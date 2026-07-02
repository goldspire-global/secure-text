const api = typeof browser !== 'undefined' ? browser : chrome;
const global = globalThis;

const builtInUnlockUrl = GoldspireConstants.BUILT_IN_PUBLIC_UNLOCK_URL;
const extensionVersion = api.runtime.getManifest().version;

const PROFILE_DEFAULTS = {
  personal: {
    securityProfile: 'personal',
    passphraseFromVault: false,
    useSavedPassphrase: true,
    enforceStrongPassphrase: true,
    resecureDelaySeconds: 60,
    defaultSecureMode: 'one-time',
    copilotEnabled: true,
    productAnalytics: false,
    selectionUiMode: 'smart',
  },
  organization: {
    securityProfile: 'organization',
    passphraseFromVault: false,
    useSavedPassphrase: true,
    enforceStrongPassphrase: true,
    resecureDelaySeconds: 45,
    defaultSecureMode: 'team',
    copilotEnabled: true,
    productAnalytics: true,
    selectionUiMode: 'smart',
  },
};

const defaults = {
  useSavedPassphrase: true,
  showFloatingButton: true,
  showSelectionPill: true,
  selectionUiMode: 'smart',
  autoDetectRedacted: true,
  defaultSecureMode: 'team',
  copyOneTimeCodeAutomatically: true,
  clipboardClearSeconds: 30,
  passwordLength: 16,
  passwordLowercase: true,
  passwordUppercase: true,
  passwordDigits: true,
  passwordSymbols: true,
  securityProfile: 'personal',
  resecureAfterUnlock: true,
  resecureDelaySeconds: 60,
  publicUnlockUrl: '',
  passphraseFromVault: false,
  enforceStrongPassphrase: true,
  setupComplete: false,
  firstSecurePractice: false,
  orgId: '',
  orgDisplayName: '',
  orgProvisionSource: '',
  orgPolicyVersion: 0,
  orgMemberEmail: '',
  copilotEnabled: true,
  dlpMode: 'off',
};

const SETTINGS_KEYS = [
  'securityProfile',
  'publicUnlockUrl',
  'defaultSecureMode',
  'useSavedPassphrase',
  'autoDetectRedacted',
  'resecureAfterUnlock',
  'resecureDelaySeconds',
  'passphraseFromVault',
  'showFloatingButton',
  'showSelectionPill',
  'selectionUiMode',
  'copyOneTimeCodeAutomatically',
  'clipboardClearSeconds',
  'passwordLength',
  'passwordLowercase',
  'passwordUppercase',
  'passwordDigits',
  'passwordSymbols',
  'enforceStrongPassphrase',
  'setupComplete',
  'firstSecurePractice',
  'tourComplete',
  'orgId',
  'orgDisplayName',
  'orgProvisionSource',
  'orgPolicyVersion',
  'orgMemberEmail',
  'copilotEnabled',
  'dlpMode',
  'learningTelemetry',
];

// ── DOM refs ────────────────────────────────────────────────────────────────
const viewSetup = document.getElementById('view-setup');
const viewMain = document.getElementById('view-main');
const form = document.getElementById('settings-form');
const status = document.getElementById('status');
const generatedPassword = document.getElementById('generated-password');
const passphraseInput = document.getElementById('passphrase');
const useSavedPassphraseInput = document.getElementById('useSavedPassphrase');
const passphraseFromVaultInput = document.getElementById('passphraseFromVault');
const passphraseStrength = document.getElementById('passphrase-strength');
const resecureDelayInput = document.getElementById('resecureDelaySeconds');
const profileChip = document.getElementById('profile-chip');

const passwordLengthInput = document.getElementById('passwordLength');
const passwordLowercaseInput = document.getElementById('passwordLowercase');
const passwordUppercaseInput = document.getElementById('passwordUppercase');
const passwordDigitsInput = document.getElementById('passwordDigits');
const passwordSymbolsInput = document.getElementById('passwordSymbols');

let passphraseDirty = false;
let orgPassphraseDirty = false;
let hasStoredPassphrase = false;
let hasStoredOrgPassphrase = false;
let managedState = {
  active: false,
  keys: [],
  hasTeamPassphrase: false,
  orgDisplayName: '',
  skipOnboarding: false,
  profileLocked: false,
};
let currentProfile = 'personal';

function migrateSettings(settings) {
  return GoldspireSettingsMigrate?.migrateSettings?.(settings) || settings;
}

function orgMessage(type, payload = {}) {
  return new Promise((resolve) => {
    api.runtime.sendMessage({ type, ...payload }, (response) => {
      const err = api.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: friendlyRuntimeError(err.message) });
        return;
      }
      resolve(response || { ok: false, error: 'No response from the extension background.' });
    });
  });
}

function friendlyRuntimeError(message) {
  const msg = String(message || '');
  if (/application not found|receiving end does not exist|could not establish connection/i.test(msg)) {
    return 'Veil could not reach its background service. Close and reopen the popup, or reload the extension from edge://extensions.';
  }
  return msg || 'Extension message failed.';
}

function isOrgProvisioned(settings = {}) {
  return Boolean(
    settings.orgProvisionSource === 'managed'
    || settings.orgProvisionSource === 'cloud'
    || managedState.hasTeamPassphrase
    || managedState.skipOnboarding,
  );
}

async function refreshManagedPolicy() {
  try {
    if (typeof GoldspireManagedPolicy !== 'undefined') {
      managedState = await GoldspireManagedPolicy.applyManagedPolicy();
    } else {
      managedState = await new Promise((resolve) => {
        api.runtime.sendMessage({ type: 'APPLY_MANAGED_POLICY' }, (response) => {
          resolve(response || { active: false, keys: [] });
        });
      });
    }
  } catch {
    managedState = { active: false, keys: [], hasTeamPassphrase: false, orgDisplayName: '', skipOnboarding: false };
  }
  applyManagedChrome({});
}

function applyManagedChrome(settings = {}) {
  const banner = document.getElementById('managed-banner');
  if (banner) {
    if (!managedState.active) {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      const orgName = managedState.orgDisplayName?.trim() || settings.orgDisplayName?.trim();
      banner.textContent = orgName
        ? `Managed by ${orgName}`
        : 'Managed by your organization';
    }
  }

  const policyLocksPassphrase =
    managedState.hasTeamPassphrase || managedState.keys?.includes('teamPassphrase');
  const orgInput = document.getElementById('org-passphrase');
  const vaultCheckbox = passphraseFromVaultInput;

  if (policyLocksPassphrase) {
    orgInput?.setAttribute('readonly', 'readonly');
    vaultCheckbox?.setAttribute('disabled', 'disabled');
  } else if (!isOrgProvisioned(settings)) {
    orgInput?.removeAttribute('readonly');
    if (!managedState.keys?.includes('passphraseFromVault')
      && !managedState.keys?.includes('passphraseIn1Password')) {
      vaultCheckbox?.removeAttribute('disabled');
    }
  }

  if (managedState.keys?.includes('passphraseFromVault')
    || managedState.keys?.includes('passphraseIn1Password')) {
    vaultCheckbox?.setAttribute('disabled', 'disabled');
  }

  const resetBtn = document.getElementById('reset-setup');
  const lockProfile = managedState.active || isOrgProvisioned(settings);
  if (lockProfile) resetBtn?.setAttribute('disabled', 'disabled');
  else resetBtn?.removeAttribute('disabled');
}

function applyProvisionChrome(settings) {
  const provisioned = isOrgProvisioned(settings);
  const manual = document.getElementById('org-manual-settings');
  const connected = document.getElementById('org-connected-card');
  const disconnect = document.getElementById('disconnect-org');
  const resetBtn = document.getElementById('reset-setup');
  const modeEl = document.getElementById('defaultSecureMode');
  const orgEmailEl = document.getElementById('orgMemberEmail');
  const orgName = settings.orgDisplayName || managedState.orgDisplayName || 'Your team';
  const source = settings.orgProvisionSource === 'managed' || managedState.hasTeamPassphrase
    ? 'managed'
    : settings.orgProvisionSource;

  if (provisioned && source) {
    manual?.setAttribute('hidden', '');
    if (connected) connected.hidden = false;
    const nameEl = document.getElementById('org-connected-name');
    const sourceEl = document.getElementById('org-connected-source');
    if (nameEl) nameEl.textContent = orgName;
    if (sourceEl) sourceEl.hidden = true;
    // Leaving org is an IT/admin action in real deployments.
    if (disconnect) disconnect.hidden = true;
    if (resetBtn) resetBtn.hidden = true;
    if (modeEl) modeEl.setAttribute('disabled', 'disabled');
    const emailRow = document.getElementById('org-member-email-row');
    if (emailRow) emailRow.hidden = source !== 'cloud';
    if (orgEmailEl) orgEmailEl.setAttribute('readonly', 'readonly');
  } else {
    manual?.removeAttribute('hidden');
    if (connected) connected.hidden = true;
    if (disconnect) disconnect.hidden = true;
    if (resetBtn) resetBtn.hidden = false;
    if (modeEl) modeEl.removeAttribute('disabled');
    if (orgEmailEl) orgEmailEl.removeAttribute('readonly');
  }
}

// ── Storage helpers ─────────────────────────────────────────────────────────
function parseDelaySeconds(value, fallback = 60, max = 600) {
  const parsed = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(5, parsed));
}

