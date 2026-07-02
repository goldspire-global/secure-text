#!/usr/bin/env node
/**
 * Chrome Web Store assets — 5 screenshots (1280×800) + promo tiles.
 * Run: npm run capture:store
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { selectPracticeKey } from './lib/practice-smoke-helpers.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(repoRoot, 'extension');
const demoDir = join(extensionDir, 'store', 'demo');
const outDir = join(extensionDir, 'store', 'screenshots');
const SHOT = { width: 1280, height: 800 };

const CAPTION_STYLE = `
  .store-caption {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
    padding: 18px 32px 22px;
    background: linear-gradient(transparent, rgba(8, 10, 16, 0.92) 35%);
    pointer-events: none;
  }
  .store-caption strong {
    display: block; font: 600 22px "Segoe UI", system-ui, sans-serif;
    color: #f4f6fb; margin-bottom: 4px;
  }
  .store-caption span {
    font: 400 15px "Segoe UI", system-ui, sans-serif; color: #9aa3b8;
  }
`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function resolveAsset(urlPath) {
  const clean = urlPath.split('?')[0];
  if (clean.startsWith('/demo/')) {
    return join(demoDir, clean.slice('/demo/'.length));
  }
  if (clean.startsWith('/styles/')) {
    return join(extensionDir, clean.slice(1));
  }
  if (clean.startsWith('/popup/')) {
    return join(extensionDir, clean.slice(1));
  }
  if (clean.startsWith('/icons/')) {
    return join(extensionDir, clean.slice(1));
  }
  if (clean === '/practice' || clean === '/practice.html') return join(repoRoot, 'practice.html');
  if (clean.startsWith('/portal/')) return join(repoRoot, 'portal', clean.slice('/portal/'.length));
  if (clean === '/practice.css') return join(repoRoot, 'practice.css');
  if (clean === '/practice-tour.css') return join(repoRoot, 'practice-tour.css');
  return join(demoDir, clean.replace(/^\//, ''));
}

function startDemoServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = req.url || '/';
        const filePath = resolveAsset(urlPath);
        if (!existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const type = MIME[extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.on('error', reject);
  });
}

async function waitForServiceWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  }
  return worker;
}

async function getExtensionId(context) {
  const worker = await waitForServiceWorker(context);
  return new URL(worker.url()).host;
}

async function seedSettings(context, values) {
  const worker = await waitForServiceWorker(context);
  await worker.evaluate(async (payload) => {
    await chrome.storage.sync.set(payload);
  }, values);
}

async function launchWithExtension(userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: SHOT,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
}

async function addCaption(page, title, subtitle) {
  await page.evaluate(({ title, subtitle }) => {
    const el = document.createElement('div');
    el.className = 'store-caption';
    el.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    document.body.appendChild(el);
  }, { title, subtitle });
}

async function captureWelcome(context, extensionId, outputPath) {
  await seedSettings(context, { setupComplete: false, tourComplete: false, securityProfile: 'personal' });
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view-setup:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.addStyleTag({
    content: `
      html, body {
        width: 1280px !important; height: 800px !important; min-height: 0 !important;
        margin: 0 !important;
        background: radial-gradient(ellipse at 28% 18%, #1a2235 0%, #0d111b 55%, #080a10 100%) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
      }
      .popup { box-shadow: 0 28px 90px rgba(0,0,0,0.55); border: 1px solid rgba(212,160,23,0.28); border-radius: 16px; }
      ${CAPTION_STYLE}
    `,
  });
  await addCaption(page, 'Free for personal use', 'Pick Personal or join your team with a code from IT');
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
  await seedSettings(context, {
    setupComplete: true,
    copilotEnabled: true,
    securityProfile: 'personal',
    dlpMode: 'off',
    useSavedPassphrase: true,
    passphrase: 'StoreCaptureDemo1!',
    showSelectionPill: true,
    selectionUiMode: 'smart',
    tourComplete: true,
  });
}

async function capturePopup(context, extensionId, outputPath) {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#view-main:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const card = document.getElementById('readiness-card');
    if (card) card.hidden = false;
  });

  await page.addStyleTag({
    content: `
      html, body {
        width: 1280px !important;
        min-height: 800px !important;
        height: 800px !important;
        margin: 0 !important;
        background: radial-gradient(ellipse at 28% 18%, #1a2235 0%, #0d111b 55%, #080a10 100%) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      body::before {
        content: 'Veil';
        position: absolute;
        top: 52px;
        left: 72px;
        font: 600 34px "Segoe UI", system-ui, sans-serif;
        color: #d4a017;
      }
      body::after {
        content: 'Setup checklist — ready to protect sensitive text';
        position: absolute;
        top: 96px;
        left: 72px;
        font: 400 18px "Segoe UI", system-ui, sans-serif;
        color: #94a3b8;
      }
      .popup {
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(212, 160, 23, 0.28);
        border-radius: 16px;
        overflow: hidden;
      }
    `,
  });

  await page.screenshot({ path: outputPath, fullPage: false });
  await page.close();
}

async function waitForExtensionReady(page) {
  await page.waitForSelector('#goldspire-selection-status', {
    timeout: 20000,
    state: 'attached',
  });
  // Content script caches settings asynchronously after inject.
  await page.waitForTimeout(2500);
}

async function captureCopilot(context, baseUrl, outputPath) {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
  await page.goto(`${baseUrl}/demo/02-copilot-compose.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);

  const apiKey = 'sk-live-abcdefghijklmnopqrstuvwxyz';
  const textarea = page.locator('#compose-body');
  await textarea.click();

  // Real Ctrl+V so the document capture-phase paste listener runs.
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, apiKey);
  await page.keyboard.press('Control+V');

  try {
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 8000 });
  } catch {
    // Fallback: typed field scan if paste was swallowed by the host page.
    await textarea.fill('');
    await textarea.click();
    await page.keyboard.type(apiKey, { delay: 20 });
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 12000 });
  }

  await page.waitForTimeout(400);
  await page.addStyleTag({ content: CAPTION_STYLE });
  await addCaption(page, 'Smart copilot on paste', 'Catches API keys before they land in email or forms');
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function captureStaticDemo(context, baseUrl, demoPath, outputPath, title, subtitle) {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`${baseUrl}/demo/${demoPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: CAPTION_STYLE });
  await addCaption(page, title, subtitle);
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function capturePracticeSecure(context, baseUrl, outputPath) {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`${baseUrl}/practice`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  await selectPracticeKey(page, '#practice-body', 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3');
  await page.waitForTimeout(600);
  await page.locator('.gst-pill-half--quick').click({ timeout: 10000 });
  await page.waitForSelector('.gst-result__value, a.gst-redacted', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: CAPTION_STYLE });
  await addCaption(page, 'Hands-on practice mode', 'Try secure → unlock in a safe sandbox before real mail');
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function capturePromo(context, baseUrl, demoPath, outputPath, width, height) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/demo/${demoPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function captureStaticPage(context, url, outputPath) {
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outputPath, fullPage: false });
  await page.close();
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const { server, baseUrl } = await startDemoServer();
  const userDataDir = join(tmpdir(), 'veil-store-capture-profile');

  console.log('Launching Chromium with Veil extension…');
  const context = await launchWithExtension(userDataDir);

  try {
    await waitForServiceWorker(context);
    const extensionId = await getExtensionId(context);

    const shots = [
      {
        name: '01-welcome.png',
        run: () => captureWelcome(context, extensionId, join(outDir, '01-welcome.png')),
      },
      {
        name: '02-copilot-compose.png',
        run: () => captureCopilot(context, baseUrl, join(outDir, '02-copilot-compose.png')),
      },
      {
        name: '03-email-redacted.png',
        run: () => captureStaticDemo(
          context, baseUrl, '03-email-redacted.html', join(outDir, '03-email-redacted.png'),
          'Clickable [redacted] links', 'Recipients unlock in the same email thread — passphrase stays separate',
        ),
      },
      {
        name: '04-email-token.png',
        run: () => captureStaticDemo(
          context, baseUrl, '04-email-token.html', join(outDir, '04-email-token.png'),
          'Team tokenization', 'Org members reveal vault tokens without pasting plaintext',
        ),
      },
      {
        name: '05-practice-secure.png',
        run: () => capturePracticeSecure(context, baseUrl, join(outDir, '05-practice-secure.png')),
      },
    ];

    for (const shot of shots) {
      console.log(`Capturing ${shot.name}…`);
      await shot.run();
      console.log(`  → ${join(outDir, shot.name)}`);
    }

    console.log('Capturing promo-small.png…');
    await capturePromo(context, baseUrl, 'promo-small.html', join(outDir, 'promo-small.png'), 440, 280);
    console.log('Capturing promo-marquee.png…');
    await capturePromo(context, baseUrl, 'promo-marquee.html', join(outDir, 'promo-marquee.png'), 1400, 560);

    console.log(`\nDone. Upload from:\n  ${outDir}`);
    console.log('\nScreenshots (upload in order):');
    shots.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    console.log('Promo: promo-small.png (440×280), promo-marquee.png (1400×560)');
  } finally {
    await context.close();
    server.close();
  }
}

main().catch((error) => {
  if (String(error?.message || error).includes("Executable doesn't exist")) {
    console.error('\nPlaywright browser missing. Run:\n  npx playwright install chromium\n');
  } else {
    console.error('\nCapture failed:', error.message || error);
  }
  process.exit(1);
});
