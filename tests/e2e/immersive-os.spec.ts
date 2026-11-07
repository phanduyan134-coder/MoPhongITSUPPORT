import { expect, test, type Locator, type Page } from "@playwright/test";

type Device = "server" | "client";
const machineName = (device: Device) => device === "server" ? "SRV-01" : "CLIENT-01";

async function openWorkspace(page: Page, preset = "healthy", guide?: string) {
  await page.goto(`/system?preset=${preset}&workspace=desktop${guide ? `&guide=${guide}` : ""}`);
  await expect(page.locator(".iw-workspace")).toBeVisible();
  await expect(page.getByTestId("device-desktop")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Không gian hệ thống", exact: true })).toHaveCount(0);
}

async function selectDevice(page: Page, device: Device) {
  const button = page.getByRole("button", { name: device === "server" ? "Chọn máy chủ SRV-01" : "Chọn máy trạm CLIENT-01", exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function openApp(page: Page, title: string, device: Device) {
  await selectDevice(page, device);
  await page.getByRole("button", { name: `Mở ${title}`, exact: true }).click();
  const app = page.getByRole("region", { name: `${title} · ${machineName(device)}`, exact: true });
  await expect(app).toBeVisible();
  return app;
}

async function openTool(page: Page, item: string, title: string) {
  const manager = await openApp(page, "Server Manager", "server");
  await manager.getByRole("button", { name: "Tools", exact: true }).click();
  await manager.getByRole("menuitem", { name: item, exact: true }).click();
  const app = page.getByRole("region", { name: `${title} · SRV-01`, exact: true });
  await expect(app).toBeVisible();
  return app;
}

async function runCommand(page: Page, device: Device, command: string, guided = false) {
  const terminal = await openApp(page, "PowerShell", device);
  const input = terminal.getByRole("textbox", { name: `Lệnh trên ${machineName(device)}`, exact: true });
  if (guided) await expect(input).toHaveValue(command);
  else await input.fill(command);
  const response = page.waitForResponse((reply) => reply.url().endsWith("/api/simulation")
    && reply.request().method() === "POST" && reply.request().postDataJSON()?.operation === "diagnose");
  await terminal.getByRole("button", { name: "Chạy", exact: true }).click();
  const reply = await response;
  expect(reply.ok()).toBe(true);
  const data = await reply.json() as { output: string; revision: number };
  return { terminal, data };
}

async function browse(page: Page, url: string) {
  const browser = await openApp(page, "Trình duyệt", "client");
  await browser.getByRole("textbox", { name: "Địa chỉ website mô phỏng", exact: true }).fill(url);
  await browser.getByRole("button", { name: "Đi", exact: true }).click();
  return browser.getByTestId("desktop-browser-output");
}

const step = (page: Page) => page.locator(".iw-guide");

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("four homepage groups lead to scenarios and a normal system opens a desktop without the dashboard menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  for (const group of ["DNS / DHCP", "Web Server IIS", "Kết nối mạng", "Windows Server"]) {
    const choice = page.getByRole("button", { name: `Chọn nhóm ${group}`, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: `Tình huống ${group}`, exact: true })).toBeVisible();
  }
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") {
    await page.getByRole("button", { name: "Chọn nhóm DNS / DHCP", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/images/desktop-os-home.png", fullPage: true });
  }
  await page.getByRole("link", { name: "Mở hệ thống bình thường", exact: true }).click();
  await expect(page.locator(".iw-workspace")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Không gian hệ thống", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chọn máy chủ SRV-01", exact: true })).toBeVisible();
  const assistant = page.getByRole("complementary", { name: "Trợ lý AI trong mô phỏng", exact: true });
  await expect(assistant).not.toBeVisible();
  await page.getByRole("button", { name: "Trợ lý AI", exact: true }).click();
  await expect(assistant).toBeVisible();
  const draft = assistant.getByRole("textbox").last();
  await draft.fill("Kiểm tra cấu hình DNS của hệ thống");
  await page.keyboard.press("Escape");
  await expect(assistant).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Trợ lý AI", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Trợ lý AI", exact: true }).click();
  await expect(draft).toHaveValue("Kiểm tra cấu hình DNS của hệ thống");
  await page.keyboard.press("Escape");
  await expectNoOverflow(page);
});

