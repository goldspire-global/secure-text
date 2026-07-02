#!/usr/bin/env node
/**
 * Extension smoke — practice secure, demo compose copilot, popup, keyboard shortcut.
 * Run: npm run test:extension-smoke
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertPracticeRedactedLink, selectPracticeKey } from './lib/practice-smoke-helpers.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(repoRoot, 'extension');
const demoDir = join(extensionDir, 'store', 'demo');
const PRACTICE_KEY = 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3';
const PASTE_KEY = 'sk-live-abcdefghijklmnopqrstuvwxyz';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (clean.startsWith('/demo/')) return join(demoDir, clean.slice('/demo/'.length));
  if (clean === '/') return join(repoRoot, 'index.html');
  return join(repoRoot, clean.replace(/^\//, ''));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const filePath = resolveFile(req.url);
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
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
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  return worker;
}

async function seedPersonalSettings(context) {
  const worker = await waitForServiceWorker(context);
  await worker.evaluate(async () => {
    await chrome.storage.sync.set({
      setupComplete: true,
      copilotEnabled: true,
      securityProfile: 'personal',
      dlpMode: 'off',
      useSavedPassphrase: true,
      defaultSecureMode: 'team',
      showSelectionPill: true,
      selectionUiMode: 'smart',
      copyOneTimeCodeAutomatically: true,
    });
  });
}

function assertNoFatalErrors(errors, label) {
  const fatal = errors.filter(
    (e) => e.includes('global is not defined')
      || e.includes('Extension context invalidated')
      || e.includes('Something went wrong'),
  );
  if (fatal.length) {
    throw new Error(`${label}: ${fatal.join('; ')}`);
  }
}

async function testPracticeQuick(page, errors) {
  await page.goto(`${page.context()._baseUrl}/practice.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
  await page.waitForTimeout(500);
  await page.waitForSelector('#goldspire-selection-status.gst-selection-status--visible', { timeout: 10000 });
  await page.locator('.gst-pill-half--quick').click();
  await page.waitForTimeout(1200);
  assertNoFatalErrors(errors, 'practice quick');
  await assertPracticeRedactedLink(page, '#practice-body', PRACTICE_KEY, 'practice quick');
  console.log('  ✓ practice Quick → clickable [redacted] link');
}

async function testPracticeOptionsSheet(page, errors) {
  await page.goto(`${page.context()._baseUrl}/practice.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
  await page.waitForTimeout(500);
  await page.waitForSelector('#goldspire-selection-status.gst-selection-status--visible', { timeout: 10000 });
  await page.locator('.gst-pill-half--options').click();
  await page.waitForSelector('#goldspire-veil-prompt', { timeout: 8000 });
  await page.locator('[data-action="submit"]').click();
  await page.waitForTimeout(1200);
  assertNoFatalErrors(errors, 'practice options');
  await assertPracticeRedactedLink(page, '#practice-body', PRACTICE_KEY, 'practice options');
  console.log('  ✓ practice Options sheet → clickable [redacted] link');
}

async function waitForExtensionReady(page) {
  await page.waitForSelector('#goldspire-selection-status', { timeout: 20000, state: 'attached' });
  await page.waitForTimeout(2500);
}

async function testDemoPasteCopilotMask(page, errors) {
  const baseUrl = page.context()._baseUrl;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
  await page.goto(`${baseUrl}/demo/02-copilot-compose.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  const textarea = page.locator('#compose-body');
  await textarea.click();
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, PASTE_KEY);
  await page.keyboard.press('Control+V');
  try {
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 8000 });
  } catch {
    await textarea.fill('');
    await textarea.click();
    await page.keyboard.type(PASTE_KEY, { delay: 20 });
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 12000 });
  }
  const maskBtn = page.locator('#goldspire-veil-copilot [data-action-id="mask"]');
  await maskBtn.first().click();
  await page.waitForTimeout(800);
  assertNoFatalErrors(errors, 'demo copilot mask');
  const body = await page.inputValue('#compose-body');
  if (body.includes(PASTE_KEY)) {
    throw new Error('demo copilot: Mask did not redact pasted key');
  }
  console.log('  ✓ demo compose paste → copilot Mask');
}

async function testPopupLoads(context) {
  const worker = await waitForServiceWorker(context);
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const main = document.getElementById('view-main');
    const setup = document.getElementById('view-setup');
    return (main && !main.hidden) || (setup && !setup.hidden);
  }, { timeout: 20000 });
  assertNoFatalErrors(errors, 'popup');
  await page.close();
  console.log('  ✓ extension popup loads');
}

async function main() {
  const { server, baseUrl } = await startServer();
  const userDataDir = mkdtempSync(join(tmpdir(), 'veil-ext-smoke-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
  context._baseUrl = baseUrl;

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    await seedPersonalSettings(context);
    console.log('Extension smoke:');
    await testPracticeQuick(page, errors);
    await testPracticeOptionsSheet(page, errors);
    await testDemoPasteCopilotMask(page, errors);
    await testPopupLoads(context);
    if (errors.length) {
      console.warn('  (non-fatal page errors:', errors.join('; '), ')');
    }
    console.log('✓ Extension smoke passed');
    process.exit(0);
  } catch (error) {
    console.error('✗', error.message || error);
    if (errors.length) console.error('  errors:', errors.join('; '));
    process.exit(1);
  } finally {
    await context.close().catch(() => {});
    server.close();
  }
}

main();
