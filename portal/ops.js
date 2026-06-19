/**
 * In-house platform ops dashboard (reads Veil API summary with ops token).
 */
(function (global) {
  const TOKEN_KEY = 'veilOpsToken';

  function apiBase() {
    return String(global.GoldspirePortal?.API_BASE || '').replace(/\/$/, '');
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

  async function fetchSummary(days) {
    const base = apiBase();
    if (!base) throw new Error('API base is not configured.');
    const t = token();
    if (!t) throw new Error('Enter your platform ops token.');
    const response = await fetch(`${base}/v1/ops/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid ops token.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }
    return response.json();
  }

  function renderSummary(container, data) {
    const kinds = (data.eventsByKind || [])
      .map((row) => `<tr><td>${escapeHtml(row.kind)}</td><td>${row.count}</td></tr>`)
      .join('');
    const recent = (data.recentEvents || [])
      .map((row) => {
        const at = row.event_at ? new Date(row.event_at).toLocaleString() : '';
        return `<tr>
          <td>${escapeHtml(at)}</td>
          <td>${escapeHtml(row.kind)}</td>
          <td>${escapeHtml(row.code)}</td>
          <td>${escapeHtml(row.source)}</td>
          <td>${escapeHtml(row.extension_version)}</td>
          <td>${escapeHtml(row.message)}</td>
        </tr>`;
      })
      .join('');
    const health = (data.health || [])
      .map((row) => {
        const at = row.checked_at ? new Date(row.checked_at).toLocaleString() : '';
        const status = row.ok ? (row.db_ok ? 'OK' : 'DB down') : 'Degraded';
        return `<tr><td>${escapeHtml(at)}</td><td>${escapeHtml(status)}</td><td>${escapeHtml(row.version)}</td><td>${row.uptime_sec || 0}s</td></tr>`;
      })
      .join('');
    const security = (data.securityEventsByDay || [])
      .map((row) => {
        const day = row.day ? new Date(row.day).toLocaleDateString() : '';
        return `<tr><td>${escapeHtml(day)}</td><td>${row.count}</td></tr>`;
      })
      .join('');

    container.innerHTML = `
      <p class="lede">Last ${data.windowDays} days — metadata only, no secrets.</p>
      <h2>API health</h2>
      <table class="data-table"><thead><tr><th>Checked</th><th>Status</th><th>Version</th><th>Uptime</th></tr></thead><tbody>${health || '<tr><td colspan="4">No health samples yet.</td></tr>'}</tbody></table>
      <h2>Client ops events by kind</h2>
      <table class="data-table"><thead><tr><th>Kind</th><th>Count</th></tr></thead><tbody>${kinds || '<tr><td colspan="2">No client ops events.</td></tr>'}</tbody></table>
      <h2>Org security events by day</h2>
      <table class="data-table"><thead><tr><th>Day</th><th>Events</th></tr></thead><tbody>${security || '<tr><td colspan="2">No security events.</td></tr>'}</tbody></table>
      <h2>Recent ops events</h2>
      <table class="data-table"><thead><tr><th>Time</th><th>Kind</th><th>Code</th><th>Source</th><th>Extension</th><th>Message</th></tr></thead><tbody>${recent || '<tr><td colspan="6">No recent events.</td></tr>'}</tbody></table>
    `;
  }

  function init() {
    const form = document.getElementById('ops-form');
    const tokenInput = document.getElementById('ops-token');
    const daysInput = document.getElementById('ops-days');
    const statusEl = document.getElementById('ops-status');
    const summaryEl = document.getElementById('ops-summary');
    if (!form || !summaryEl) return;

    if (tokenInput && token()) tokenInput.value = token();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (statusEl) statusEl.textContent = 'Loading…';
      setToken(tokenInput?.value?.trim() || '');
      try {
        const data = await fetchSummary(Number(daysInput?.value) || 7);
        renderSummary(summaryEl, data);
        if (statusEl) statusEl.textContent = 'Updated.';
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || 'Could not load summary.';
        summaryEl.innerHTML = '';
      }
    });
  }

  global.GoldspirePortalOps = { init, fetchSummary };
})(typeof window !== 'undefined' ? window : globalThis);
