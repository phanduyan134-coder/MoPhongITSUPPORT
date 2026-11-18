'use strict';

// Automated, reproducible recording of the network-gateway simulation.
// This records the Web state engine only; it does not run Windows Server.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const baseURL = process.env.SUPPORTLAB_BASE_URL || 'http://127.0.0.1:3100';
const recordedAt = new Date().toISOString();
const runId = recordedAt.replace(/[:.]/g, '-');
const folder = path.join(root, 'output', 'demo', 'gateway-' + runId);
const ffmpeg = path.join(root, 'output/tools/ffmpeg/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const observations = [];
const actions = [];
const errors = [];
const phases = [];
let agentRequests = 0;
let browser;
let context;
let page;
let startedAt;
let browserVersion;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const machineName = device => device === 'server' ? 'SRV-01' : 'CLIENT-01';

async function point(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await wait(180);
}

async function click(locator) {
  await point(locator);
  await locator.click();
  await wait(300);
}

async function selectDevice(device) {
  await click(page.getByRole('button', {
    name: device === 'server' ? 'Chọn máy chủ SRV-01' : 'Chọn máy trạm CLIENT-01',
    exact: true
  }));
}

async function openApp(title, device) {
  await selectDevice(device);
  await click(page.getByRole('button', { name: 'Mở ' + title, exact: true }));
  const region = page.getByRole('region', { name: title + ' · ' + machineName(device), exact: true });
  await expect(region).toBeVisible();
  return region;
}

async function runCommand(device, command, expected, nextGuideText) {
  const terminal = await openApp('PowerShell', device);
  const input = terminal.getByRole('textbox', { name: 'Lệnh trên ' + machineName(device), exact: true });
  await input.fill(command);
  const pending = page.waitForResponse(response => response.url().endsWith('/api/simulation')
    && response.request().method() === 'POST'
    && response.request().postDataJSON()?.operation === 'diagnose');
  await click(terminal.getByRole('button', { name: 'Chạy', exact: true }));
  const response = await pending;
  const data = await response.json();
  assert.equal(response.ok(), true, `API ${response.status()}: ${data.error || 'diagnostic failed'}`);
  assert.match(data.output, expected);
  assert.equal(data.observed, true);
  observations.push({ device, command, output: data.output, revision: data.revision });
  // The guide may switch machine/app immediately after a successful check.
  // Wait for that transition, then show the recorded result again without
  // rerunning the diagnostic or changing the simulation state.
  if (nextGuideText) await expect(page.locator('.iw-guide')).toContainText(nextGuideText);
  const visibleTerminal = await openApp('PowerShell', device);
  const output = visibleTerminal.getByRole('log', { name: 'Kết quả PowerShell ' + machineName(device), exact: true });
  const lastResult = output.locator('pre').last();
  await expect(output).toBeVisible();
  await expect(lastResult).toContainText(command);
  await expect(lastResult).toContainText(data.output);
  await lastResult.scrollIntoViewIfNeeded();
  await wait(3500);
  return data;
}

async function shot(name) {
  await wait(650);
  await page.screenshot({ path: path.join(folder, name + '.png'), fullPage: false });
}

async function stage(title, explanation, work, minDurationMs = 7000) {
  const phase = { title, explanation, startMs: Date.now() - startedAt, endMs: null };
  phases.push(phase);
  console.log('SCENE ' + phases.length + ': ' + title);
  await work();
  await wait(Math.max(500, minDurationMs - (Date.now() - startedAt - phase.startMs)));
  phase.endMs = Date.now() - startedAt;
}

function assTimestamp(ms) {
  const ticks = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(ticks / 360000)}:${String(Math.floor(ticks / 6000) % 60).padStart(2, '0')}:${String(Math.floor(ticks / 100) % 60).padStart(2, '0')}.${String(ticks % 100).padStart(2, '0')}`;
}

function captions() {
  const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1440\nPlayResY: 1120\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00120B0B,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,35,35,20,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  return header + phases.map(p => `Dialogue: 0,${assTimestamp(p.startMs)},${assTimestamp(p.endMs)},Default,,0,0,0,,${p.title}\\N${p.explanation}`).join('\n') + '\n';
}

function verifySession(evidence) {
  assert.equal(evidence.kind, 'supportlab-web-session');
  assert.equal(evidence.schemaVersion, 1);
  const before = evidence.session.initialState;
  const after = evidence.session.currentState;
  assert.equal(before.revision, 0);
  assert.equal(before.client.gateway, '192.168.10.254');
  assert.equal(before.client.dhcp, true);
  assert.equal(before.dhcp.gateway, '192.168.10.1');
  assert.equal(before.dhcp.dns, '192.168.10.10');
  assert.equal(after.revision, 1);
  assert.deepEqual(after.client, { ...before.client, gateway: '192.168.10.1' });
  assert.ok(after.dhcp.lease.expiresAt > after.simulatedTime);
  assert.equal(after.dhcp.lease.ip, after.client.ip);
  for (const key of ['server', 'roles', 'dns', 'iis', 'system']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual({ ...after.dhcp, lease: null }, { ...before.dhcp, lease: null });
  assert.equal(evidence.journal.droppedEntries, 0);
  assert.equal(evidence.journal.truncated, false);
  const entries = evidence.journal.entries;
  assert.deepEqual(entries.map(entry => entry.sequence), Array.from({ length: 8 }, (_, i) => i + 1));
  assert.deepEqual(entries.map(entry => entry.kind), ['diagnostic', 'diagnostic', 'diagnostic', 'diagnostic', 'action', 'diagnostic', 'diagnostic', 'diagnostic']);
  const recordedActions = entries.filter(entry => entry.kind === 'action');
  assert.deepEqual(recordedActions.map(entry => entry.data.action), [{ type: 'client.renew' }]);
  assert.deepEqual(recordedActions[0].data.beforeState, before);
  assert.deepEqual(recordedActions[0].data.afterState, after);
  const diagnostics = entries.filter(entry => entry.kind === 'diagnostic');
  assert.equal(diagnostics.length, 7);
  diagnostics.forEach((entry, index) => {
    const observation = observations[index];
    assert.equal(entry.data.device, observation.device);
    assert.equal(entry.data.command, observation.command);
    assert.equal(entry.data.result.output, observation.output);
    assert.equal(entry.data.result.observed, true);
    assert.equal(entry.revision, index < 4 ? 0 : 1);
    assert.equal(entry.data.result.revision, entry.revision);
    assert.equal(observation.revision, entry.revision);
  });
  const sensitiveKeys = [];
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:password|passwd|secret|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|cookie|sessionId)$/i.test(key)) sensitiveKeys.push(key);
      inspect(child);
    }
  }
  inspect(evidence);
  assert.deepEqual(sensitiveKeys, []);
  assert.equal(agentRequests, 0);
  assert.deepEqual(actions, [{ type: 'client.renew' }]);
  assert.deepEqual(errors, []);
  return { status: 'passed', source: 'web-simulation', actions: 1, diagnostics: 7, revisionBefore: 0, revisionAfter: 1, journalComplete: true, unaffectedConfigurationPreserved: true, sensitiveKeyScan: 'no-matches', agentRequests: 0 };
}

async function main() {
  await fs.mkdir(folder, { recursive: true });
  console.log('OUTPUT ' + folder);
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  // Warm compilation before the measured session; no results from warm-up are reused.
  const warm = await browser.newContext();
  const warmPage = await warm.newPage();
  await warmPage.goto(baseURL + '/system?preset=network-gateway&workspace=desktop', { waitUntil: 'networkidle', timeout: 120000 });
  await expect(warmPage.getByTestId('device-desktop')).toBeVisible();
  await warm.close();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: path.join(folder, 'capture'), size: { width: 1440, height: 1000 } },
    reducedMotion: 'reduce',
    acceptDownloads: true
  });
  page = await context.newPage();
  startedAt = Date.now();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().endsWith('/api/system-agent')) agentRequests++;
    if (!request.url().endsWith('/api/simulation') || request.method() !== 'POST') return;
    const body = request.postDataJSON();
    if (body?.operation === 'action') actions.push(body.action);
  });

  await stage('SupportLab · Gateway sai trên máy trạm', 'Theo dõi trạng thái trước và sau thao tác trong Web mô phỏng.', async () => {
    await page.goto(baseURL + '/system?preset=network-gateway&workspace=desktop&guide=gateway', { waitUntil: 'networkidle', timeout: 120000 });
    await expect(page.getByTestId('device-desktop')).toBeVisible();
  }, 4500);
  await stage('01 · Đọc cấu hình CLIENT-01', 'Máy vẫn dùng DHCP nhưng đang giữ gateway 192.168.10.254.', async () => {
    await runCommand('client', 'ipconfig /all', /Default Gateway: 192\.168\.10\.254/, 'Bước 2/7');
    await shot('01-client-gateway-wrong');
  });
  await stage('02 · Kiểm tra máy cùng LAN', 'Ping 192.168.10.10 thành công vì cùng subnet không cần default gateway.', async () => {
    await runCommand('client', 'ping 192.168.10.10', /Received = 4/, 'Bước 3/7');
    await shot('02-ping-same-lan-passed');
  });
  await stage('03 · Kiểm tra thiết bị khác mạng', 'Ping 192.168.20.10 thất bại khi gateway máy trạm còn sai.', async () => {
    await runCommand('client', 'ping 192.168.20.10', /Received = 0/, 'Bước 4/7');
    await shot('03-ping-other-network-failed');
  });
  await stage('04 · Đối chiếu nguồn cấu hình DHCP', 'Trên SRV-01, Router đã là .1 và DNS là .10; không cần sửa option.', async () => {
    await runCommand('server', 'Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0', /3\s+Router\s+192\.168\.10\.1[\s\S]*6\s+DNS Servers\s+192\.168\.10\.10/, 'Bước 5/7');
    await shot('04-server-dhcp-options-correct');
  }, 9000);
  await stage('05 · Gia hạn DHCP trên CLIENT-01', 'Giữ DHCP và nhận lại cấu hình đúng từ máy chủ.', async () => {
    const network = await openApp('Cấu hình mạng', 'client');
    await expect(network.getByRole('checkbox', { name: 'Obtain configuration automatically (DHCP)', exact: true })).toBeChecked();
    await click(network.getByRole('button', { name: 'Renew DHCP lease', exact: true }));
    await expect(page.getByRole('status').filter({ hasText: 'DHCP ACK:' })).toBeVisible();
    await expect(page.locator('.iw-guide')).toContainText('Bước 6/7');
    const renewedNetwork = await openApp('Cấu hình mạng', 'client');
    await expect(renewedNetwork.getByRole('textbox', { name: 'Default gateway', exact: true })).toHaveValue('192.168.10.1');
    await shot('05-client-renew-dhcp');
  });
  await stage('06 · Xác minh gateway sau renew', 'Gateway đổi thành 192.168.10.1; máy vẫn dùng DHCP và giữ nguyên IP/DNS.', async () => {
    await runCommand('client', 'ipconfig /all', /Default Gateway: 192\.168\.10\.1[\s\S]*DHCP Enabled: Yes/, 'Bước 7/7');
    await shot('06-client-gateway-correct');
  });
  await stage('07 · Kiểm tra lại đường sang mạng khác', 'Cùng lệnh ping 192.168.20.10 nay nhận đủ bốn phản hồi ở revision mới.', async () => {
    await runCommand('client', 'ping 192.168.20.10', /Received = 4/, 'Đã hoàn thành hướng dẫn Gateway');
    await expect(page.locator('.iw-guide')).toContainText('Đã hoàn thành hướng dẫn Gateway');
    await shot('07-ping-other-network-restored');
  });
  await stage('08 · Kiểm tra LAN sau sửa', 'Ping 192.168.10.10 tiếp tục thành công; cấu hình không liên quan được bảo toàn.', async () => {
    await runCommand('client', 'ping 192.168.10.10', /Received = 4/);
    await shot('08-ping-same-lan-still-passed');
  });
  await stage('09 · Xuất hồ sơ phiên', 'Lưu trạng thái đầu/cuối, một action renew và bảy phép kiểm theo revision.', async () => {
    await click(page.getByRole('button', { name: 'Trợ lý AI', exact: true }));
    const pendingDownload = page.waitForEvent('download');
    await click(page.getByRole('button', { name: 'Xuất hồ sơ phiên', exact: true }));
    const download = await pendingDownload;
    await download.saveAs(path.join(folder, 'web-session.json'));
  }, 4500);
  const evidence = JSON.parse(await fs.readFile(path.join(folder, 'web-session.json'), 'utf8'));
  await fs.writeFile(path.join(folder, 'evidence-check.json'), JSON.stringify(verifySession(evidence), null, 2) + '\n');
  const recordingDurationMs = Date.now() - startedAt;

  const rawVideo = path.join(folder, 'gateway-demo.webm');
  const video = page.video();
  await context.close();
  context = null;
  if (video) await video.saveAs(rawVideo);
  await browser.close();
  browser = null;
  await fs.writeFile(path.join(folder, 'chapters.ass'), captions(), 'utf8');

  const mp4 = path.join(folder, 'SupportLab-Gateway-demo.mp4');
  let mp4Status = 'not-created';
  if (await fs.stat(ffmpeg).then(() => true).catch(() => false)) {
    const encoded = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', rawVideo, '-vf', 'pad=iw:ih+120:0:0:color=0x0b1220,ass=chapters.ass', '-c:v', 'libx264', '-crf', '22', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { cwd: folder, encoding: 'utf8', windowsHide: true, timeout: 180000 });
    await fs.writeFile(path.join(folder, 'encode.log'), encoded.stderr || '', 'utf8');
    if (encoded.status === 0) { mp4Status = 'created'; } else { errors.push('ffmpeg failed'); }
  } else {
    errors.push('ffmpeg executable not found; retained WebM');
  }

  const files = [];
  async function collect(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await collect(absolute);
      else if (entry.isFile() && entry.name !== 'manifest.json') {
        const bytes = await fs.readFile(absolute);
        files.push({ path: path.relative(folder, absolute).split(path.sep).join('/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await collect(folder);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(gitResult.status, 0, 'Cannot read source commit');
  const dirty = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(dirty.status, 0, 'Cannot read working tree');
  const sourceScriptSha256 = crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  const status = errors.length === 0 ? 'recorded-and-assertions-passed' : 'recorded-with-review-needed';
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify({
    kind: 'supportlab-web-gateway-demo', recordedAt, baseURL,
    sourceCommit: gitResult.stdout.trim(), workingTreeChanges: dirty.stdout.trim().split(/\r?\n/).filter(Boolean),
    browser: { name: 'Playwright Chromium', version: browserVersion }, nodeVersion: process.version, operator: 'automated-playwright',
    recorder: { path: 'scripts/record-gateway-demo.cjs', sha256: sourceScriptSha256 },
    status, recordingDurationMs, actions, observations, errors, phases,
    assistant: { mode: 'not-used', callsToExternalModel: 0 },
    video: { webm: true, mp4: mp4Status, audio: false, burnedVietnameseCaptions: true, width: 1440, height: 1120 },
    limitations: ['Ghi giao diện Web mô phỏng; không phải Windows Server VM.', 'Kết quả ping/gateway do state engine tính từ cấu hình phiên.', 'Không đánh giá chất lượng model AI trong lượt quay.'], files
  }, null, 2) + '\n');
  console.log('DONE ' + folder);
  console.log('STATUS ' + status);
  if (errors.length) process.exitCode = 1;
}

main().catch(async error => {
  errors.push(error.stack || String(error));
  await fs.writeFile(path.join(folder, 'recording-error.txt'), errors.join('\n'), 'utf8').catch(() => {});
  if (page && !page.isClosed()) await shot('error-state').catch(() => {});
  await fs.writeFile(path.join(folder, 'incomplete.json'), JSON.stringify({ status: 'incomplete', errors, observations, actions, phases }, null, 2) + '\n').catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
