/**
 * Portal billing helpers — early access banner and Stripe payment links.
 */
(function (global) {
  function config() {
    return global.GoldspirePortal || {};
  }

  function isEarlyAccess() {
    return config().EARLY_ACCESS !== false && String(config().EARLY_ACCESS) !== 'false';
  }

  function teamPaymentLink() {
    return String(config().STRIPE_PAYMENT_LINK_TEAM || '').trim();
  }

  function billingPortalUrl() {
    return String(config().STRIPE_BILLING_PORTAL_URL || '').trim();
  }

  function renderEarlyAccessBanner(container) {
    if (!container || !isEarlyAccess()) return;
    container.innerHTML = `
      <div class="banner banner--success" role="status">
        <strong>Early access — no payment required.</strong>
        Create your team free while we’re in review. List prices apply at general availability;
        we’ll email admins before any charge.
      </div>
    `;
    container.hidden = false;
  }

  function renderBillingStatus(container) {
    if (!container) return;
    const link = teamPaymentLink();
    const portal = billingPortalUrl();
    const sales = String(config().SALES_EMAIL || '').trim();
    const support = String(config().SUPPORT_EMAIL || '').trim();
    const salesLine = sales
      ? `<li>Enterprise volume pricing from 100+ seats — contact <a href="mailto:${sales}">${sales}</a>.</li>`
      : '<li>Enterprise volume pricing from 100+ seats — contact sales.</li>';

    if (isEarlyAccess()) {
      container.innerHTML = `
        <p class="lede"><strong>Early access</strong> — your team cloud is free. No card on file.</p>
        <ul class="trust-list">
          <li>Team list price: <strong>$7 / user / month</strong>, billed annually ($84 / user / year), minimum 5 seats.</li>
          ${salesLine}
          <li>We’ll notify you before billing starts at general availability.</li>
        </ul>
        ${link ? `<p class="hint">Optional: <a href="${link}" rel="noopener noreferrer" target="_blank">Preview Team checkout</a> (for procurement / finance review only).</p>` : ''}
      `;
      return;
    }

    if (link) {
      container.innerHTML = `
        <p class="lede">Subscribe to Veil Team cloud for admin, policy packs, and token storage.</p>
        <div class="btn-row">
          <a class="btn btn--sm" href="${link}" rel="noopener noreferrer" target="_blank">Subscribe / manage seats</a>
          ${portal ? `<a class="btn btn--ghost btn--sm" href="${portal}" rel="noopener noreferrer" target="_blank">Billing portal</a>` : ''}
        </div>
        <p class="hint">$7 / user / month, billed annually ($84 / user / year). Minimum 5 seats.</p>
      `;
      return;
    }

    container.innerHTML = support
      ? `<p class="hint">Billing is not configured. Contact <a href="mailto:${support}">${support}</a>.</p>`
      : '<p class="hint">Billing is not configured. Contact support via Feedback.</p>';
  }

  global.GoldspireBilling = {
    isEarlyAccess,
    teamPaymentLink,
    billingPortalUrl,
    renderEarlyAccessBanner,
    renderBillingStatus,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
