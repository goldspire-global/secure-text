#!/usr/bin/env node
/**
 * Capture pricing page screenshot for QA.
 * Run: node scripts/capture-pricing-screenshot.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'extension', 'store', 'screenshots');
const VIEWPORT = { width: 1280, height: 900 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.json': 'application/json',
};

function resolveAsset(urlPath) {
  const clean = urlPath.split('?')[0];
  if (clean === '/' || clean === '/pricing.html') return join(repoRoot, 'pricing.html');
  const rel = clean.replace(/^\//, '');
  const direct = join(repoRoot, rel);
  if (existsSync(direct)) return direct;
  return join(repoRoot, rel);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
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
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.on('error', reject);
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('veilPricingCurrency', 'GBP');
    } catch (_) { /* ignore */ }
  });

  await page.goto(`${baseUrl}/pricing.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const outPath = join(outDir, 'pricing-sandwich-gbp.png');
  await page.screenshot({ path: outPath, fullPage: true });

  await browser.close();
  server.close();
  console.log(`Saved ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
