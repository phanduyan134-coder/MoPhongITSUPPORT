import { test, expect, type Page } from "@playwright/test";

async function openLab(page: Page) {
  await page.goto("/system?workspace=classic");
  await expect(page.getByTestId("system-ready")).toBeVisible();
}

async function newSession(page: Page, preset: string) {
  await page.getByRole("button", { name: "Tạo phiên mới", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo phiên hệ thống", exact: true });
  await dialog.getByLabel("Trạng thái ban đầu", { exact: true }).selectOption(preset);
  await dialog.getByRole("button", { name: "Tạo phiên", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function selectTool(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Mở điều hướng", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function terminal(page: Page, command: string, device = "client") {
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page.getByLabel("Thiết bị terminal", { exact: true }).selectOption(device);
  await page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true }).fill(command);
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  return page.getByTestId("terminal-output").locator(".sl-terminal-entry").last();
}

test("system lab opens with four operational groups and retains the PC simulator", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLab(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Phòng mô phỏng hệ thống");
  for (const name of ["DNS / DHCP", "Web Server IIS", "Kết nối mạng", "Windows Server"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
  await page.goto("/pc");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Máy tính mô phỏng");
  expect(errors).toEqual([]);
});

test("home selects the DNS simulation and starts its guided actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bạn muốn mô phỏng");
  await page.getByRole("button", { name: "Chọn nhóm DNS / DHCP", exact: true }).click();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Không phân giải được tên nội bộ", exact: true }) }).getByRole("link", { name: "Có hướng dẫn", exact: true }).click();
  await expect(page).toHaveURL(/\/system\?preset=dns-stopped&workspace=desktop&guide=dns/);
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await expect(page.getByText("Bước 1/6 · Kiểm tra kết nối IP", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Không gian hệ thống", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Chọn máy trạm CLIENT-01", exact: true }).click();
  await page.getByRole("button", { name: "Mở PowerShell", exact: true }).click();
  const command = page.getByRole("textbox", { name: "Lệnh trên CLIENT-01", exact: true });
  await expect(command).toHaveValue("ping 192.168.10.10");
  await expect(command).toBeFocused();
});

test("portal flow visualizes a DNS interruption and updates after the service is restored", async ({ page }) => {
  await openLab(page);
  await newSession(page, "dns-stopped");
  const flow = page.getByTestId("portal-flow");
  await expect(flow).toContainText("Không nhận được phản hồi DNS");
  await expect(flow).toContainText("Đang bị chặn");
  await selectTool(page, "DNS / DHCP");
  await page.getByLabel("DNS đang chạy", { exact: true }).click();
  await selectTool(page, "Tổng quan");
  await expect(flow).toContainText("Luồng truy cập portal.lab.test đang hoạt động");
  await expect(flow).toContainText("HTTP sẵn sàng");
});

test("DNS guided actions focus the next user-controlled diagnostic and repair", async ({ page }) => {
  await openLab(page);
  await newSession(page, "dns-stopped");
  await page.getByRole("button", { name: "Dẫn xử lý từng bước", exact: true }).click();
  const command = page.getByRole("textbox", { name: "Lệnh mô phỏng", exact: true });
  await expect(command).toBeFocused();
  await expect(command).toHaveValue("ping 192.168.10.10");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("Get-Service DNS");
  await expect(page.getByLabel("Thiết bị terminal", { exact: true })).toHaveValue("server");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  const dnsToggle = page.getByLabel("DNS đang chạy", { exact: true });
  await expect(dnsToggle).toBeFocused();
  await dnsToggle.click();
  await expect(command).toHaveValue("nslookup portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(command).toHaveValue("curl http://portal.lab.test");
  await page.getByRole("button", { name: "Chạy lệnh", exact: true }).click();
  await expect(page.getByText("Đã hoàn thành hướng dẫn DNS", { exact: true })).toBeVisible();
});

test("renewing DHCP replaces a stale gateway option and restores the route", async ({ page }) => {
  await openLab(page);
  await newSession(page, "network-gateway");
  await expect(await terminal(page, "ipconfig /all")).toContainText("192.168.10.");
  await expect(await terminal(page, "ping 192.168.20.10")).toContainText("Received = 0");
  await expect(await terminal(page, "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0", "server")).toContainText("Router        192.168.10.1");
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Nhận IP qua DHCP", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Gia hạn DHCP", exact: true }).click();
  await expect(await terminal(page, "ipconfig /all")).toContainText("Default Gateway: 192.168.10.1");
  await expect(await terminal(page, "ping 192.168.20.10")).toContainText("Received = 4");
});

test("a new server can install and configure DNS DHCP and IIS through interactive tools", async ({ page }) => {
  await openLab(page);
  await newSession(page, "unconfigured");
  await page.getByRole("button", { name: "DNS / DHCP", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Địa chỉ bản ghi A", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cài DNS", exact: true }).click();
  await page.getByRole("textbox", { name: "Địa chỉ bản ghi A", exact: true }).fill("192.168.10.10");
  await page.getByRole("button", { name: "Lưu bản ghi DNS", exact: true }).click();
  await page.getByRole("button", { name: "Cài DHCP", exact: true }).click();
  await page.getByRole("textbox", { name: "DHCP bắt đầu", exact: true }).fill("192.168.10.110");
  await page.getByRole("textbox", { name: "DHCP kết thúc", exact: true }).fill("192.168.10.160");
  await page.getByRole("checkbox", { name: "Kích hoạt scope", exact: true }).check();
  await page.getByRole("button", { name: "Áp dụng DHCP", exact: true }).click();
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  await page.getByRole("button", { name: "Gia hạn DHCP", exact: true }).click();
  await expect(await terminal(page, "ipconfig /all")).toContainText("IPv4 Address: 192.168.10.110");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await page.getByRole("button", { name: "Cài Web Server (IIS)", exact: true }).click();
  await page.getByRole("checkbox", { name: "Website đang chạy", exact: true }).check();
  await page.getByRole("checkbox", { name: "Application pool đang chạy", exact: true }).check();
  await page.getByRole("button", { name: "Áp dụng IIS", exact: true }).click();
  await page.getByRole("button", { name: "Truy cập website", exact: true }).click();
  await expect(page.getByTestId("http-output")).toContainText("HTTP/1.1 200 OK");
});

test("DNS service and A record can be diagnosed and repaired separately", async ({ page }) => {
  await openLab(page);
  await newSession(page, "dns-stopped");
  await expect(await terminal(page, "ping 192.168.10.10")).toContainText("Received = 4");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("DNS request timed out");
  await page.getByRole("button", { name: "DNS / DHCP", exact: true }).click();
  await page.getByRole("checkbox", { name: "DNS đang chạy", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "DNS đang chạy", exact: true })).toBeChecked();
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
  await newSession(page, "dns-record");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.99");
  await page.getByRole("button", { name: "DNS / DHCP", exact: true }).click();
  await page.getByRole("textbox", { name: "Địa chỉ bản ghi A", exact: true }).fill("192.168.10.10");
  await page.getByRole("button", { name: "Lưu bản ghi DNS", exact: true }).click();
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
});

test("correcting a DHCP option only changes the client after renewal", async ({ page }) => {
  await openLab(page);
  await newSession(page, "dhcp-options");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("DNS request timed out");
  await page.getByRole("button", { name: "DNS / DHCP", exact: true }).click();
  await page.getByRole("textbox", { name: "DHCP DNS", exact: true }).fill("192.168.10.10");
  await page.getByRole("button", { name: "Áp dụng DHCP", exact: true }).click();
  await expect(await terminal(page, "ipconfig /all")).toContainText("DNS Servers: 192.168.10.254");
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  await page.getByRole("button", { name: "Gia hạn DHCP", exact: true }).click();
  await expect(await terminal(page, "ipconfig /all")).toContainText("DNS Servers: 192.168.10.10");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
});

test("link and adapter controls persist when switching tools", async ({ page }) => {
  await openLab(page);
  await newSession(page, "network-link");
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  const link = page.getByRole("checkbox", { name: "Kết nối cáp mạng", exact: true });
  await expect(link).not.toBeChecked();
  await link.click();
  await expect(link).toBeChecked();
  await expect(await terminal(page, "ping 192.168.10.10")).toContainText(/TTL=|Received = 4/);
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  await expect(link).toBeChecked();
  await page.getByRole("checkbox", { name: "Bật bộ điều hợp", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Bật bộ điều hợp", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Bật bộ điều hợp", exact: true })).not.toBeChecked();
});

