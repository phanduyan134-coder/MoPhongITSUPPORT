import { test, expect, type Page } from "@playwright/test";

function guidance(page: Page) {
  return page.getByRole("region", { name: "Hướng dẫn làm cùng", exact: true });
}

function controls(page: Page) {
  return page.getByRole("region", { name: "Điều khiển máy", exact: true });
}

async function expectStep(page: Page, step: string) {
  await expect(guidance(page)).toHaveAttribute("data-guide-step", step);
}

async function createBlankPC(page: Page) {
  await guidance(page).getByRole("button", { name: "Tạo máy trống", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Trạng thái khởi tạo" })).toHaveValue("blank");
  await dialog.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expectStep(page, "connect-usb");
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

test("guidance is optional and opening it or cancelling a new PC leaves the device unchanged", async ({ page }) => {
  await page.goto("/");
  const machine = page.getByRole("region", { name: "Trạng thái máy", exact: true });
  const originalState = await machine.innerText();
  const originalLog = await page.locator(".activity-list").innerText();
  await expect(guidance(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await expectStep(page, "existing-windows");
  await expect(guidance(page)).toContainText(/Windows/);
  await expect(machine).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });
  await expect(page.getByRole("checkbox", { name: "Cắm USB cài Windows" })).not.toBeChecked();

  await guidance(page).getByRole("button", { name: "Tạo máy trống", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Trạng thái khởi tạo" })).toHaveValue("blank");
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
  await expectStep(page, "existing-windows");
  await expect(machine).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });

  await guidance(page).getByRole("button", { name: "Cài lại trên máy này", exact: true }).click();
  await expectStep(page, "connect-usb");
  await expect(machine).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });
  await guidance(page).getByRole("button", { name: "Tắt hướng dẫn", exact: true }).click();
  await expect(guidance(page)).toHaveCount(0);
  await expect(page.locator(".guide-highlight")).toHaveCount(0);
  await expect(machine).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });
});