test("Server Manager Tools and the DNS tree lead to real record properties with Apply and Cancel semantics", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const actions: unknown[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/simulation") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { operation: string; action?: unknown };
    if (body.operation === "action") actions.push(body.action);
  });
  await openWorkspace(page, "dns-record");
  expect((await runCommand(page, "client", "nslookup portal.lab.test")).data.output).toContain("Address: 192.168.10.99");
  const dns = await openTool(page, "DNS", "DNS Manager");
  await expect(dns.getByRole("button", { name: "lab.test", exact: true })).toHaveCount(0);
  await dns.getByRole("button", { name: "SRV-01", exact: true }).click();
  await dns.getByRole("button", { name: "Forward Lookup Zones", exact: true }).click();
  await dns.getByRole("button", { name: "lab.test", exact: true }).click();
  await dns.getByRole("button", { name: "portal", exact: true }).click();
  await dns.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "portal Properties", exact: true });
  const address = properties.getByRole("textbox", { name: "IPv4 address", exact: true });
  await expect(address).toHaveValue("192.168.10.99");
  await address.fill("192.168.10.88");
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(properties).not.toBeVisible();
  expect(actions).toEqual([]);
  await dns.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(address).toHaveValue("192.168.10.99");
  await address.fill("192.168.10.10");
  await properties.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu bản ghi" })).toBeVisible();
  expect(actions).toEqual([{ type: "dns.record", address: "192.168.10.10" }]);
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") await page.screenshot({ path: "docs/images/desktop-os-dns.png" });
  const query = await runCommand(page, "client", "nslookup portal.lab.test");
  expect(query.data.output).toContain("Address: 192.168.10.10");
  await expect(await browse(page, "http://portal.lab.test")).toContainText("Support Portal");
});

