#!/usr/bin/env node
/**
 * Full product E2E walk — personal + org flows, screenshots, console/network monitoring.
 * Run: npm run product:e2e
 */
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  PageMonitor,
  VIEWPORT,
  launchExtensionContext,
  repoRoot,
  shot,
  startApiServer,
  startPortalServer,
  step,
  waitForApiHealthy,
  waitForExtensionReady,
  waitForServiceWorker,
  writeReport,
} from './lib/e2e-harness.mjs';
import { assertPracticeRedactedLink, selectPracticeKey } from './lib/practice-smoke-helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cleanupScenarioOrg, hasDatabase, loadDotEnv, loadExtensionCrypto, polyfillBrowserGlobals } from '../tests/scenarios/helpers.mjs';

loadDotEnv();

function buildOneTimeMarker(secret, passphrase) {
  const iterations = 600_000;
  const crypto = loadExtensionCrypto(iterations);
  const ctx = vm.createContext(polyfillBrowserGlobals({
    GoldspireConstants: { CRYPTO_ITERATIONS: { personal: iterations, organization: iterations } },
    GoldspirePassphrasePolicy: { assertPassphrase() {} },
  }));
  vm.runInContext(readFileSync(join(repoRoot, 'extension/src/marker.js'), 'utf8'), ctx);
  return crypto.encryptText(secret, passphrase, {
    mode: 'one-time',
    profile: 'personal',
    expiresAt: Date.now() + 86400000,
    burnAfterRead: false,
  }).then((payload) => ctx.GoldspireSecureMarker.wrapSecured(payload, '', '2'));
}

const PRACTICE_KEY = 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3';
const TEAM_PASS = 'E2E-Walk-Team-Pass-2026!';
const extensionDir = join(repoRoot, 'extension');
const demoDir = join(extensionDir, 'store', 'demo');

const PORTAL_ROUTES = [
  { path: '/', name: 'home', expect: /keyboard-edge/i },
  { path: '/install.html', name: 'install', expect: /practice/i },
  { path: '/practice.html', name: 'practice', expect: /Practice secure/i },
  { path: '/plus.html', name: 'plus', expect: /Veil Plus/i },
  { path: '/claim.html', name: 'claim', expect: /magic link/i },
  { path: '/verify-email.html', name: 'verify-email', expect: /Verify your email/i },
  { path: '/pricing.html', name: 'pricing', expect: /team/i },
  { path: '/gmail-addon/taskpane.html', name: 'gmail-addon', expect: /Gmail/i },
  { path: '/outlook-addin/taskpane.html', name: 'outlook-addon', expect: /Outlook/i },
  { path: '/create.html?billing=1', name: 'create', expect: /Set up your team/i },
  { path: '/join.html', name: 'join', expect: /Join your team/i },
  { path: '/unlock.html', name: 'unlock', expect: /Unlock/i },
  { path: '/feedback.html', name: 'feedback', expect: /feedback/i },
  { path: '/privacy.html', name: 'privacy', expect: /Privacy/i },
  { path: '/terms.html', name: 'terms', expect: /Terms/i },
  { path: '/admin.html', name: 'admin', expect: /Admin sign in/i },
];

function collectIssues(monitor) {
  const snap = monitor.snapshot();
  const issues = [];
  if (snap.pageErrors.length) issues.push(...snap.pageErrors.map((e) => `page: ${e}`));
  if (snap.consoleErrors.length) issues.push(...snap.consoleErrors.map((e) => `console: ${e}`));
  const badReq = snap.failedRequests.filter((r) => !/favicon|analytics|google|stripe/i.test(r));
  if (badReq.length) issues.push(...badReq.map((r) => `network: ${r}`));
  return issues;
}

