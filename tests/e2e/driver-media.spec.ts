import { test, expect, type Page } from "@playwright/test";

function preparation(page: Page) {
  return page.getByRole("dialog", { name: "Chuẩn bị driver lưu trữ", exact: true });
}

function loader(page: Page) {
  return page.getByRole("dialog", { name: "Nạp driver lưu trữ", exact: true });
}

async function blankPC(page: Page) {
  await page.goto("/pc");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Trạng thái khởi tạo" }).selectOption("blank");
  await page.getByRole("dialog").getByRole("button", { name: "Tạo phiên", exact: true }).click();
}

async function startInstaller(page: Page) {
  await blankPC(page);
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows", exact: true }).check();
  const controls = page.getByRole("region", { name: "Điều khiển máy", exact: true });
  await controls.getByRole("button", { name: "Vào BIOS", exact: true }).click();
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await page.getByRole("switch", { name: "TPM 2.0", exact: true }).click();
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true }).click();
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
}

async function preparePackage(page: Page, id = "intel-vmd-x64") {
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  const dialog = preparation(page);
  await dialog.getByRole("combobox", { name: "Gói driver mô phỏng", exact: true }).selectOption(id);
  await dialog.getByRole("button", { name: "Tải gói mô phỏng", exact: true }).click();
  await dialog.getByRole("button", { name: "Giải nén gói", exact: true }).click();
  await dialog.getByRole("button", { name: "Chép vào USB", exact: true }).click();
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
}

async function openLoader(page: Page) {
  await page.getByRole("button", { name: "Nạp driver Intel VMD", exact: true }).click();
  await expect(loader(page)).toBeVisible();
}

async function browse(page: Page, folder: string) {
  await loader(page).getByRole("button", { name: "Browse", exact: true }).click();
  await loader(page).getByRole("combobox", { name: "Thư mục driver", exact: true }).selectOption(folder);
  await loader(page).getByRole("button", { name: "Chọn thư mục", exact: true }).click();
}

test("driver media preparation requires extraction and a connected USB before copying", async ({ page }) => {
  await blankPC(page);
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  const dialog = preparation(page);
  const copy = dialog.getByRole("button", { name: "Chép vào USB", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Gói driver mô phỏng", exact: true })).toHaveValue("intel-vmd-x64");
  await expect(copy).toBeDisabled();
  await dialog.getByRole("button", { name: "Tải gói mô phỏng", exact: true }).click();
  await expect(copy).toBeDisabled();
  await dialog.getByRole("button", { name: "Giải nén gói", exact: true }).click();
  await expect(copy).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Cắm USB cài Windows", exact: true }).check();
  await copy.click();
  await expect(dialog).toContainText(/\.inf/i);
  await expect(dialog.getByRole("link").first()).toHaveAttribute("href", /^https:\/\//);
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Cắm USB cài Windows", exact: true })).toBeChecked();
  const controls = page.getByRole("region", { name: "Điều khiển máy", exact: true });
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true }).click();
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
});

test("driver preparation advice is visible before boot and disk advice follows actual SSD visibility", async ({ page }) => {
  await blankPC(page);
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  const guide = page.getByRole("region", { name: "Hướng dẫn làm cùng", exact: true });
  await expect(guide).toHaveAttribute("data-guide-step", "connect-usb");
  await expect(guide.locator(".guidance-warning")).toBeVisible();
  await expect(guide.locator(".guidance-warning")).toContainText("không phải mọi máy đều cần");
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  const preparationNotice = preparation(page).getByLabel("Lưu ý chuẩn bị driver", { exact: true });
  await expect(preparationNotice).toBeVisible();
  await expect(preparationNotice).toContainText("đúng model");
  await expect(preparationNotice).toContainText("trước khi cắm sang máy cần cài");
  await preparation(page).getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows", exact: true }).check();
  const controls = page.getByRole("region", { name: "Điều khiển máy", exact: true });
  await controls.getByRole("button", { name: "Vào BIOS", exact: true }).click();
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await page.getByRole("switch", { name: "TPM 2.0", exact: true }).click();
  await expect(guide).toHaveAttribute("data-guide-step", "boot-usb");
  await expect(guide.locator(".guidance-warning")).toContainText("không phải mọi máy đều cần");
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true }).click();
  const diskNotice = page.getByLabel("Lưu ý driver lưu trữ", { exact: true });
  await expect(diskNotice).toBeVisible();
  await expect(diskNotice).toContainText("Nếu BIOS nhận SSD nhưng Windows Setup chưa nhận");
  await expect(diskNotice).toContainText("đúng model");
  await expect(diskNotice).toContainText(/BIOS.*(?:không|chưa).*SSD/);
  await expect(diskNotice).toContainText(/không.*(?:sửa|khắc phục|giải quyết)/);

  await preparePackage(page);
  await openLoader(page);
  await browse(page, "storage");
  await loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true }).check();
  await loader(page).getByRole("button", { name: "Nạp driver", exact: true }).click();
  await expect(diskNotice).toContainText("Bộ cài đã nhận SSD");
  await expect(diskNotice).toContainText("Không cần nạp thêm driver lưu trữ");
  await expect(diskNotice).not.toContainText("Windows Setup chưa nhận");

  await controls.getByRole("button", { name: "Vào BIOS", exact: true }).click();
  await page.getByRole("switch", { name: "Intel VMD Controller", exact: true }).click();
  await controls.getByRole("button", { name: "Menu boot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true }).click();
  await expect(diskNotice).toContainText("Bộ cài đã nhận SSD");
  await expect(diskNotice).toContainText("Không cần nạp thêm driver lưu trữ");
  await expect(page.getByRole("button", { name: "Nạp driver Intel VMD", exact: true })).toHaveCount(0);
});