function readSyncSettings() {
  return new Promise((resolve) => {
    api.storage.sync.get(SETTINGS_KEYS, (result) => {
      if (api.runtime.lastError) { resolve({ ...defaults }); return; }
      resolve(migrateSettings({ ...defaults, ...(result || {}) }));
    });
  });
}

function writeSyncSettings(patch) {
  return new Promise((resolve, reject) => {
    const migrated = migrateSettings(patch);
    api.storage.sync.set(migrated, () => {
      if (api.runtime.lastError) { reject(new Error(api.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

function showStatus(message) {
  status.hidden = false;
  status.textContent = message;
  window.setTimeout(() => { status.hidden = true; }, 2400);
}

function sendToActiveTab(action, payload = {}) {
  api.runtime.sendMessage({ type: 'SEND_TO_ACTIVE_TAB', action, payload });
}

// ── View switching ──────────────────────────────────────────────────────────
function animateSetupStep(stepEl) {
  if (!stepEl) return;
  stepEl.classList.remove('setup-step--enter');
  void stepEl.offsetWidth;
  stepEl.classList.add('setup-step--enter');
}

function showSetupStep(step) {
  const pick = document.getElementById('setup-step-pick');
  const personal = document.getElementById('setup-step-personal');
  const org = document.getElementById('setup-step-organization');
  const progress = document.getElementById('setup-progress');

  pick.hidden = step !== 'pick';
  personal.hidden = step !== 'personal';
  org.hidden = step !== 'organization';

  if (progress) {
    progress.hidden = step === 'pick';
    progress.setAttribute('aria-hidden', step === 'pick' ? 'true' : 'false');
    const dots = progress.querySelectorAll('.setup-progress__dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('setup-progress__dot--active', step !== 'pick' && index === 0);
    });
  }

  const active = step === 'pick' ? pick : step === 'personal' ? personal : org;
  animateSetupStep(active);
}

function showSetup() {
  viewSetup.hidden = false;
  viewMain.hidden = true;
  viewSetup.classList.remove('view--enter');
  void viewSetup.offsetWidth;
  viewSetup.classList.add('view--enter');
  showSetupStep('pick');
  refreshSetupReturningHints().catch(() => {});
}

function showPersonalSetupMode(mode) {
  const returning = document.getElementById('setup-personal-returning');
  const newBlock = document.getElementById('setup-personal-new');
  if (returning) returning.hidden = mode !== 'returning';
  if (newBlock) newBlock.hidden = mode !== 'new';
}

async function refreshSetupReturningHints() {
  const storedPersonal = await GoldspireSecrets.loadPassphrase('personal');
  const hasPersonal = Boolean(storedPersonal?.trim());
  const settings = await readSyncSettings();
  const hasTeam = isOrgConnected(settings);

  const personalBadge = document.getElementById('setup-personal-badge');
  const teamBadge = document.getElementById('setup-team-badge');
  const hint = document.getElementById('setup-returning-hint');

  if (personalBadge) personalBadge.hidden = !hasPersonal;
  if (teamBadge) teamBadge.hidden = !hasTeam;

  if (hint) {
    if (hasPersonal || hasTeam) {
      hint.hidden = false;
      hint.textContent = hasPersonal && hasTeam
        ? 'Welcome back — pick Personal or Team to continue. Your passphrase stays saved on this browser.'
        : hasPersonal
          ? 'Welcome back — Personal already has a passphrase saved here.'
          : 'Welcome back — your team connection is still active.';
    } else {
      hint.hidden = true;
    }
  }
}

function showMain(profile) {
  viewSetup.hidden = true;
  viewMain.hidden = false;
  viewMain.classList.remove('view--enter');
  void viewMain.offsetWidth;
  viewMain.classList.add('view--enter');
  applyProfileChrome(profile);
  refreshReadinessChecklist().catch(() => {});
  refreshContextualHelp().catch(() => {});
  refreshFirstSecureCard().catch(() => {});
  if (profile === 'personal') refreshPlusPanel().catch(() => {});
}

function isOrgConnected(settings) {
  return Boolean(settings.orgId && (
    settings.orgProvisionSource === 'cloud'
    || settings.orgProvisionSource === 'managed'
    || managedState.hasTeamPassphrase
    || managedState.skipOnboarding
  ));
}

function switchTab(tabName) {
  document.querySelectorAll('.tabs__btn').forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('tabs__btn--active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab').forEach((panel) => {
    panel.classList.toggle('tab--active', panel.id === `tab-${tabName}`);
  });
  if (tabName === 'settings') {
    loadSnoozedSites();
    loadSiteAllowRules();
    refreshPassphraseField().catch(() => {});
    refreshContextualHelp().catch(() => {});
    refreshPlusPanel().catch(() => {});
  }
  if (tabName === 'help') {
    refreshContextualHelp().catch(() => {});
    refreshSecurityProof().catch(() => {});
  }
  if (tabName === 'home') {
    refreshHomeShortcuts().catch(() => {});
  }
}

function escapePopupHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readSnoozedHosts() {
  return new Promise((resolve) => {
    api.storage.local.get({ gstSnoozedHosts: [] }, (result) => {
      if (api.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(result?.gstSnoozedHosts || []);
    });
  });
}

async function readActiveTabHost() {
  return new Promise((resolve) => {
    if (!api.tabs?.query) {
      resolve('');
      return;
    }
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (api.runtime.lastError) {
        resolve('');
        return;
      }
      try {
        resolve(new URL(tabs[0]?.url || '').hostname);
      } catch {
        resolve('');
      }
    });
  });
}

async function isPassphraseReady(settings) {
  const profile = settings.securityProfile || 'personal';
  const isOrg = profile === 'organization';
  if (isOrg) {
    return Boolean(
      settings.passphraseFromVault
      || managedState.hasTeamPassphrase
      || hasStoredOrgPassphrase
      || (await GoldspireSecrets.loadPassphrase?.('organization'))?.trim(),
    );
  }
  return Boolean(
    hasStoredPassphrase
    || (await GoldspireSecrets.loadPassphrase?.('personal'))?.trim(),
  );
}

async function refreshContextualHelp() {
  if (typeof GoldspireHelpContext === 'undefined') return;

  const settings = await readSyncSettings();
  const passphraseReady = await isPassphraseReady(settings);
  const snoozedHosts = await readSnoozedHosts();
  const activeHost = await readActiveTabHost();
  const ctx = GoldspireHelpContext.build(settings, {
    snoozedHosts,
    activeHost,
    passphraseReady,
    managedState,
  });

  const summaryEl = document.getElementById('help-context-summary');
  if (summaryEl) summaryEl.textContent = ctx.summary;

  const behaviorsEl = document.getElementById('help-context-behaviors');
  if (behaviorsEl) {
    behaviorsEl.innerHTML = ctx.behaviors.map((item) => `
      <li class="help-context__item">
        <strong>${escapePopupHtml(item.title)}</strong>
        <span>${escapePopupHtml(item.body)}</span>
      </li>`).join('');
  }

  const troubleshootEl = document.getElementById('help-troubleshoot-list');
  const troubleshootDetails = document.getElementById('help-troubleshoot-details');
  if (troubleshootEl) {
    if (!ctx.troubleshooting.length) {
      troubleshootDetails?.setAttribute('hidden', '');
      troubleshootEl.innerHTML = '';
    } else {
      troubleshootDetails?.removeAttribute('hidden');
      troubleshootEl.innerHTML = ctx.troubleshooting.map((item) => {
        const actionBtn = item.action
          ? `<button type="button" class="help-context__action btn btn--ghost btn--sm" data-help-action="${item.action}">Change setting</button>`
          : '';
        return `<li class="help-context__item help-context__item--trouble">
          <strong>${escapePopupHtml(item.question)}</strong>
          <span>${escapePopupHtml(item.answer)}</span>
          ${actionBtn}
        </li>`;
      }).join('');

      troubleshootEl.querySelectorAll('[data-help-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.helpAction;
          if (action === 'settings-copilot') switchTab('settings');
          if (action === 'settings-hints') {
            switchTab('settings');
            document.querySelector('.settings-advanced')?.setAttribute('open', '');
            document.getElementById('selectionUiMode')?.focus();
          }
          if (action === 'settings-passphrase') switchTab('settings');
          if (action === 'settings-snooze') switchTab('settings');
        });
      });
    }
  }

  const refreshHint = document.getElementById('help-context-refresh-hint');
  if (refreshHint) refreshHint.textContent = ctx.refreshHint || '';

  const copilotHint = document.getElementById('copilot-settings-hint');
  const hintsHint = document.getElementById('hints-settings-hint');
  if (copilotHint) copilotHint.textContent = ctx.settingsHints.copilot;
  if (hintsHint) hintsHint.textContent = ctx.settingsHints.hints;
}

function isMailComposeHost(host = '') {
  return /mail\.google|googlemail|outlook\.(live|office)|office365|hotmail/i.test(host);
}

function portalBaseUrl() {
  return GoldspireConstants.PORTAL_ORIGIN
    ? `${GoldspireConstants.PORTAL_ORIGIN.replace(/\/$/, '')}/`
    : '';
}

async function openPracticePage({ startTour = true } = {}) {
  const base = portalBaseUrl();
  if (!base) {
    showStatus('Practice page URL not configured.');
    return;
  }
  const url = `${base}practice?tour=1`;
  const tab = await new Promise((resolve) => {
    api.tabs.create({ url, active: true }, (created) => {
      void api.runtime?.lastError;
      resolve(created);
    });
  });
  await writeSyncSettings({ firstSecurePractice: true, practiceTourPending: false });
  refreshFirstSecureCard().catch(() => {});

  if (startTour && tab?.id) {
    const tabId = tab.id;
    const tryStart = (attempts = 0) => {
      api.tabs.sendMessage(tabId, { type: 'START_PAGE_TOUR', force: true }, () => {
        if (api.runtime?.lastError && attempts < 10) {
          window.setTimeout(() => tryStart(attempts + 1), 450);
        }
      });
    };
    window.setTimeout(() => tryStart(), 700);
  }
  window.close();
}

async function refreshFirstSecureCard() {
  const card = document.getElementById('first-secure-card');
  if (!card) return;
  const settings = await readSyncSettings();
  if (!settings.setupComplete || settings.firstSecurePractice) {
    card.hidden = true;
    return;
  }
  let hasActivity = false;
  if (global.GoldspireWeeklyDigest) {
    const stats = await GoldspireWeeklyDigest.buildHeroStats();
    hasActivity = Boolean(stats?.total);
  }
  card.hidden = hasActivity;
}

async function refreshSecurityProof() {
  const detail = document.getElementById('security-proof-detail');
  const badge = document.getElementById('security-proof-badge');
  const attestationEl = document.getElementById('security-proof-attestation');
  if (!detail) return;
  const settings = await readSyncSettings();
  const parts = [
    `Veil v${extensionVersion} · AES-GCM + PBKDF2 in your browser.`,
    'Secure and Tokenize never upload plaintext.',
  ];
  if (settings.securityProfile === 'organization' && settings.orgDisplayName) {
    parts.push(`Team: ${settings.orgDisplayName}.`);
    if (settings.orgPolicyVersion) {
      parts.push(`Policy pack v${settings.orgPolicyVersion}.`);
    }
    if (badge) badge.textContent = 'Team · zero-knowledge';
  } else if (badge) {
    badge.textContent = 'Zero-knowledge';
  }
  detail.textContent = parts.join(' ');

  if (attestationEl && global.GoldspireAttestation) {
    const att = await global.GoldspireAttestation.load();
    const line = global.GoldspireAttestation.summaryLine(att);
    if (line) {
      attestationEl.textContent = line;
      attestationEl.hidden = false;
    } else {
      attestationEl.textContent = '';
      attestationEl.hidden = true;
    }
  }
}

async function refreshHomeShortcuts() {
  const selectionTip = document.getElementById('selection-tip-shortcuts');
  const shortcutHint = document.getElementById('shortcut-hint');
  const digestLine = document.getElementById('weekly-digest-line');
  const hero = document.getElementById('protection-hero');
  const heroTotal = document.getElementById('protection-hero-total');
  const heroGrid = document.getElementById('protection-hero-grid');
  const statusBar = document.getElementById('protection-status');
  if (!selectionTip && !shortcutHint && !digestLine && !hero) return;

  const activeHost = await readActiveTabHost();
  const mailCompose = isMailComposeHost(activeHost);

  if (statusBar) {
    statusBar.hidden = !activeHost;
  }

  if (selectionTip && GoldspireCopy?.homeShortcutsLine) {
    selectionTip.textContent = GoldspireCopy.homeShortcutsLine({ mailCompose });
  }
  if (shortcutHint && GoldspireCopy?.helpShortcutsLine) {
    shortcutHint.textContent = GoldspireCopy.helpShortcutsLine();
  }
  if (global.GoldspireWeeklyDigest) {
    const stats = await GoldspireWeeklyDigest.buildHeroStats();
    if (hero && heroTotal && heroGrid && stats?.total) {
      hero.hidden = false;
      heroTotal.textContent = String(stats.total);
      const tiles = [];
      if (stats.secured) tiles.push(['Secured', stats.secured]);
      if (stats.masked) tiles.push(['Masked', stats.masked]);
      if (stats.tokenized) tiles.push(['Tokenized', stats.tokenized]);
      if (stats.copilot) tiles.push(['Copilot', stats.copilot]);
      if (stats.aiSanitized) tiles.push(['AI safe', stats.aiSanitized]);
      heroGrid.innerHTML = tiles.map(([label, n]) => `
        <div class="protection-hero__stat"><span>${n}</span><small>${label}</small></div>
      `).join('');
      if (digestLine) digestLine.hidden = true;
    } else if (hero) {
      hero.hidden = true;
      if (digestLine) {
        const line = await GoldspireWeeklyDigest.buildSummaryLine();
        digestLine.hidden = !line;
        if (line) digestLine.textContent = line;
      }
    }
  }
  await refreshFirstSecureCard();
}

async function refreshPassphraseField() {
  const settings = await readSyncSettings();
  const profile = settings.securityProfile || 'personal';
  if (profile !== 'personal' || !passphraseInput) return;
  const stored = await GoldspireSecrets.loadPassphrase('personal');
  hasStoredPassphrase = Boolean(stored?.trim());
  if (!passphraseDirty) {
    passphraseInput.value = stored || '';
    passphraseInput.placeholder = hasStoredPassphrase
      ? 'Saved — leave blank to keep, or type to replace'
      : 'Choose a strong passphrase (16+ chars)';
  }
  refreshPassphraseStrength();
}

async function refreshReadinessChecklist() {
  const card = document.getElementById('readiness-card');
  const list = document.getElementById('readiness-list');
  const hint = document.getElementById('readiness-hint');
  const enableBtn = document.getElementById('readiness-enable-copilot');
  if (!card || !list) return;

  const settings = await readSyncSettings();
  const profile = settings.securityProfile || 'personal';
  const isOrg = profile === 'organization';

  const required = [];
  const recommended = [];

  if (isOrg) {
    const connected = isOrgConnected(settings);
    required.push({
      ok: connected,
      label: connected ? `Connected to ${settings.orgDisplayName || 'your team'}` : 'Join your team',
      action: connected ? null : 'setup-org',
    });
  } else {
    required.push({
      ok: Boolean(settings.setupComplete),
      label: 'Personal setup complete',
      action: null,
    });
  }

  let passphraseReady = false;
  if (isOrg) {
    passphraseReady = settings.passphraseFromVault
      || managedState.hasTeamPassphrase
      || hasStoredOrgPassphrase
      || Boolean((await GoldspireSecrets.loadPassphrase?.('organization'))?.trim());
  } else {
    passphraseReady = hasStoredPassphrase || Boolean((await GoldspireSecrets.loadPassphrase?.('personal'))?.trim());
  }
  required.push({
    ok: passphraseReady,
    label: isOrg ? 'Team passphrase saved' : 'Passphrase saved',
    action: passphraseReady ? null : 'settings-passphrase',
  });

  const copilotOn = settings.copilotEnabled === true;
  recommended.push({
    ok: copilotOn,
    label: 'Veil copilot (paste & highlight guard)',
    action: copilotOn ? null : 'enable-copilot',
  });

  const renderItem = (item, extraClass = '') => {
    const icon = item.ok ? '✓' : '○';
    if (!item.ok && item.action) {
      return `
        <li>
          <button type="button" class="readiness__item readiness__item--action${extraClass}" data-readiness-action="${item.action}">
            <span class="readiness__icon" aria-hidden="true">${icon}</span>
            <span>${item.label}</span>
          </button>
        </li>`;
    }
    return `
      <li class="readiness__item${item.ok ? ' readiness__item--ok' : ''}${extraClass}">
        <span class="readiness__icon" aria-hidden="true">${icon}</span>
        <span>${item.label}</span>
      </li>`;
  };

  list.innerHTML = [
    ...required.map((item) => renderItem(item)),
    ...recommended.map((item) => renderItem(item, ' readiness__item--recommended')),
  ].join('');

  list.querySelectorAll('[data-readiness-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.readinessAction;
      if (action === 'settings-passphrase') switchTab('settings');
      if (action === 'setup-org') {
        showSetup();
        showSetupStep('organization');
      }
      if (action === 'enable-copilot') enableBtn?.click();
    });
  });

  const requiredOk = required.every((item) => item.ok);
  card.hidden = requiredOk && recommended.every((item) => item.ok);

  if (hint) {
    if (requiredOk && !recommended.every((item) => item.ok)) {
      hint.textContent = 'Recommended: turn on copilot so Veil catches secrets on paste.';
    } else if (!requiredOk) {
      hint.textContent = `Tap an item above to finish setup. ${GoldspireCopy?.refreshTabHint?.(settings) || 'Refresh the page after saving your passphrase.'}`;
    } else {
      hint.textContent = '';
    }
  }

  if (enableBtn) {
    enableBtn.hidden = copilotOn;
    enableBtn.onclick = async () => {
      const copilotEl = document.getElementById('copilotEnabled');
      if (copilotEl) copilotEl.checked = true;
      await writeSyncSettings({ ...await readSyncSettings(), copilotEnabled: true, copilotUserSet: true });
      showStatus(`Copilot enabled — ${GoldspireCopy?.refreshTabHint?.(await readSyncSettings()) || 'refresh the page.'}`);
      await refreshReadinessChecklist();
    };
  }
}