test("IIS application pool affects HTTP independently of DNS", async ({ page }) => {
  await openLab(page);
  await newSession(page, "iis-pool");
  await expect(await terminal(page, "nslookup portal.lab.test")).toContainText("Address: 192.168.10.10");
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await page.getByRole("textbox", { name: "Địa chỉ website", exact: true }).fill("http://portal.lab.test");
  await page.getByRole("button", { name: "Truy cập website", exact: true }).click();
  await expect(page.getByTestId("http-output")).toContainText("503");
  await page.getByRole("checkbox", { name: "Application pool đang chạy", exact: true }).check();
  await page.getByRole("button", { name: "Áp dụng IIS", exact: true }).click();
  await page.getByRole("button", { name: "Truy cập website", exact: true }).click();
  await expect(page.getByTestId("http-output")).toContainText("200");
});

test("new sessions reset modified controls to the selected preset", async ({ page }) => {
  await openLab(page);
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await page.getByRole("checkbox", { name: "Website đang chạy", exact: true }).uncheck();
  await page.getByRole("button", { name: "Áp dụng IIS", exact: true }).click();
  await newSession(page, "healthy");
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Website đang chạy", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Application pool đang chạy", exact: true })).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Cổng HTTP", exact: true })).toHaveValue("80");
});

test("Windows Server share UI models Share and NTFS permissions separately", async ({ page }) => {
  await openLab(page);
  await newSession(page, "share-ntfs");
  await expect(await terminal(page, "Test-Share tech")).toContainText("Access denied: tech");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Quyền Share: Read", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Quyền NTFS: Read", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Quyền NTFS: Read", exact: true }).check();
  await page.getByRole("button", { name: "Áp dụng quyền", exact: true }).click();
  await expect(await terminal(page, "Test-Share tech")).toContainText("Read successful: tech");
  await expect(await terminal(page, "Test-Share outsider")).toContainText("Access denied: outsider");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Quyền NTFS: Read", exact: true })).toBeChecked();
});

