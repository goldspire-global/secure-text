/**
 * Veil platform ops — monitor, support tickets, trace, resolve.
 */
(function (global) {
  const TOKEN_KEY = 'veilOpsToken';
  let refreshTimer = null;
  let activeTab = 'overview';
  let lastSummary = null;
  let eventFilter = '';
  let ticketFilter = { status: '', kind: '', q: '' };
  let ticketList = [];
  let selectedTicketRef = '';

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'support', label: 'Support' },
    { id: 'api', label: 'API' },
    { id: 'clients', label: 'Clients' },
    { id: 'security', label: 'Security' },
    { id: 'events', label: 'Event log' },
  ];

  const PORTAL_BASE = 'https://join-veil.goldspireventures.com';
  const KIND_LABELS = {
    feedback: 'Feedback',
    bug: 'Bug',
    falsePositive: 'False alert',
    security: 'Security',
  };
  const STATUS_LABELS = {
    new: 'New',
    investigating: 'Investigating',
    waiting_customer: 'Waiting on customer',
    resolved: 'Resolved',
    closed: 'Closed',
  };

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

  async function apiFetch(path, options = {}) {
    const t = token();
    if (!t) throw new Error('Enter your platform ops token.');
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(options.headers || {}),
      },
    });
    if (response.status === 401 || response.status === 403) throw new Error('Invalid ops token.');
    if (response.status === 429) throw new Error('Rate limited — wait a minute and retry.');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    return body;
  }

  async function fetchSummary(days) {
    return apiFetch(`/v1/ops/summary?days=${days}`);
  }

  async function postTestAlert() {
    return apiFetch('/v1/ops/test-alert', { method: 'POST' });
  }

  async function fetchTickets() {
    const params = new URLSearchParams();
    if (ticketFilter.status) params.set('status', ticketFilter.status);
    if (ticketFilter.kind) params.set('kind', ticketFilter.kind);
    if (ticketFilter.q) params.set('q', ticketFilter.q);
    params.set('limit', '80');
    return apiFetch(`/v1/ops/support/tickets?${params}`);
  }

  async function fetchTicketDetail(ref) {
    return apiFetch(`/v1/ops/support/tickets/${encodeURIComponent(ref)}`);
  }

  async function patchTicket(ref, patch) {
    return apiFetch(`/v1/ops/support/tickets/${encodeURIComponent(ref)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  function tableCard(title, headers, rowHtml, emptyColspan, tall, toolbarHtml) {
    const scrollClass = tall ? 'ops-scroll ops-scroll--tall' : 'ops-scroll';
    const body = rowHtml.length
      ? rowHtml.join('')
      : `<tr><td colspan="${emptyColspan}" class="ops-empty">No data in this window.</td></tr>`;
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    return `
      <div class="ops-card">
        <div class="ops-card__head">
          <h3>${escapeHtml(title)}</h3>
          ${toolbarHtml || ''}
        </div>
        <div class="${scrollClass}">
          <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>
      </div>`;
  }

  function renderKpis(kpiEl, data) {
    const avail = data.availability || {};
    const org = data.orgStats || {};
    const support = data.support || {};
    const pct = avail.availability_pct != null ? `${avail.availability_pct}%` : '—';
    kpiEl.hidden = false;
    kpiEl.innerHTML = `
      <div class="ops-stat ${statClass(avail.availability_pct)}"><strong>${escapeHtml(pct)}</strong><span>Availability</span></div>
      <div class="ops-stat ${support.openCount ? 'ops-stat--warn' : ''}"><strong>${support.openCount ?? 0}</strong><span>Open tickets</span></div>
      <div class="ops-stat"><strong>${org.org_count ?? 0}</strong><span>Orgs</span></div>
      <div class="ops-stat"><strong>${org.active_members ?? 0}</strong><span>Members</span></div>
      <div class="ops-stat"><strong>${org.active_devices ?? 0}</strong><span>Devices</span></div>
    `;
  }

  function filterEvents(rows) {
    const q = eventFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = `${row.kind} ${row.code} ${row.source} ${row.message}`.toLowerCase();
      return blob.includes(q);
    });
  }

  function ticketRowHtml(ticket) {
    const at = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : '';
    const preview = escapeHtml(String(ticket.message || '').slice(0, 80));
    const selected = ticket.ticketRef === selectedTicketRef ? ' ops-ticket-row--active' : '';
    return `<tr class="ops-ticket-row${selected}" data-ticket-ref="${escapeHtml(ticket.ticketRef)}">
      <td><code>${escapeHtml(ticket.ticketRef)}</code></td>
      <td>${escapeHtml(at)}</td>
      <td>${escapeHtml(KIND_LABELS[ticket.kind] || ticket.kind)}</td>
      <td><span class="ops-pill ops-pill--${escapeHtml(ticket.status)}">${escapeHtml(STATUS_LABELS[ticket.status] || ticket.status)}</span></td>
      <td>${escapeHtml(ticket.source)}</td>
      <td>${escapeHtml(ticket.orgName || '—')}</td>
      <td>${preview}</td>
    </tr>`;
  }

  function buildSupportPanelHtml(data) {
    const failedSynth = (data.syntheticChecks || []).filter((row) => !row.ok);
    const rows = ticketList.map(ticketRowHtml);
    const statusOptions = ['', 'new', 'investigating', 'waiting_customer', 'resolved', 'closed']
      .map((s) => `<option value="${s}"${ticketFilter.status === s ? ' selected' : ''}>${s ? STATUS_LABELS[s] : 'All statuses'}</option>`)
      .join('');
    const kindOptions = ['', 'feedback', 'bug', 'falsePositive', 'security']
      .map((k) => `<option value="${k}"${ticketFilter.kind === k ? ' selected' : ''}>${k ? KIND_LABELS[k] : 'All types'}</option>`)
      .join('');

    return `
      <p class="hint-inline"><strong>${data.support?.openCount ?? 0}</strong> open · Portal &amp; extension tickets with auto-captured diagnostics</p>
      <div class="ops-support-grid">
        <div class="ops-card">
          <h3>Platform actions</h3>
          <div class="ops-action-list">
            <button type="button" class="btn btn--sm" id="ops-test-alert">Send test alert</button>
            <button type="button" class="btn btn--ghost btn--sm" id="ops-copy-health">Copy health JSON</button>
            <button type="button" class="btn btn--ghost btn--sm" id="ops-refresh-tickets">Refresh tickets</button>
          </div>
          <p class="hint" id="ops-action-status" style="margin:0.5rem 0 0;min-height:1.2em;"></p>
        </div>
        <div class="ops-card">
          <h3>Quick links</h3>
          <ul class="ops-link-list hint">
            <li><a href="${PORTAL_BASE}/admin.html" target="_blank" rel="noopener">Org admin</a></li>
            <li><a href="${PORTAL_BASE}/feedback.html" target="_blank" rel="noopener">Customer feedback form</a></li>
            <li><a href="${apiBase()}/health" target="_blank" rel="noopener">API health</a></li>
          </ul>
        </div>
        <div class="ops-card">
          <h3>Workflow</h3>
          <ol class="ops-link-list hint" style="padding-left:1.1rem;">
            <li><strong>New</strong> — arrived from portal or extension</li>
            <li><strong>Investigating</strong> — review diagnostics + related events</li>
            <li><strong>Waiting on customer</strong> — need more detail</li>
            <li><strong>Resolved / Closed</strong> — document fix in resolution notes</li>
          </ol>
          ${failedSynth.length ? `<p class="hint" style="margin-top:0.5rem;"><strong>${failedSynth.length}</strong> synthetic check failure(s) — see Overview</p>` : ''}
        </div>
      </div>
      <div class="ops-ticket-layout">
        <div class="ops-ticket-list">
          ${tableCard('Support tickets', ['Ref', 'Created', 'Type', 'Status', 'Source', 'Org', 'Preview'], rows, 7, true, `
            <div class="ops-toolbar">
              <select id="ops-ticket-status" class="ops-filter">${statusOptions}</select>
              <select id="ops-ticket-kind" class="ops-filter">${kindOptions}</select>
              <input type="search" id="ops-ticket-search" class="ops-filter" placeholder="Search ref, message, org…" value="${escapeHtml(ticketFilter.q)}" />
            </div>`)}
        </div>
        <div class="ops-ticket-detail" id="ops-ticket-detail">
          <p class="ops-empty">Select a ticket to investigate.</p>
        </div>
      </div>`;
  }

  function renderTicketDetail(detail, panelsEl) {
    const el = panelsEl.querySelector('#ops-ticket-detail');
    if (!el || !detail?.ticket) return;
    const t = detail.ticket;
    const diag = t.diagnostics || {};
    const diagLines = Object.entries(diag)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
    const related = (detail.relatedEvents || []).map((row) => {
      const at = row.event_at ? new Date(row.event_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`;
    }).join('');

    const statusOptions = Object.keys(STATUS_LABELS)
      .map((s) => `<option value="${s}"${t.status === s ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`)
      .join('');

    el.innerHTML = `
      <div class="ops-card ops-card--detail">
        <div class="ops-card__head">
          <h3><code>${escapeHtml(t.ticketRef)}</code> · ${escapeHtml(KIND_LABELS[t.kind] || t.kind)}</h3>
          <span class="ops-pill ops-pill--${escapeHtml(t.status)}">${escapeHtml(STATUS_LABELS[t.status] || t.status)}</span>
        </div>
        <p class="hint">Created ${escapeHtml(new Date(t.createdAt).toLocaleString())} · Source: <strong>${escapeHtml(t.source)}</strong></p>
        ${t.contactEmail ? `<p class="hint">Contact: <a href="mailto:${escapeHtml(t.contactEmail)}">${escapeHtml(t.contactEmail)}</a></p>` : ''}
        ${t.orgId ? `<p class="hint">Org: <code>${escapeHtml(t.orgId)}</code>${t.orgName ? ` (${escapeHtml(t.orgName)})` : ''} · <a href="${PORTAL_BASE}/admin.html" target="_blank" rel="noopener">Admin</a></p>` : ''}
        <p class="hint">Extension ${escapeHtml(t.extensionVersion || '—')} · ${escapeHtml(t.browser || '—')} · ${escapeHtml(t.profile || '—')} · Host ${escapeHtml(t.pageHost || '—')}</p>

        <h4>Customer message</h4>
        <pre class="ops-message-block">${escapeHtml(t.message)}</pre>

        <h4>Auto-captured diagnostics</h4>
        <table class="data-table data-table--compact"><tbody>${diagLines || '<tr><td colspan="2" class="ops-empty">None</td></tr>'}</tbody></table>

        <h4>Workflow</h4>
        <div class="ops-workflow">
          <label class="field"><span>Status</span>
            <select id="ops-ticket-patch-status">${statusOptions}</select>
          </label>
          <label class="field"><span>Assignee</span>
            <input type="text" id="ops-ticket-patch-assignee" value="${escapeHtml(t.assignee)}" placeholder="name" />
          </label>
        </div>
        <label class="field"><span>Internal ops notes</span>
          <textarea id="ops-ticket-patch-ops-notes" rows="4">${escapeHtml(t.opsNotes)}</textarea>
        </label>
        <label class="field"><span>Resolution (customer-facing summary)</span>
          <textarea id="ops-ticket-patch-resolution" rows="3">${escapeHtml(t.resolutionNotes)}</textarea>
        </label>
        <div class="btn-row">
          <button type="button" class="btn btn--sm" id="ops-ticket-save" data-ticket-ref="${escapeHtml(t.ticketRef)}">Save &amp; update status</button>
          <button type="button" class="btn btn--ghost btn--sm" id="ops-ticket-copy-json">Copy ticket JSON</button>
        </div>
        <p class="hint" id="ops-ticket-save-status"></p>

        <h4>Related ops events (±24h, same version/host)</h4>
        <div class="ops-scroll">
          <table class="data-table"><thead><tr><th>Time</th><th>Kind</th><th>Code</th><th>Message</th></tr></thead>
          <tbody>${related || '<tr><td colspan="4" class="ops-empty">No related events</td></tr>'}</tbody></table>
        </div>
      </div>`;
  }

  async function openTicket(ref, panelsEl) {
    selectedTicketRef = ref;
    const detailEl = panelsEl.querySelector('#ops-ticket-detail');
    if (detailEl) detailEl.innerHTML = '<p class="hint">Loading ticket…</p>';
    try {
      const detail = await fetchTicketDetail(ref);
      renderTicketDetail(detail, panelsEl);
      bindPanelActions(panelsEl);
      panelsEl.querySelectorAll('.ops-ticket-row').forEach((row) => {
        row.classList.toggle('ops-ticket-row--active', row.dataset.ticketRef === ref);
      });
    } catch (error) {
      if (detailEl) detailEl.innerHTML = `<p class="ops-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  async function refreshTicketList(panelsEl) {
    try {
      const data = await fetchTickets();
      ticketList = data.tickets || [];
      const supportPanel = panelsEl.querySelector('#panel-support');
      if (supportPanel && lastSummary) {
        supportPanel.innerHTML = buildSupportPanelHtml(lastSummary);
        bindPanelActions(panelsEl);
        if (selectedTicketRef) await openTicket(selectedTicketRef, panelsEl);
      }
    } catch (error) {
      const statusEl = panelsEl.querySelector('#ops-action-status');
      if (statusEl) statusEl.textContent = error.message || 'Could not load tickets.';
    }
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

    const recentAll = data.recentEvents || [];
    const recentFiltered = filterEvents(recentAll);
    const recent = recentFiltered.map((row) => {
      const at = row.event_at ? new Date(row.event_at).toLocaleString() : '';
      const codeCell = row.kind === 'support_ticket' && row.code
        ? `<code>${escapeHtml(row.code)}</code>`
        : escapeHtml(row.code);
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${codeCell}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`;
    });

    const recentTickets = (data.support?.recentTickets || []).map((t) => {
      const at = t.createdAt ? new Date(t.createdAt).toLocaleString() : '';
      return `<tr class="ops-ticket-row" data-ticket-ref="${escapeHtml(t.ticketRef)}">
        <td><code>${escapeHtml(t.ticketRef)}</code></td>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(KIND_LABELS[t.kind] || t.kind)}</td>
        <td>${escapeHtml(t.orgName || '—')}</td>
      </tr>`;
    });

    return {
      overview: `
        <p class="hint-inline">Last ${data.windowDays} days · ${data.support?.openCount || 0} open ticket(s) · Support tab for full workflow</p>
        <div class="ops-columns">
          ${tableCard('Synthetic checks', ['Target', 'Status', 'HTTP', 'Latency', 'Checked'], synthetic, 5)}
          ${tableCard('Recent support tickets', ['Ref', 'Created', 'Type', 'Org'], recentTickets, 4)}
        </div>
        <div class="ops-columns" style="margin-top:0.85rem">
          ${tableCard('Recent alerts', ['Time', 'Severity', 'Title', 'Sent'], alerts, 4)}
        </div>`,
      support: buildSupportPanelHtml(data),
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
      events: (() => {
        const toolbar = `
          <div class="ops-toolbar">
            <input type="search" id="ops-event-filter" class="ops-filter" placeholder="Filter kind, code, source…" value="${escapeHtml(eventFilter)}" />
            <span class="hint">${recentFiltered.length}/${recentAll.length} shown · filter <code>support_ticket</code> for customer reports</span>
          </div>`;
        return tableCard('Recent ops events', ['Time', 'Kind', 'Code', 'Source', 'Message'], recent, 5, true, toolbar);
      })(),
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
        bindPanelActions(panelsEl);
        if (activeTab === 'support') refreshTicketList(panelsEl);
      });
    });

    bindPanelActions(panelsEl);
    if (activeTab === 'support') refreshTicketList(panelsEl);
  }

  function bindPanelActions(panelsEl) {
    const statusEl = panelsEl.querySelector('#ops-action-status');

    panelsEl.querySelector('#ops-test-alert')?.addEventListener('click', async () => {
      if (statusEl) statusEl.textContent = 'Sending test alert…';
      try {
        const result = await postTestAlert();
        if (statusEl) statusEl.textContent = result.delivered ? 'Test alert delivered.' : 'Test alert queued.';
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || 'Test alert failed.';
      }
    });

    panelsEl.querySelector('#ops-copy-health')?.addEventListener('click', async () => {
      const payload = { health: lastSummary?.health, syntheticChecks: lastSummary?.syntheticChecks, at: new Date().toISOString() };
      await navigator.clipboard?.writeText?.(JSON.stringify(payload, null, 2));
      if (statusEl) statusEl.textContent = 'Health JSON copied.';
    });

    panelsEl.querySelector('#ops-refresh-tickets')?.addEventListener('click', () => refreshTicketList(panelsEl));

    panelsEl.querySelector('#ops-ticket-status')?.addEventListener('change', (e) => {
      ticketFilter.status = e.target.value;
      refreshTicketList(panelsEl);
    });
    panelsEl.querySelector('#ops-ticket-kind')?.addEventListener('change', (e) => {
      ticketFilter.kind = e.target.value;
      refreshTicketList(panelsEl);
    });
    panelsEl.querySelector('#ops-ticket-search')?.addEventListener('input', (e) => {
      ticketFilter.q = e.target.value || '';
      refreshTicketList(panelsEl);
    });

    panelsEl.querySelectorAll('.ops-ticket-row').forEach((row) => {
      row.addEventListener('click', () => openTicket(row.dataset.ticketRef, panelsEl));
    });

    panelsEl.querySelector('#ops-ticket-save')?.addEventListener('click', async () => {
      const ref = panelsEl.querySelector('#ops-ticket-save')?.dataset.ticketRef;
      const saveStatus = panelsEl.querySelector('#ops-ticket-save-status');
      if (!ref) return;
      if (saveStatus) saveStatus.textContent = 'Saving…';
      try {
        await patchTicket(ref, {
          status: panelsEl.querySelector('#ops-ticket-patch-status')?.value,
          assignee: panelsEl.querySelector('#ops-ticket-patch-assignee')?.value,
          opsNotes: panelsEl.querySelector('#ops-ticket-patch-ops-notes')?.value,
          resolutionNotes: panelsEl.querySelector('#ops-ticket-patch-resolution')?.value,
        });
        if (saveStatus) saveStatus.textContent = 'Saved.';
        await refreshTicketList(panelsEl);
        await openTicket(ref, panelsEl);
      } catch (error) {
        if (saveStatus) saveStatus.textContent = error.message || 'Save failed.';
      }
    });

    panelsEl.querySelector('#ops-ticket-copy-json')?.addEventListener('click', async () => {
      const ref = panelsEl.querySelector('#ops-ticket-save')?.dataset.ticketRef;
      if (!ref) return;
      try {
        const detail = await fetchTicketDetail(ref);
        await navigator.clipboard?.writeText?.(JSON.stringify(detail, null, 2));
        const saveStatus = panelsEl.querySelector('#ops-ticket-save-status');
        if (saveStatus) saveStatus.textContent = 'Ticket JSON copied.';
      } catch {
        /* ignore */
      }
    });

    const filterInput = panelsEl.querySelector('#ops-event-filter');
    filterInput?.addEventListener('input', (event) => {
      eventFilter = event.target.value || '';
      if (lastSummary) {
        const panels = buildPanels(lastSummary);
        const eventsPanel = panelsEl.querySelector('#panel-events');
        if (eventsPanel) eventsPanel.innerHTML = panels.events;
        bindPanelActions(panelsEl);
      }
    });
  }

  async function loadSummary(statusEl, kpiEl, tabsEl, panelsEl, daysInput) {
    if (statusEl) statusEl.textContent = 'Loading…';
    try {
      const data = await fetchSummary(Number(daysInput?.value) || 7);
      lastSummary = data;
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

  global.GoldspireOpsDashboard = { init, fetchSummary, postTestAlert };
})(typeof window !== 'undefined' ? window : globalThis);