function refreshSecureModeOptions(profile) {
  const modeEl = document.getElementById('defaultSecureMode');
  if (!modeEl) return;
  const isOrg = profile === 'organization';
  const value = modeEl.value === 'one-time' ? 'one-time' : 'team';
  modeEl.innerHTML = isOrg
    ? '<option value="team">Team passphrase</option><option value="one-time">One-time code</option>'
    : '<option value="team">My passphrase</option><option value="one-time">One-time code</option>';
  modeEl.value = value;
}

function applyProfileChrome(profile) {
  currentProfile = profile;
  const isOrg = profile === 'organization';
  profileChip.textContent = isOrg ? 'Team' : 'Personal';
  profileChip.className = `profile-chip profile-chip--${profile}`;

  document.getElementById('settings-personal').hidden = isOrg;
  document.getElementById('settings-organization').hidden = !isOrg;
  document.getElementById('advanced-org-only').hidden = !isOrg;
  document.getElementById('help-personal').hidden = isOrg;
  document.getElementById('help-organization').hidden = !isOrg;
  refreshSecureModeOptions(profile);
  const portalLink = document.getElementById('help-portal-link');
  const installLink = document.getElementById('help-install-link');
  if (portalLink) portalLink.hidden = !isOrg;
  if (installLink) installLink.hidden = isOrg;
  document.querySelectorAll('.profile-org-only').forEach((el) => {
    el.hidden = !isOrg;
  });

  if (resecureDelayInput) {
    // Security posture: org members shouldn't be able to keep secrets unlocked for ages.
    resecureDelayInput.max = String(isOrg ? 120 : 600);
  }
}