test("indicating a control only changes the view and highlight", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await createBlankPC(page);
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows" }).check();
  await controls(page).getByRole("button", { name: "Vào BIOS", exact: true }).click();
  await expectStep(page, "secure-boot");
  await page.getByRole("tab", { name: "Command Prompt", exact: true }).click();
  const machine = page.getByRole("region", { name: "Trạng thái máy", exact: true });
  const originalState = await machine.innerText();
  const originalLog = await page.locator(".activity-list").innerText();

  await guidance(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await expect(page.getByRole("tab", { name: "BIOS / UEFI", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-guide-target].guide-highlight")).toHaveCount(1);
  await expect(page.getByRole("switch", { name: "Secure Boot", exact: true })).toHaveAttribute("aria-checked", "false");
  await expectStep(page, "secure-boot");
  await expect(machine).toHaveText(originalState, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(originalLog, { useInnerText: true });

  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await expect(guidance(page)).toHaveCount(0);
  await expect(page.locator(".guide-highlight")).toHaveCount(0);
});

test("guidance follows actual USB, firmware, storage, installation and boot changes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await createBlankPC(page);
  const usb = page.getByRole("checkbox", { name: "Cắm USB cài Windows" });
  await usb.check();
  await expectStep(page, "enter-bios");
  await controls(page).getByRole("button", { name: "Vào BIOS", exact: true }).click();
  await expectStep(page, "secure-boot");
  await page.getByRole("button", { name: "LEGACY", exact: true }).click();
  await expectStep(page, "uefi");
  await page.getByRole("button", { name: "UEFI", exact: true }).click();
  await expectStep(page, "secure-boot");
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await expectStep(page, "tpm");
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await expectStep(page, "secure-boot");
  await page.getByRole("switch", { name: "Secure Boot", exact: true }).click();
  await page.getByRole("switch", { name: "TPM 2.0", exact: true }).click();
  await expectStep(page, "boot-usb");

  const machine = page.getByRole("region", { name: "Trạng thái máy", exact: true });
  const beforeUSB = await machine.innerText();
  const beforeUSBLog = await page.locator(".activity-list").innerText();
  await guidance(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  const usbBoot = page.getByRole("dialog").getByRole("button", { name: "USB Drive", exact: true });
  await expect(usbBoot).toBeFocused();
  await expect(usbBoot).toHaveClass(/guide-highlight/);
  await expect(machine).toHaveText(beforeUSB, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeUSBLog, { useInnerText: true });
  await page.keyboard.press("Escape");
  await expectStep(page, "boot-usb");
  await expect(machine).toHaveText(beforeUSB, { useInnerText: true });
  await guidance(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  await usbBoot.click();
  await expectStep(page, "storage-driver");
  await prepareAndLoadStorageDriver(page);
  await expectStep(page, "prepare-disk");
  await page.getByRole("button", { name: "Chuẩn bị GPT & phân vùng", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
  await expectStep(page, "prepare-disk");
  await expect(page.getByRole("region", { name: "Trạng thái máy", exact: true })).toContainText("MBR · 0 phân vùng");
  await page.getByRole("button", { name: "Chuẩn bị GPT & phân vùng", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xóa & tạo phân vùng", exact: true }).click();
  await expectStep(page, "install-windows");
  await page.getByRole("tabpanel").getByRole("button", { name: "Cài đặt Windows", exact: true }).click();
  await expectStep(page, "boot-windows");
  const beforeSSD = await machine.innerText();
  const beforeSSDLog = await page.locator(".activity-list").innerText();
  await guidance(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
  const ssdBoot = page.getByRole("dialog").getByRole("button", { name: "NVMe SSD", exact: true });
  await expect(ssdBoot).toBeFocused();
  await expect(ssdBoot).toHaveClass(/guide-highlight/);
  await expect(machine).toHaveText(beforeSSD, { useInnerText: true });
  await expect(page.locator(".activity-list")).toHaveText(beforeSSDLog, { useInnerText: true });
  await ssdBoot.click();
  await expectStep(page, "disconnect-usb");
  await expect(page.getByRole("tabpanel")).toContainText("Windows 11");
  await usb.uncheck();
  await expectStep(page, "complete");
  await expect(page.getByRole("region", { name: "Trạng thái máy", exact: true })).toContainText("Windows đang chạy");
});

test("new session resets reinstallation intent without leaving stale guidance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
  await guidance(page).getByRole("button", { name: "Cài lại trên máy này", exact: true }).click();
  await expectStep(page, "connect-usb");
  await page.getByRole("checkbox", { name: "Cắm USB cài Windows" }).check();
  await expectStep(page, "boot-usb");
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Trạng thái khởi tạo" }).selectOption("installed");
  await page.getByRole("dialog").getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expectStep(page, "existing-windows");
  await expect(page.getByRole("checkbox", { name: "Cắm USB cài Windows" })).not.toBeChecked();
  await expect(page.getByText("0 sự kiện", { exact: true })).toBeVisible();
  await expect(page.locator(".guide-highlight")).toHaveCount(0);
});

for (const viewport of [{ name: "desktop", width: 1440, height: 1050 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} guidance remains usable without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Hướng dẫn làm cùng", exact: true }).click();
    await expect(guidance(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/screenshots/guidance-${viewport.name}.png`, fullPage: true });

    await createBlankPC(page);
    await page.getByRole("checkbox", { name: "Cắm USB cài Windows" }).check();
    await controls(page).getByRole("button", { name: "Vào BIOS", exact: true }).click();
    await expectStep(page, "secure-boot");
    await guidance(page).getByRole("button", { name: "Chỉ vị trí thao tác", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator("[data-guide-target].guide-highlight")).toHaveCount(1);
    await page.screenshot({ path: `output/screenshots/guidance-${viewport.name}-bios.png`, fullPage: true });
  });
}
