import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import type { AgentRunEvidence, WebSessionEvidence } from "../../src/lib/system-evidence";

// This is an automated local-mode browser regression, not a model evaluation
// or a new Windows lab run. Each execution retains its own export and images.
test("complete DNS workflow preserves three phases, read-only assistance and downloaded evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const startedAt = new Date().toISOString();
  const folder = path.join("output", "evidence", "web-dns", `${startedAt.replace(/[:.]/g, "-")}-local-workflow`);
  await mkdir(folder, { recursive: true });
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/system?workspace=classic&preset=healthy");
  await expect(page.getByTestId("system-ready")).toBeVisible();
  await page.getByRole("button", { name: "DNS / DHCP", exact: true }).click();
  const recheck = page.getByRole("button", { name: "Kiểm tra lại DNS / website", exact: true });
  const results = page.getByTestId("dns-verification");
  const dns = page.getByRole("checkbox", { name: "DNS đang chạy", exact: true });
  async function capture(result: Locator, filename: string) {
    const checks = result.locator(".sl-verification-checks > li");
    for (const index of [2, 3, 4]) await checks.nth(index).locator("summary").click();
    // Expand only the scrolling presentation while capturing so every check is
    // visible. Keep the page data and downloaded observations unchanged.
    const style = await page.addStyleTag({ content: ".sl-assistant{position:static!important;overflow:visible!important}.sl-messages{max-height:none!important;overflow:visible!important}" });
    try {
      await page.screenshot({ path: path.join(folder, filename), fullPage: true });
      await result.screenshot({ path: path.join(folder, filename.replace(".png", "-details.png")) });
    } finally { await style.evaluate((node) => node.parentNode?.removeChild(node)); }
  }

  await recheck.click();
  await expect(results).toHaveCount(1);
  await expect(results.last()).toHaveAttribute("data-status", "passed");
  await expect(results.last().getByTestId("dns-assessment")).toHaveAttribute("data-code", "healthy");
  await capture(results.last(), "01-healthy.png");

  await dns.uncheck();
  await expect(results.first()).toHaveAttribute("data-status", "stale");
  await page.getByRole("textbox", { name: "Tin nhắn trợ lý", exact: true }).fill("Không mở được portal.lab.test, hãy kiểm tra giúp mình và nêu cách xác nhận sau sửa.");
  await page.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await expect(results).toHaveCount(2);
  await expect(results.last()).toHaveAttribute("data-status", "failed");
  await expect(results.last().getByTestId("dns-assessment")).toHaveAttribute("data-code", "dns-service");
  const ipCheck = results.last().locator(".sl-verification-checks > li").last();
  await expect(ipCheck).toContainText("Đạt");
  await expect(dns).not.toBeChecked(); // Assistance cannot repair the state itself.
  const trace = page.locator(".sl-message.assistant").last().locator(".sl-agent-trace");
  await trace.locator("summary").click();
  await expect(trace).toContainText("Phép kiểm cố định");
  await expect(trace).toContainText("Quy tắc cục bộ");
  await capture(results.last(), "02-dns-stopped.png");
  await trace.locator("summary").click();

  await dns.check();
  await expect(results.nth(1)).toHaveAttribute("data-status", "stale");
  await expect(results.nth(1).getByTestId("dns-assessment")).toHaveCount(0);
  await recheck.click();
  await expect(results).toHaveCount(3);
  await expect(results.last()).toHaveAttribute("data-status", "passed");
  await capture(results.last(), "03-restored.png");

  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất hồ sơ phiên", exact: true }).click();
  const download = await pendingDownload;
  const exportFile = path.join(folder, "web-session.json");
  await download.saveAs(exportFile);
  const evidence = JSON.parse(await readFile(exportFile, "utf8")) as WebSessionEvidence;
  expect(evidence.journal.truncated).toBe(false);
  expect(evidence.journal.droppedEntries).toBe(0);
  const agents = evidence.journal.entries.filter((entry) => entry.kind === "agent")
    .map((entry) => (entry.data as { evidence: AgentRunEvidence; stale: boolean }).evidence);
  expect(agents.map((entry) => entry.revision)).toEqual([0, 1, 2]);
  expect(agents.map((entry) => entry.purpose)).toEqual(["verify-dns", "diagnose", "verify-dns"]);
  expect(agents.map((entry) => entry.verification?.assessment.code)).toEqual(["healthy", "dns-service", "healthy"]);
  for (const entry of agents) {
    expect(entry.source).toBe("local");
    expect(entry.model).toBeNull();
    expect(entry.verification?.protocol).toBe("dns-portal-v2");
    expect(entry.trace.filter((step) => step.origin === "verification")).toHaveLength(5);
    expect(entry.trace.every((step) => step.revision === entry.revision)).toBe(true);
    expect(entry.trace.some((step) => step.tool === "search_knowledge")).toBe(true);
  }
  const actions = evidence.journal.entries.filter((entry) => entry.kind === "action");
  expect(actions.map((entry) => (entry.data as { action: unknown }).action)).toEqual([
    { type: "service.toggle", service: "dns", running: false },
    { type: "service.toggle", service: "dns", running: true },
  ]);
  // The only intended change across phases is DNS running/revision/events/time.
  for (const entry of actions) {
    const { beforeState, afterState } = entry.data as { beforeState: WebSessionEvidence["session"]["initialState"]; afterState: WebSessionEvidence["session"]["currentState"] };
    for (const key of ["client", "server", "roles", "dhcp", "iis", "system"] as const) expect(afterState[key]).toEqual(beforeState[key]);
    expect(afterState.dns.record).toBe(beforeState.dns.record);
  }
  expect(evidence.session.currentState.dns.running).toBe(true);
  expect(browserErrors).toEqual([]);

  const artifactNames = ["web-session.json", "01-healthy.png", "01-healthy-details.png", "02-dns-stopped.png", "02-dns-stopped-details.png", "03-restored.png", "03-restored-details.png"];
  const artifacts = await Promise.all(artifactNames.map(async (file) => ({ file, sha256: createHash("sha256").update(await readFile(path.join(folder, file))).digest("hex") })));
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify({
    kind: "supportlab-browser-dns-regression", startedAt, finishedAt: new Date().toISOString(),
    execution: { actor: "Playwright", assistance: "local-rules", model: "not-run", windowsLab: "not-run", userStudy: "not-run" },
    protocol: "dns-portal-v2", revisions: [0, 1, 2], assessments: ["healthy", "dns-service", "healthy"],
    screenshotPresentation: "Expanded assistant scrolling container for screenshots only; observations and state unchanged.",
    journalTruncated: false, artifacts,
    limitations: ["Automated browser test, not a human study or AI model quality evaluation.", "Screenshots show Web simulation, not Windows guest output.", "Previously captured Windows reference is reviewed separately."],
  }, null, 2) + "\n");
  await writeFile(path.join(folder, "README.md"), "# Phiên Web DNS tự động\n\nĐã chạy bằng Playwright với trợ lý quy tắc cục bộ. Không gọi model AI, không chạy máy ảo mới và không phải thực nghiệm người dùng.\n\nBa giai đoạn: bình thường r0 → dừng DNS r1 → bật lại DNS r2. File web-session.json là hồ sơ tải từ giao diện; manifest.json lưu hash các tệp. Ảnh *-details.png hiển thị rõ năm phép kiểm ở từng giai đoạn.\n");
  console.log(`Web DNS artifacts: ${folder}`);
});
