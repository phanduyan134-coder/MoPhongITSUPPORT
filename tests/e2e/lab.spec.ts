import { test, expect, type Page } from "@playwright/test";
import { initialPC } from "../../src/lib/engine";

async function command(page: Page, value: string) {
  await page.getByRole("tab", { name: "Command Prompt", exact: true }).click();
  await page.getByRole("textbox", { name: "Lệnh CMD" }).fill(value);
  await page.getByRole("button", { name: "Thực thi lệnh" }).click();
  return page.getByRole("log").locator(".terminal-entry").last();
}

async function setNetworkField(page: Page, field: string, value: string) {
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await page.getByRole("textbox", { name: field, exact: true }).fill(value);
  await page.getByRole("button", { name: "Áp dụng cấu hình" }).click();
}

async function prepareAndLoadStorageDriver(page: Page) {
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  const preparation = page.getByRole("dialog", { name: "Chuẩn bị driver lưu trữ", exact: true });
  await preparation.getByRole("button", { name: "Tải gói mô phỏng", exact: true }).click();
  await preparation.getByRole("button", { name: "Giải nén gói", exact: true }).click();
  await preparation.getByRole("button", { name: "Chép vào USB", exact: true }).click();
  await preparation.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Nạp driver Intel VMD", exact: true }).click();
  const loader = page.getByRole("dialog", { name: "Nạp driver lưu trữ", exact: true });
  await loader.getByRole("button", { name: "Browse", exact: true }).click();
  await loader.getByRole("combobox", { name: "Thư mục driver", exact: true }).selectOption("storage");
  await loader.getByRole("button", { name: "Chọn thư mục", exact: true }).click();
  await loader.getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true }).check();
  await loader.getByRole("button", { name: "Nạp driver", exact: true }).click();
}

