import { expect, test, type Page } from "@playwright/test";

async function openGuide(page: Page) {
  await page.goto("/system?workspace=classic&preset=dns-stopped&guide=dns");
  await expect(page.getByRole("region", { name: "Dẫn thao tác DNS", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toBeFocused();
}

async function selectTool(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Mở điều hướng", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("guided DNS explains the focused control and completes on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await openGuide(page);
    const progress = page.getByRole("list", { name: "Tiến trình mô phỏng DNS" });
    const note = page.getByRole("complementary", { name: "Giải thích thao tác hiện tại" });
    const command = page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true });
    await expect(progress.locator('[aria-current="step"]')).toContainText("Kết nối IP");
    await expect(command).toHaveAttribute("aria-describedby", "dns-guide-target");
    await expect(note).toContainText("Received = 4");
    await expect(note).toHaveCSS("opacity", "1");
    await expect(page.locator(".sl-guide-current")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `output/screenshots/dns-guidance-${name}-start.png`, fullPage: true });

    await selectTool(page, "Kết nối mạng");
    await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
    await expect(command).toBeFocused();
    await expect(command).toHaveValue("ping 192.168.10.10");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(command).toHaveValue("nslookup portal.lab.test");
    await expect(progress.locator('[aria-current="step"]')).toContainText("Tra DNS");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(command).toHaveValue("Get-Service DNS");
    await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("server");
    await expect(note).toContainText("Timeout chưa xác định được nguyên nhân");
    await expect(page.getByRole("checkbox", { name: "DNS đang chạy", exact: true })).toHaveCount(0);
    await page.getByLabel("Thiết bị terminal", { exact: true }).selectOption("client");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(page.locator(".sl-guide-feedback")).toContainText("SRV-01");
    await expect(progress.locator('[aria-current="step"]')).toContainText("Dịch vụ");
    await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
    await expect(command).toHaveValue("Get-Service DNS");
    await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("server");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    const toggle = page.getByRole("checkbox", { name: "DNS đang chạy", exact: true });
    await expect(toggle).toBeFocused();
    await expect(note).toContainText("Khởi động dịch vụ DNS trên SRV-01");
    await expect(toggle).not.toBeChecked();
    await expect(note).toHaveCSS("opacity", "1");
    await expect(page.locator(".sl-guide-current")).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/dns-guidance-${name}-repair.png` });
    await toggle.click();
    await expect(command).toHaveValue("nslookup portal.lab.test");
    await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("client");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(command).toHaveValue("curl http://portal.lab.test");
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect(page.getByText("Đã hoàn thành hướng dẫn DNS", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Xem tổng quan", exact: true }).click();
    await expect(page.getByTestId("portal-flow")).toContainText("HTTP sẵn sàng");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("wrong-device diagnostics keep the step and explain how to recover", async ({ page }) => {
  await openGuide(page);
  await page.getByLabel("Thiết bị terminal", { exact: true }).selectOption("server");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.locator(".sl-guide-feedback")).toContainText("Chọn CLIENT-01");
  await expect(page.getByRole("list", { name: "Tiến trình mô phỏng DNS" }).locator('[aria-current="step"]')).toContainText("Kết nối IP");
  await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("client");
  await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toHaveValue("ping 192.168.10.10");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.getByText("Bước 2/6 · Kiểm tra phân giải tên", { exact: true })).toBeVisible();
});

test("a service already running is verified without asking the user to toggle it", async ({ page }) => {
  await openGuide(page);
  const command = page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true });
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("Get-Service DNS");
  await selectTool(page, "DNS / DHCP");
  await page.getByRole("checkbox", { name: "DNS đang chạy", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "DNS đang chạy", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Đến thao tác hiện tại", exact: true }).click();
  await expect(command).toHaveValue("Get-Service DNS");
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("server");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("nslookup portal.lab.test");
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("client");
  await expect(page.getByText("Bước 5/6 · Xác minh lại DNS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("curl http://portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.getByText("Đã hoàn thành hướng dẫn DNS", { exact: true })).toBeVisible();
});

test("stale diagnostic revisions cannot advance the guide", async ({ page }) => {
  await openGuide(page);
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation !== "diagnose") return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, revision: data.revision + 1 } });
  });
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.locator(".sl-guide-feedback")).toContainText("Cấu hình đã thay đổi");
  await expect(page.getByText("Bước 1/6 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
});

test("reduced-motion guidance retains focus and can be stopped", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page);
  const target = page.locator(".sl-terminal-form.sl-guide-focus");
  expect(await target.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.getByRole("button", { name: "Dừng dẫn thao tác", exact: true }).click();
  await expect(page.getByRole("region", { name: "Dẫn thao tác DNS", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Giải thích thao tác hiện tại" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dẫn thao tác DNS", exact: true })).toBeVisible();
});

test("retrying a failed launch retains the DNS preset and guided mode", async ({ page }) => {
  let failed = false;
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation !== "create" || failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 503, json: { error: "Tạm thời chưa mở được phiên." } });
  });
  await page.goto("/system?workspace=classic&preset=dns-stopped&guide=dns");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByText("Bước 1/6 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toHaveValue("ping 192.168.10.10");
});

test("a diagnostic from a stopped guide cannot advance a restarted guide", async ({ page }) => {
  await openGuide(page);
  let intercepted = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation !== "diagnose") return route.continue();
    const response = await route.fetch();
    intercepted = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await page.getByRole("button", { name: "Dừng dẫn thao tác", exact: true }).click();
    await page.getByRole("button", { name: "Dẫn thao tác DNS", exact: true }).click();
    release();
    await expect(page.getByRole("button", { name: "Chạy lệnh", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true })).toHaveValue("ping 192.168.10.10");
    await expect(page.getByText("Bước 1/6 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
  } finally { release(); }
});
