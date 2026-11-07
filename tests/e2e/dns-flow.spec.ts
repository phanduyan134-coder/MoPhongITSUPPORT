import { expect, test, type Page } from "@playwright/test";

type SimulationRequest = { operation: string; sessionId?: string; command?: string };

async function selectTool(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Mở điều hướng", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function openLab(page: Page, preset = "healthy") {
  await page.goto(`/system?workspace=classic&preset=${preset}`);
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await expect(page.getByTestId("dns-flow")).toHaveAttribute("data-outcome", "none");
}

async function runCommand(page: Page, command: string, device = "client") {
  await selectTool(page, "Terminal");
  await page.getByLabel("Thiết bị terminal", { exact: true }).selectOption(device);
  await page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true }).fill(command);
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chạy lệnh", exact: true })).toBeDisabled();
  await expect(page.getByTestId("terminal-output").locator(".sl-terminal-entry").last()).toContainText(command);
}

async function resetSession(page: Page, preset = "healthy") {
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo phiên hệ thống", exact: true });
  await dialog.getByLabel("Trạng thái ban đầu", { exact: true }).selectOption(preset);
  await dialog.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("DNS flow starts empty and is not invented from other diagnostic commands", async ({ page }) => {
  await openLab(page);
  const flow = page.getByRole("region", { name: "Giao dịch DNS", exact: true });
  await expect(flow).toContainText("Chưa có truy vấn");
  await runCommand(page, "ping 192.168.10.10");
  await expect(flow).toHaveAttribute("data-outcome", "none");
  await runCommand(page, "nslookup portal.lab.test");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
  await runCommand(page, "Get-Service DNS", "server");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
  await expect(flow.getByTestId("dns-flow-source")).toContainText("CLIENT-01");
  await selectTool(page, "Tổng quan");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
});

test("healthy DNS playback can pause and replay without requests or state changes", async ({ page }) => {
  const requests: SimulationRequest[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/simulation") && request.method() === "POST") {
      requests.push(request.postDataJSON() as SimulationRequest);
    }
  });
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-status", "playing");
  await expect(flow).toContainText("Có phản hồi DNS");
  await expect(flow).toContainText("192.168.10.10");
  await expect(flow.getByTestId("dns-flow-source")).toContainText("192.168.10.100");
  await expect(flow.getByTestId("dns-flow-resolver")).toContainText("192.168.10.10");
  const sessionId = requests.findLast((request) => request.operation === "diagnose")!.sessionId!;
  const before = await (await page.request.get(`/api/simulation?sessionId=${sessionId}`)).json();
  const requestCount = requests.length;
  await flow.getByRole("button", { name: "Tạm dừng luồng DNS", exact: true }).click();
  await expect(flow).toHaveAttribute("data-status", "paused");
  const pausedPhase = await flow.getAttribute("data-phase");
  await page.waitForTimeout(350);
  await expect(flow).toHaveAttribute("data-phase", pausedPhase!);
  await flow.getByRole("button", { name: "Tiếp tục luồng DNS", exact: true }).click();
  await expect(flow).toHaveAttribute("data-status", "playing");
  await expect(flow).toHaveAttribute("data-status", "complete", { timeout: 8_000 });
  await flow.getByRole("button", { name: "Phát lại luồng DNS", exact: true }).click();
  await expect(flow).toHaveAttribute("data-status", "playing");
  await expect(flow).toHaveAttribute("data-phase", "query");
  const packet = flow.getByTestId("dns-flow-packet");
  await expect(packet).toBeVisible();
  const initialX = (await packet.boundingBox())!.x;
  await expect.poll(async () => (await packet.boundingBox())?.x ?? initialX, { timeout: 800 }).toBeGreaterThan(initialX + 1);
  const after = await (await page.request.get(`/api/simulation?sessionId=${sessionId}`)).json();
  expect(after.state).toEqual(before.state);
  expect(requests).toHaveLength(requestCount);
});

test("a DNS timeout is a missing response rather than a fabricated answer", async ({ page }) => {
  await openLab(page, "dns-stopped");
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-outcome", "timeout");
  await expect(flow).toContainText("Không nhận được phản hồi DNS");
  await expect(flow).not.toContainText("Có phản hồi DNS");
  await expect(flow).toHaveAttribute("data-status", "complete", { timeout: 8_000 });
  await expect(flow).toHaveAttribute("data-phase", "complete");
});

test("NXDOMAIN and a wrong A record remain distinct DNS responses", async ({ page }) => {
  await openLab(page);
  await runCommand(page, "nslookup absent.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-outcome", "nxdomain");
  await expect(flow).toContainText("Không tồn tại tên (NXDOMAIN)");
  await expect(flow).toContainText("absent.lab.test");
  await resetSession(page, "dns-record");
  await runCommand(page, "nslookup portal.lab.test");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
  await expect(flow).toContainText("Có phản hồi DNS");
  await expect(flow).toContainText("192.168.10.99");
  await expect(flow).not.toContainText("NXDOMAIN");
});