function refreshOrgPassphraseStatus(fromVault, settings = {}) {
  const statusEl = document.getElementById('org-passphrase-status');
  const fieldEl = document.getElementById('org-passphrase-field');
  const vaultRow = document.getElementById('passphrase-from-vault-row');
  if (isOrgProvisioned(settings)) {
    if (statusEl) statusEl.textContent = 'Set by your team';
    if (fieldEl) fieldEl.hidden = true;
    if (vaultRow) vaultRow.hidden = true;
    return;
  }
  if (statusEl) {
    statusEl.textContent = fromVault ? 'From password manager' : 'Saved on this browser';
  }
  if (fieldEl) fieldEl.hidden = fromVault;
  if (vaultRow) vaultRow.hidden = false;
}

function getResecureChecked() {
  if (currentProfile === 'organization') {
    return document.getElementById('resecureAfterUnlock-org')?.checked !== false;
  }
  return document.getElementById('resecureAfterUnlock')?.checked !== false;
}

// ── Setup flow ──────────────────────────────────────────────────────────────
document.querySelectorAll('.profile-card').forEach((card) => {
  card.addEventListener('click', async () => {
    if (card.dataset.profile === 'personal') {
      const stored = await GoldspireSecrets.loadPassphrase('personal');
      showSetupStep('personal');
      showPersonalSetupMode(stored?.trim() ? 'returning' : 'new');
      return;
    }
    if (card.dataset.profile === 'organization') {
      const settings = await readSyncSettings();
      if (settings.orgId && settings.orgProvisionSource === 'cloud') {
        showPendingOrgSetup(settings);
        return;
      }
      resetOrgSetupStep();
    }
    showSetupStep(card.dataset.profile);
  });
});

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => {
    resetOrgSetupStep();
    showSetupStep('pick');
  });
});

document.getElementById('setup-personal-passphrase')?.addEventListener('input', () => {
  const el = document.getElementById('setup-personal-strength');
  const val = document.getElementById('setup-personal-passphrase').value;
  if (!el || !GoldspirePassphrasePolicy) return;
  if (!val) { el.textContent = ''; return; }
  const a = GoldspirePassphrasePolicy.assessPassphrase(val, 'personal');
  el.textContent = a.ok ? `Strength: ${a.label}` : a.message;
  el.classList.toggle('hint--warn', !a.ok);
});

async function finishSetup(profile, extraSettings = {}, passphrase = '') {
  const profileDefaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS.personal;
  // Preserve any org provisioning fields already written by ORG_JOIN / managed policy.
  const current = await readSyncSettings();
  const patch = migrateSettings({
    ...current,
    ...profileDefaults,
    ...extraSettings,
    setupComplete: true,
    tourComplete: false,
    securityProfile: profile,
    ...(profile === 'personal' || profile === 'organization' ? { practiceTourPending: true } : {}),
  });

  await writeSyncSettings(patch);

  if (profile === 'personal' && passphrase) {
    await GoldspireSecrets.savePassphrase(passphrase, 'personal');
    hasStoredPassphrase = true;
  }

  global.GoldspireVeilEvents?.emit?.({
    type: 'lifecycle',
    category: 'setup_complete',
    source: profile,
    action: 'setup',
    outcome: 'ok',
  }).catch?.(() => {});

  showMain(profile);
  await loadSettings();
  const secureShortcut = GoldspireCopy?.shortcut?.('secure') || 'Ctrl+Shift+S';
  showStatus(`Setup complete — highlight text and press ${secureShortcut}.`);
  GoldspirePopupTour?.start?.(profile, { switchTab, api, force: true });
}

function generatePersonalPassphrase() {
  return generateLocalPassword({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
  });
}

function fillSetupPassphrase(value) {
  const input = document.getElementById('setup-personal-passphrase');
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function completePersonalSetup(passphrase, { oneClick = true, triggerEl = null } = {}) {
  const a = GoldspirePassphrasePolicy?.assessPassphrase?.(passphrase, 'personal');
  if (a && !a.ok) {
    showStatus(a.message);
    return false;
  }

  const prevLabel = triggerEl?.textContent;
  if (triggerEl) {
    triggerEl.disabled = true;
    triggerEl.textContent = 'Saving…';
  }

  try {
    await finishSetup('personal', { useSavedPassphrase: oneClick }, passphrase);
    return true;
  } catch (e) {
    showStatus(e?.message || 'Setup failed.');
    return false;
  } finally {
    if (triggerEl && prevLabel) {
      triggerEl.disabled = false;
      triggerEl.textContent = prevLabel;
    }
  }
}

document.getElementById('open-practice-page')?.addEventListener('click', () => {
  openPracticePage({ startTour: true }).catch(() => showStatus('Could not open practice page.'));
});

document.getElementById('setup-quick-personal')?.addEventListener('click', async () => {
  const btn = document.getElementById('setup-quick-personal');
  const oneClick = document.getElementById('setup-personal-oneclick')?.checked !== false;
  const passphrase = generatePersonalPassphrase();
  fillSetupPassphrase(passphrase);
  await completePersonalSetup(passphrase, { oneClick, triggerEl: btn });
});

document.getElementById('setup-generate-passphrase')?.addEventListener('click', () => {
  fillSetupPassphrase(generatePersonalPassphrase());
  document.getElementById('setup-personal-passphrase')?.focus();
});

document.getElementById('passphrase-generate')?.addEventListener('click', () => {
  if (!passphraseInput) return;
  passphraseInput.value = generatePersonalPassphrase();
  passphraseDirty = true;
  refreshPassphraseStrength();
  passphraseInput.focus();
});

document.getElementById('setup-finish-personal')?.addEventListener('click', async () => {
  const passphrase = document.getElementById('setup-personal-passphrase').value.trim();
  const oneClick = document.getElementById('setup-personal-oneclick').checked;
  const finishBtn = document.getElementById('setup-finish-personal');

  if (!passphrase) {
    showStatus('Enter a passphrase, or use Quick setup.');
    document.getElementById('setup-personal-passphrase')?.focus();
    return;
  }

  await completePersonalSetup(passphrase, { oneClick, triggerEl: finishBtn });
});

document.getElementById('setup-continue-personal')?.addEventListener('click', async () => {
  const stored = await GoldspireSecrets.loadPassphrase('personal');
  if (!stored?.trim()) {
    showPersonalSetupMode('new');
    showStatus('No saved passphrase — set one to continue.');
    document.getElementById('setup-personal-passphrase')?.focus();
    return;
  }

  const oneClick = document.getElementById('setup-personal-returning-oneclick')?.checked !== false;
  const continueBtn = document.getElementById('setup-continue-personal');
  const prevLabel = continueBtn?.textContent;

  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Continuing…';
  }

  try {
    await finishSetup('personal', { useSavedPassphrase: oneClick });
  } catch (e) {
    showStatus(e?.message || 'Setup failed.');
  } finally {
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent = prevLabel || 'Continue';
    }
  }
});

document.getElementById('setup-personal-new-passphrase')?.addEventListener('click', () => {
  showPersonalSetupMode('new');
  document.getElementById('setup-personal-passphrase')?.focus();
});

document.getElementById('setup-org-connect')?.addEventListener('click', async () => {
  const joinCode = document.getElementById('setup-org-join-code')?.value.trim() || '';
  const email = document.getElementById('setup-org-email')?.value.trim().toLowerCase() || '';
  const connectBtn = document.getElementById('setup-org-connect');
  if (!email) {
    showStatus('Enter your work email for secure sharing.');
    return;
  }
  if (!joinCode && !document.getElementById('setup-org-join-code')?.hidden) {
    showStatus('Enter your join code.');
    return;
  }

  const prevLabel = connectBtn?.textContent;
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting…';
  }

  try {
    await completeOrgMembership({ joinCode, email });
  } catch (error) {
    showStatus(error?.message || 'Could not join your team.');
  } finally {
    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.textContent = prevLabel || 'Connect';
    }
  }
});

