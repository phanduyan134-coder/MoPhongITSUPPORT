import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { AgentRunEvidence, WebSessionEvidence } from "../../src/lib/system-evidence";

const recheckName = "Kiểm tra lại DNS / website";

async function openLab(page: Page, preset = "healthy") {
  await page.goto(`/system?workspace=classic&preset=${preset}`);
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await expect(page.getByRole("button", { name: recheckName, exact: true })).toBeEnabled();
}

async function selectTool(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Mở điều hướng", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function resetSession(page: Page, preset: string) {
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo phiên hệ thống", exact: true });
  await dialog.getByLabel("Trạng thái ban đầu", { exact: true }).selectOption(preset);
  await dialog.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("DNS recheck uses fresh observations after repair and exports the Web session evidence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLab(page, "dns-stopped");

  await selectTool(page, "Terminal");
  await page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true }).fill("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.getByTestId("terminal-output")).toContainText("DNS request timed out");

  await page.getByRole("button", { name: recheckName, exact: true }).click();
  const results = page.getByTestId("dns-verification");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveAttribute("data-status", "failed");
  await expect(results.first().locator(".sl-verification-checks > li")).toHaveCount(5);
  await expect(results.first().getByTestId("dns-assessment")).toHaveAttribute("data-code", "dns-service");
  await expect(results.first()).toContainText("website qua IP vẫn hoạt động");
  await expect(page.getByText("Cục bộ · không dùng AI", { exact: true })).toBeVisible();

  await selectTool(page, "DNS / DHCP");
  await page.getByRole("checkbox", { name: "DNS đang chạy", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "DNS đang chạy", exact: true })).toBeChecked();
  await expect(results.first()).toHaveAttribute("data-status", "stale");
  await page.getByRole("button", { name: recheckName, exact: true }).click();
  await expect(results).toHaveCount(2);
  await expect(results.last()).toHaveAttribute("data-status", "passed");
  await expect(results.last()).toContainText("Các phép kiểm tra DNS và website đều đạt.");
  await expect(results.last()).toContainText("chỉ xác nhận các mục bên dưới");
  await results.last().locator(".sl-verification-checks > li").nth(2).locator("summary").click();
  await expect(results.last().locator(".sl-verification-checks > li").nth(2)).toContainText("Address: 192.168.10.10");
  await page.screenshot({ path: "output/screenshots/dns-verification-desktop.png", fullPage: true });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất hồ sơ phiên", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^supportlab-web-session-.*\.json$/);
  const evidence = JSON.parse(await readFile((await download.path())!, "utf8")) as WebSessionEvidence;
  expect(evidence.kind).toBe("supportlab-web-session");
  expect(evidence.session.initialState.dns.running).toBe(false);
  expect(evidence.session.currentState.dns.running).toBe(true);
  expect(evidence.journal.truncated).toBe(false);
  const action = evidence.journal.entries.find((entry) => entry.kind === "action")!;
  expect(action.data).toMatchObject({ action: { type: "service.toggle", service: "dns", running: true }, beforeState: { dns: { running: false } }, afterState: { dns: { running: true } } });
  expect(evidence.journal.entries.find((entry) => entry.kind === "diagnostic")?.data).toMatchObject({ device: "client", command: "nslookup portal.lab.test" });
  const agents = evidence.journal.entries.filter((entry) => entry.kind === "agent").map((entry) => (entry.data as { evidence: AgentRunEvidence }).evidence);
  expect(agents).toHaveLength(2);
  expect(agents.map((agent) => agent.verification?.status)).toEqual(["failed", "passed"]);
  expect(agents.map((agent) => agent.revision)).toEqual([0, 1]);
  expect(agents.every((agent) => agent.source === "local" && agent.model === null)).toBe(true);
  expect(agents[1].trace).toEqual(expect.arrayContaining([expect.objectContaining({ tool: "run_diagnostic", origin: "verification", revision: 1, input: { device: "client", command: "nslookup portal.lab.test" }, output: expect.any(Object) })]));
  expect(evidence).not.toHaveProperty("sessionId");
  expect(errors).toEqual([]);
});

test("a response arriving after a configuration change is shown as outdated", async ({ page }) => {
  let release!: () => void;
  let observed!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const captured = new Promise<void>((resolve) => { observed = resolve; });
  await page.route("**/api/system-agent", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    observed();
    await held;
    await route.fulfill({ response, json: data });
  });
  await openLab(page);
  try {
    await page.getByRole("button", { name: recheckName, exact: true }).click();
    await captured;
    await selectTool(page, "DNS / DHCP");
    await page.getByRole("checkbox", { name: "DNS đang chạy", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "DNS đang chạy", exact: true })).not.toBeChecked();
    release();
    const result = page.getByTestId("dns-verification");
    await expect(result).toHaveAttribute("data-status", "stale");
    await expect(result).toContainText("Kết quả đã cũ");
    await expect(result).not.toHaveClass(/is-passed/);
    await expect(result).not.toContainText("Các phép kiểm tra DNS và website đều đạt.");
  } finally { release(); }
});

test("reset discards in-flight assistant responses from the preceding session generation", async ({ page }) => {
  let release!: () => void;
  let observed!: () => void;
  let requests = 0;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const captured = new Promise<void>((resolve) => { observed = resolve; });
  await page.route("**/api/system-agent", async (route) => {
    if (++requests !== 1) { await route.continue(); return; }
    const response = await route.fetch();
    const data = await response.json();
    observed();
    await held;
    await route.fulfill({ response, json: { ...data, message: "PHẢN HỒI PHIÊN CŨ" } }).catch(() => {});
  });
  await openLab(page);
  try {
    await page.getByRole("button", { name: recheckName, exact: true }).click();
    await captured;
    await resetSession(page, "dns-stopped");
    release();
    await expect(page.locator(".sl-message.assistant")).toHaveCount(0);
    await expect(page.getByRole("button", { name: recheckName, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: recheckName, exact: true }).click();
    await expect(page.getByTestId("dns-verification")).toHaveAttribute("data-status", "failed");
    await expect(page.locator(".sl-message.assistant")).toHaveCount(1);
    await expect(page.getByText("PHẢN HỒI PHIÊN CŨ", { exact: true })).toHaveCount(0);
    await expect(page.locator(".sl-agent-error")).toHaveCount(0);
  } finally { release(); }
});

test("DNS verification details and evidence actions fit a narrow touch screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page);
  await page.getByRole("button", { name: recheckName, exact: true }).click();
  const result = page.getByTestId("dns-verification");
  await expect(result).toHaveAttribute("data-status", "passed");
  await result.locator(".sl-verification-checks > li").first().locator("summary").click();
  await expect(result.locator("pre").first()).toBeVisible();
  await page.getByRole("button", { name: "Xuất hồ sơ phiên", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Xuất hồ sơ phiên", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "output/screenshots/dns-verification-mobile.png", fullPage: true });
});