test("stopped worker allows editing startup policy without changing unrelated roles", async ({ page }) => {
  await openLab(page);
  await newSession(page, "worker-disabled");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByLabel("Startup Type", { exact: true })).toHaveValue("Disabled");
  await expect(page.getByRole("checkbox", { name: "LabWorker đang chạy", exact: true })).not.toBeChecked();
  await page.getByLabel("Startup Type", { exact: true }).selectOption("Automatic");
  await page.getByRole("checkbox", { name: "LabWorker đang chạy", exact: true }).check();
  await page.getByRole("button", { name: "Áp dụng dịch vụ", exact: true }).click();
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Website đang chạy", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByLabel("Startup Type", { exact: true })).toHaveValue("Automatic");
  await expect(page.getByRole("checkbox", { name: "LabWorker đang chạy", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Khởi động lại máy chủ", exact: true }).click();
  const reboot = page.getByRole("dialog", { name: "Khởi động lại SRV-01?", exact: true });
  await reboot.getByRole("button", { name: "Khởi động lại", exact: true }).click();
  await expect(reboot).not.toBeVisible();
  await expect(await terminal(page, "Get-Service LabWorker", "server")).toContainText("Running");
  await expect(page.getByTestId("terminal-output").locator(".sl-terminal-entry").last()).toContainText("Automatic");
});

test("disk cleanup requires confirmation and cannot delete protected customer data", async ({ page }) => {
  await openLab(page);
  await newSession(page, "disk-full");
  await expect(await terminal(page, "Get-Volume", "server")).toContainText("SizeRemaining: 4 MB");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xóa Du-lieu-khach-hang.dat", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Xóa Cache-tam-lab.tmp", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Xóa tệp mô phỏng?", exact: true });
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xóa Cache-tam-lab.tmp", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xóa Cache-tam-lab.tmp", exact: true }).click();
  await dialog.getByRole("button", { name: "Xóa tệp", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xóa Cache-tam-lab.tmp", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ghi tệp kiểm tra 10 MB", exact: true }).click();
  await expect(await terminal(page, "Get-Volume", "server")).toContainText("SizeRemaining: 822 MB");
  await expect(page.getByTestId("terminal-output").locator(".sl-terminal-entry").last()).not.toContainText("Du-lieu-khach-hang.dat");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xóa Du-lieu-khach-hang.dat", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Xóa Du-lieu-dich-vu.dat", exact: true })).toBeDisabled();
});

