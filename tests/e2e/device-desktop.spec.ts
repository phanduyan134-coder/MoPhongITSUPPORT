import { expect, test, type Locator, type Page } from "@playwright/test";

async function openDesktop(page: Page, preset = "dns-stopped", guided = false) {
  await page.goto(`/system?preset=${preset}&workspace=desktop${guided ? "&guide=dns" : ""}`);
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await expect(page.getByTestId("device-desktop")).toBeVisible();
}

async function selectDevice(page: Page, device: "server" | "client") {
  await page.getByRole("button", { name: device === "server" ? "Chọn máy chủ SRV-01" : "Chọn máy trạm CLIENT-01", exact: true }).click();
}

async function openApp(page: Page, title: string, device: "server" | "client") {
  await selectDevice(page, device);
  await page.getByRole("button", { name: `Mở ${title}`, exact: true }).click();
  const app = page.getByRole("region", { name: `${title} · ${device === "server" ? "SRV-01" : "CLIENT-01"}`, exact: true });
  await expect(app).toBeVisible();
  return app;
}

async function browse(browser: Locator, address: string) {
  await browser.getByRole("textbox", { name: "Địa chỉ website mô phỏng", exact: true }).fill(address);
  await browser.getByRole("button", { name: "Đi", exact: true }).click();
  const result = browser.getByTestId("desktop-browser-output");
  await expect(result).toBeVisible();
  return result;
}

async function runCommand(terminal: Locator, command: string, device: "server" | "client" = "client") {
  await terminal.getByRole("textbox", { name: `Lệnh trên ${device === "server" ? "SRV-01" : "CLIENT-01"}`, exact: true }).fill(command);
  await terminal.getByRole("button", { name: "Chạy", exact: true }).click();
  const result = terminal.getByTestId("desktop-terminal-output");
  await expect(result).toBeVisible();
  return result;
}