async function walkPortalRoutes(page, monitor, baseUrl, outDir, report) {
  for (const route of PORTAL_ROUTES) {
    monitor.reset();
    const url = `${baseUrl}${route.path}`;
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const text = await page.locator('body').innerText();
      const issues = collectIssues(monitor);
      const status = response?.status() !== 200 ? 'fail' : issues.some((i) => /page:|Uncaught/i.test(i)) ? 'warn' : 'pass';
      if (route.expect && !route.expect.test(text)) {
        issues.push(`missing expected content: ${route.expect}`);
      }
      await shot(page, outDir, `portal-${route.name}`);
      step(report, {
        profile: 'portal',
        name: `Portal ${route.path}`,
        status: status === 'pass' && issues.length ? 'warn' : status,
        detail: issues.length ? issues.slice(0, 3).join('; ') : `HTTP ${response?.status()}`,
        issues,
        screenshot: `portal-${route.name}.png`,
      });
    } catch (error) {
      await shot(page, outDir, `portal-${route.name}-error`).catch(() => {});
      step(report, {
        profile: 'portal',
        name: `Portal ${route.path}`,
        status: 'fail',
        detail: error.message,
      });
    }
  }
}

async function walkPortalEdgeCases(page, monitor, baseUrl, outDir, report) {
  monitor.reset();
  await page.goto(`${baseUrl}/claim.html?t=invalid-token-e2e`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const claimText = await page.locator('body').innerText();
  const claimOk = /invalid|expired|error|could not|not found/i.test(claimText);
  await shot(page, outDir, 'portal-claim-bad-token');
  step(report, {
    profile: 'personal',
    name: 'Claim page — invalid token',
    status: claimOk ? 'pass' : 'warn',
    detail: claimOk ? 'Shows error state' : 'No clear error for bad token',
    issues: collectIssues(monitor),
  });

  monitor.reset();
  await page.goto(`${baseUrl}/verify-email.html?t=bad`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const verifyText = await page.locator('body').innerText();
  await shot(page, outDir, 'portal-verify-bad-token');
  step(report, {
    profile: 'personal',
    name: 'Verify email — invalid token',
    status: /invalid|expired|error|could not|verify/i.test(verifyText) ? 'pass' : 'warn',
    detail: 'Bad token handling',
    issues: collectIssues(monitor),
  });
}

async function walkUnlockRoundtrip(page, monitor, baseUrl, outDir, report) {
  const secret = 'practice-unlock-e2e-secret';
  const passphrase = 'E2E-OneTime-Code-1234';
  const fullMarker = await buildOneTimeMarker(secret, passphrase);

  monitor.reset();
  await page.goto(`${baseUrl}/unlock.html#${encodeURIComponent(fullMarker)}`, { waitUntil: 'networkidle' });
  await page.fill('#secret', passphrase);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  const resultVisible = await page.locator('#result:not([hidden])').isVisible().catch(() => false);
  const resultText = resultVisible ? await page.locator('#result-value').innerText() : await page.locator('#error').innerText();
  await shot(page, outDir, 'portal-unlock-roundtrip');
  step(report, {
    profile: 'personal',
    name: 'Unlock page — hash link + decrypt',
    status: resultText.includes(secret) ? 'pass' : 'fail',
    detail: resultText.includes(secret) ? 'Decrypted successfully' : `Got: ${resultText.slice(0, 60)}`,
    issues: collectIssues(monitor),
  });
}

async function walkOrgCreateAndAdmin(page, monitor, portalBase, apiBase, outDir, report) {
  if (!hasDatabase()) {
    step(report, { profile: 'org', name: 'Org create + admin', status: 'warn', detail: 'Skipped — no DATABASE_URL' });
    return null;
  }

  const apiQ = `billing=1&api=${encodeURIComponent(apiBase)}`;
  const orgName = `E2E Walk ${randomBytes(3).toString('hex')}`;
  const adminEmail = `e2e-admin-${randomBytes(2).toString('hex')}@scenario.veil`;

  monitor.reset();
  if (!(await waitForApiHealthy(apiBase))) {
    step(report, {
      profile: 'org',
      name: 'Create team (portal)',
      status: 'fail',
      detail: `API not healthy at ${apiBase}`,
      issues: collectIssues(monitor),
    });
    return null;
  }

  let adminToken = '';
  let joinCode = '';
  let createOk = false;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    monitor.reset();
    await page.goto(`${portalBase}/create.html?${apiQ}`, { waitUntil: 'networkidle' });
    if (attempt === 1) {
      await page.evaluate(() => {
        sessionStorage.removeItem('gstOrgAdminSession');
        sessionStorage.removeItem('veil_team_billing_ack');
      });
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.fill('#display-name', orgName);
    await page.fill('#admin-email', adminEmail);
    await page.fill('#team-passphrase', TEAM_PASS);
    await page.click('#submit-btn');
    const success = await page.waitForSelector('#success-card:not(.hidden)', { timeout: 30000 }).catch(() => null);
    if (success) {
      adminToken = await page.locator('#out-admin-token').innerText();
      joinCode = await page.locator('#out-join-code').innerText();
      createOk = true;
      break;
    }
    if (attempt < 3) {
      await waitForApiHealthy(apiBase);
      await page.waitForTimeout(1000);
    }
  }

  if (!createOk) {
    const err = await page.locator('#status').innerText().catch(() => '');
    step(report, {
      profile: 'org',
      name: 'Create team (portal)',
      status: 'fail',
      detail: err || 'Create did not reach success screen',
      issues: collectIssues(monitor),
    });
    await shot(page, outDir, 'org-create-error');
    return null;
  }
  await shot(page, outDir, 'org-create-success');
  step(report, {
    profile: 'org',
    name: 'Create team (portal)',
    status: adminToken.startsWith('gst_') ? 'pass' : 'fail',
    detail: `Join code ${joinCode}`,
    issues: collectIssues(monitor),
  });

  monitor.reset();
  await page.goto(`${portalBase}/admin.html?${apiQ}`, { waitUntil: 'networkidle' });
  const dashboardVisible = await page.locator('#dashboard:not(.hidden)').isVisible().catch(() => false);
  if (!dashboardVisible) {
    await page.fill('#admin-token', adminToken);
    await page.click('#login-form button[type="submit"]');
  }
  await page.waitForSelector('#dashboard:not(.hidden)', { timeout: 20000 });
  await shot(page, outDir, 'org-admin-overview');

  const tabs = ['overview', 'settings', 'people', 'access', 'security'];
  for (const tab of tabs) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(600);
    await shot(page, outDir, `org-admin-${tab}`);
  }

  const memberEmail = `member-${randomBytes(2).toString('hex')}@scenario.veil`;
  await page.click('[data-tab="people"]');
  await page.fill('#member-email', memberEmail);
  await page.click('#add-member-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await shot(page, outDir, 'org-admin-member-added');

  const dashText = await page.locator('#dashboard').innerText();
  step(report, {
    profile: 'org',
    name: 'Admin portal — all tabs',
    status: /Team overview|People|Security/i.test(dashText) ? 'pass' : 'warn',
    detail: 'Signed in and navigated tabs',
    issues: collectIssues(monitor),
  });

  monitor.reset();
  await page.goto(`${portalBase}/join.html?${apiQ}`, { waitUntil: 'networkidle' });
  await page.fill('#join-code', joinCode);
  await page.fill('#join-email', memberEmail);
  await page.click('#submit-btn');
  await page.waitForTimeout(2000);
  const joinStatus = await page.locator('#status').innerText();
  await shot(page, outDir, 'org-join-attempt');
  const joinOk = /connected|provision|install|extension|success|team passphrase/i.test(joinStatus);
  step(report, {
    profile: 'org',
    name: 'Join page — connect with code',
    status: joinOk ? 'pass' : 'warn',
    detail: joinStatus.slice(0, 120),
    issues: collectIssues(monitor),
  });

  const orgId = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('gstOrgAdminSession') || '{}').orgId || null;
    } catch {
      return null;
    }
  });

  return orgId;
}

