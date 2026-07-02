#!/usr/bin/env node
/**
 * Practice tour — all 22 steps, 3s pause + screenshot each, then review log.
 * Run: node scripts/practice-tour-walk.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { selectPracticeKey } from './lib/practice-smoke-helpers.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(repoRoot, 'extension');
const PRACTICE_KEY = 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3';
const PLAIN_PHRASE = 'Thanks for your help on the project';
const SAMPLE_IBAN = 'IE64IRCE99007012345678';
const TYPE_DEMO_KEY = 'sk-type-demo';
const STEP_PAUSE_MS = 3000;
const TOTAL_STEPS = 22;
const outDir = join(repoRoot, 'extension', 'store', 'practice-tour-walk', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
};

const review = [];

function resolveFile(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (clean === '/practice' || clean === '/practice.html') return join(repoRoot, 'practice.html');
  if (clean.startsWith('/portal/')) return join(repoRoot, 'portal', clean.slice('/portal/'.length));
  if (clean === '/practice-tour.css') return join(repoRoot, 'practice-tour.css');
  if (clean === '/practice.css') return join(repoRoot, 'practice.css');
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

async function waitForExtensionReady(page) {
  await page.waitForSelector('#goldspire-selection-status', { timeout: 20000, state: 'attached' });
  await page.waitForTimeout(2000);
}

async function tourMeta(page) {
  return page.evaluate(() => ({
    step: document.querySelector('.practice-tour__bubble-step')?.textContent?.trim() || '',
    title: document.querySelector('.practice-tour__bubble-title')?.textContent?.trim() || '',
    body: document.querySelector('.practice-tour__bubble-body')?.textContent?.trim() || '',
    nextLabel: document.querySelector('[data-tour-next]')?.textContent?.trim() || '',
    pill: Boolean(document.getElementById('goldspire-selection-status')?.classList?.contains('gst-selection-status--visible')),
    dialog: Boolean(document.querySelector('#goldspire-veil-prompt .gst-dialog, #goldspire-veil-prompt .gst-result')),
    sheet: Boolean(document.querySelector('.gst-veil-pop--secure')),
  }));
}

async function waitForStepNum(page, n, timeout = 60000) {
  await page.waitForFunction(
    (expected) => {
      const t = document.querySelector('.practice-tour__bubble-step')?.textContent || '';
      return t.startsWith(`${expected} /`);
    },
    n,
    { timeout },
  );
}

async function shotStep(page, n) {
  const meta = await tourMeta(page);
  const file = `${String(n).padStart(2, '0')}-${meta.title.replace(/[^\w]+/g, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: true });
  const entry = { n, file, ...meta };
  review.push(entry);
  console.log(`  📸 ${n}/${TOTAL_STEPS} ${meta.title}${meta.pill ? ' [pill visible]' : ''}`);
  return entry;
}

async function pause() {
  await new Promise((r) => setTimeout(r, STEP_PAUSE_MS));
}

async function dismissCopilot(page) {
  await page.evaluate(() => {
    document.getElementById('goldspire-veil-copilot')?.remove();
    document.querySelector('.gst-overlay:not(#goldspire-veil-prompt)')?.remove();
  });
  await page.waitForTimeout(200);
}

async function clickNext(page) {
  await dismissCopilot(page);
  const btn = page.locator('[data-tour-next]:visible').first();
  await btn.click({ timeout: 12000, force: true });
  await page.waitForTimeout(400);
}

async function dismissPrompt(page) {
  await page.evaluate(() => {
    document.querySelector('#goldspire-veil-prompt [data-action="close"]')?.click();
    document.getElementById('goldspire-veil-prompt')?.remove();
  });
}

async function readCode(page) {
  return (await page.locator('#goldspire-veil-prompt .gst-result__value').first().textContent().catch(() => '') || '').trim();
}

async function unlockRedacted(page, code) {
  await page.locator('#practice-body a.gst-redacted').click();
  await page.waitForSelector('#goldspire-veil-prompt input', { timeout: 8000 });
  await page.locator('#goldspire-veil-prompt input').first().fill(code);
  await page.locator('#goldspire-veil-prompt [data-action="submit"], #goldspire-veil-prompt .gst-btn--primary').first().click();
  await page.waitForTimeout(900);
}

async function selectPhrase(page, phrase) {
  await page.evaluate((p) => {
    const root = document.getElementById('practice-body');
    const text = root?.textContent || '';
    const start = text.indexOf(p);
    if (!root || start < 0) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent.length;
      if (pos + len > start) {
        const range = document.createRange();
        const offset = start - pos;
        range.setStart(node, offset);
        range.setEnd(node, Math.min(len, offset + p.length));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      pos += len;
      node = walker.nextNode();
    }
  }, phrase);
  await page.waitForTimeout(500);
}

async function seedSettings(context) {
  const page = await context.newPage();
  await page.goto('about:blank');
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({
        setupComplete: true,
        copilotEnabled: true,
        securityProfile: 'personal',
        useSavedPassphrase: false,
        defaultSecureMode: 'one-time',
        showSelectionPill: true,
        selectionUiMode: 'smart',
        copyOneTimeCodeAutomatically: false,
      });
      try { localStorage.removeItem('veilPracticeTourCompleteV10'); } catch { /**/ }
    });
  }
  await page.close();
}