test("local assistance is explicitly labelled and does not change network state", async ({ page }) => {
  await openLab(page);
  await newSession(page, "network-gateway");
  await page.getByRole("button", { name: "Kết nối mạng", exact: true }).click();
  const gateway = page.getByRole("textbox", { name: "Gateway máy trạm", exact: true });
  const before = await gateway.inputValue();
  await page.getByRole("button", { name: "Phân tích trạng thái", exact: true }).click();
  await expect(page.getByText("Cục bộ · không dùng AI", { exact: true })).toBeVisible();
  await expect(gateway).toHaveValue(before);
});

test("long assistant replies remain visible but follow-up history respects the API content limit", async ({ page }) => {
  const longReply = "A".repeat(4001);
  const requests: { history: { role: string; content: string }[] }[] = [];
  await page.route("**/api/system-agent", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ source: "local", message: requests.length === 1 ? longReply : "Đã nhận câu hỏi tiếp theo.", revision: 0, trace: [], sources: [] }),
    });
  });
  await openLab(page);
  await page.getByRole("button", { name: "Phân tích trạng thái", exact: true }).click();
  const firstReply = page.locator(".sl-message.assistant p").first();
  await expect(firstReply).toHaveText(longReply);
  await page.getByRole("textbox", { name: "Tin nhắn trợ lý", exact: true }).fill("Kiểm tra lại giúp mình.");
  await page.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].history.every((message) => message.content.length <= 3000)).toBe(true);
  expect(requests[1].history.find((message) => message.role === "assistant")?.content).toBe(longReply.slice(0, 3000));
  await expect(firstReply).toHaveText(longReply);
  await expect(page.locator(".sl-message.assistant p").last()).toHaveText("Đã nhận câu hỏi tiếp theo.");
});

test("inline HTTP and share observations use the authoritative diagnostic revision", async ({ page }) => {
  await page.route("**/api/simulation", async (route) => {
    const body = route.request().postDataJSON() as { operation: string; command?: string };
    if (body.operation !== "diagnose") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ output: body.command?.startsWith("curl ") ? "HTTP/1.1 200 OK" : "Read successful: tech", revision: 100 }),
    });
  });
  await openLab(page);
  await page.getByRole("button", { name: "Web Server IIS", exact: true }).click();
  await page.getByRole("button", { name: "Truy cập website", exact: true }).click();
  await expect(page.getByTestId("http-output").locator("small")).toContainText("Revision 100");
  await expect(page.getByTestId("http-output")).toContainText("HTTP/1.1 200 OK");
  await page.getByRole("button", { name: "Windows Server", exact: true }).click();
  await page.getByRole("button", { name: "Kiểm tra truy cập", exact: true }).click();
  const shareOutput = page.getByRole("region", { name: "Quản lý Windows Server", exact: true }).locator(".sl-output");
  await expect(shareOutput.locator("small")).toContainText("Revision 100");
  await expect(shareOutput).toContainText("Read successful: tech");
});

test("system tools fit desktop and mobile without horizontal overflow", async ({ page }) => {
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await openLab(page);
    for (const [view, tool] of [
      ["overview", "Tổng quan"], ["dns-dhcp", "DNS / DHCP"], ["iis", "Web Server IIS"],
      ["network", "Kết nối mạng"], ["windows", "Windows Server"], ["terminal", "Terminal"],
    ]) {
      await selectTool(page, tool);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/screenshots/system-lab-${name}-${view}.png`, fullPage: true });
    }
    await selectTool(page, "Tổng quan");
    await page.screenshot({ path: `output/screenshots/system-lab-${name}.png`, fullPage: true });
  }
});
