/**
 * Veil platform ops dashboard — tabbed layout, API host only.
 */
(function (global) {
  const TOKEN_KEY = 'veilOpsToken';
  let refreshTimer = null;
  let activeTab = 'overview';

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'api', label: 'API' },
    { id: 'clients', label: 'Clients' },
    { id: 'security', label: 'Security' },
    { id: 'events', label: 'Event log' },
  ];

  function apiBase() {
    return String(global.location?.origin || '').replace(/\/$/, '');
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function statClass(value, { warnBelow = 99, badBelow = 95 } = {}) {
    const n = Number(value);
    if (Number.isNaN(n)) return '';
    if (n < badBelow) return 'ops-stat--bad';
    if (n < warnBelow) return 'ops-stat--warn';
    return 'ops-stat--ok';
  }

  async function fetchSummary(days) {
    const t = token();
    if (!t) throw new Error('Enter your platform ops token.');
    const response = await fetch(`${apiBase()}/v1/ops/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (response.status === 401 || response.status === 403) throw new Error('Invalid ops token.');
    if (response.status === 429) throw new Error('Rate limited — wait a minute and retry.');
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }
    return response.json();
  }

  function tableCard(title, headers, rowHtml, emptyColspan, tall) {
    const scrollClass = tall ? 'ops-scroll ops-scroll--tall' : 'ops-scroll';
    const body = rowHtml.length
      ? rowHtml.join('')
      : `<tr><td colspan="${emptyColspan}" class="ops-empty">No data in this window.</td></tr>`;
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    return `
      <div class="ops-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="${scrollClass}">
          <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>
      </div>`;
  }

  function renderKpis(kpiEl, data) {
    const avail = data.availability || {};
    const org = data.orgStats || {};
    const pct = avail.availability_pct != null ? `${avail.availability_pct}%` : '—';
    kpiEl.hidden = false;
    kpiEl.innerHTML = `
      <div class="ops-stat ${statClass(avail.availability_pct)}"><strong>${escapeHtml(pct)}</strong><span>Availability</span></div>
      <div class="ops-stat"><strong>${avail.healthy ?? 0}/${avail.samples ?? 0}</strong><span>Health samples</span></div>
      <div class="ops-stat"><strong>${org.org_count ?? 0}</strong><span>Orgs</span></div>
      <div class="ops-stat"><strong>${org.active_members ?? 0}</strong><span>Members</span></div>
      <div class="ops-stat"><strong>${org.active_devices ?? 0}</strong><span>Devices</span></div>
    `;
  }

  function buildPanels(data) {
    const synthetic = (data.syntheticChecks || []).map((row) => {
      const at = row.checked_at ? new Date(row.checked_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(row.target_name)}</td>
        <td>${row.ok ? 'OK' : 'FAIL'}</td>
        <td>${row.status_code ?? '—'}</td>
        <td>${row.latency_ms ?? '—'}ms</td>
        <td>${escapeHtml(at)}</td>
      </tr>`;
    });

    const alerts = (data.recentAlerts || []).map((row) => {
      const at = row.alerted_at ? new Date(row.alerted_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.severity)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${row.delivered ? 'yes' : 'no'}</td>
      </tr>`;
    });

    const health = (data.health || []).slice(0, 48).map((row) => {
      const at = row.checked_at ? new Date(row.checked_at).toLocaleString() : '';
      const status = row.ok ? (row.db_ok ? 'OK' : 'DB down') : 'Degraded';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(row.version)}</td>
        <td title="Process age at sample">${row.uptime_sec || 0}s</td>
      </tr>`;
    });

    const apiErrors = (data.apiErrorsByRoute || []).map((row) =>
      `<tr><td>${escapeHtml(row.route)}</td><td>${row.errors}</td><td>${row.requests}</td></tr>`,
    );

    const apiLatency = (data.apiLatencyByRoute || []).map((row) =>
      `<tr><td>${escapeHtml(row.route)}</td><td>${row.requests}</td><td>${row.errors || 0}</td><td>${row.avg_ms ?? '—'}ms</td></tr>`,
    );

    const versions = (data.extensionVersions || []).map((row) =>
      `<tr><td>${escapeHtml(row.extension_version)}</td><td>${escapeHtml(row.browser)}</td><td>${row.count}</td></tr>`,
    );

    const kinds = (data.eventsByKind || []).map((row) =>
      `<tr><td>${escapeHtml(row.kind)}</td><td>${row.count}</td></tr>`,
    );

    const security = (data.securityEventsByDay || []).map((row) => {
      const day = row.day ? new Date(row.day).toLocaleDateString() : '';
      return `<tr><td>${escapeHtml(day)}</td><td>${row.count}</td></tr>`;
    });

    const recent = (data.recentEvents || []).map((row) => {
      const at = row.event_at ? new Date(row.event_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`;
    });

    return {
      overview: `
        <p class="hint-inline">Last ${data.windowDays} days · refreshes every 60s · metadata only</p>
        <div class="ops-columns">
          ${tableCard('Synthetic checks', ['Target', 'Status', 'HTTP', 'Latency', 'Checked'], synthetic, 5)}
          ${tableCard('Recent alerts', ['Time', 'Severity', 'Title', 'Sent'], alerts, 4)}
        </div>`,
      api: `
        <div class="ops-columns">
          ${tableCard('Health samples', ['Checked', 'Status', 'Version', 'Process age'], health, 4, true)}
          ${tableCard('5xx by route', ['Route', '5xx', 'Requests'], apiErrors, 3)}
        </div>
        <div style="margin-top:0.85rem">
          ${tableCard('Traffic & latency', ['Route', 'Requests', '5xx', 'Avg ms'], apiLatency, 4)}
        </div>`,
      clients: `
        <div class="ops-columns">
          ${tableCard('Extension versions', ['Version', 'Browser', 'Events'], versions, 3)}
          ${tableCard('Ops events by kind', ['Kind', 'Count'], kinds, 2)}
        </div>`,
      security: tableCard('Security events by day', ['Day', 'Events'], security, 2),
      events: tableCard('Recent ops events', ['Time', 'Kind', 'Code', 'Source', 'Message'], recent, 5, true),
    };
  }

  function renderTabs(tabsEl, panelsEl, panels) {
    tabsEl.hidden = false;
    tabsEl.innerHTML = TABS.map((tab) =>
      `<button type="button" class="ops-tab" role="tab" data-tab="${tab.id}" aria-selected="${tab.id === activeTab}">${tab.label}</button>`,
    ).join('');

    panelsEl.innerHTML = TABS.map((tab) =>
      `<div class="ops-panel" id="panel-${tab.id}" role="tabpanel" aria-hidden="${tab.id !== activeTab}">${panels[tab.id] || ''}</div>`,
    ).join('');

    tabsEl.querySelectorAll('.ops-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        tabsEl.querySelectorAll('.ops-tab').forEach((b) => {
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        panelsEl.querySelectorAll('.ops-panel').forEach((panel) => {
          panel.setAttribute('aria-hidden', panel.id === `panel-${activeTab}` ? 'false' : 'true');
        });
      });
    });
  }

  async function loadSummary(statusEl, kpiEl, tabsEl, panelsEl, daysInput) {
    if (statusEl) statusEl.textContent = 'Loading…';
    try {
      const data = await fetchSummary(Number(daysInput?.value) || 7);
      renderKpis(kpiEl, data);
      renderTabs(tabsEl, panelsEl, buildPanels(data));
      if (statusEl) statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}.`;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not load summary.';
      kpiEl.hidden = true;
      tabsEl.hidden = true;
      panelsEl.innerHTML = '';
    }
  }

  function init() {
    const form = document.getElementById('ops-form');
    const tokenInput = document.getElementById('ops-token');
    const daysInput = document.getElementById('ops-days');
    const statusEl = document.getElementById('ops-status');
    const kpiEl = document.getElementById('ops-kpis');
    const tabsEl = document.getElementById('ops-tabs');
    const panelsEl = document.getElementById('ops-panels');
    const refreshBtn = document.getElementById('ops-refresh');
    if (!form || !panelsEl) return;

    if (tokenInput && token()) tokenInput.value = token();

    const run = async () => {
      setToken(tokenInput?.value?.trim() || '');
      await loadSummary(statusEl, kpiEl, tabsEl, panelsEl, daysInput);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      run();
    });
    refreshBtn?.addEventListener('click', () => run());

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (token()) run();
    }, 60_000);
  }

  global.GoldspireOpsDashboard = { init, fetchSummary };
})(typeof window !== 'undefined' ? window : globalThis);