test("changing the selected package cannot extract or copy a different workspace package", async ({ page }) => {
  await blankPC(page);
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows", exact: true }).check();
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  const dialog = preparation(page);
  const select = dialog.getByRole("combobox", { name: "Gói driver mô phỏng", exact: true });
  const download = dialog.getByRole("button", { name: "Tải gói mô phỏng", exact: true });
  const extract = dialog.getByRole("button", { name: "Giải nén gói", exact: true });
  const copy = dialog.getByRole("button", { name: "Chép vào USB", exact: true });
  await download.click();
  await select.selectOption("ethernet-x64");
  await expect(extract).toBeDisabled();
  await expect(copy).toBeDisabled();
  await select.selectOption("intel-vmd-x64");
  await expect(extract).toBeEnabled();
  await extract.click();
  await expect(copy).toBeEnabled();
  await select.selectOption("ethernet-x64");
  await expect(extract).toBeDisabled();
  await expect(copy).toBeDisabled();
  await download.click();
  await expect(extract).toBeEnabled();
  await expect(copy).toBeDisabled();
  await extract.click();
  await expect(copy).toBeEnabled();
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
  await expect(select).toHaveValue("ethernet-x64");
  await copy.click();
  const files = dialog.getByRole("region", { name: "Tệp driver trên USB", exact: true });
  await expect(files).toContainText("Gói Ethernet x64");
  await expect(files).not.toContainText("Gói Intel VMD x64");
});

test("empty media and the wrong folder cannot load a driver and cancellation leaves storage unchanged", async ({ page }) => {
  await startInstaller(page);
  const machine = page.getByRole("region", { name: "Trạng thái máy", exact: true });
  const before = await machine.innerText();
  const beforeLog = await page.locator(".activity-list").innerText();
  await openLoader(page);
  await browse(page, "storage");
  await expect(loader(page).getByRole("radio")).toHaveCount(0);
  await expect(loader(page).getByRole("button", { name: "Nạp driver", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(machine).toHaveText(before, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeLog, { useInnerText: true });

  await preparePackage(page);
  await openLoader(page);
  await browse(page, "root");
  await expect(loader(page).getByRole("radio")).toHaveCount(0);
  await expect(loader(page).getByRole("button", { name: "Nạp driver", exact: true })).toBeDisabled();
  await browse(page, "drivers");
  await expect(loader(page).getByRole("radio")).toHaveCount(0);
  await browse(page, "storage");
  await expect(loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
});

test("compatibility filtering rejects an Ethernet package and only loading VMD reveals the SSD", async ({ page }) => {
  await startInstaller(page);
  await preparePackage(page, "ethernet-x64");
  await preparePackage(page, "intel-vmd-x64");
  await openLoader(page);
  await browse(page, "storage");
  const filter = loader(page).getByRole("checkbox", { name: "Chỉ hiện driver tương thích", exact: true });
  const ethernet = loader(page).getByRole("radio", { name: "Ethernet Adapter (x64)", exact: true });
  await expect(filter).toBeChecked();
  await expect(ethernet).toHaveCount(0);
  await filter.uncheck();
  await ethernet.check();
  const load = loader(page).getByRole("button", { name: "Nạp driver", exact: true });
  if (await load.isEnabled()) await load.click();
  await expect(loader(page)).toBeVisible();
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
  await filter.check();
  await loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true }).check();
  await load.click();
  await expect(loader(page)).toHaveCount(0);
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chuẩn bị GPT & phân vùng", exact: true })).toBeEnabled();
});

test("restarting Setup keeps USB driver files but requires loading the driver again", async ({ page }) => {
  await startInstaller(page);
  await preparePackage(page);
  await openLoader(page);
  await browse(page, "storage");
  await loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true }).check();
  await loader(page).getByRole("button", { name: "Nạp driver", exact: true }).click();
  await page.getByRole("region", { name: "Điều khiển máy", exact: true }).getByRole("button", { name: "Khởi động lại", exact: true }).click();
  await expect(page.getByText("Không tìm thấy ổ đĩa lưu trữ", { exact: true })).toBeVisible();
  await openLoader(page);
  await browse(page, "storage");
  await loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true }).check();
  await loader(page).getByRole("button", { name: "Nạp driver", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chuẩn bị GPT & phân vùng", exact: true })).toBeEnabled();
});

for (const viewport of [{ name: "desktop", width: 1440, height: 1050 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} preparation and driver browsing fit the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startInstaller(page);
    await page.getByRole("button", { name: "Chuẩn bị driver", exact: true }).click();
    await expect(preparation(page).getByRole("heading", { name: "Chuẩn bị driver lưu trữ", exact: true })).toBeInViewport();
    await expect.poll(() => preparation(page).evaluate((dialog) => dialog.scrollTop)).toBeLessThanOrEqual(2);
    expect(await preparation(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/driver-media-${viewport.name}-guide.png`, fullPage: false });
    await preparation(page).getByRole("button", { name: "Tải gói mô phỏng", exact: true }).click();
    await preparation(page).getByRole("button", { name: "Giải nén gói", exact: true }).click();
    await preparation(page).getByRole("button", { name: "Chép vào USB", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await preparation(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/driver-media-${viewport.name}.png`, fullPage: true });
    await preparation(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await openLoader(page);
    expect(await loader(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await browse(page, "storage");
    await expect(loader(page).getByRole("radio", { name: "Intel VMD Controller (x64)", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await loader(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/driver-media-${viewport.name}-browse.png`, fullPage: true });
  });
}