async function completeOrgMembership({ joinCode, email }) {
  const settings = await readSyncSettings();
  const needsJoin = Boolean(joinCode) && !settings.orgId;

  if (needsJoin) {
    try {
      if (typeof GoldspireOrgProvision?.joinWithCode === 'function') {
        await GoldspireOrgProvision.joinWithCode(joinCode, email);
      } else {
        const result = await orgMessage('ORG_JOIN', { joinCode, email });
        if (!result?.ok) {
          throw new Error(result?.error || 'Could not join your team.');
        }
      }
    } catch (error) {
      throw new Error(error?.message || 'Could not join your team.');
    }
  } else if (!settings.orgId) {
    throw new Error('Enter your join code.');
  }

  const registered = typeof GoldspireOrgShare?.registerMember === 'function'
    ? await GoldspireOrgShare.registerMember(email).catch((error) => ({ error: error?.message }))
    : await orgMessage('ORG_REGISTER_MEMBER', { email });
  if (registered?.error) {
    if (typeof GoldspireOrgProvision?.disconnectOrg === 'function') {
      await GoldspireOrgProvision.disconnectOrg();
    } else {
      await orgMessage('ORG_DISCONNECT');
    }
    throw new Error(registered.error);
  }

  const joined = await readSyncSettings();
  await finishSetup('organization', { orgMemberEmail: email, copilotEnabled: true, copilotUserSet: false });
  showStatus(`Connected to ${joined.orgDisplayName || 'your team'}. ${GoldspireCopy?.refreshTabHint?.({ securityProfile: 'organization' }) || 'Refresh your mail tab.'}`);
}

function showPendingOrgSetup(settings = {}) {
  showSetup();
  showSetupStep('organization');
  document.getElementById('setup-org-join-code').closest('.field').hidden = true;
  document.getElementById('setup-org-connect').textContent = 'Complete setup';
  const emailEl = document.getElementById('setup-org-email');
  if (emailEl && settings.orgMemberEmail) emailEl.value = settings.orgMemberEmail;
  const title = document.querySelector('#setup-step-organization .setup-step__title');
  if (title) title.textContent = 'Welcome back';
  const blurb = document.querySelector('#setup-step-organization .card__text');
  if (blurb) {
    blurb.textContent = settings.orgDisplayName
      ? `Still connected to ${settings.orgDisplayName}. Confirm your work email to continue.`
      : 'Still connected to your team. Confirm your work email to continue.';
  }
}

function resetOrgSetupStep() {
  const joinField = document.getElementById('setup-org-join-code')?.closest('.field');
  if (joinField) joinField.hidden = false;
  const connectBtn = document.getElementById('setup-org-connect');
  if (connectBtn) connectBtn.textContent = 'Connect';
  const title = document.querySelector('#setup-step-organization .setup-step__title');
  if (title) title.textContent = 'Join your team';
  const blurb = document.querySelector('#setup-step-organization .card__text');
  if (blurb) {
    blurb.textContent = 'Enter the join code from your admin and the work email they registered for you.';
  }
}

document.getElementById('setup-org-signin')?.addEventListener('click', async () => {
  const result = await orgMessage('ORG_SIGN_IN');
  if (result?.error) {
    showStatus(result.error);
    return;
  }
  showStatus('Open the join page if in-popup connect fails — same join code and work email.');
});

document.getElementById('disconnect-org')?.addEventListener('click', async () => {
  // Real deployments: only IT/admin can remove a device from an org.
  showStatus('Ask your admin to remove this device.');
  return;
  if (!confirm('Leave this team? You will need to join again to use team secure.')) return;
  const result = await orgMessage('ORG_DISCONNECT');
  if (!result?.ok) {
    showStatus(result?.error || 'Could not disconnect.');
    return;
  }
  showSetup();
  showStatus('Left team.');
});

document.getElementById('reset-setup')?.addEventListener('click', async () => {
  if (!confirm('Reset setup? Your passphrase stays saved but you\'ll re-choose personal vs team.')) return;
  await writeSyncSettings({ setupComplete: false, tourComplete: false });
  showSetup();
});

// ── Settings load / save ────────────────────────────────────────────────────
function refreshPassphraseStrength() {
  if (!passphraseStrength || !GoldspirePassphrasePolicy || currentProfile !== 'personal') return;
  if (!passphraseInput?.value) { passphraseStrength.textContent = ''; return; }
  const a = GoldspirePassphrasePolicy.assessPassphrase(passphraseInput.value, 'personal');
  passphraseStrength.textContent = a.ok ? `Strength: ${a.label}` : a.message;
  passphraseStrength.classList.toggle('hint--warn', !a.ok);
}

function applySettingsToForm(settings) {
  const profile = settings.securityProfile || 'personal';
  applyProfileChrome(profile);
  wirePasswordGeneratorSettings(settings);

  const customUrl = settings.publicUnlockUrl?.trim() || '';
  const urlEl = document.getElementById('publicUnlockUrl');
  if (urlEl) urlEl.value = customUrl && customUrl !== builtInUnlockUrl ? customUrl : '';

  const modeEl = document.getElementById('defaultSecureMode');
  if (modeEl) modeEl.value = settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team';

  if (useSavedPassphraseInput) useSavedPassphraseInput.checked = settings.useSavedPassphrase !== false;

  const fromVault = settings.passphraseFromVault === true;
  if (passphraseFromVaultInput) passphraseFromVaultInput.checked = fromVault;
  refreshOrgPassphraseStatus(fromVault, settings);
  applyProvisionChrome(settings);

  const resecure = settings.resecureAfterUnlock !== false;
  const resecurePersonal = document.getElementById('resecureAfterUnlock');
  const resecureOrg = document.getElementById('resecureAfterUnlock-org');
  if (resecurePersonal) resecurePersonal.checked = resecure;
  if (resecureOrg) resecureOrg.checked = resecure;
  const delayMax = profile === 'organization' ? 120 : 600;
  resecureDelayInput.value = String(parseDelaySeconds(settings.resecureDelaySeconds, 60, delayMax));

  const selModeEl = document.getElementById('selectionUiMode');
  if (selModeEl) selModeEl.value = settings.selectionUiMode || defaults.selectionUiMode;

  const orgEmailEl = document.getElementById('orgMemberEmail');
  if (orgEmailEl) orgEmailEl.value = settings.orgMemberEmail || '';

  const personalEmailEl = document.getElementById('personalEmail');
  if (personalEmailEl) personalEmailEl.value = settings.personalEmail || '';

  const copilotEl = document.getElementById('copilotEnabled');
  if (copilotEl) copilotEl.checked = settings.copilotEnabled === true;

  const learningRow = document.getElementById('learning-telemetry-row');
  const learningEl = document.getElementById('learningTelemetry');
  const isOrgCloud = profile === 'organization' && settings.orgProvisionSource === 'cloud';
  if (learningRow) learningRow.hidden = isOrgCloud;
  if (learningEl) learningEl.checked = settings.learningTelemetry !== false;

  const dlpModeEl = document.getElementById('dlpMode');
  if (dlpModeEl) {
    const mode = String(settings.dlpMode || 'off').toLowerCase();
    dlpModeEl.value = ['off', 'observe', 'enforce'].includes(mode) ? mode : 'off';
  }

  return profile;
}

async function loadSettings() {
  await refreshManagedPolicy();

  if (managedState.skipOnboarding) {
    await writeSyncSettings({
      setupComplete: true,
      securityProfile: 'organization',
      orgProvisionSource: 'managed',
    });
    await orgMessage('ORG_SYNC');
    const settings = await readSyncSettings();
    showMain('organization');
    applySettingsToForm(settings);
  applyProvisionChrome(settings);
  applyManagedChrome(settings);
    await refreshReadinessChecklist();
    await refreshContextualHelp();
    GoldspirePopupTour?.maybeStartAfterSetup?.('organization', { switchTab, api });
    return;
  }

  let settings = await readSyncSettings();

  if (settings.orgProvisionSource === 'cloud') {
    await orgMessage('ORG_SYNC');
    await orgMessage('ORG_SYNC_SHARES');
    settings = await readSyncSettings();
  }

  if (settings.securityProfile !== 'organization') {
    await GoldspirePersonalProvision?.syncStatus?.();
    if (settings.personalAccountId && settings.personalEmail && settings.personalEmailVerified) {
      try {
        await GoldspirePersonalShare?.syncPendingShares?.();
      } catch {
        // Non-fatal — receiver may not have pending shares yet.
      }
    }
    settings = await readSyncSettings();
  }

  if (!settings.setupComplete) {
    if (settings.orgId && settings.orgProvisionSource === 'cloud') {
      showPendingOrgSetup(settings);
      return;
    }
    showSetup();
    return;
  }

  showMain(settings.securityProfile || 'personal');
  const profile = applySettingsToForm(settings);

  if (profile === 'personal' && passphraseInput) {
    const stored = await GoldspireSecrets.loadPassphrase('personal');
    hasStoredPassphrase = Boolean(stored?.trim());
    passphraseInput.value = stored || '';
    passphraseInput.placeholder = hasStoredPassphrase
      ? 'Saved — leave blank to keep, or type to replace'
      : 'Choose a strong passphrase (16+ chars)';
  }

  if (profile === 'organization') {
    const orgInput = document.getElementById('org-passphrase');
    const stored = await GoldspireSecrets.loadPassphrase('organization');
    hasStoredOrgPassphrase = Boolean(stored?.trim());
    if (orgInput && !isOrgProvisioned(settings)) {
      orgInput.value = stored || '';
      orgInput.placeholder = hasStoredOrgPassphrase
        ? 'Saved — leave blank to keep, or type to replace'
        : 'Shared team passphrase (16+ chars)';
    } else if (orgInput) {
      orgInput.value = '';
      orgInput.placeholder = 'Set by your team';
    }
  }

  passphraseDirty = false;
  orgPassphraseDirty = false;
  refreshPassphraseStrength();
  applyProvisionChrome(settings);
  applyManagedChrome(settings);
  await refreshReadinessChecklist();
  await refreshContextualHelp();
  await refreshHomeShortcuts();
  await refreshFirstSecureCard();
  await refreshSecurityProof();
  if (profile === 'personal') await refreshPlusPanel();

  if (settings.setupComplete && settings.tourComplete !== true) {
    GoldspirePopupTour?.maybeStartAfterSetup?.(profile, { switchTab, api });
  }
}