test("desktop repair changes the client's actual DNS and HTTP results while retaining the server-client model", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  const actions: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/simulation") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { operation: string; action?: unknown };
    if (body.operation === "action") actions.push(body.action);
  });
  await openDesktop(page);
  const topology = page.getByTestId("device-desktop");
  await expect(topology.getByRole("button", { name: "Chọn máy chủ SRV-01", exact: true })).toBeVisible();
  await expect(topology.getByRole("button", { name: "Chọn máy trạm CLIENT-01", exact: true })).toBeVisible();
  await expect(topology).toContainText("SW-01");

  const browser = await openApp(page, "Trình duyệt", "client");
  await expect(await browse(browser, "http://portal.lab.test")).toContainText("Could not resolve host");
  await expect(await browse(browser, "http://192.168.10.10")).toContainText("Support Portal");
  const services = await openApp(page, "Services", "server");
  await services.getByRole("button", { name: "DNS Server", exact: true }).click();
  await expect(services.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") {
    await page.screenshot({ path: "docs/images/desktop-dns-services.png", fullPage: true });
  }
  expect(actions).toEqual([]); // Merely opening windows or selecting devices cannot repair anything.
  await services.getByRole("button", { name: "Start", exact: true }).click();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  expect(actions).toEqual([{ type: "service.toggle", service: "dns", running: true }]);

  await selectDevice(page, "client");
  await expect(browser).toBeVisible();
  await expect(browser.getByTestId("desktop-browser-output")).toHaveAttribute("data-status", "stale");
  await expect(await browse(browser, "http://portal.lab.test")).toContainText("Support Portal");
  await expect(browser.getByTestId("desktop-browser-output")).not.toHaveAttribute("data-status", "stale");
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") {
    await page.screenshot({ path: "docs/images/desktop-dns-client.png", fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("DNS Manager applies records to the shared state and unsaved properties do not alter client queries", async ({ page }) => {
  await openDesktop(page, "healthy");
  const manager = await openApp(page, "DNS Manager", "server");
  await manager.getByRole("button", { name: "SRV-01", exact: true }).click();
  await manager.getByRole("button", { name: "Forward Lookup Zones", exact: true }).click();
  await manager.getByRole("button", { name: "lab.test", exact: true }).click();
  await manager.getByRole("button", { name: "portal", exact: true }).click();
  await manager.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "portal Properties", exact: true });
  await properties.getByRole("textbox", { name: "IPv4 address", exact: true }).fill("192.168.10.99");
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
  const terminal = await openApp(page, "PowerShell", "client");
  await expect(await runCommand(terminal, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
  await selectDevice(page, "server");
  await manager.getByRole("button", { name: "Properties", exact: true }).click();
  await properties.getByRole("textbox", { name: "IPv4 address", exact: true }).fill("192.168.10.99");
  await properties.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu bản ghi" })).toBeVisible();
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
  await selectDevice(page, "client");
  await expect(terminal.getByTestId("desktop-terminal-output")).toHaveAttribute("data-status", "stale");
  await expect(await runCommand(terminal, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.99");
  const browser = await openApp(page, "Trình duyệt", "client");
  await expect(await browse(browser, "http://portal.lab.test")).toContainText("Connection timed out to 192.168.10.99");
});

test("window controls preserve drafts per device and closing discards only that window", async ({ page }) => {
  await openDesktop(page);
  const services = await openApp(page, "Services", "server");
  const serverTerminal = await openApp(page, "PowerShell", "server");
  const serverInput = serverTerminal.getByRole("textbox", { name: "Lệnh trên SRV-01", exact: true });
  const initialCommand = await serverInput.inputValue();
  const serverDraft = initialCommand === "Get-Service DNS" ? "Get-Service DHCP" : "Get-Service DNS";
  await serverInput.fill(serverDraft);
  await serverTerminal.getByRole("button", { name: "Phóng to PowerShell", exact: true }).click();
  await expect(serverTerminal).toHaveClass(/is-maximized/);
  await serverTerminal.getByRole("button", { name: "Thu nhỏ PowerShell", exact: true }).click();
  await expect(serverTerminal).not.toBeVisible();
  await page.getByRole("button", { name: "Khôi phục cửa sổ PowerShell", exact: true }).click();
  await expect(serverTerminal).toBeVisible();
  await expect(serverTerminal).toHaveClass(/is-maximized/);
  await expect(serverInput).toHaveValue(serverDraft);
  const clientTerminal = await openApp(page, "PowerShell", "client");
  await clientTerminal.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true }).fill("nslookup portal.lab.test");
  await selectDevice(page, "server");
  await expect(serverInput).toHaveValue(serverDraft);
  await serverTerminal.getByRole("button", { name: "Khôi phục PowerShell", exact: true }).click();
  await expect(serverTerminal).not.toHaveClass(/is-maximized/);
  await serverTerminal.getByRole("button", { name: "Đóng PowerShell", exact: true }).click();
  await expect(serverTerminal).not.toBeVisible();
  await expect(services).toBeFocused();
  await page.getByRole("button", { name: "Mở PowerShell", exact: true }).click();
  await expect(serverInput).toHaveValue(initialCommand);
  await selectDevice(page, "client");
  await expect(clientTerminal.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true })).toHaveValue("nslookup portal.lab.test");
});

