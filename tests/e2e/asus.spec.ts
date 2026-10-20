import { test, expect } from "@playwright/test";

test("ASUS catalog keeps unknown models generic and applies CPU and device context", async ({ page }) => {
  await page.goto("/handbook");
  await page.getByLabel("Thiết bị", { exact: true }).selectOption("asus");
  await page.getByLabel("Tìm model ASUS").fill("x515ea");
  await expect(page.locator(".asus-evidence")).toContainText("X515EA · Hướng dẫn chung");
  await expect(page.locator(".asus-evidence")).toContainText("Chưa đối chiếu nội dung manual");
  await page.getByLabel("Nền tảng CPU trên máy").selectOption("intel");
  await page.getByRole("button", { name: /Kiểm tra SSD và driver/ }).click();
  await expect(page.locator(".guide-content")).toContainText("một số nền tảng mới");
  await page.getByLabel("Tôi đã tự kiểm tra bước này").check();
  await page.getByLabel("Tìm model ASUS").fill("FA506NC");
  await expect(page.getByLabel("Nền tảng CPU trên máy")).toHaveValue("unknown");
  await expect(page.locator(".guide-nav .section-title")).toContainText("0/9");
  await page.getByLabel("Nền tảng CPU trên máy").selectOption("amd");
  await page.getByRole("button", { name: /Kiểm tra SSD và driver/ }).click();
  await expect(page.locator(".guide-content")).toContainText("không nạp driver Intel IRST/VMD");
  await page.getByLabel("Tìm model ASUS").fill("FA506NC-unknown");
  await expect(page.locator(".asus-empty")).toContainText("Chưa có hồ sơ khớp");
  await expect(page.locator(".asus-evidence")).not.toContainText("Trang hỗ trợ đã mở");
  await page.getByLabel("Nhóm thiết bị ASUS").selectOption("desktop");
  await expect(page.getByLabel("Tìm model ASUS")).toHaveValue("");
  await expect(page.locator(".device-summary")).toContainText("Theo manual model");
  await page.getByRole("button", { name: /D500ME/ }).click();
  await page.getByRole("button", { name: /Mở menu khởi động/ }).click();
  await expect(page.locator(".guide-content")).toContainText("máy bàn ASUS nguyên bộ");
  await page.getByLabel("Nhóm thiết bị ASUS").selectOption("motherboard");
  await page.getByRole("button", { name: /PRIME B760M-A WIFI D4/ }).click();
  await expect(page.locator(".device-summary")).toContainText("F8");
  await page.getByRole("button", { name: /Cài driver và cập nhật/ }).click();
  await expect(page.locator(".guide-content")).toContainText("model và revision mainboard");
  await page.getByLabel("Mục tiêu cài đặt").selectOption("preserve");
  await expect(page.getByRole("button", { name: /Mở menu khởi động/ })).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".guide-print")).toContainText("Mainboard ASUS / PC tự ráp");
  await expect(page.locator(".guide-print")).toContainText("Hướng dẫn chung");
});

test("ASUS ARM fallback and responsive catalog", async ({ page }) => {
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/handbook");
    await page.getByLabel("Thiết bị", { exact: true }).selectOption("asus");
    await page.getByLabel("Tìm model ASUS").fill("Unknown-ARM");
    await page.getByLabel("Nền tảng CPU trên máy").selectOption("arm");
    await page.getByRole("button", { name: /Tạo USB/ }).click();
    await expect(page.locator(".guide-content")).toContainText("Windows 11 ARM64");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/asus-${name}.png`, fullPage: true });
  }
});