async function refreshPlusPanel() {
  const panel = document.getElementById('plus-settings-panel');
  if (!panel) return;

  let settings = await readSyncSettings();
  if (settings.personalAccountId) {
    await GoldspirePersonalProvision?.syncStatus?.();
    settings = await readSyncSettings();
  }
  if (settings.securityProfile === 'organization') {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const registerBlock = document.getElementById('plus-register-block');
  const activeBlock = document.getElementById('plus-active-block');
  const upgradeBtn = document.getElementById('plus-upgrade-btn');
  const statusHint = document.getElementById('plus-status-hint');
  const contactsSummary = document.getElementById('plus-contacts-summary');
  const contactsList = document.getElementById('plus-contacts-list');
  const manageLink = document.getElementById('plus-manage-link');
  const emailEl = document.getElementById('personalEmail');

  if (emailEl && settings.personalEmail) emailEl.value = settings.personalEmail;

  const hasAccount = Boolean(settings.personalAccountId);
  const emailVerified = settings.personalEmailVerified === true;
  const plusActive = settings.personalPlusActive === true;
  const resendVerifyBtn = document.getElementById('plus-resend-verify-btn');
  const verifyBanner = document.getElementById('plus-verify-banner');

  if (statusHint) {
    if (!hasAccount) {
      statusHint.textContent = 'Save and verify your email to receive Plus direct unlocks (free). Upgrade only if you want to send.';
    } else if (!emailVerified) {
      statusHint.textContent = 'Check your inbox for a verification link — receiving unlocks starts after you confirm.';
    } else if (plusActive) {
      statusHint.textContent = 'Plus active — 6 contacts included to send direct unlocks or magic links.';
    } else {
      statusHint.textContent = 'Receiving enabled. Upgrade to send to your own trusted contacts.';
    }
  }

  if (resendVerifyBtn) {
    resendVerifyBtn.hidden = !hasAccount || emailVerified;
  }

  if (verifyBanner) {
    if (hasAccount && !emailVerified) {
      verifyBanner.hidden = false;
      verifyBanner.textContent = 'Verify your email before trusted-contact unlocks can reach this device.';
    } else {
      verifyBanner.hidden = true;
      verifyBanner.textContent = '';
    }
  }

  const receiverBanner = document.getElementById('plus-receiver-banner');
  const pendingShares = settings.personalPendingShareCount || 0;
  if (receiverBanner && hasAccount && emailVerified && !plusActive) {
    receiverBanner.hidden = false;
    receiverBanner.textContent = pendingShares > 0
      ? `${pendingShares} trusted-contact message(s) waiting — open the email and unlock [redacted].`
      : 'You can receive trusted-contact unlocks without paying for Plus.';
  } else if (receiverBanner) {
    receiverBanner.hidden = true;
  }

  if (upgradeBtn) {
    upgradeBtn.hidden = !hasAccount || !emailVerified || plusActive;
    upgradeBtn.textContent = 'Upgrade — Veil Plus';
  }

  if (registerBlock) registerBlock.hidden = false;
  if (activeBlock) activeBlock.hidden = !plusActive;

  if (manageLink && GoldspirePersonalProvision?.plusPageUrl) {
    manageLink.href = GoldspirePersonalProvision.plusPageUrl();
  }

  const slotBar = document.getElementById('plus-slot-bar');
  const slotLabel = document.getElementById('plus-slot-label');
  const teamNudge = document.getElementById('plus-team-nudge');
  const teamLink = document.getElementById('plus-team-link');
  const portal = GoldspireConstants?.PORTAL_ORIGIN?.replace(/\/$/, '') || 'https://veil.goldspireventures.com';
  if (teamLink) teamLink.href = `${portal}/pricing.html#team`;

  if (!plusActive || !contactsList) return;

  contactsList.innerHTML = '';
  try {
    const payload = await GoldspirePersonalShare?.listContacts?.();
    const included = payload?.includedContacts || settings.personalIncludedContacts || 6;
    const extra = payload?.extraContactSlots || settings.personalExtraContactSlots || 0;
    const limit = payload?.contactLimit || included + extra;
    const contacts = payload?.contacts || [];
    const atIncludedCap = contacts.length >= included;

    if (contactsSummary) {
      contactsSummary.textContent = `${contacts.length} / ${limit} trusted contacts (${included} included${extra ? ` + ${extra} paid` : ''})`;
    }
    if (slotBar) {
      slotBar.hidden = !atIncludedCap;
      if (slotLabel) {
        slotLabel.textContent = atIncludedCap
          ? 'Need another contact? Add a monthly slot or switch to Team.'
          : '';
      }
    }
    if (teamNudge) teamNudge.hidden = contacts.length < included;

    for (const contact of contacts) {
      const li = document.createElement('li');
      const status = contact.registered ? 'ready' : 'pending Veil install';
      li.textContent = `${contact.email} (${status})`;
      contactsList.appendChild(li);
    }
  } catch (error) {
    if (contactsSummary) {
      contactsSummary.textContent = error?.message || 'Could not load contacts.';
    }
  }
}

document.getElementById('plus-register-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('personalEmail')?.value?.trim();
  if (!email) {
    showStatus('Enter your email first.');
    return;
  }
  try {
    const body = await GoldspirePersonalProvision.register(email);
    if (body.emailVerified === true) {
      await GoldspirePersonalShare?.registerContact?.(email);
      showStatus('Email saved and verified — you can receive trusted-contact unlocks.');
    } else if (body.verification?.verifyUrl) {
      showStatus(`Verification link (dev): ${body.verification.verifyUrl}`);
    } else {
      showStatus(body.verification?.message || 'Check your inbox for a verification link.');
    }
    await refreshPlusPanel();
  } catch (error) {
    showStatus(error?.message || 'Registration failed.');
  }
});

document.getElementById('plus-resend-verify-btn')?.addEventListener('click', async () => {
  try {
    const result = await GoldspirePersonalProvision.sendVerificationEmail();
    if (result?.verifyUrl) {
      showStatus(`Verification link (dev): ${result.verifyUrl}`);
    } else {
      showStatus(result?.message || 'Verification email sent.');
    }
  } catch (error) {
    showStatus(error?.message || 'Could not send verification email.');
  }
});

document.getElementById('plus-upgrade-btn')?.addEventListener('click', async () => {
  try {
    const url = await GoldspirePersonalProvision.startCheckout();
    api.tabs.create({ url });
  } catch (error) {
    showStatus(error?.message || 'Could not start checkout.');
  }
});

document.getElementById('plus-add-contact-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('plus-contact-email')?.value?.trim();
  if (!email) {
    showStatus('Enter a contact email.');
    return;
  }
  try {
    await GoldspirePersonalShare.addContact(email);
    document.getElementById('plus-contact-email').value = '';
    showStatus('Contact added.');
    await refreshPlusPanel();
  } catch (error) {
    const msg = error?.message || '';
    if (/slot|limit|402/i.test(msg)) {
      showStatus('Contact limit reached — add a slot or set up Team.');
    } else {
      showStatus(msg || 'Could not add contact.');
    }
  }
});

