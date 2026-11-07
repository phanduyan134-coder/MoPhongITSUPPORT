import { test, expect, type Locator, type Page } from "@playwright/test";

const simulations = [
  { title: "Không phân giải được tên nội bộ", href: "/system?preset=dns-stopped&guide=dns", topic: /DNS|phân giải/ },
  { title: "Máy trạm chưa nhận địa chỉ", href: "/system?preset=dhcp-stopped&guide=dhcp", topic: /DHCP|địa chỉ IP/ },
  { title: "Website trả về HTTP 503", href: "/system?preset=iis-pool&guide=iis", topic: /IIS|website/ },
  { title: "Truy cập LAN nhưng không đến mạng khác", href: "/system?preset=network-gateway&guide=gateway", topic: /gateway|mạng khác/i },
  { title: "Không ghi được dữ liệu", href: "/system?preset=disk-full&guide=disk", topic: /dung lượng|ổ dữ liệu/ },
] as const;

const cardFor = (page: Page, title: string) => page.locator("article.sh-card")
  .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const infoFor = (page: Page, title: string) => page.getByRole("button", { name: `Thông tin mô phỏng: ${title}`, exact: true });

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  await expect(target).toBeFocused();
}

async function expectWithinViewport(page: Page, tooltip: Locator) {
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("each simulation exposes an information button without changing its launch link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("article.sh-card")).toHaveCount(5);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  for (const simulation of simulations) {
    const card = cardFor(page, simulation.title);
    await expect(infoFor(page, simulation.title)).toBeVisible();
    await expect(infoFor(page, simulation.title)).toHaveAttribute("aria-expanded", "false");
    await expect(card.getByRole("link", { name: "Bắt đầu có hướng dẫn", exact: true })).toHaveAttribute("href", simulation.href);
  }
});

test("hovering different cards reveals only the relevant description without shifting the grid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  for (const simulation of simulations) {
    const card = cardFor(page, simulation.title);
    const before = await card.boundingBox();
    await card.hover({ position: { x: 12, y: 12 } });
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(simulation.topic);
    await expectWithinViewport(page, tooltip);
    const after = await card.boundingBox();
    expect(after).not.toBeNull();
    expect(before).not.toBeNull();
    for (const dimension of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after![dimension] - before![dimension])).toBeLessThan(0.5);
    }
  }
  await expect(page).toHaveURL("/");
});

test("pointer can enter the description and Escape dismisses it until a new hover", async ({ page }) => {
  await page.goto("/");
  const card = cardFor(page, simulations[0].title);
  await card.hover({ position: { x: 12, y: 12 } });
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(2, 2);
  await card.hover({ position: { x: 12, y: 12 } });
  await expect(tooltip).toBeVisible();
});

test("keyboard focus describes the information button and launch link, and supports Escape", async ({ page }) => {
  await page.goto("/");
  const info = infoFor(page, simulations[0].title);
  await tabTo(page, info);
  await expect(info).toBeFocused();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const tooltipId = await tooltip.getAttribute("id");
  expect(tooltipId).toBeTruthy();
  await expect(info).toHaveAttribute("aria-describedby", tooltipId!);
  const launch = cardFor(page, simulations[0].title).getByRole("link", { name: "Bắt đầu có hướng dẫn", exact: true });
  await tabTo(page, launch);
  await expect(tooltip).toBeVisible();
  await expect(launch).toHaveAttribute("aria-describedby", tooltipId!);
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(launch).not.toHaveAttribute("aria-describedby", /.+/);
  await page.waitForTimeout(350);
  await expect(tooltip).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test("information clicks toggle the description and outside clicks close it without launching", async ({ page }) => {
  await page.goto("/");
  const info = infoFor(page, simulations[0].title);
  await info.click();
  await expect(info).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page).toHaveURL("/");
  await info.click();
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await info.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("heading", { name: "Bạn muốn xử lý tình huống nào?", exact: true }).click();
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page).toHaveURL("/");
});

test("touch users can read each description without navigating or overflowing a narrow viewport", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    for (const simulation of simulations) {
      const info = infoFor(page, simulation.title);
      await info.tap();
      await expect(info).toHaveAttribute("aria-expanded", "true");
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toHaveCount(1);
      await expect(tooltip).toContainText(simulation.topic);
      await expectWithinViewport(page, tooltip);
      await expect(page).toHaveURL("/");
      await info.tap();
      await expect(tooltip).toHaveCount(0);
    }
    await page.setViewportSize({ width: 320, height: 640 });
    const info = infoFor(page, simulations[3].title);
    await info.tap();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expectWithinViewport(page, page.getByRole("tooltip"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("short viewports constrain the description without covering its information button", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto("/");
  const info = infoFor(page, simulations[0].title);
  await info.click();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expectWithinViewport(page, tooltip);
  const infoBox = await info.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(infoBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox!.y + tooltipBox!.height <= infoBox!.y || tooltipBox!.y >= infoBox!.y + infoBox!.height).toBe(true);
  await info.click();
  await expect(tooltip).toHaveCount(0);
});
