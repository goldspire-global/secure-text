#!/usr/bin/env node
/**
 * Full product walk — every portal route, screenshots, console errors, broken assets.
 * Run: npm run product:walk
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'extension', 'store', 'product-review');
const VIEWPORT = { width: 1280, height: 800 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
};

const ROUTES = [
  { path: '/', name: '01-home', expect: /keyboard-edge/i },
  { path: '/index.html', name: '02-index', expect: /Veil/ },
  { path: '/install.html', name: '03-install', expect: /practice page/i },
  { path: '/practice', name: '04-practice', expect: /Practice secure/i },
  { path: '/practice.html', name: '04-practice-html', expect: /Practice secure/i },
  { path: '/plus.html', name: '04b-plus', expect: /Veil Plus/i },
  { path: '/claim.html', name: '04c-claim', expect: /magic link/i },
  { path: '/verify-email.html', name: '04d-verify-email', expect: /Verify your email/i },
  { path: '/pricing.html', name: '05-pricing', expect: /team/i },
  { path: '/create.html', name: '06-create', expect: /team/i },
  { path: '/join.html', name: '07-join', expect: /join/i },
  { path: '/unlock.html', name: '08-unlock', expect: /Zero-knowledge/i },
  { path: '/privacy.html', name: '09-privacy', expect: /privacy/i },
  { path: '/terms.html', name: '10-terms', expect: /terms/i },
  { path: '/feedback.html', name: '11-feedback', expect: /feedback/i },
  { path: '/admin.html', name: '12-admin', expect: /Admin sign in/i },
  { path: '/outlook-addin/taskpane.html', name: '13-outlook-pane', expect: /Outlook/i },
];

function resolveStatic(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (clean === '/') return join(repoRoot, 'index.html');
  const candidate = join(repoRoot, clean.replace(/^\//, ''));
  if (existsSync(candidate)) return candidate;
  return null;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const filePath = resolveStatic(req.url);
      if (!filePath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.on('error', reject);
  });
}

async function walkPopup(page, extensionPath, baseUrl) {
  const popupUrl = `file:///${extensionPath.replace(/\\/g, '/')}/popup/popup.html`;
  const errors = [];
  page.on('pageerror', (err) => errors.push(`popup: ${err.message}`));
  await page.goto(popupUrl);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, '14-popup-setup.png'), fullPage: true });
  return errors;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startServer();
  const report = { passed: [], failed: [], warnings: [], screenshots: outDir };

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  for (const route of ROUTES) {
    const url = `${baseUrl}${route.path}`;
    consoleErrors.length = 0;
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      const status = response?.status() || 0;
      const html = await page.content();
      const text = await page.locator('body').innerText();

      if (status !== 200) {
        report.failed.push({ route: route.path, reason: `HTTP ${status}` });
        continue;
      }
      if (route.expect && !route.expect.test(text) && !route.expect.test(html)) {
        report.warnings.push({ route: route.path, reason: `Expected content not found: ${route.expect}` });
      }
      if (consoleErrors.length) {
        report.warnings.push({ route: route.path, reason: `Console errors: ${consoleErrors.join('; ')}` });
      }

      await page.screenshot({ path: join(outDir, `${route.name}.png`), fullPage: true });
      report.passed.push(route.path);
      console.log(`✓ ${route.path}`);
    } catch (error) {
      report.failed.push({ route: route.path, reason: error.message || String(error) });
      console.log(`✗ ${route.path} — ${error.message}`);
    }
  }

  const extDir = join(repoRoot, 'extension');
  if (existsSync(join(extDir, 'popup', 'popup.html'))) {
    try {
      const popupErrors = await walkPopup(page, extDir, baseUrl);
      if (popupErrors.length) {
        report.warnings.push({ route: 'popup', reason: popupErrors.join('; ') });
      } else {
        report.passed.push('extension/popup');
      }
      console.log('✓ extension/popup');
    } catch (error) {
      report.warnings.push({ route: 'popup', reason: error.message });
    }
  }

  await browser.close();
  server.close();

  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`\nScreenshots → ${outDir}`);
  console.log(`Passed: ${report.passed.length} · Failed: ${report.failed.length} · Warnings: ${report.warnings.length}`);

  if (report.failed.length) {
    console.error('\nFailed routes:');
    for (const f of report.failed) console.error(`  ${f.route}: ${f.reason}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