document.getElementById('plus-add-slot-btn')?.addEventListener('click', async () => {
  try {
    await GoldspirePersonalProvision.purchaseContactSlot();
    showStatus('Contact slot added to your subscription.');
    await GoldspirePersonalProvision.syncStatus();
    await refreshPlusPanel();
  } catch (error) {
    showStatus(error?.message || 'Could not add contact slot.');
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = currentProfile;
  const fromVault = profile === 'organization' && passphraseFromVaultInput?.checked;
  const newPassphrase = passphraseInput?.value.trim() || '';
  const orgPassphrase = document.getElementById('org-passphrase')?.value.trim() || '';
  const delayMax = profile === 'organization' ? 120 : 600;
  const resecureDelaySeconds = parseDelaySeconds(resecureDelayInput.value, 60, delayMax);

  if (profile === 'personal' && newPassphrase) {
    const a = GoldspirePassphrasePolicy?.assessPassphrase?.(newPassphrase, 'personal');
    if (a && !a.ok) { showStatus(a.message); return; }
  }

  if (profile === 'organization' && !fromVault && orgPassphrase && !isOrgProvisioned(await readSyncSettings())) {
    const a = GoldspirePassphrasePolicy?.assessPassphrase?.(orgPassphrase, 'organization');
    if (a && !a.ok) { showStatus(a.message); return; }
  }

  const selectionUiMode = document.getElementById('selectionUiMode')?.value || defaults.selectionUiMode;
  const showOnPageUi = selectionUiMode !== 'quiet';

  const savedSettings = migrateSettings({
    securityProfile: profile,
    publicUnlockUrl: document.getElementById('publicUnlockUrl')?.value.trim() || '',
    defaultSecureMode: document.getElementById('defaultSecureMode')?.value || 'team',
    useSavedPassphrase: profile === 'personal'
      ? useSavedPassphraseInput?.checked !== false
      : !fromVault,
    autoDetectRedacted: true,
    resecureAfterUnlock: getResecureChecked(),
    resecureDelaySeconds,
    passphraseFromVault: fromVault,
    selectionUiMode,
    showFloatingButton: showOnPageUi,
    showSelectionPill: showOnPageUi,
    setupComplete: true,
    orgMemberEmail: document.getElementById('orgMemberEmail')?.value.trim().toLowerCase() || '',
    passwordLength: parseInt(String(passwordLengthInput?.value || 16), 10) || 16,
    passwordLowercase: passwordLowercaseInput?.checked !== false,
    passwordUppercase: passwordUppercaseInput?.checked !== false,
    passwordDigits: passwordDigitsInput?.checked !== false,
    passwordSymbols: passwordSymbolsInput?.checked !== false,
    copilotEnabled: document.getElementById('copilotEnabled')?.checked === true,
    learningTelemetry: document.getElementById('learningTelemetry')?.checked !== false,
    dlpMode: document.getElementById('dlpMode')?.value || 'off',
  });

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const current = await readSyncSettings();
    await writeSyncSettings({ ...current, ...savedSettings });

    if (profile === 'organization' && savedSettings.orgMemberEmail && isOrgProvisioned({ ...current, ...savedSettings })) {
      await orgMessage('ORG_REGISTER_MEMBER', { email: savedSettings.orgMemberEmail });
    }

    if (profile === 'organization' && fromVault && !isOrgProvisioned({ ...current, ...savedSettings })) {
      await GoldspireSecrets.savePassphrase('', 'organization');
      await GoldspireSecrets.clearSessionTeamPassphrase?.();
    } else if (profile === 'organization' && orgPassphrase && !isOrgProvisioned({ ...current, ...savedSettings })) {
      await GoldspireSecrets.savePassphrase(orgPassphrase, 'organization');
    } else if (profile === 'personal' && (passphraseDirty || newPassphrase)) {
      await GoldspireSecrets.savePassphrase(newPassphrase, 'personal');
    }

    applySettingsToForm({ ...current, ...savedSettings });
    passphraseDirty = false;
    orgPassphraseDirty = false;
    if (profile === 'personal') {
      const stored = await GoldspireSecrets.loadPassphrase('personal');
      hasStoredPassphrase = Boolean(stored?.trim());
      if (stored && passphraseInput) passphraseInput.value = stored;
    }
    if (profile === 'organization' && !fromVault) {
      const stored = await GoldspireSecrets.loadPassphrase('organization');
      hasStoredOrgPassphrase = Boolean(stored?.trim());
      const orgInput = document.getElementById('org-passphrase');
      if (stored && orgInput) orgInput.value = stored;
    }
    refreshPassphraseStrength();
    showStatus('Settings saved.');
    await refreshReadinessChecklist();
    await refreshContextualHelp();
  } catch (error) {
    showStatus(error?.message || 'Could not save settings.');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

passphraseInput?.addEventListener('input', () => {
  passphraseDirty = true;
  refreshPassphraseStrength();
});

passphraseFromVaultInput?.addEventListener('change', async () => {
  refreshOrgPassphraseStatus(passphraseFromVaultInput.checked, await readSyncSettings());
});

document.getElementById('copilotEnabled')?.addEventListener('change', async (event) => {
  const enabled = event.target.checked === true;
  try {
    await writeSyncSettings({ ...await readSyncSettings(), copilotEnabled: enabled, copilotUserSet: true });
    const settings = await readSyncSettings();
    showStatus(enabled ? `Copilot enabled — ${GoldspireCopy?.refreshTabHint?.(settings) || 'refresh the page.'}` : 'Copilot off.');
    await refreshReadinessChecklist();
    await refreshContextualHelp();
  } catch (error) {
    showStatus(error?.message || 'Could not save copilot setting.');
    event.target.checked = !enabled;
  }
});

document.getElementById('org-passphrase')?.addEventListener('input', () => {
  orgPassphraseDirty = true;
});

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tabs__btn').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

document.getElementById('home-help-context-link')?.addEventListener('click', () => switchTab('help'));

// ── Home actions ──────────────────────────────────────────────────────────
function generateLocalPassword(options = {}) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*-_+=?';

  const pools = [];
  if (options.lowercase) pools.push(lower);
  if (options.uppercase) pools.push(upper);
  if (options.digits) pools.push(digits);
  if (options.symbols) pools.push(symbols);

  const length = Math.min(64, Math.max(8, Number(options.length) || 16));
  if (pools.length === 0) throw new Error('Choose at least one character set.');

  // Ensure at least one char from each selected pool.
  const required = pools.map((pool) => {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    return pool[b % pool.length];
  });

  const all = pools.join('');
  const remaining = Math.max(0, length - required.length);
  const bytes = crypto.getRandomValues(new Uint32Array(remaining));
  const rest = Array.from(bytes, (b) => all[b % all.length]);

  const out = [...required, ...rest];
  // Shuffle output.
  const shuffleBytes = crypto.getRandomValues(new Uint32Array(out.length));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = shuffleBytes[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

function passwordUiRoot() {
  if (currentProfile === 'personal') {
    return {
      output: document.getElementById('generated-password-personal'),
      length: document.getElementById('passwordLength-personal'),
      lowercase: document.getElementById('passwordLowercase-personal'),
      uppercase: document.getElementById('passwordUppercase-personal'),
      digits: document.getElementById('passwordDigits-personal'),
      symbols: document.getElementById('passwordSymbols-personal'),
    };
  }
  return {
    output: generatedPassword,
    length: passwordLengthInput,
    lowercase: passwordLowercaseInput,
    uppercase: passwordUppercaseInput,
    digits: passwordDigitsInput,
    symbols: passwordSymbolsInput,
  };
}

function getPasswordOptionsFromUi() {
  const ui = passwordUiRoot();
  return {
    length: parseInt(String(ui.length?.value || 16), 10) || 16,
    lowercase: ui.lowercase?.checked !== false,
    uppercase: ui.uppercase?.checked !== false,
    digits: ui.digits?.checked !== false,
    symbols: ui.symbols?.checked !== false,
  };
}

function writeGeneratedPassword(value) {
  const ui = passwordUiRoot();
  if (ui.output) ui.output.textContent = value;
}

document.getElementById('generate-password')?.addEventListener('click', () => {
  try {
    writeGeneratedPassword(generateLocalPassword(getPasswordOptionsFromUi()));
  } catch (e) {
    showStatus(e?.message || 'Could not generate password.');
  }
});

document.getElementById('settings-form')?.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('.js-generate-password')) {
    try {
      writeGeneratedPassword(generateLocalPassword(getPasswordOptionsFromUi()));
    } catch (e) {
      showStatus(e?.message || 'Could not generate password.');
    }
    return;
  }
  if (target.closest('.js-copy-password')) {
    const ui = passwordUiRoot();
    let value = ui.output?.textContent || '—';
    if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
    writeGeneratedPassword(value);
    navigator.clipboard.writeText(value).then(() => showStatus('Copied.'));
    return;
  }
  if (target.closest('.js-insert-password')) {
    const ui = passwordUiRoot();
    let value = ui.output?.textContent || '—';
    if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
    writeGeneratedPassword(value);
    sendToActiveTab('INSERT_TEXT', { text: value });
    showStatus('Inserted.');
  }
});

document.getElementById('copy-password')?.addEventListener('click', async () => {
  const ui = passwordUiRoot();
  let value = ui.output?.textContent || '—';
  if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
  writeGeneratedPassword(value);
  await navigator.clipboard.writeText(value);
  showStatus('Copied.');
});

document.getElementById('insert-password')?.addEventListener('click', () => {
  const ui = passwordUiRoot();
  let value = ui.output?.textContent || '—';
  if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
  writeGeneratedPassword(value);
  sendToActiveTab('INSERT_TEXT', { text: value });
  showStatus('Inserted.');
});

function wirePasswordGeneratorSettings(settings) {
  const panels = [
    {
      length: passwordLengthInput,
      lowercase: passwordLowercaseInput,
      uppercase: passwordUppercaseInput,
      digits: passwordDigitsInput,
      symbols: passwordSymbolsInput,
    },
    {
      length: document.getElementById('passwordLength-personal'),
      lowercase: document.getElementById('passwordLowercase-personal'),
      uppercase: document.getElementById('passwordUppercase-personal'),
      digits: document.getElementById('passwordDigits-personal'),
      symbols: document.getElementById('passwordSymbols-personal'),
    },
  ];
  for (const ui of panels) {
    if (!ui.length) continue;
    ui.length.value = String(settings.passwordLength || 16);
    if (ui.lowercase) ui.lowercase.checked = settings.passwordLowercase !== false;
    if (ui.uppercase) ui.uppercase.checked = settings.passwordUppercase !== false;
    if (ui.digits) ui.digits.checked = settings.passwordDigits !== false;
    if (ui.symbols) ui.symbols.checked = settings.passwordSymbols !== false;
  }
}

async function persistPasswordGeneratorSettings() {
  try {
    const ui = passwordUiRoot();
    const current = await readSyncSettings();
    await writeSyncSettings({
      ...current,
      passwordLength: parseInt(String(ui.length?.value || 16), 10) || 16,
      passwordLowercase: ui.lowercase?.checked !== false,
      passwordUppercase: ui.uppercase?.checked !== false,
      passwordDigits: ui.digits?.checked !== false,
      passwordSymbols: ui.symbols?.checked !== false,
    });
  } catch {
    // ignore
  }
}

[passwordLengthInput, passwordLowercaseInput, passwordUppercaseInput, passwordDigitsInput, passwordSymbolsInput]
  .filter(Boolean)
  .forEach((el) => el.addEventListener('change', () => { persistPasswordGeneratorSettings(); }));

document.getElementById('action-secure')?.addEventListener('click', () => sendToActiveTab('SECURE_SELECTION'));
document.getElementById('action-secure-options')?.addEventListener('click', () => sendToActiveTab('SECURE_WITH_OPTIONS'));
document.getElementById('action-unlock')?.addEventListener('click', () => sendToActiveTab('UNLOCK_SELECTION'));

function refreshSelectionPreview() {
  const preview = document.getElementById('selection-preview');
  if (!preview) return;
  readSyncSettings().then((settings) => {
    api.runtime.sendMessage({ type: 'GET_SELECTION_STATUS' }, (response) => {
      const text = response?.preview?.trim() || '';
      preview.textContent = text
        ? `"${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"`
        : (GoldspireCopy?.homeEmptyHint?.(settings) || 'Highlight text on the page.');
      preview.classList.toggle('selection-preview--ready', Boolean(text));
    });
  }).catch(() => {});
}

// ── Snoozed sites ───────────────────────────────────────────────────────────
function loadSnoozedSites() {
  const card = document.getElementById('snoozed-sites-card');
  const list = document.getElementById('snoozed-sites-list');
  if (!card || !list) return;

  api.storage.local.get({ gstSnoozedHosts: [] }, (result) => {
    if (api.runtime.lastError) return;
    const hosts = result.gstSnoozedHosts || [];
    card.hidden = hosts.length === 0;
    list.innerHTML = hosts.map((h) =>
      `<li class="snoozed-row"><span>${h}</span><button type="button" class="btn btn--ghost btn--sm" data-unsnooze="${h}">Remove</button></li>`,
    ).join('');

    list.querySelectorAll('[data-unsnooze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        api.storage.local.get({ gstSnoozedHosts: [] }, (r) => {
          const updated = (r.gstSnoozedHosts || []).filter((x) => x !== btn.dataset.unsnooze);
          api.storage.local.set({ gstSnoozedHosts: updated }, () => {
            loadSnoozedSites();
            refreshContextualHelp().catch(() => {});
          });
        });
      });
    });
  });
}

