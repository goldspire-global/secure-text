/**
 * Admin setup checklist and guided copy for org consoles.
 */
(function (global) {
  function checklistItems(overview = {}, org = {}) {
    const policyPack = overview.policy?.packId || org.settings?.policyPackId || '';
    const hasPolicy = Boolean(policyPack) && policyPack !== 'observational';
    const members = overview.members || {};
    const codes = overview.joinCodes || {};
    const industry = GoldspirePolicyPacks?.getIndustry?.(org.settings?.industry);

    return [
      {
        id: 'policy',
        label: hasPolicy ? 'Company default pack set (Access tab)' : 'Set company default pack (Access tab)',
        tab: 'access',
        done: hasPolicy,
        hint: hasPolicy
          ? `${overview.policy?.packLabel || policyPack} is the default. Use sub-teams for other departments.`
          : `Pick a default for most employees — enable extra packs in the library for Finance, Legal, etc.`,
      },
      {
        id: 'members',
        label: 'Add member work emails (People tab)',
        tab: 'people',
        done: (members.active || 0) > 0,
        hint: 'Required for invite-only teams — members must use the email you add here.',
      },
      {
        id: 'codes',
        label: 'Create a join code (Access tab)',
        tab: 'access',
        done: (codes.active || 0) > 0,
        hint: 'Share the code with members so they can connect the extension.',
      },
      {
        id: 'connected',
        label: 'Get at least one browser connected',
        tab: 'people',
        done: (members.connected || 0) > 0,
        hint: 'Members install Veil → Team → enter join code + work email. They appear under Connected browsers.',
      },
      {
        id: 'siem',
        label: 'Optional: forward events to your SIEM',
        tab: 'security',
        done: Boolean(org.settings?.analytics?.siemWebhookUrl),
        optional: true,
        hint: 'Metadata-only webhook for Splunk, Sentinel, etc.',
      },
    ];
  }

  function renderChecklist(container, overview, org, { onGoToTab } = {}) {
    if (!container) return;
    const items = checklistItems(overview, org);
    const pending = items.filter((item) => !item.done && !item.optional);
    const doneCount = items.filter((item) => item.done).length;

    container.innerHTML = `
      <div class="guide-callout">
        <div class="guide-callout__head">
          <strong>Setup guide</strong>
          <span class="hint">${doneCount}/${items.length} complete${pending.length ? ` · ${pending.length} left` : ' · ready to roll'}</span>
        </div>
        <ol class="guide-checklist">
          ${items.map((item) => `
            <li class="guide-checklist__item${item.done ? ' guide-checklist__item--done' : ''}${item.optional ? ' guide-checklist__item--optional' : ''}">
              <span class="guide-checklist__mark" aria-hidden="true">${item.done ? '✓' : '○'}</span>
              <div class="guide-checklist__body">
                <button type="button" class="guide-checklist__link" data-guide-tab="${item.tab}">${item.label}</button>
                <p class="hint">${item.hint}</p>
              </div>
            </li>
          `).join('')}
        </ol>
      </div>`;

    container.querySelectorAll('[data-guide-tab]').forEach((button) => {
      button.addEventListener('click', () => onGoToTab?.(button.dataset.guideTab));
    });
  }

  function renderOverviewStats(container, overview = {}) {
    if (!container) return;
    const members = overview.members || {};
    const devices = overview.devices || {};
    const security = overview.security || {};
    const policy = overview.policy || {};

    const tile = (label, value, sub) => `
      <div class="stat-tile">
        <div class="stat-tile__value">${value}</div>
        <div class="hint">${label}</div>
        ${sub ? `<div class="hint" style="margin-top:0.2rem;font-size:0.78rem;">${sub}</div>` : ''}
      </div>`;

    container.className = 'stat-grid';
    container.innerHTML = [
      tile('Active members', members.active || 0, `${members.connected || 0} connected`),
      tile('Browsers', devices.active || 0, `${devices.unlinked || 0} unlinked`),
      tile('Events (30d)', security.total || 0, `${security.blocks || 0} blocks`),
      tile('Policy', policy.packLabel || 'Not set', `v${policy.version || 1}`),
    ].join('');
  }

  function subTeamGuideHtml() {
    return `
      <div class="guide-callout guide-callout--compact">
        <strong>Department-specific rule sets</strong>
        <p class="hint" style="margin:0.5rem 0 0;">A <strong>policy pack</strong> is a pre-built list of what to warn or block (API keys, IBANs, PPS numbers, etc.). Your <strong>company default</strong> applies to most people. Sub-teams let one department use stricter or different rules — e.g. Finance blocks payment data while Engineering blocks secrets only.</p>
        <ol class="guide-steps">
          <li>Enable packs you need under <strong>Access → Pack library</strong>.</li>
          <li><strong>Create</strong> a sub-team below (e.g. Finance, Legal).</li>
          <li>Go to <strong>People</strong> → assign members in the <strong>Sub-team</strong> column.</li>
          <li>Click <strong>Set policy</strong> → pick a starter pack or paste custom JSON (use <em>Insert sample template</em> for a guided starting point).</li>
          <li>Members pick up changes the next time they open the extension.</li>
        </ol>
      </div>`;
  }

  function peopleGuideHtml() {
    return `
      <div class="guide-callout guide-callout--compact">
        <strong>Member onboarding flow</strong>
        <ol class="guide-steps">
          <li>Add their <strong>work email</strong> here (if invite-only).</li>
          <li>Create a <strong>join code</strong> under Access and send it to them.</li>
          <li>They <a href="install.html">install Veil</a> → choose <strong>Team</strong> → enter code + email.</li>
          <li>They appear in <strong>Connected browsers</strong> once the extension syncs.</li>
        </ol>
      </div>`;
  }

  function devicesGuideHtml() {
    return `
      <p class="hint">Each row is one browser profile where a member installed Veil and joined your org. <strong>Disconnect</strong> forces them to join again — use if a laptop is lost or someone leaves.</p>
      <p class="hint">Rows without a member email are usually old sessions — disconnect them or ask the member to re-join with their work email.</p>`;
  }

  function formatDeviceClient(device) {
    const browser = device.browser || '';
    const platform = device.platform || '';
    const version = device.extensionVersion || '';
    if (!browser && !platform && !version) return '—';
    const parts = [browser, platform].filter(Boolean);
    const label = parts.length ? parts.join(' · ') : 'Unknown browser';
    return version ? `${label} (v${version})` : label;
  }

  function policyPackLabel(packId) {
    const pack = global.GoldspirePolicyPacks?.get?.(packId);
    return pack?.label || packId || 'Org default';
  }

  global.GoldspireAdminGuide = {
    checklistItems,
    renderChecklist,
    renderOverviewStats,
    subTeamGuideHtml,
    peopleGuideHtml,
    devicesGuideHtml,
    formatDeviceClient,
    policyPackLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
