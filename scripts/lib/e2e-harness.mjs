/**
 * Shared E2E harness — page monitoring, screenshots, portal/API servers.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

export const VIEWPORT = { width: 1280, height: 800 };

export function resolveStatic(repoRootPath, urlPath, demoDir = null) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (clean === '/practice' || clean === '/practice/') {
    const practicePath = join(repoRootPath, 'practice.html');
    if (existsSync(practicePath)) return practicePath;
  }
  if (demoDir && clean.startsWith('/demo/')) {
    const demoPath = join(demoDir, clean.slice('/demo/'.length));
    if (existsSync(demoPath)) return demoPath;
  }
  if (clean === '/') return join(repoRootPath, 'index.html');
  const candidate = join(repoRootPath, clean.replace(/^\//, ''));
  if (existsSync(candidate)) return candidate;
  return null;
}

export function startPortalServer(repoRootPath, options = {}) {
  const demoDir = options.demoDir || null;
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const filePath = resolveStatic(repoRootPath, req.url, demoDir);
      if (!filePath) {
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

async function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
    probe.on('error', reject);
  });
}

export async function startApiServer(env, portalOrigin) {
  const port = Number(env.E2E_API_PORT) > 0 ? Number(env.E2E_API_PORT) : await reservePort();
  const child = spawn('node', ['api/src/server.mjs'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      CORS_ALLOW_ORIGINS: portalOrigin,
    },
  });

  const logs = [];
  child.stdout?.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 30; i += 1) {
    try {
      const headers = portalOrigin ? { Origin: portalOrigin } : {};
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000), headers });
      const acao = res.headers.get('access-control-allow-origin');
      if (res.ok && (!portalOrigin || acao === portalOrigin)) {
        return {
          baseUrl,
          logs,
          stop: () => new Promise((resolve) => {
            child.kill();
            child.on('close', resolve);
          }),
        };
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  child.kill();
  throw new Error(`API failed to start on ${baseUrl}\n${logs.join('')}`);
}

export async function waitForApiHealthy(baseUrl, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export class PageMonitor {
  constructor() {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.warnings = [];
  }

  attach(page) {
    page.on('pageerror', (err) => this.pageErrors.push(err.message));
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') this.consoleErrors.push(text);
      if (msg.type() === 'warning') this.warnings.push(text);
    });
    page.on('requestfailed', (req) => {
      this.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || 'failed'}`);
    });
  }

  snapshot() {
    return {
      consoleErrors: [...this.consoleErrors],
      pageErrors: [...this.pageErrors],
      failedRequests: [...this.failedRequests],
      warnings: [...this.warnings],
    };
  }

  reset() {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.warnings = [];
  }

  hasCritical() {
    const all = [...this.pageErrors, ...this.consoleErrors];
    return all.some((e) => /global is not defined|Uncaught|Failed to fetch|is not a function/i.test(e));
  }
}

export async function shot(page, dir, name) {
  const path = join(dir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

export function step(report, entry) {
  const record = {
    at: new Date().toISOString(),
    ...entry,
  };
  report.steps.push(record);
  if (entry.status === 'fail') report.summary.failed += 1;
  else if (entry.status === 'warn') report.summary.warnings += 1;
  else report.summary.passed += 1;
  const icon = entry.status === 'fail' ? '✗' : entry.status === 'warn' ? '⚠' : '✓';
  console.log(`${icon} [${entry.profile || 'all'}] ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
  return record;
}

export function writeReport(outDir, report) {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  const lines = [
    '# Veil product E2E walk',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `**Passed:** ${report.summary.passed} · **Warnings:** ${report.summary.warnings} · **Failed:** ${report.summary.failed}`,
    '',
    `Screenshots: \`${outDir}\``,
    '',
    '## Findings',
    '',
  ];

  const fails = report.steps.filter((s) => s.status === 'fail');
  const warns = report.steps.filter((s) => s.status === 'warn');

  if (fails.length) {
    lines.push('### Failures', '');
    for (const f of fails) {
      lines.push(`- **${f.name}** (${f.profile}): ${f.detail || 'failed'}`);
      if (f.issues?.length) for (const i of f.issues) lines.push(`  - ${i}`);
    }
    lines.push('');
  }

  if (warns.length) {
    lines.push('### Warnings', '');
    for (const w of warns) {
      lines.push(`- **${w.name}** (${w.profile}): ${w.detail || 'warning'}`);
      if (w.issues?.length) for (const i of w.issues) lines.push(`  - ${i}`);
    }
    lines.push('');
  }

  lines.push('## All steps', '', '| Status | Profile | Step | Detail |', '|--------|---------|------|--------|');
  for (const s of report.steps) {
    lines.push(`| ${s.status} | ${s.profile || ''} | ${s.name} | ${(s.detail || '').replace(/\|/g, '/')} |`);
  }

  writeFileSync(join(outDir, 'REPORT.md'), lines.join('\n'));
}

export async function launchExtensionContext(extensionDir, userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
}

export async function waitForExtensionReady(page) {
  await page.waitForSelector('#goldspire-selection-status', { timeout: 20000, state: 'attached' });
  await page.waitForTimeout(2500);
}

export async function waitForServiceWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  return worker;
}

export { repoRoot };