function formatAllowRuleLabel(rule = {}) {
  const cat = String(rule.category || '').replace(/_/g, ' ');
  const intent = rule.intent && rule.intent !== '*' ? ` · ${rule.intent}` : '';
  return `${rule.host} · ${cat}${intent}`;
}

function loadSiteAllowRules() {
  const card = document.getElementById('site-allow-rules-card');
  const list = document.getElementById('site-allow-rules-list');
  if (!card || !list) return;

  api.storage.local.get({ gstSiteAllowRules: [] }, (result) => {
    if (api.runtime.lastError) return;
    const rules = result.gstSiteAllowRules || [];
    card.hidden = rules.length === 0;
    list.innerHTML = rules.map((rule, index) =>
      `<li class="snoozed-row"><span>${escapePopupHtml(formatAllowRuleLabel(rule))}</span><button type="button" class="btn btn--ghost btn--sm" data-remove-allow="${index}">Remove</button></li>`,
    ).join('');

    list.querySelectorAll('[data-remove-allow]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeAllow);
        api.storage.local.get({ gstSiteAllowRules: [] }, (r) => {
          const updated = (r.gstSiteAllowRules || []).filter((_, i) => i !== idx);
          api.storage.local.set({ gstSiteAllowRules: updated }, () => {
            loadSiteAllowRules();
            refreshContextualHelp().catch(() => {});
          });
        });
      });
    });
  });
}

document.getElementById('clear-site-allows')?.addEventListener('click', () => {
  api.storage.local.set({ gstSiteAllowRules: [] }, () => {
    loadSiteAllowRules();
    refreshContextualHelp().catch(() => {});
  });
});

document.getElementById('clear-snoozed')?.addEventListener('click', () => {
  api.storage.local.set({ gstSnoozedHosts: [] }, () => {
    loadSnoozedSites();
    refreshContextualHelp().catch(() => {});
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
if (api.storage?.onChanged) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.orgProvisionSource || changes.setupComplete || changes.orgDisplayName) {
      loadSettings().catch(() => {});
    }
  });
}

loadSettings().then(async () => {
  const notice = await GoldspireStatusNotice?.consumeNotice?.();
  if (notice?.message) showStatus(notice.message);
}).catch(() => showStatus('Could not load settings.'));

const helpPortalLink = document.getElementById('help-portal-link');
const helpInstallLink = document.getElementById('help-install-link');
const helpPrivacyLink = document.getElementById('help-privacy-link');
if (typeof GoldspireConstants !== 'undefined') {
  const base = GoldspireConstants.PORTAL_ORIGIN
    ? `${GoldspireConstants.PORTAL_ORIGIN.replace(/\/$/, '')}/`
    : (GoldspireFeedback?.portalBaseUrl?.(GoldspireConstants) || '');
  if (helpPortalLink && base) helpPortalLink.href = `${base}index.html`;
  if (helpInstallLink && base) helpInstallLink.href = `${base}install.html`;
  if (helpPrivacyLink && base) helpPrivacyLink.href = `${base}privacy.html`;
}

async function collectFeedbackMeta() {
  const settings = await readSyncSettings();
  let pageUrl = '';
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    pageUrl = GoldspireFeedback?.sanitizePageUrl?.(tabs[0]?.url) || '';
  } catch {
    pageUrl = '';
  }
  let deviceHint = '';
  try {
    const stored = await api.storage.local.get(['deviceId']);
    const deviceId = stored?.deviceId || '';
    if (deviceId) deviceHint = String(deviceId).slice(0, 8);
  } catch {
    deviceHint = '';
  }
  return {
    version: extensionVersion,
    browser: GoldspireFeedback?.detectBrowser?.() || 'Unknown',
    profile: settings.securityProfile || 'personal',
    copilot: settings.copilotEnabled === true,
    orgName: settings.orgDisplayName || '',
    orgId: settings.orgId || '',
    policyPackId: settings.policyPackId || settings.effectivePolicyPackId || '',
    dlpEnabled: settings.dlp?.enabled === true,
    pageUrl,
    deviceHint,
    platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
    locale: typeof navigator !== 'undefined' ? navigator.language || '' : '',
  };
}

async function submitFeedbackTicket(kind, message = '') {
  if (!GoldspireFeedback?.submitTicket) throw new Error('Feedback unavailable');
  const meta = await collectFeedbackMeta();
  const payload = GoldspireFeedback.buildTicketPayload(kind, message, meta, { source: 'extension_popup' });
  const result = await GoldspireFeedback.submitTicket(GoldspireConstants.ORG_API_BASE, payload);
  if (global.GoldspireOpsTelemetry?.report) {
    await GoldspireOpsTelemetry.report({
      kind: 'support_ticket',
      code: result.ticketRef,
      message: kind,
      source: 'extension',
    });
    GoldspireOpsTelemetry.flush?.();
  }
  return result;
}

async function openFeedbackMail(kind) {
  if (!GoldspireFeedback) return;
  const meta = await collectFeedbackMeta();
  const diagnostics = GoldspireFeedback.buildDiagnostics(meta);
  const mailto = GoldspireFeedback.buildMailtoUrl(kind, { diagnostics, meta });
  GoldspireFeedback.openMailto(api, mailto);
}

async function openFeedbackPortal(kind) {
  if (!GoldspireFeedback) return;
  const meta = await collectFeedbackMeta();
  GoldspireFeedback.openFeedbackPage(api, GoldspireConstants, {
    v: meta.version,
    browser: meta.browser,
    profile: meta.profile,
    copilot: meta.copilot ? 'on' : 'off',
    page: meta.pageUrl,
    kind: kind || 'feedback',
    orgId: meta.orgId,
    orgName: meta.orgName,
    policyPackId: meta.policyPackId,
    dlp: meta.dlpEnabled ? 'on' : 'off',
    deviceHint: meta.deviceHint,
  });
}

document.getElementById('replay-tour')?.addEventListener('click', async () => {
  const settings = await readSyncSettings();
  GoldspirePopupTour?.start?.(settings.securityProfile || 'personal', {
    switchTab,
    api,
    force: true,
  });
});
document.getElementById('feedback-send')?.addEventListener('click', () => {
  submitFeedbackTicket('feedback', 'General feedback from extension popup')
    .then((result) => showStatus(`Ticket ${result.ticketRef} submitted — thank you.`))
    .catch(() => openFeedbackPortal('feedback').catch(() => showStatus('Could not submit — opened feedback page.')));
});
document.getElementById('feedback-bug')?.addEventListener('click', () => {
  openFeedbackPortal('bug').catch(() => showStatus('Could not open feedback page.'));
});
document.getElementById('feedback-false-positive')?.addEventListener('click', () => {
  openFeedbackPortal('falsePositive').catch(() => showStatus('Could not open feedback page.'));
});
document.getElementById('feedback-portal-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  openFeedbackPortal('feedback').catch(() => showStatus('Could not open feedback page.'));
});
document.getElementById('popup-feedback-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  openFeedbackPortal('feedback').catch(() => showStatus('Could not open feedback page.'));
});

const popupVersion = document.getElementById('popup-version');
if (popupVersion) popupVersion.textContent = `v${extensionVersion}`;

refreshSelectionPreview();
