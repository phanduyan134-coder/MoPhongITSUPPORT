import { expect, test, type Page } from "@playwright/test";

const scenarios = {
  dhcp: { preset: "dhcp-stopped", label: "DHCP", title: "Máy trạm chưa nhận địa chỉ", command: "ipconfig /all", device: "client" },
  iis: { preset: "iis-pool", label: "IIS", title: "Website trả về HTTP 503", command: "nslookup portal.lab.test", device: "client" },
  gateway: { preset: "network-gateway", label: "Gateway", title: "Truy cập LAN nhưng không đến mạng khác", command: "ipconfig /all", device: "client" },
  disk: { preset: "disk-full", label: "Ổ đĩa", title: "Không ghi được dữ liệu", command: "Get-Volume", device: "server" },
} as const;

type Scenario = keyof typeof scenarios;

async function openGuide(page: Page, scenario: Scenario) {
  const { preset, label, command, device } = scenarios[scenario];
  await page.goto(`/system?workspace=classic&preset=${preset}&guide=${scenario}`);
  await expect(page.getByRole("region", { name: `Dẫn thao tác ${label}`, exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toHaveValue(command);
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue(device);
}

async function runGuidedCommand(page: Page, command: string, device = "client") {
  const input = page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true });
  await expect(input).toHaveValue(command);
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue(device);
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
}

async function currentStep(page: Page, scenario: Scenario) {
  return page.getByRole("list", { name: `Tiến trình mô phỏng ${scenarios[scenario].label}`, exact: true }).locator('[aria-current="step"]');
}

async function captureTarget(page: Page, scenario: Scenario, viewport: string, suffix = "repair") {
  const note = page.getByRole("complementary", { name: "Giải thích thao tác hiện tại", exact: true });
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS("opacity", "1");
  await expect(page.locator(".sl-guide-current")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/screenshots/${scenario}-guidance-${viewport}-${suffix}.png` });
}

async function expectComplete(page: Page, scenario: Scenario) {
  await expect(page.getByText(`Đã hoàn thành hướng dẫn ${scenarios[scenario].label}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

const viewports = [["desktop", 1440, 1000], ["mobile", 390, 844]] as const;

test("home groups launch guided desktops and replace sessions through client-side navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Chọn nhóm / })).toHaveCount(4);
  for (const scenario of Object.keys(scenarios) as Scenario[]) {
    const { title, preset, device, command } = scenarios[scenario];
    const group = scenario === "dhcp" ? "DNS / DHCP" : scenario === "iis" ? "Web Server IIS" : scenario === "gateway" ? "Kết nối mạng" : "Windows Server";
    await page.getByRole("button", { name: `Chọn nhóm ${group}`, exact: true }).click();
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await card.getByRole("link", { name: "Có hướng dẫn", exact: true }).click();
    await expect(page).toHaveURL(`/system?preset=${preset}&workspace=desktop&guide=${scenario}`);
    await expect(page.getByTestId("device-desktop")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Không gian hệ thống", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: device === "client" ? "Chọn máy trạm CLIENT-01" : "Chọn máy chủ SRV-01", exact: true }).click();
    await page.getByRole("button", { name: "Mở PowerShell", exact: true }).click();
    await expect(page.getByRole("textbox", { name: `Lệnh trên ${device === "client" ? "CLIENT-01" : "SRV-01"}`, exact: true })).toHaveValue(command);
    await page.getByRole("link", { name: "Về trang chủ chọn mô phỏng", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Chọn nhóm / })).toHaveCount(4);
  }
});

test("DHCP guidance focuses service startup, lease renewal and client verification", async ({ page }) => {
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openGuide(page, "dhcp");
    await runGuidedCommand(page, "ipconfig /all");
    await runGuidedCommand(page, "Get-Service DHCPServer", "server");
    const toggle = page.getByRole("checkbox", { name: "DHCP đang chạy", exact: true });
    await expect(toggle).toBeFocused();
    await expect(toggle).not.toBeChecked();
    await captureTarget(page, "dhcp", viewport);
    await toggle.click();
    const renew = page.getByRole("button", { name: "Gia hạn DHCP", exact: true });
    await expect(renew).toBeFocused();
    await captureTarget(page, "dhcp", viewport, "renew");
    await renew.click();
    await runGuidedCommand(page, "ipconfig /all");
    await runGuidedCommand(page, "nslookup portal.lab.test");
    await expectComplete(page, "dhcp");
  }
});

test("IIS guidance waits for an applied pool repair before checking HTTP again", async ({ page }) => {
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openGuide(page, "iis");
    await runGuidedCommand(page, "nslookup portal.lab.test");
    await runGuidedCommand(page, "curl http://portal.lab.test");
    const pool = page.getByRole("checkbox", { name: "Application pool đang chạy", exact: true });
    await expect(pool).toBeFocused();
    await expect(pool).not.toBeChecked();
    await captureTarget(page, "iis", viewport);
    const step = await currentStep(page, "iis");
    const before = await step.textContent();
    await pool.check();
    await expect(step).toHaveText(before!);
    await expect(page.getByRole("complementary", { name: "Giải thích thao tác hiện tại", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Áp dụng IIS", exact: true }).click();
    await runGuidedCommand(page, "curl http://portal.lab.test");
    await expectComplete(page, "iis");
  }
});

test("gateway guidance checks DHCP options and renews the client without switching to static IP", async ({ page }) => {
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openGuide(page, "gateway");
    await runGuidedCommand(page, "ipconfig /all");
    await runGuidedCommand(page, "ping 192.168.10.10");
    await runGuidedCommand(page, "ping 192.168.20.10");
    await runGuidedCommand(page, "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0", "server");
    const dhcp = page.getByRole("checkbox", { name: "Nhận IP qua DHCP", exact: true });
    await expect(dhcp).toBeChecked();
    const renew = page.getByRole("button", { name: "Gia hạn DHCP", exact: true });
    await expect(renew).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Gateway máy trạm", exact: true })).toHaveValue("192.168.10.254");
    await expect(page.getByRole("textbox", { name: "Gateway máy trạm", exact: true })).toBeDisabled();
    await captureTarget(page, "gateway", viewport);
    await renew.click();
    await runGuidedCommand(page, "ipconfig /all");
    await expect(page.getByTestId("terminal-output")).toContainText("DHCP Enabled: Yes");
    await expect(page.getByTestId("terminal-output")).toContainText("Default Gateway: 192.168.10.1");
    await runGuidedCommand(page, "ping 192.168.20.10");
    await expectComplete(page, "gateway");
  }
});

test("disk guidance protects customer data and advances only after confirmed cleanup and a write probe", async ({ page }) => {
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openGuide(page, "disk");
    const volumeResponse = page.waitForResponse((response) => response.url().endsWith("/api/simulation")
      && response.request().postDataJSON()?.command === "Get-Volume");
    await runGuidedCommand(page, "Get-Volume", "server");
    const volume = await (await volumeResponse).json() as { output: string };
    expect(volume.output).toContain("SizeRemaining: 4 MB");
    expect(volume.output).not.toMatch(/Cache-tam-lab|Du-lieu-khach-hang|protected|temporary|removable/);
    const remove = page.getByRole("button", { name: "Xóa Cache-tam-lab.tmp", exact: true });
    await expect(remove).toBeFocused();
    await expect(page.getByRole("button", { name: "Xóa Du-lieu-khach-hang.dat", exact: true })).toBeDisabled();
    await captureTarget(page, "disk", viewport);
    const step = await currentStep(page, "disk");
    const before = await step.textContent();
    await remove.click();
    const dialog = page.getByRole("dialog", { name: "Xóa tệp mô phỏng?", exact: true });
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(step).toHaveText(before!);
    await expect(remove).toBeVisible();
    await remove.click();
    await dialog.getByRole("button", { name: "Xóa tệp", exact: true }).click();
    const write = page.getByRole("button", { name: "Ghi tệp kiểm tra 10 MB", exact: true });
    await expect(write).toBeFocused();
    await captureTarget(page, "disk", viewport, "write");
    await write.click();
    await expectComplete(page, "disk");
    await expect(page.getByRole("button", { name: "Xóa Du-lieu-khach-hang.dat", exact: true })).toBeDisabled();
  }
});

for (const scenario of Object.keys(scenarios) as Scenario[]) {
  test(`${scenario} guidance rejects observations from the wrong device`, async ({ page }) => {
    await openGuide(page, scenario);
    const step = await currentStep(page, scenario);
    const before = await step.textContent();
    await page.getByLabel("Thiết bị terminal", { exact: true }).selectOption(scenarios[scenario].device === "client" ? "server" : "client");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(page.locator(".sl-guide-feedback")).toContainText(scenarios[scenario].device === "client" ? "CLIENT-01" : "SRV-01");
    await expect(step).toHaveText(before!);
    await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
    await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue(scenarios[scenario].device);
    await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toHaveValue(scenarios[scenario].command);
  });
}

test("all additional guides restore focus after navigation and stop without changing the simulation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scenario of Object.keys(scenarios) as Scenario[]) {
    await openGuide(page, scenario);
    const menu = page.getByRole("button", { name: "Mở điều hướng", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
    await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Dừng dẫn thao tác", exact: true }).click();
    await expect(page.getByRole("region", { name: `Dẫn thao tác ${scenarios[scenario].label}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Giải thích thao tác hiện tại", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("system-ready")).toBeVisible();
  }
});