test("default session is a healthy desktop with freely accessible tools", async ({ page }) => {
  await page.goto("/pc");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Máy tính mô phỏng");
  await expect(page.getByRole("tab", { name: "Màn hình", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Windows 11");
  await expect(page.getByRole("region", { name: "Trạng thái máy", exact: true })).toContainText("Có Internet / DNS hoạt động");
  await expect(page.getByRole("checkbox", { name: "Cắm USB cài Windows" })).not.toBeChecked();
  await expect(page.getByText(/bài thực hành|yêu cầu khách hàng|điểm số|đã xử lý/i)).toHaveCount(0);
  await expect(await command(page, "ping example.com")).toContainText("Received = 4");
  await page.getByRole("tab", { name: "BIOS / UEFI", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Secure Boot", exact: true })).toBeDisabled();
  await page.getByRole("region", { name: "Điều khiển máy", exact: true }).getByRole("button", { name: "Tắt máy", exact: true }).click();
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Adapter inactive");
  await expect(page.locator(".network-topology .connection.connected")).toHaveCount(0);
});

test("blank PC installs Windows through BIOS, attached USB and one-time SSD boot", async ({ page }) => {
  await page.goto("/pc");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("combobox", { name: "Trạng thái khởi tạo" }).selectOption("blank");
  await page.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Máy đang tắt");
  const controls = page.getByRole("region", { name: "Điều khiển máy", exact: true });
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /USB Drive/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await controls.getByRole("button", { name: "Vào BIOS", exact: true }).click();
  const order = await page.locator(".boot-list li strong").allTextContents();
  expect(order).toEqual(["USB Drive", "NVMe SSD", "Network Boot"]);
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await page.getByRole("switch", { name: "TPM 2.0", exact: true }).click();
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows" }).check();
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true }).click();
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
  await prepareAndLoadStorageDriver(page);
  await page.getByRole("button", { name: "Chuẩn bị GPT & phân vùng" }).click();
  await page.getByRole("button", { name: "Xóa & tạo phân vùng" }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Cài đặt Windows", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Windows đã có trên SSD");
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "NVMe SSD", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Windows 11");
  await page.getByRole("tab", { name: "BIOS / UEFI", exact: true }).click();
  expect(await page.locator(".boot-list li strong").allTextContents()).toEqual(order);
  await controls.getByRole("button", { name: "Khởi động lại", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Windows 11 Setup", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows" }).uncheck();
  await controls.getByRole("button", { name: "Bật máy", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Windows 11");
});

test("DNS edits affect CMD and new sessions clear chat, commands and actions", async ({ page }) => {
  await page.goto("/pc");
  await setNetworkField(page, "DNS Server", "999.1.1.1");
  await expect(page.getByRole("alert").filter({ hasText: "IPv4 hợp lệ" })).toBeVisible();
  await setNetworkField(page, "DNS Server", "192.168.1.254");
  await expect(await command(page, "ping 8.8.8.8")).toContainText("Received = 4");
  await expect(await command(page, "nslookup example.com")).toContainText("DNS request timed out");
  await page.getByRole("button", { name: "Phân tích trạng thái máy", exact: true }).click();
  await expect(page.getByText("Gợi ý cục bộ · không dùng AI", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-message.assistant")).toContainText("DNS 192.168.1.254");
  await setNetworkField(page, "DNS Server", "1.1.1.1");
  await expect(await command(page, "nslookup example.com")).toContainText("93.184.215.14");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(page.getByText("Chưa có thao tác trong phiên này.", { exact: true })).toBeVisible();
  await expect(page.getByText("0 sự kiện", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-message")).toHaveCount(0);
  await page.getByRole("tab", { name: "Command Prompt", exact: true }).click();
  await expect(page.getByRole("log").locator(".terminal-entry")).toHaveCount(0);
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "DNS Server", exact: true })).toHaveValue("192.168.1.1");
});

test("router DHCP availability and client renew control the simulated lease", async ({ page }) => {
  await page.goto("/pc");
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await page.getByRole("switch", { name: "Dịch vụ DHCP trên router" }).click();
  await page.getByRole("switch", { name: "Nhận IP tự động", exact: true }).click();
  await page.getByRole("button", { name: "Áp dụng cấu hình" }).click();
  await expect(page.getByRole("textbox", { name: "Địa chỉ IPv4", exact: true })).toHaveValue("169.254.12.8");
  await expect(await command(page, "ipconfig /renew")).toContainText("Unable to contact your DHCP server");
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await page.getByRole("switch", { name: "Dịch vụ DHCP trên router" }).click();
  await expect(page.getByRole("textbox", { name: "Địa chỉ IPv4", exact: true })).toHaveValue("169.254.12.8");
  await expect(await command(page, "ipconfig /renew")).toContainText("DHCP lease renewed");
  await expect(await command(page, "ping example.com")).toContainText("Received = 4");
  await expect(await command(page, "ipconfig /release")).toContainText("Đã giải phóng địa chỉ DHCP");
  await expect(await command(page, "ping 8.8.8.8")).toContainText("100% loss");
});

test("gateway edits preserve LAN and cancelling a session retains the current PC", async ({ page }) => {
  await page.goto("/pc");
  await setNetworkField(page, "Default Gateway", "192.168.1.254");
  await expect(await command(page, "ping 192.168.1.10")).toContainText("Received = 4");
  await expect(await command(page, "ping 8.8.8.8")).toContainText("100% loss");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("combobox", { name: "Trạng thái khởi tạo" }).selectOption("blank");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "Cấu hình mạng", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Default Gateway", exact: true })).toHaveValue("192.168.1.254");
  await setNetworkField(page, "Default Gateway", "192.168.1.1");
  await expect(await command(page, "ping 8.8.8.8")).toContainText("Received = 4");
});

test("agent accepts PC snapshots and rejects malformed or legacy-only requests", async ({ request }) => {
  const valid = { pc: initialPC(), history: [{ role: "user", content: "Phân tích trạng thái máy" }], actions: [], terminal: [] };
  const result = await request.post("/api/agent", { data: valid });
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ source: "local", message: expect.stringContaining("Windows đang chạy") });
  for (const data of [{ ...valid, pc: {} }, { ...valid, pc: { ...valid.pc, media: undefined } }, { scenarioId: "other" }]) {
    expect((await request.post("/api/agent", { data })).status()).toBe(400);
  }
});

for (const viewport of [{ name: "desktop", width: 1440, height: 1050 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} layout renders five tools without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/pc");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const tab of ["Màn hình", "BIOS / UEFI", "Cài đặt Windows", "Cấu hình mạng", "Command Prompt"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("tab", { name: "Màn hình", exact: true }).click();
    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Mở công cụ", exact: true }).click();
      const tools = page.getByRole("navigation", { name: "Công cụ mô phỏng", exact: true });
      await expect(tools).toBeVisible();
      await tools.getByRole("button", { name: "Cấu hình mạng", exact: true }).click();
      await expect(page.getByRole("tab", { name: "Cấu hình mạng", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "Màn hình", exact: true }).click();
    }
    await page.screenshot({ path: `output/screenshots/${viewport.name}.png`, fullPage: true });
  });
}
