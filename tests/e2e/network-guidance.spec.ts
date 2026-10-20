import { test, expect, type Page } from "@playwright/test";

function guide(page: Page) {
  return page.getByRole("region", { name: "Hướng dẫn làm cùng", exact: true });
}

function machine(page: Page) {
  return page.getByRole("region", { name: "Trạng thái máy", exact: true });
}

async function openNetworkGuide(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await guide(page).getByRole("combobox", { name: "Nội dung hướng dẫn", exact: true }).selectOption("network");
  await expect(guide(page)).toHaveAttribute("data-guide-mode", "network");
}

async function expectStep(page: Page, step: string) {
  await expect(guide(page)).toHaveAttribute("data-guide-step", step);
}

async function command(page: Page, value: string) {
  await page.getByRole("tab", { name: "Command Prompt", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Lệnh CMD", exact: true });
  await input.fill(value);
  await input.press("Enter");
  const output = page.getByRole("log").locator(".terminal-entry").last();
  await expect(output).toContainText(value);
  return output;
}

async function setNetworkField(page: Page, field: string, value: string) {
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await page.getByRole("textbox", { name: field, exact: true }).fill(value);
  await page.getByRole("button", { name: "Áp dụng cấu hình", exact: true }).click();
}

test("choosing network guidance and locating CMD do not change the PC or execute commands", async ({ page }) => {
  await page.goto("/");
  const originalState = await machine(page).innerText();
  const originalLog = await page.locator(".activity-list").innerText();
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  const selector = guide(page).getByRole("combobox", { name: "Nội dung hướng dẫn", exact: true });
  await expect(selector).toHaveValue("windows");
  await selector.selectOption("network");
  await expectStep(page, "network-inspect");
  await expect(guide(page).locator("code")).toContainText("ipconfig /all");
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Command Prompt", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Lệnh CMD", exact: true })).toBeFocused();
  await expect(page.getByRole("log").locator(".terminal-entry")).toHaveCount(0);
  await expectStep(page, "network-inspect");
  await expect(machine(page)).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });

  await guide(page).getByRole("button", { name: "Tắt hướng dẫn", exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.locator(".guide-highlight")).toHaveCount(0);
  await expect(machine(page)).toHaveText(originalState, { useInnerText: true });
});

test("healthy checks require manual commands and DNS changes invalidate earlier evidence", async ({ page }) => {
  await openNetworkGuide(page);
  for (const [step, value, next] of [
    ["network-inspect", "ipconfig /all", "network-router"],
    ["network-router", "ping 192.168.1.1", "network-lan"],
    ["network-lan", "ping 192.168.1.10", "network-internet"],
    ["network-internet", "ping 8.8.8.8", "network-name"],
    ["network-name", "nslookup example.com", "network-complete"],
  ]) {
    await expectStep(page, step);
    await expect(guide(page).locator("code")).toContainText(value);
    await command(page, value);
    await expectStep(page, next);
  }

  await setNetworkField(page, "DNS Server", "192.168.1.254");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-dns");
  const beforeLocate = await machine(page).innerText();
  const beforeLocateLog = await page.locator(".activity-list").innerText();
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Cấu hình mạng", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "DNS Server", exact: true })).toBeFocused();
  await expect(machine(page)).toHaveText(beforeLocate, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeLocateLog, { useInnerText: true });
  await expect(await command(page, "nslookup example.com")).toContainText("DNS request timed out");
  await expectStep(page, "network-dns");

  await setNetworkField(page, "DNS Server", "1.1.1.1");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
  for (const value of ["ping 192.168.1.1", "ping 192.168.1.10", "ping 8.8.8.8", "nslookup example.com"]) {
    await command(page, value);
  }
  await expectStep(page, "network-complete");
});

test("DHCP guidance follows router recovery and an explicitly requested lease renewal", async ({ page }) => {
  await openNetworkGuide(page);
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await page.getByRole("switch", { name: "Dịch vụ DHCP trên router", exact: true }).click();
  await page.getByRole("switch", { name: "Nhận IP tự động", exact: true }).click();
  await page.getByRole("button", { name: "Áp dụng cấu hình", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Địa chỉ IPv4", exact: true })).toHaveValue("169.254.12.8");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-dhcp-server");
  const beforeLocate = await page.locator(".activity-list").innerText();
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  const router = page.getByRole("switch", { name: "Dịch vụ DHCP trên router", exact: true });
  await expect(router).toBeFocused();
  await expect(router).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".activity-list")).toHaveText(beforeLocate, { useInnerText: true });
  await router.click();
  await expectStep(page, "network-inspect");
  await expect(page.getByRole("textbox", { name: "Địa chỉ IPv4", exact: true })).toHaveValue("169.254.12.8");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-renew");
  await expect(guide(page).locator("code")).toContainText("ipconfig /renew");
  await expect(await command(page, "ipconfig /renew")).toContainText("DHCP lease renewed");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
  await expect(machine(page)).toContainText("192.168.1.50");
});