test("DHCP ignores unsaved static fields and renew updates the configuration actually used by the client", async ({ page }) => {
  const actions: unknown[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/simulation") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { operation: string; action?: unknown };
    if (body.operation === "action") actions.push(body.action);
  });
  await openDesktop(page, "network-gateway");
  const network = await openApp(page, "Cấu hình mạng", "client");
  const automatic = network.getByRole("checkbox", { name: "Obtain configuration automatically (DHCP)", exact: true });
  await automatic.uncheck();
  await network.getByRole("textbox", { name: "IP address", exact: true }).fill("192.168.10.77");
  await network.getByRole("textbox", { name: "Default gateway", exact: true }).fill("192.168.10.250");
  await network.getByRole("textbox", { name: "Preferred DNS server", exact: true }).fill("192.168.10.99");
  await automatic.check();
  await expect(network.getByRole("textbox", { name: "IP address", exact: true })).toBeDisabled();
  await network.getByRole("button", { name: "Apply network settings", exact: true }).click();
  await expect(network.getByRole("button", { name: "Apply network settings", exact: true })).toBeEnabled();
  expect(actions).toEqual([{ type: "client.configure", config: { ip: "192.168.10.100", prefix: 24, gateway: "192.168.10.254", dns: "192.168.10.10", dhcp: true } }]);
  const terminal = await openApp(page, "PowerShell", "client");
  const before = (await runCommand(terminal, "ipconfig /all")).locator("pre").last();
  await expect(before).toContainText("IPv4 Address: 192.168.10.100");
  await expect(before).toContainText("Default Gateway: 192.168.10.254");
  await expect(before).toContainText("DNS Servers: 192.168.10.10");
  await expect(before).toContainText("DHCP Enabled: Yes");
  await expect((await runCommand(terminal, "ping 192.168.20.10")).locator("pre").last()).toContainText("Received = 0");
  await page.getByRole("button", { name: "Khôi phục cửa sổ Cấu hình mạng", exact: true }).click();
  await network.getByRole("button", { name: "Renew DHCP lease", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "DHCP ACK:" })).toBeVisible();
  expect(actions.at(-1)).toEqual({ type: "client.renew" });
  await page.getByRole("button", { name: "Khôi phục cửa sổ PowerShell", exact: true }).click();
  const after = (await runCommand(terminal, "ipconfig /all")).locator("pre").last();
  await expect(after).toContainText("Default Gateway: 192.168.10.1");
  await expect(after).toContainText("DNS Servers: 192.168.10.10");
  await expect(after).not.toContainText("192.168.10.250");
  await expect(after).not.toContainText("192.168.10.99");
  await expect((await runCommand(terminal, "ping 192.168.20.10")).locator("pre").last()).toContainText("Received = 4");
});

test("a DNS role must be installed before its service and records can be managed from the desktop", async ({ page }) => {
  await openDesktop(page, "unconfigured");
  const services = await openApp(page, "Services", "server");
  await services.getByRole("button", { name: "DNS Server", exact: true }).click();
  await expect(services.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  const dns = await openApp(page, "DNS Manager", "server");
  await dns.getByRole("button", { name: "SRV-01", exact: true }).click();
  await dns.getByRole("button", { name: "Forward Lookup Zones", exact: true }).click();
  await dns.getByRole("button", { name: "lab.test", exact: true }).click();
  await expect(dns.getByRole("button", { name: "portal", exact: true })).toBeDisabled();
  const manager = await openApp(page, "Server Manager", "server");
  await manager.getByRole("button", { name: "Add roles and features", exact: true }).click();
  await manager.getByRole("button", { name: "Add DNS role", exact: true }).click();
  await expect(manager.getByRole("button", { name: "Add DNS role", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Khôi phục cửa sổ Services", exact: true }).click();
  await expect(services.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
  await expect(services.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Khôi phục cửa sổ DNS Manager", exact: true }).click();
  await dns.getByRole("button", { name: "portal", exact: true }).click();
  await dns.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "portal Properties", exact: true });
  await properties.getByRole("textbox", { name: "IPv4 address", exact: true }).fill("192.168.10.10");
  await properties.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu bản ghi" })).toBeVisible();
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
  const network = await openApp(page, "Cấu hình mạng", "client");
  await network.getByRole("checkbox", { name: "Obtain configuration automatically (DHCP)", exact: true }).uncheck();
  await network.getByRole("textbox", { name: "IP address", exact: true }).fill("192.168.10.100");
  await network.getByRole("textbox", { name: "Subnet prefix length", exact: true }).fill("24");
  await network.getByRole("textbox", { name: "Default gateway", exact: true }).fill("192.168.10.1");
  await network.getByRole("textbox", { name: "Preferred DNS server", exact: true }).fill("192.168.10.10");
  await network.getByRole("button", { name: "Apply network settings", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã áp dụng cấu hình IPv4" })).toBeVisible();
  const terminal = await openApp(page, "PowerShell", "client");
  await expect((await runCommand(terminal, "nslookup portal.lab.test")).locator("pre").last()).toContainText("Address: 192.168.10.10");
});

test("the homepage launches the guided immersive desktop and preserves its active window", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Chọn nhóm DNS / DHCP", exact: true }).click();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Không phân giải được tên nội bộ", exact: true }) }).getByRole("link", { name: "Có hướng dẫn", exact: true }).click();
  await expect(page).toHaveURL(/workspace=desktop/);
  await expect(page.getByTestId("device-desktop")).toBeVisible();
  const command = page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true });
  await expect(command).toBeFocused();
  await expect(command).toHaveValue("ping 192.168.10.10");
  await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
  await page.getByRole("button", { name: "Dừng dẫn thao tác", exact: true }).click();
  await command.fill("nslookup portal.lab.test 192.168.10.10");
  await expect(command).toHaveValue("nslookup portal.lab.test 192.168.10.10");
  await page.getByRole("link", { name: "Về trang chủ chọn mô phỏng", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bạn muốn mô phỏng", exact: false })).toBeVisible();
});

test("creating a new session clears desktop results and window drafts as well as machine state", async ({ page }) => {
  await openDesktop(page, "healthy");
  const terminal = await openApp(page, "PowerShell", "client");
  await expect(await runCommand(terminal, "nslookup portal.lab.test 192.168.10.10")).toContainText("Address: 192.168.10.10");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo phiên hệ thống", exact: true });
  await dialog.getByLabel("Trạng thái ban đầu", { exact: true }).selectOption("dns-stopped");
  await dialog.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("desktop-terminal-output")).toHaveCount(0);
  const nextTerminal = await openApp(page, "PowerShell", "client");
  await expect(nextTerminal.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true })).not.toHaveValue("nslookup portal.lab.test 192.168.10.10");
  await expect(await runCommand(nextTerminal, "nslookup portal.lab.test")).toContainText("DNS request timed out");
});