async function walkExtensionPersonal(extContext, portalBase, outDir, report) {
  const page = await extContext.newPage();
  const monitor = new PageMonitor();
  monitor.attach(page);
  page.context()._baseUrl = portalBase;

  await extContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: portalBase });

  // Practice Quick + clickable link
  monitor.reset();
  await page.goto(`${portalBase}/practice.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
  await page.waitForTimeout(500);
  await page.waitForSelector('#goldspire-selection-status.gst-selection-status--visible', { timeout: 10000 });
  await page.locator('.gst-pill-half--quick').click();
  await page.waitForTimeout(1200);
  try {
    await assertPracticeRedactedLink(page, '#practice-body', PRACTICE_KEY, 'practice');
    await shot(page, outDir, 'ext-personal-practice-secured');
    step(report, {
      profile: 'personal',
      name: 'Extension — practice Quick secure',
      status: 'pass',
      detail: 'Clickable [redacted] link inserted',
      issues: collectIssues(monitor),
    });
  } catch (error) {
    await shot(page, outDir, 'ext-personal-practice-fail');
    step(report, { profile: 'personal', name: 'Extension — practice Quick secure', status: 'fail', detail: error.message });
  }

  // Click [redacted] → unlock UI
  monitor.reset();
  const link = page.locator('#practice-body a.gst-redacted, #practice-body a[href*="unlock"]');
  if (await link.count() > 0) {
    await link.first().click();
    await page.waitForTimeout(1000);
    const promptVisible = await page.locator('#goldspire-veil-prompt').isVisible().catch(() => false);
    await shot(page, outDir, 'ext-personal-unlock-prompt');
    step(report, {
      profile: 'personal',
      name: 'Extension — click [redacted] unlock',
      status: promptVisible ? 'pass' : 'warn',
      detail: promptVisible ? 'Unlock prompt opened' : 'No in-page unlock prompt after click',
      issues: collectIssues(monitor),
    });
  }

  // Options sheet
  monitor.reset();
  await page.goto(`${portalBase}/practice.html`, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  await selectPracticeKey(page, '#practice-body', PRACTICE_KEY);
  await page.waitForTimeout(500);
  await page.waitForSelector('#goldspire-selection-status.gst-selection-status--visible', { timeout: 10000 });
  await page.locator('.gst-pill-half--options').click();
  await page.waitForSelector('#goldspire-veil-prompt', { timeout: 8000 });
  await page.locator('[data-action="submit"]').click();
  await page.waitForTimeout(1200);
  try {
    await assertPracticeRedactedLink(page, '#practice-body', PRACTICE_KEY, 'options');
    await shot(page, outDir, 'ext-personal-options-secured');
    step(report, { profile: 'personal', name: 'Extension — practice Options secure', status: 'pass', detail: 'Sheet secure works' });
  } catch (error) {
    step(report, { profile: 'personal', name: 'Extension — practice Options secure', status: 'fail', detail: error.message });
  }

  // Copilot mask on demo compose
  monitor.reset();
  const demoUrl = `${portalBase}/demo/02-copilot-compose.html`;
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  await waitForExtensionReady(page);
  const textarea = page.locator('#compose-body');
  await textarea.click();
  await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, 'sk-live-abcdefghijklmnopqrstuvwxyz');
  await page.keyboard.press('Control+V');
  try {
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 8000 });
  } catch {
    await textarea.fill('sk-live-abcdefghijklmnopqrstuvwxyz');
    await page.waitForSelector('#goldspire-veil-copilot', { timeout: 12000 });
  }
  await page.locator('#goldspire-veil-copilot [data-action-id="mask"]').first().click();
  await page.waitForTimeout(800);
  const body = await page.inputValue('#compose-body');
  await shot(page, outDir, 'ext-personal-copilot-mask');
  step(report, {
    profile: 'personal',
    name: 'Extension — copilot Mask on paste',
    status: body.includes('sk-live-abcdefghijklmnopqrstuvwxyz') ? 'fail' : 'pass',
    detail: body.includes('sk-live') ? 'Key still visible' : 'Masked',
    issues: collectIssues(monitor),
  });

  await page.close();
}

async function walkExtensionPopup(extContext, outDir, report, profile, settings) {
  const worker = await waitForServiceWorker(extContext);
  await worker.evaluate(async (s) => { await chrome.storage.sync.set(s); }, settings);
  const extensionId = new URL(worker.url()).host;
  const page = await extContext.newPage();
  const monitor = new PageMonitor();
  monitor.attach(page);
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const main = document.getElementById('view-main');
    const setup = document.getElementById('view-setup');
    return (main && !main.hidden) || (setup && !setup.hidden);
  }, { timeout: 20000 });
  await shot(page, outDir, `ext-popup-${profile}`);
  const issues = collectIssues(monitor);
  const onMain = await page.evaluate(() => {
    const main = document.getElementById('view-main');
    return Boolean(main && !main.hidden);
  });
  step(report, {
    profile,
    name: `Extension popup — ${profile}`,
    status: issues.some((i) => /global is not defined/i.test(i)) ? 'fail' : onMain ? 'pass' : 'warn',
    detail: onMain ? 'Main settings view' : 'Setup view shown',
    issues,
  });
  await page.close();
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
      tourComplete: true,
    });
  });
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join(repoRoot, 'extension', 'store', 'e2e-walk', stamp);
  mkdirSync(outDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    outDir,
    summary: { passed: 0, warnings: 0, failed: 0 },
    steps: [],
  };

  console.log(`\n=== Veil product E2E walk ===\nOutput: ${outDir}\n`);

  const { server: portalServer, baseUrl: portalBase } = await startPortalServer(repoRoot, { demoDir });
  let apiHandle = null;
  let orgIdToCleanup = null;

  try {
    apiHandle = await startApiServer({
      ...process.env,
      VEIL_EARLY_ACCESS: 'true',
      VEIL_ORG_CHECK_MX: 'false',
    }, portalBase);
    console.log(`API: ${apiHandle.baseUrl}\n`);

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const monitor = new PageMonitor();
    monitor.attach(page);

    await walkPortalRoutes(page, monitor, portalBase, outDir, report);
    await walkPortalEdgeCases(page, monitor, portalBase, outDir, report);
    await walkUnlockRoundtrip(page, monitor, portalBase, outDir, report);
    orgIdToCleanup = await walkOrgCreateAndAdmin(page, monitor, portalBase, apiHandle.baseUrl, outDir, report);

    await browser.close();

    // Extension walks (separate profile)
    const userDataDir = mkdtempSync(join(tmpdir(), 'veil-e2e-'));
    const extContext = await launchExtensionContext(extensionDir, userDataDir);
    try {
      await seedPersonalSettings(extContext);
      await walkExtensionPersonal(extContext, portalBase, outDir, report);
      await walkExtensionPopup(extContext, outDir, report, 'personal', {
        setupComplete: true,
        securityProfile: 'personal',
        copilotEnabled: true,
        tourComplete: true,
      });
      await walkExtensionPopup(extContext, outDir, report, 'organization', {
        setupComplete: true,
        securityProfile: 'organization',
        orgId: 'e2e-demo-org',
        orgDisplayName: 'E2E Demo Team',
        copilotEnabled: true,
        dlpMode: 'observe',
        tourComplete: true,
      });
    } finally {
      await extContext.close();
    }

    // API scenario gate
    console.log('\n--- API scenario tests ---');
    const { spawn } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', 'test:scenarios'], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          VEIL_EARLY_ACCESS: 'true',
          VEIL_ORG_CHECK_MX: 'false',
        },
      });
      child.on('close', (code) => {
        if (code === 0) {
          step(report, { profile: 'org', name: 'API scenario tests', status: 'pass', detail: 'All scenario tests passed' });
          resolve();
        } else {
          step(report, { profile: 'org', name: 'API scenario tests', status: 'fail', detail: `exited ${code}` });
          reject(new Error('Scenario tests failed'));
        }
      });
    });
  } finally {
    portalServer.close();
    if (apiHandle) await apiHandle.stop();
    if (orgIdToCleanup) {
      try { await cleanupScenarioOrg(orgIdToCleanup); } catch { /* pool closed */ }
    }
  }

  writeReport(outDir, report);
  console.log(`\nReport → ${join(outDir, 'REPORT.md')}`);
  console.log(`Passed: ${report.summary.passed} · Warnings: ${report.summary.warnings} · Failed: ${report.summary.failed}`);

  if (report.summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('\nE2E walk crashed:', error.message || error);
  process.exit(1);
});
