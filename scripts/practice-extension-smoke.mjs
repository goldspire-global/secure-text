#!/usr/bin/env node
/**
 * Practice page + extension smoke — select fake API key, Quick secure → [redacted].
 * Run: npm run test:practice-ext
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
const PRACTICE_KEY = 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
};

function startPortalServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const clean = decodeURIComponent((req.url || '/').split('?')[0]);
      const filePath = clean === '/'
        ? join(repoRoot, 'index.html')
        : join(repoRoot, clean.replace(/^\//, ''));
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
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 25000 });
  return worker;
}

async function seedSettings(context) {
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

async function main() {
  const { server, baseUrl } = await startPortalServer();
  const userDataDir = mkdtempSync(join(tmpdir(), 'veil-practice-'));
  const errors = [];

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  try {
    await seedSettings(context);
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`${baseUrl}/practice.html`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('#practice-body', { timeout: 10000 });

    await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);

    await page.waitForTimeout(600);
    await page.waitForSelector('#goldspire-selection-status.gst-selection-status--visible', { timeout: 8000 });

    const quick = page.locator('.gst-pill-half--quick');
    await quick.click({ timeout: 5000 });
    await page.waitForTimeout(1500);

    if (errors.some((e) => e.includes('global is not defined'))) {
      throw new Error(`Extension error: global is not defined (${errors.join('; ')})`);
    }
    if (errors.length) {
      console.warn('Page errors:', errors);
    }
    await assertPracticeRedactedLink(page, '#practice-body', PRACTICE_KEY, 'practice quick');

    console.log('✓ Practice Quick secure → clickable [redacted] link');
    process.exit(0);
  } catch (error) {
    console.error('✗', error.message || error);
    process.exit(1);
  } finally {
    await context.close().catch(() => {});
    server.close();
  }
}

main();
