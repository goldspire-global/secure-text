(function (global) {
  function supportEmail() {
    return global.GoldspirePortal?.SUPPORT_EMAIL || '';
  }

  function apiBase() {
    return String(global.GoldspirePortal?.API_BASE || '').replace(/\/$/, '');
  }

  const SUBJECTS = {
    feedback: 'Veil feedback',
    bug: 'Veil issue report',
    falsePositive: 'Veil copilot false alert',
  };

  const KIND_LABELS = {
    feedback: 'General feedback',
    bug: 'Report a problem',
    falsePositive: 'Copilot false alert',
  };

  function readParams() {
    const params = new URLSearchParams(global.location.search);
    return {
      version: params.get('v') || params.get('version') || '',
      browser: params.get('browser') || '',
      profile: params.get('profile') || '',
      copilot: params.get('copilot') || '',
      page: params.get('page') || '',
      kind: params.get('kind') || '',
      orgId: params.get('orgId') || '',
      orgName: params.get('orgName') || '',
      policyPackId: params.get('policyPackId') || '',
      dlp: params.get('dlp') || '',
      deviceHint: params.get('deviceHint') || '',
    };
  }

  function detectBrowser() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/Edg\//i.test(ua)) return 'Microsoft Edge';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Chrome\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua)) return 'Safari';
    return 'Web browser';
  }

  function resolveParams(raw) {
    const params = { ...raw };
    if (!params.browser) params.browser = detectBrowser();
    if (!params.profile) {
      const session = global.GoldspirePortalApp?.loadAdminSession?.();
      if (session?.adminToken) {
        params.profile = `Team admin (${session.displayName || session.orgId || 'organization'})`;
        if (!params.orgId && session.orgId) params.orgId = session.orgId;
        if (!params.orgName && session.displayName) params.orgName = session.displayName;
      } else {
        params.profile = 'Portal visitor';
      }
    }
    if (!params.version) {
      params.version = global.GoldspirePortal?.EXTENSION_VERSION
        || global.GoldspirePortal?.PORTAL_VERSION
        || 'portal (no extension context)';
    }
    if (!params.page) {
      const ref = typeof document !== 'undefined' ? document.referrer : '';
      if (ref && /^https?:/i.test(ref)) {
        params.page = ref;
      } else if (typeof global.location !== 'undefined') {
        params.page = `${global.location.origin}${global.location.pathname}`;
      }
    }
    return params;
  }

  function pageHost(pageUrl) {
    if (!pageUrl) return '';
    try {
      return new URL(pageUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  function buildDiagnostics(params) {
    const lines = [
      `Veil version: ${params.version || 'unknown'}`,
      `Browser: ${params.browser || 'unknown'}`,
      `Profile: ${params.profile || 'unknown'}`,
    ];
    if (params.copilot) lines.push(`Copilot: ${params.copilot}`);
    if (params.orgName) lines.push(`Team: ${params.orgName}`);
    if (params.orgId) lines.push(`Org ID: ${params.orgId}`);
    if (params.policyPackId) lines.push(`Policy pack: ${params.policyPackId}`);
    if (params.dlp) lines.push(`DLP enforce: ${params.dlp}`);
    if (params.page) lines.push(`Page: ${params.page}`);
    if (params.deviceHint) lines.push(`Device hint: ${params.deviceHint}`);
    return lines.join('\n');
  }

  function buildBody(message, diagnostics) {
    const parts = [];
    if (message) parts.push(message.trim(), '');
    parts.push('---', 'Diagnostic info (no secrets):', diagnostics, '', 'Describe what happened and what you expected:');
    return parts.join('\n');
  }

  function buildTicketPayload(kind, message, params, contactEmail) {
    const pageUrl = params.page || '';
    return {
      kind: SUBJECTS[kind] ? kind : 'feedback',
      message: String(message || '').trim(),
      source: 'portal',
      contactEmail: String(contactEmail || '').trim(),
      orgId: params.orgId || '',
      orgName: params.orgName || '',
      extensionVersion: params.version || '',
      browser: params.browser || '',
      profile: params.profile || '',
      pageHost: pageHost(pageUrl),
      diagnostics: {
        version: params.version || '',
        browser: params.browser || '',
        profile: params.profile || '',
        copilot: params.copilot === 'on',
        orgName: params.orgName || '',
        orgId: params.orgId || '',
        pageUrl,
        pageHost: pageHost(pageUrl),
        policyPackId: params.policyPackId || '',
        dlpEnabled: params.dlp === 'on',
        deviceHint: params.deviceHint || '',
      },
    };
  }

  async function submitTicket(payload) {
    const base = apiBase();
    if (!base) throw new Error('Support API is not configured.');
    const response = await fetch(`${base}/v1/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || `Could not submit (${response.status}).`);
    }
    return body;
  }

  function init() {
    const form = document.getElementById('feedback-form');
    const kindEl = document.getElementById('feedback-kind');
    const messageEl = document.getElementById('feedback-message');
    const emailEl = document.getElementById('feedback-email');
    const diagEl = document.getElementById('feedback-diagnostics');
    const statusEl = document.getElementById('feedback-status');
    const copyBtn = document.getElementById('feedback-copy');
    const emailBtn = document.getElementById('feedback-email-btn');
    const ticketRefEl = document.getElementById('feedback-ticket-ref');
    if (!form || !kindEl || !messageEl || !diagEl) return;

    const params = resolveParams(readParams());

    function currentDiagnostics() {
      return buildDiagnostics(params);
    }

    diagEl.textContent = currentDiagnostics();

    if (params.kind && SUBJECTS[params.kind]) {
      kindEl.value = params.kind;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const kind = kindEl.value || 'feedback';
      const message = messageEl.value || '';
      if (!message.trim() && kind !== 'feedback') {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.className = 'hint status--error';
          statusEl.textContent = 'Please describe the problem before submitting.';
        }
        return;
      }
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.className = 'hint';
        statusEl.textContent = 'Submitting…';
      }
      try {
        const payload = buildTicketPayload(kind, message, params, emailEl?.value);
        const result = await submitTicket(payload);
        if (ticketRefEl) {
          ticketRefEl.hidden = false;
          ticketRefEl.innerHTML = `Ticket <strong>${result.ticketRef}</strong> created. Our team will follow up${emailEl?.value ? ` at ${emailEl.value}` : ''}.`;
        }
        if (statusEl) {
          statusEl.className = 'hint status--ok';
          statusEl.textContent = 'Submitted — reference saved above. You can also email us if you prefer.';
        }
        form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
      } catch (error) {
        if (statusEl) {
          statusEl.className = 'hint status--error';
          statusEl.textContent = error.message || 'Could not submit ticket.';
        }
      }
    });

    emailBtn?.addEventListener('click', () => {
      const kind = kindEl.value || 'feedback';
      const subject = SUBJECTS[kind] || SUBJECTS.feedback;
      const body = buildBody(messageEl.value, currentDiagnostics());
      const mailto = `mailto:${supportEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      global.location.href = mailto;
    });

    copyBtn?.addEventListener('click', async () => {
      const kind = kindEl.value || 'feedback';
      const subject = SUBJECTS[kind] || SUBJECTS.feedback;
      const text = `To: ${supportEmail()}\nSubject: ${subject}\n\n${buildBody(messageEl.value, currentDiagnostics())}`;
      try {
        await navigator.clipboard.writeText(text);
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.className = 'hint';
          statusEl.textContent = 'Copied — paste into your email client if needed.';
        }
      } catch {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.className = 'hint status--error';
          statusEl.textContent = 'Could not copy — use Submit ticket or Email instead.';
        }
      }
    });
  }

  global.GoldspirePortalFeedback = {
    init,
    buildDiagnostics,
    readParams,
    resolveParams,
    detectBrowser,
    buildTicketPayload,
    submitTicket,
    KIND_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
