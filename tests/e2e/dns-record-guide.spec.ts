import { expect, test, type Page } from "@playwright/test";

async function openDesktop(page: Page) {
  await page.goto("/system?preset=dns-record&workspace=desktop&guide=dns-record");
  await expect(page.locator(".iw-workspace")).toBeVisible();
  await expect(page.getByText("Bước 1/5 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
}

async function runGuided(page: Page, device: "client" | "server", command: string) {
  const terminal = page.getByRole("region", { name: `PowerShell · ${device === "client" ? "CLIENT-01" : "SRV-01"}`, exact: true });
  await expect(terminal).toBeVisible();
  const input = terminal.getByRole("textbox", { name: `Lệnh trên ${device === "client" ? "CLIENT-01" : "SRV-01"}`, exact: true });
  await expect(input).toHaveValue(command);
  await terminal.getByRole("button", { name: "Chạy", exact: true }).click();
  return terminal;
}

test("DNS A-record guided desktop flow requires Apply and fresh verification", async ({ page }) => {
  await openDesktop(page);
  await runGuided(page, "client", "ping 192.168.10.10");
  await expect(page.getByText("Bước 2/5 · Kiểm tra câu trả lời DNS", { exact: true })).toBeVisible();
  await runGuided(page, "client", "nslookup portal.lab.test");
  await expect(page.getByText("Bước 3/5 · Cập nhật bản ghi portal", { exact: true })).toBeVisible();

  const dns = page.getByRole("region", { name: "DNS Manager · SRV-01", exact: true });
  await expect(dns).toBeVisible();
  await expect(dns.getByRole("button", { name: "Properties", exact: true })).toBeFocused();
  await dns.getByRole("button", { name: "Properties", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "portal Properties", exact: true });
  await dialog.getByRole("textbox", { name: "IPv4 address", exact: true }).fill("192.168.10.10");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Bước 4/5 · Truy vấn lại bản ghi", { exact: true })).toBeVisible();

  await runGuided(page, "client", "nslookup portal.lab.test");
  await expect(page.getByText("Bước 5/5 · Xác minh truy cập theo tên", { exact: true })).toBeVisible();
  await runGuided(page, "client", "curl http://portal.lab.test");
  await expect(page.getByText("Đã hoàn thành hướng dẫn DNS · Bản ghi A", { exact: true })).toBeVisible();
});