test("Tools closes with Escape and Services controls the same DNS state used by the client", async ({ page }) => {
  await openWorkspace(page, "dns-stopped");
  const browserResult = await browse(page, "http://portal.lab.test");
  await expect(browserResult).toContainText("Could not resolve host");
  const manager = await openApp(page, "Server Manager", "server");
  const tools = manager.getByRole("button", { name: "Tools", exact: true });
  await tools.click();
  await expect(manager.getByRole("menuitem", { name: "Services", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(manager.getByRole("menuitem", { name: "Services", exact: true })).not.toBeVisible();
  await expect(tools).toBeFocused();
  const services = await openTool(page, "Services", "Services");
  await services.getByRole("button", { name: "DNS Server", exact: true }).click();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await services.getByRole("button", { name: "Start", exact: true }).click();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await selectDevice(page, "client");
  await expect(browserResult).toHaveAttribute("data-status", "stale");
  await expect(await browse(page, "http://portal.lab.test")).toContainText("Support Portal");
  await selectDevice(page, "server");
  await services.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(services.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await expect(await browse(page, "http://192.168.10.10")).toContainText("Support Portal");
  await expect(await browse(page, "http://portal.lab.test")).toContainText("Could not resolve host");
});

for (const layout of ["desktop", "mobile"] as const) {
  test(`DNS guidance on ${layout} leads through device selection, Tools and the user's repair`, async ({ page }) => {
    await page.setViewportSize(layout === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkspace(page, "dns-stopped", "dns");
    await expect(step(page)).toContainText("Bước 1/6");
    const client = page.getByRole("button", { name: "Chọn máy trạm CLIENT-01", exact: true });
    await expect(client).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "PowerShell · CLIENT-01", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true })).toBeFocused();
    expect((await runCommand(page, "client", "ping 192.168.10.10", true)).data.output).toContain("Received = 4");
    await expect(step(page)).toContainText("Bước 2/6");
    expect((await runCommand(page, "client", "nslookup portal.lab.test", true)).data.output).toContain("DNS request timed out");
    await expect(step(page)).toContainText("Bước 3/6");
    expect((await runCommand(page, "server", "Get-Service DNS", true)).data.output).toContain("Stopped");
    await expect(step(page)).toContainText("Bước 4/6");
    const services = await openTool(page, "Services", "Services");
    const start = services.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeFocused();
    await expect(start).toBeInViewport();
    await start.click();
    await expect(step(page)).toContainText("Bước 5/6");
    expect((await runCommand(page, "client", "nslookup portal.lab.test", true)).data.output).toContain("Address: 192.168.10.10");
    await expect(step(page)).toContainText("Bước 6/6");
    expect((await runCommand(page, "client", "curl http://portal.lab.test", true)).data.output).toContain("HTTP/1.1 200 OK");
    await expect(step(page)).toContainText("Đã hoàn thành hướng dẫn DNS");
    await expectNoOverflow(page);
    if (layout === "mobile" && process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") await page.screenshot({ path: "output/screenshots/mobile-os.png" });
  });
}

test("DHCP guidance in the desktop requires starting the server and renewing the client before verification", async ({ page }) => {
  await openWorkspace(page, "dhcp-stopped", "dhcp");
  expect((await runCommand(page, "client", "ipconfig /all", true)).data.output).toContain("169.254.10.100");
  expect((await runCommand(page, "server", "Get-Service DHCPServer", true)).data.output).toContain("Stopped");
  const dhcp = await openTool(page, "DHCP", "DHCP Manager");
  await dhcp.getByRole("button", { name: "Start DHCP", exact: true }).click();
  const network = await openApp(page, "Cấu hình mạng", "client");
  await network.getByRole("button", { name: "Renew DHCP lease", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "DHCP ACK:" })).toBeVisible();
  const configuration = (await runCommand(page, "client", "ipconfig /all", true)).data.output;
  expect(configuration).toContain("DHCP Enabled: Yes");
  expect(configuration).toContain("Default Gateway: 192.168.10.1");
  expect((await runCommand(page, "client", "nslookup portal.lab.test", true)).data.output).toContain("Address: 192.168.10.10");
  await expect(step(page)).toContainText("Đã hoàn thành hướng dẫn DHCP");
});

test("IIS guidance starts the application pool in IIS Manager and verifies HTTP from the client", async ({ page }) => {
  await openWorkspace(page, "iis-pool", "iis");
  expect((await runCommand(page, "client", "nslookup portal.lab.test", true)).data.output).toContain("Address: 192.168.10.10");
  expect((await runCommand(page, "client", "curl http://portal.lab.test", true)).data.output).toContain("HTTP/1.1 503");
  const iis = await openTool(page, "Internet Information Services (IIS) Manager", "IIS Manager");
  await iis.getByRole("button", { name: "Application Pools", exact: true }).click();
  await iis.getByRole("button", { name: "Start application pool", exact: true }).click();
  expect((await runCommand(page, "client", "curl http://portal.lab.test", true)).data.output).toContain("HTTP/1.1 200 OK");
  await expect(step(page)).toContainText("Đã hoàn thành hướng dẫn IIS");
});

test("gateway guidance renews DHCP in network properties without replacing the client with a static configuration", async ({ page }) => {
  await openWorkspace(page, "network-gateway", "gateway");
  expect((await runCommand(page, "client", "ipconfig /all", true)).data.output).toContain("Default Gateway: 192.168.10.254");
  expect((await runCommand(page, "client", "ping 192.168.10.10", true)).data.output).toContain("Received = 4");
  expect((await runCommand(page, "client", "ping 192.168.20.10", true)).data.output).toContain("Received = 0");
  expect((await runCommand(page, "server", "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0", true)).data.output).toContain("192.168.10.1");
  const network = await openApp(page, "Cấu hình mạng", "client");
  await expect(network.getByRole("checkbox", { name: "Obtain configuration automatically (DHCP)", exact: true })).toBeChecked();
  await network.getByRole("button", { name: "Renew DHCP lease", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "DHCP ACK:" })).toBeVisible();
  const after = (await runCommand(page, "client", "ipconfig /all", true)).data.output;
  expect(after).toContain("Default Gateway: 192.168.10.1");
  expect(after).toContain("DHCP Enabled: Yes");
  expect((await runCommand(page, "client", "ping 192.168.20.10", true)).data.output).toContain("Received = 4");
  await expect(step(page)).toContainText("Đã hoàn thành hướng dẫn Gateway");
});

test("disk guidance uses File Explorer and confirmation before deleting an allowed file and retrying the write", async ({ page }) => {
  await openWorkspace(page, "disk-full", "disk");
  expect((await runCommand(page, "server", "Get-Volume", true)).data.output).toContain("SizeRemaining");
  const files = await openApp(page, "File Explorer", "server");
  await files.getByRole("button", { name: "Delete selected file", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Xóa tệp mô phỏng?", exact: true });
  await expect(confirmation).toContainText("Cache-tam-lab.tmp");
  await confirmation.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(step(page)).toContainText("Bước 2/3");
  await expect(files.getByRole("button", { name: "Chọn tệp Cache-tam-lab.tmp", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "Delete selected file", exact: true }).click();
  await confirmation.getByRole("button", { name: "Xóa tệp", exact: true }).click();
  await expect(files.getByRole("button", { name: "Chọn tệp Cache-tam-lab.tmp", exact: true })).toHaveCount(0);
  await expect(step(page)).toContainText("Bước 3/3");
  await files.getByRole("button", { name: "Ghi tệp kiểm tra 10 MB", exact: true }).click();
  await expect(step(page)).toContainText("Đã hoàn thành hướng dẫn Ổ đĩa");
  await expect(files).toContainText("Dữ liệu cần giữ");
});
