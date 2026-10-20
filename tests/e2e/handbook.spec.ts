import { test, expect } from "@playwright/test";

test("handbook selects manufacturer, separates motherboard shortcuts and branches for preserving apps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Sổ tay cài Windows/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cài Windows theo thiết bị");
  await expect(page.locator(".device-summary")).toContainText("F12");
  await page.getByLabel("Thiết bị", { exact: true }).selectOption("hp");
  await expect(page.locator(".device-summary")).toContainText("Esc → F9");
  await page.getByLabel("Thiết bị", { exact: true }).selectOption("asus");
  await expect(page.locator(".device-summary")).toContainText("Esc (thường gặp)");
  await page.getByLabel("Thiết bị", { exact: true }).selectOption("pc");
  await page.getByLabel("Hãng mainboard", { exact: true }).selectOption("msi");
  await expect(page.locator(".device-summary")).toContainText("F11");
  await page.getByLabel("Model thiết bị").fill("B760 - ghi chú thử");
  await page.getByLabel("Tôi đã tự kiểm tra bước này").check();
  await expect(page.locator(".guide-nav .section-title")).toContainText("1/9");
  await page.getByLabel("Mục tiêu cài đặt").selectOption("preserve");
  await expect(page.locator(".guide-nav .section-title")).toContainText("0/5");
  await expect(page.getByRole("button", { name: /Tạo USB/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Cài lại trong Windows/ }).click();
  await expect(page.locator(".guide-content")).toContainText("Keep personal files and apps");
  await page.getByRole("button", { name: "Bước tiếp", exact: true }).click();
  await expect(page.locator(".guide-content>h2")).toHaveText("Cài driver và cập nhật");
  await page.getByRole("button", { name: "Bước trước", exact: true }).click();
  await expect(page.locator(".guide-content>h2")).toHaveText("Cài lại trong Windows để giữ ứng dụng");
});

test("handbook readable at desktop and mobile and prints all steps", async ({ page }) => {
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/handbook");
    await page.getByRole("button", { name: /Chọn ổ đích và phân vùng/ }).click();
    await expect(page.locator(".guide-warning")).toContainText("Delete/Format");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/handbook-${name}.png`, fullPage: true });
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".guide-print")).toBeVisible();
  await expect(page.locator(".guide-print h3")).toHaveCount(9);
  await expect(page.locator(".handbook-grid")).toBeHidden();
});