test("an unknown resolver is not relabeled as SRV-01 and link loss cannot show a reply", async ({ page }) => {
  await openLab(page, "dhcp-options");
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-outcome", "timeout");
  const resolver = flow.getByTestId("dns-flow-resolver");
  await expect(resolver).toContainText("192.168.10.254");
  await expect(resolver).not.toContainText("SRV-01");
  await resetSession(page, "network-link");
  await runCommand(page, "nslookup portal.lab.test");
  await expect(flow).toHaveAttribute("data-outcome", "timeout");
  await expect(resolver).toContainText("SRV-01");
  await expect(flow).not.toContainText("Có phản hồi DNS");
});

test("server loopback DNS remains local and never presents CLIENT-01 as the source", async ({ page }) => {
  await openLab(page, "network-link");
  await runCommand(page, "nslookup portal.lab.test 127.0.0.1", "server");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
  const source = flow.getByTestId("dns-flow-source");
  await expect(source).toContainText("SRV-01");
  await expect(source).toContainText("127.0.0.1");
  await expect(source).not.toContainText("CLIENT-01");
  await expect(flow.getByTestId("dns-flow-resolver")).toContainText("127.0.0.1");
});

test("configuration changes stop old playback and a fresh query captures the new result", async ({ page }) => {
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await selectTool(page, "DNS / DHCP");
  await page.getByRole("checkbox", { name: "DNS đang chạy", exact: true }).click();
  await expect(flow).toHaveAttribute("data-status", "stale");
  await expect(flow).toContainText("Kết quả trước thay đổi");
  await expect(flow.getByRole("button", { name: "Phát lại luồng DNS", exact: true })).toBeDisabled();
  await expect(flow.getByTestId("dns-flow-packet")).not.toBeVisible();
  await runCommand(page, "nslookup portal.lab.test");
  await expect(flow).toHaveAttribute("data-outcome", "timeout");
  await expect(flow).not.toHaveAttribute("data-status", "stale");
  await expect(flow).not.toContainText("Kết quả trước thay đổi");
});

test("terminal clearing and session reset remove the captured DNS transaction", async ({ page }) => {
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-outcome", "answer");
  await page.getByRole("button", { name: "Xóa lịch sử terminal", exact: true }).click();
  await expect(flow).toHaveAttribute("data-status", "idle");
  await expect(flow).toContainText("Chưa có truy vấn");
  await runCommand(page, "nslookup portal.lab.test");
  await resetSession(page, "dns-stopped");
  await expect(flow).toHaveAttribute("data-outcome", "none");
  await expect(flow).toContainText("Chưa có truy vấn");
});

test("a successful terminal string without an authoritative trace cannot create a flow", async ({ page }) => {
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as SimulationRequest;
    if (body.operation !== "diagnose") return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    delete data.dnsTrace;
    await route.fulfill({ response, json: data });
  });
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  await expect(page.getByTestId("terminal-output")).toContainText("Address: 192.168.10.10");
  await expect(page.getByTestId("dns-flow")).toHaveAttribute("data-outcome", "none");
});

test("an authoritative result from another revision is marked stale and cannot play", async ({ page }) => {
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as SimulationRequest;
    if (body.operation !== "diagnose") return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: {
      ...data,
      revision: data.revision + 1,
      dnsTrace: { ...data.dnsTrace, revision: data.revision + 1 },
    } });
  });
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-status", "stale");
  await expect(flow).toContainText("Kết quả trước thay đổi");
  await expect(flow.getByRole("button", { name: "Phát lại luồng DNS", exact: true })).toBeDisabled();
  await expect(flow.getByTestId("dns-flow-packet")).not.toBeVisible();
});

test("the DNS trace keeps guided command focus and fits desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/system?workspace=classic&preset=dns-stopped&guide=dns");
    const command = page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true });
    await expect(command).toBeFocused();
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(command).toHaveValue("nslookup portal.lab.test");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(command).toHaveValue("Get-Service DNS");
    await expect(command).toBeFocused();
    await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("server");
    const flow = page.getByTestId("dns-flow");
    await expect(flow).toHaveAttribute("data-outcome", "timeout");
    await expect(flow.getByTestId("dns-flow-source")).toContainText("CLIENT-01");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await flow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/screenshots/dns-flow-${name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("reduced motion shows the final DNS result without autoplay or replay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  await runCommand(page, "nslookup portal.lab.test");
  const flow = page.getByTestId("dns-flow");
  await expect(flow).toHaveAttribute("data-status", "complete");
  await expect(flow).toHaveAttribute("data-phase", "complete");
  await expect(flow).toContainText("Có phản hồi DNS");
  await expect(flow.getByRole("button", { name: "Phát lại luồng DNS", exact: true })).toBeDisabled();
  await expect(flow.getByTestId("dns-flow-packet")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