test("unapplied DNS edits keep the repair step and move its target to Apply", async ({ page }) => {
  await openNetworkGuide(page);
  await setNetworkField(page, "DNS Server", "192.168.1.254");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-dns");
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  const dns = page.getByRole("textbox", { name: "DNS Server", exact: true });
  await expect(dns).toBeFocused();
  const originalState = await machine(page).innerText();
  const originalLog = await page.locator(".activity-list").innerText();
  await dns.fill("1.1.1.1");
  await expectStep(page, "network-dns");
  await expect(page.getByText("Chưa áp dụng thay đổi", { exact: true })).toBeVisible();
  await expect(machine(page)).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });
  const apply = page.getByRole("button", { name: "Áp dụng cấu hình", exact: true });
  await expect(apply).toHaveClass(/guide-highlight/);
  await expect(dns).not.toHaveClass(/guide-highlight/);
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(apply).toBeFocused();
  await expectStep(page, "network-dns");
  await expect(machine(page)).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });
  await apply.click();
  await expectStep(page, "network-inspect");
  await expect(page.getByText("Chưa áp dụng thay đổi", { exact: true })).toHaveCount(0);
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
});

test("saved static IP and gateway faults point to their corresponding repair fields", async ({ page }) => {
  await openNetworkGuide(page);
  await setNetworkField(page, "Địa chỉ IPv4", "10.0.0.50");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-ip");
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Địa chỉ IPv4", exact: true })).toBeFocused();
  await setNetworkField(page, "Địa chỉ IPv4", "192.168.1.50");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");

  await setNetworkField(page, "Default Gateway", "192.168.1.254");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-gateway");
  await expect(await command(page, "ping 192.168.1.10")).toContainText("Received = 4");
  await expectStep(page, "network-gateway");
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Default Gateway", exact: true })).toBeFocused();
  await setNetworkField(page, "Default Gateway", "192.168.1.1");
  await expectStep(page, "network-inspect");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
});

test("a PC without Windows offers installation guidance without installing anything", async ({ page }) => {
  await openNetworkGuide(page);
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Trạng thái khởi tạo", exact: true }).selectOption("blank");
  await page.getByRole("dialog").getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expectStep(page, "network-no-windows");
  const beforeSwitch = await machine(page).innerText();
  await guide(page).getByRole("button", { name: "Chuyển sang cài Windows", exact: true }).click();
  await expect(guide(page)).toHaveAttribute("data-guide-mode", "windows");
  await expectStep(page, "connect-usb");
  await expect(machine(page)).toHaveText(beforeSwitch, { useInnerText: true });
  await expect(page.getByText("0 sự kiện", { exact: true })).toBeVisible();
});

test("starting Windows is a separate action and power changes discard earlier network checks", async ({ page }) => {
  await openNetworkGuide(page);
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
  await page.getByRole("region", { name: "Điều khiển máy", exact: true }).getByRole("button", { name: "Tắt máy", exact: true }).click();
  await expectStep(page, "network-start-windows");
  const beforeLocate = await machine(page).innerText();
  const beforeLocateLog = await page.locator(".activity-list").innerText();
  await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  const boot = page.getByRole("dialog").getByRole("button", { name: "NVMe SSD", exact: true });
  await expect(boot).toBeFocused();
  await expect(boot).toHaveClass(/guide-highlight/);
  await expect(machine(page)).toHaveText(beforeLocate, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeLocateLog, { useInnerText: true });
  await boot.click();
  await expectStep(page, "network-inspect");
  await expect(machine(page)).toContainText("Windows đang chạy");
});

test("switching guidance content preserves Windows reinstall intent and network observations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await guide(page).getByRole("button", { name: "Cài lại trên máy này", exact: true }).click();
  await expectStep(page, "connect-usb");
  const selector = guide(page).getByRole("combobox", { name: "Nội dung hướng dẫn", exact: true });
  await selector.selectOption("network");
  await command(page, "ipconfig /all");
  await expectStep(page, "network-router");
  const beforeSwitch = await machine(page).innerText();
  const beforeSwitchLog = await page.locator(".activity-list").innerText();
  await selector.selectOption("windows");
  await expectStep(page, "connect-usb");
  await expect(machine(page)).toHaveText(beforeSwitch, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeSwitchLog, { useInnerText: true });
  await selector.selectOption("network");
  await expectStep(page, "network-router");
  await expect(machine(page)).toHaveText(beforeSwitch, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeSwitchLog, { useInnerText: true });
});

for (const viewport of [{ name: "desktop", width: 1440, height: 1050 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} network guidance and its command stay readable without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNetworkGuide(page);
    await expectStep(page, "network-inspect");
    await expect(guide(page).locator("code")).toContainText("ipconfig /all");
    await guide(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Lệnh CMD", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/network-guidance-${viewport.name}.png`, fullPage: true });
  });
}
