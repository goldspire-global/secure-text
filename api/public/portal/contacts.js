/**
 * Inject contact emails from GoldspirePortal config into static pages.
 */
(function (global) {
  function contactMap() {
    const cfg = global.GoldspirePortal || {};
    return {
      support: cfg.SUPPORT_EMAIL || '',
      security: cfg.SECURITY_EMAIL || '',
      privacy: cfg.PRIVACY_EMAIL || '',
      sales: cfg.SALES_EMAIL || '',
      legal: cfg.LEGAL_EMAIL || '',
    };
  }

  function applyContactEmails() {
    const map = contactMap();
    document.querySelectorAll('[data-contact]').forEach((el) => {
      const key = el.getAttribute('data-contact');
      const email = map[key];
      if (!email) return;
      if (el.tagName === 'A') {
        el.href = `mailto:${email}`;
        if (!el.textContent.trim() || el.textContent === el.getAttribute('data-placeholder')) {
          el.textContent = email;
        }
      } else {
        el.textContent = email;
      }
    });
    document.querySelectorAll('[data-contact-href="sales"]').forEach((el) => {
      const email = map.sales;
      if (!email) return;
      const subject = el.getAttribute('data-mail-subject') || 'Veil inquiry';
      el.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
    });
  }

  global.GoldspirePortalContacts = { applyContactEmails, contactMap };
})(typeof window !== 'undefined' ? window : globalThis);
