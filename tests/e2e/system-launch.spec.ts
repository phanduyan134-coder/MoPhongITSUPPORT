import { test, expect, type Page } from "@playwright/test";

async function returnHome(page: Page) {
  await page.getByRole("link", { name: /trang chủ/i }).click();
  await expect(page.getByRole("heading", { name: "Bạn muốn mô phỏng", exact: false })).toBeVisible();
}

async function chooseDns(page: Page) {
  await page.getByRole("button", { name: "Chọn nhóm DNS / DHCP", exact: true }).click();
  await page.locator('article').filter({ has: page.getByRole("heading", { name: "Không phân giải được tên nội bộ", exact: true }) }).getByRole("link", { name: "Có hướng dẫn", exact: true }).click();
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await expect(page.getByText("Bước 1/6 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true })).toHaveValue("ping 192.168.10.10");
}

test("homepage selection replaces a retained session, including reentering the same repaired preset", async ({ page }) => {
  await page.goto("/");
  await chooseDns(page);
  await returnHome(page);
  await chooseDns(page);
  await expect(page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true })).toHaveValue("ping 192.168.10.10");
});
