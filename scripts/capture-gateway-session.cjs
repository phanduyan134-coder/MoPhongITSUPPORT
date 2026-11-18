'use strict';

// Capture a manually operated Web simulation. This does not validate the simulator.
function parseOptions(args) {
  let appUrl = 'http://127.0.0.1:3100/';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') return { help: true };
    if (args[i] !== '--url' || !args[i + 1]) {
      throw new Error('Cach dung: node scripts/capture-gateway-session.cjs [--url http://127.0.0.1:3100/]');
    }
    appUrl = args[++i];
  }
  const parsed = new URL(appUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('--url phai la dia chi Web local, khong chua thong tin dang nhap, query hoac hash.');
  }
  return { help: false, appUrl: parsed.href };
}

const steps = [
  {
    id: '01-client-before',
    instruction: 'Chon tinh huong network-gateway, tao phien moi. Tren CLIENT-01, mo terminal mo phong va chay ipconfig /all.',
    expected: 'Gateway ban dau du kien 192.168.10.254; xac nhan IP, subnet mask va DHCP Enabled.'
  },
  {
    id: '02-local-before',
    instruction: 'Tren CLIENT-01, chay ping 192.168.10.10 va de ket qua hien tren man hinh.',
    expected: 'May cung subnet du kien van tra loi.'
  },
  {
    id: '03-remote-before',
    instruction: 'Tren CLIENT-01, chay ping 192.168.20.10.',
    expected: 'Ket noi khac subnet du kien chua thanh cong. Ghi dung thong bao thuc te.'
  },
  {
    id: '04-server-options',
    instruction: 'Chon SRV-01, chay Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0.',
    expected: 'Router 192.168.10.1, DNS 192.168.10.10. Neu option sai, can sua option truoc khi renew.'
  },
  {
    id: '05-client-after',
    instruction: 'Chon CLIENT-01, Renew DHCP lease, roi chay ipconfig /all.',
    expected: 'Neu may dung DHCP va option dung, gateway du kien thanh 192.168.10.1.'
  },
  {
    id: '06-remote-after',
    instruction: 'Tren CLIENT-01, chay lai ping 192.168.20.10.',
    expected: 'Du kien nhan phan hoi neu router, dich va duong tra loi hoat dong.'
  },
  {
    id: '07-local-after',
    instruction: 'Tren CLIENT-01, chay lai ping 192.168.10.10.',
    expected: 'Ket noi cung subnet du kien van thanh cong.'
  }
];

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Ghi video, anh va ho so JSON cua phien mo phong gateway thao tac thu cong.');
    console.log('Chay: node scripts/capture-gateway-session.cjs [--url http://127.0.0.1:3100/]');
    console.log('Mo san ung dung local; lam tung buoc tren trinh duyet, quay lai terminal bam Enter de chup anh.');
    console.log('Cong cu khong tu thao tac, khong tu ket luan dat va khong chay Windows Server that.');
    return;
  }

  const fs = require('node:fs/promises');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const readline = require('node:readline/promises');
  const { execFileSync } = require('node:child_process');
  let chromium;
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    try {
      chromium = require(name).chromium;
      if (chromium) break;
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  if (!chromium) throw new Error('Chua tim thay Playwright. Kiem tra dependency trong README/package.json cua du an.');
  if (!process.stdin.isTTY) throw new Error('Hay chay truc tiep trong terminal tuong tac cua VS Code.');

  const root = path.resolve(__dirname, '..');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(root, 'output', 'demo', 'gateway-manual-' + timestamp + '-' + crypto.randomBytes(3).toString('hex'));
  await fs.mkdir(out, { recursive: true });
  let commit = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000
    }).trim();
  } catch {}
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const metadata = {
    schemaVersion: 1,
    source: 'web-simulation',
    scenarioExpected: 'network-gateway',
    operator: 'user',
    appUrl: options.appUrl,
    startedAtUtc: new Date().toISOString(),
    gitCommit: commit,
    nodeVersion: process.version,
    status: 'incomplete',
    validation: 'not-automatically-validated',
    steps: [],
    downloads: [],
    errors: []
  };
  let browser;
  let context;
  let rl;
  let allStepsCaptured = false;
  const downloads = [];
  let downloadIndex = 0;
  function redact(value, stats, depth = 0) {
    if (depth > 100) throw new Error('Ho so JSON vuot gioi han do sau.');
    if (Array.isArray(value)) return value.map(item => redact(item, stats, depth + 1));
    if (value && typeof value === 'object') {
      const clean = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (/(password|passwd|secret|api.?key|authorization|access.?token|refresh.?token|cookie)/i.test(key)) {
          clean[key] = '[REDACTED]';
          stats.count++;
        } else clean[key] = redact(item, stats, depth + 1);
      }
      return clean;
    }
    return value;
  }
  async function saveDownload(download) {
    if (!/\.json$/i.test(download.suggestedFilename())) return;
    const index = ++downloadIndex;
    const tempPath = await download.path();
    if (!tempPath) throw new Error('Khong doc duoc tep JSON tai xuong.');
    const stat = await fs.stat(tempPath);
    if (stat.size > 20 * 1024 * 1024) throw new Error('Ho so JSON vuot 20 MB; chua luu.');
    const raw = await fs.readFile(tempPath);
    const stats = { count: 0 };
    const clean = redact(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')), stats);
    if (!clean || typeof clean !== 'object') throw new Error('Ho so JSON phai la object hoac array.');
    const file = 'session-export-' + index + '.json';
    await fs.writeFile(path.join(out, file), JSON.stringify(clean, null, 2) + '\n', { flag: 'wx' });
    metadata.downloads.push({
      file, sourceSha256: digest(raw), sensitiveFieldsRedacted: stats.count,
      note: 'Ban JSON duoc serialize lai va che cac truong nhay cam theo ten khoa; chua kiem chung schema hoac ket qua.'
    });
  }

  try {
    browser = await chromium.launch({ headless: false });
    metadata.browserVersion = browser.version();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
      recordVideo: { dir: path.join(out, 'video'), size: { width: 1440, height: 900 } }
    });
    const page = await context.newPage();
    page.on('download', download => {
      downloads.push(saveDownload(download).catch(error => {
        metadata.errors.push({ stage: 'download', message: error.message });
      }));
    });
    await page.goto(options.appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => rl.close());
    browser.on('disconnected', () => rl.close());
    console.log('\nDay la ghi phien thu cong, khong phai kiem thu tu dong.');
    console.log('Video chi ghi trang Web. Khong mo khoa API, token hoac mat khau khi dang ghi.');
    console.log('Thu muc luu: ' + out);

    for (const step of steps) {
      console.log('\n' + step.instruction);
      console.log('Ky vong (chua do): ' + step.expected);
      const action = await rl.question('Lam xong, bam Enter de chup; nhap q de dung: ');
      if (action.trim().toLowerCase() === 'q') break;
      const file = step.id + '.png';
      await page.screenshot({ path: path.join(out, file), fullPage: false });
      metadata.steps.push({
        id: step.id, capturedAtUtc: new Date().toISOString(), screenshot: file,
        instruction: step.instruction, expected: step.expected,
        observation: 'Screenshot captured after operator confirmation; not automatically assessed.'
      });
    }
    allStepsCaptured = metadata.steps.length === steps.length;
    if (allStepsCaptured) {
      console.log('\nTrong ung dung, xuat ho so phien JSON. Doi tai xong roi quay lai terminal.');
      await rl.question('Bam Enter sau khi xuat ho so, hoac khi muon ket thuc ma chua xuat: ');
      await Promise.all(downloads);
    }
  } catch (error) {
    metadata.errors.push({ stage: 'capture', message: error.message });
    console.error('Chua hoan tat ghi phien: ' + error.message);
    if (/executable|browser.*install/i.test(error.message)) {
      console.error('Neu thieu Chromium, chay: npx playwright install chromium');
    }
  } finally {
    if (rl) rl.close();
    await Promise.all(downloads);
    if (context) {
      try { await context.close(); }
      catch (error) { metadata.errors.push({ stage: 'close-context', message: error.message }); }
    }
    if (browser) {
      try { await browser.close(); }
      catch (error) { metadata.errors.push({ stage: 'close-browser', message: error.message }); }
    }
    metadata.finishedAtUtc = new Date().toISOString();
    metadata.status = allStepsCaptured && metadata.downloads.length > 0 && metadata.errors.length === 0
      ? 'captured-awaiting-review' : 'incomplete';
    await fs.writeFile(path.join(out, 'capture.json'), JSON.stringify(metadata, null, 2) + '\n');
    const files = [];
    async function collect(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) await collect(absolute);
        else if (entry.isFile()) {
          const bytes = await fs.readFile(absolute);
          files.push({ path: path.relative(out, absolute).split(path.sep).join('/'), bytes: bytes.length, sha256: digest(bytes) });
        }
      }
    }
    await collect(out);
    files.sort((a, b) => a.path.localeCompare(b.path));
    await fs.writeFile(path.join(out, 'manifest-sha256.json'), JSON.stringify({
      algorithm: 'SHA-256', generatedAtUtc: new Date().toISOString(),
      status: metadata.status, validation: metadata.validation, files
    }, null, 2) + '\n');
    console.log('\nDa luu: ' + out);
    console.log('Trang thai: ' + metadata.status + '. Can xem lai video, JSON va ket qua truoc khi ket luan dat.');
    if (metadata.status === 'incomplete') process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