function analyzeReview() {
  const issues = [];
  for (const r of review) {
    if (r.n === 10 && !r.dialog) issues.push(`Step ${r.n}: code dialog not visible in screenshot`);
    if (r.n === 18 && r.title.includes('Off') && r.pill) {
      issues.push(`Step ${r.n}: pill visible in Off mode`);
    }
  }
  return issues;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startServer();
  const userDataDir = mkdtempSync(join(tmpdir(), 'veil-tour-walk-'));
  let quickCode = '';
  let optionsCode = '';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });

  try {
    await seedSettings(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/practice.html?tour=1`, { waitUntil: 'networkidle' });
    await waitForExtensionReady(page);
    await page.locator('[data-intro-begin]').click({ timeout: 10000 });
    await page.waitForTimeout(800);

    // 1 intro
    await waitForStepNum(page, 1);
    await pause(); await shotStep(page, 1); await clickNext(page);

    // 2 highlight
    await waitForStepNum(page, 2);
    await pause(); await shotStep(page, 2);
    await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
    await page.waitForTimeout(800);

    // 3 quick
    await waitForStepNum(page, 3);
    await pause(); await shotStep(page, 3);
    await page.locator('.gst-pill-half--quick').click();
    await page.waitForSelector('.gst-result__value', { timeout: 10000 });
    quickCode = await readCode(page);
    await page.waitForTimeout(800);

    // 4 celebrate → 5 unlock → 6 recipient
    await waitForStepNum(page, 4);
    await pause(); await shotStep(page, 4); await clickNext(page);

    await waitForStepNum(page, 5);
    await pause(); await shotStep(page, 5);
    await unlockRedacted(page, quickCode);
    await page.waitForTimeout(800);

    await waitForStepNum(page, 6);
    await pause(); await shotStep(page, 6); await clickNext(page);

    // 7–8 options
    await waitForStepNum(page, 7);
    await pause(); await shotStep(page, 7);
    await dismissPrompt(page);
    await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
    await page.locator('.gst-pill-half--options').click();
    await page.waitForSelector('.gst-veil-pop--secure', { timeout: 8000 });
    await page.waitForTimeout(800);

    await waitForStepNum(page, 8);
    await pause(); await shotStep(page, 8); await clickNext(page);

    // 9–11 one-time flow
    await waitForStepNum(page, 9);
    await pause(); await shotStep(page, 9);
    await page.locator('.gst-veil-pop--secure [data-mode="one-time"]').click();
    await page.waitForTimeout(400);
    await page.locator('.gst-veil-pop--secure [data-action="submit"]').click();
    await page.waitForSelector('.gst-result__value', { timeout: 10000 });
    optionsCode = await readCode(page);
    const on9 = await page.locator('.practice-tour__bubble-title', { hasText: 'One-time & Secure' }).count();
    if (on9) await clickNext(page);

    await waitForStepNum(page, 10);
    await pause(); await shotStep(page, 10); await clickNext(page);

    await waitForStepNum(page, 11);
    await pause(); await shotStep(page, 11);
    await unlockRedacted(page, optionsCode);
    await page.waitForTimeout(800);

    // 12–18 hints
    await waitForStepNum(page, 12);
    await pause(); await shotStep(page, 12); await clickNext(page);

    await waitForStepNum(page, 13);
    await pause(); await shotStep(page, 13);
    await selectPhrase(page, PLAIN_PHRASE);
    await page.waitForTimeout(800);

    await waitForStepNum(page, 14);
    await pause(); await shotStep(page, 14); await clickNext(page);

    await waitForStepNum(page, 15);
    await pause(); await shotStep(page, 15);
    await selectPhrase(page, PLAIN_PHRASE);
    await page.waitForTimeout(1000);
    const on15 = await page.locator('.practice-tour__bubble-title', { hasText: 'Always mode' }).count();
    if (on15) await clickNext(page);

    await waitForStepNum(page, 16);
    await pause(); await shotStep(page, 16); await clickNext(page);

    await waitForStepNum(page, 17);
    await pause(); await shotStep(page, 17);
    await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
    await page.waitForTimeout(800);
    await clickNext(page);

    await waitForStepNum(page, 18);
    await pause(); await shotStep(page, 18);
    await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
    await page.waitForTimeout(800);
    await clickNext(page);

    // 19–22 copilot + finish
    await waitForStepNum(page, 19);
    await pause(); await shotStep(page, 19);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#practice-body').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.evaluate(async (iban) => {
      await navigator.clipboard.writeText(iban);
    }, SAMPLE_IBAN);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    await dismissCopilot(page);
    const on19 = await page.locator('[data-tour-next]:visible').count();
    if (on19) await clickNext(page);

    await waitForStepNum(page, 20);
    await pause(); await shotStep(page, 20);
    await dismissPrompt(page);
    await clickNext(page);

    await waitForStepNum(page, 21);
    await pause(); await shotStep(page, 21);
    await page.locator('#practice-body').click();
    await page.keyboard.press('Enter');
    await page.locator('#practice-body').type(TYPE_DEMO_KEY, { delay: 40 });
    await page.waitForTimeout(2000);
    const on21 = await page.locator('[data-tour-next]:visible').count();
    if (on21) await clickNext(page);

    await waitForStepNum(page, 22);
    await pause(); await shotStep(page, 22);
    await clickNext(page);

    const issues = analyzeReview();
    const report = { outDir, review, issues, passed: issues.length === 0 };
    writeFileSync(join(outDir, 'REVIEW.json'), JSON.stringify(report, null, 2));

    console.log(`\n${issues.length ? '⚠' : '✓'} Review: ${issues.length} issue(s)`);
    issues.forEach((i) => console.log(`   - ${i}`));
    console.log(`\nScreenshots: ${outDir}`);
    if (issues.length) process.exit(1);
  } finally {
    await context.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