for (const layout of ["desktop", "mobile"] as const) {
test(`desktop DNS guidance on ${layout} focuses real controls and advances only after the user's diagnostics and repair`, async ({ page }) => {
  await page.setViewportSize(layout === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await openDesktop(page, "dns-stopped", true);
  const clientCommand = page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true });
  const serverCommand = page.getByRole("textbox", { name: "Lệnh trên SRV-01", exact: true });
  await expect(clientCommand).toBeFocused();
  await expect(clientCommand).toHaveValue("ping 192.168.10.10");
  await expect(clientCommand).toBeInViewport();
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") await page.screenshot({ path: `output/screenshots/desktop-dns-guide-${layout}.png` });
  await page.getByRole("button", { name: "Chạy", exact: true }).click();
  await expect(clientCommand).toHaveValue("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy", exact: true }).click();
  await expect(serverCommand).toBeFocused();
  await expect(serverCommand).toHaveValue("Get-Service DNS");
  await page.getByRole("button", { name: "Chạy", exact: true }).click();
  const start = page.getByRole("region", { name: "Services · SRV-01", exact: true }).getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeFocused();
  await expect(start).toBeEnabled();
  await expect(start).toBeInViewport();
  await expect(page.getByText("Bước 4/6 · Khôi phục dịch vụ DNS", { exact: true })).toBeVisible();
  await start.click();
  await expect(clientCommand).toBeFocused();
  await expect(clientCommand).toHaveValue("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy", exact: true }).click();
  await expect(clientCommand).toHaveValue("curl http://portal.lab.test");
  await page.getByRole("button", { name: "Chạy", exact: true }).click();
  await expect(page.getByText("Đã hoàn thành hướng dẫn DNS", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}

test("desktop remains operable by keyboard on a small screen without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDesktop(page, "healthy");
  const client = page.getByRole("button", { name: "Chọn máy trạm CLIENT-01", exact: true });
  await client.focus();
  await page.keyboard.press("Enter");
  const shortcut = page.getByRole("button", { name: "Mở PowerShell", exact: true });
  await shortcut.focus();
  await page.keyboard.press("Enter");
  const terminal = page.getByRole("region", { name: "PowerShell · CLIENT-01", exact: true });
  const command = terminal.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true });
  await command.fill("nslookup portal.lab.test");
  await command.press("Enter");
  await expect(terminal.getByTestId("desktop-terminal-output")).toContainText("Address: 192.168.10.10");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.SUPPORTLAB_CAPTURE_DESKTOP === "true") await page.screenshot({ path: "output/screenshots/desktop-dns-mobile.png", fullPage: true });
  await terminal.getByRole("button", { name: "Thu nhỏ PowerShell", exact: true }).click();
  const task = page.getByRole("button", { name: "Khôi phục cửa sổ PowerShell", exact: true });
  await task.focus();
  await task.press("Enter");
  await expect(terminal).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
