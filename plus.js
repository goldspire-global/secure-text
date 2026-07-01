/**
 * Veil Plus landing — checkout return states.
 */
(function (global) {
  function init() {
    const params = new URLSearchParams(window.location.search);
    const banner = document.getElementById('plus-banner');
    if (!banner) return;

    if (params.get('plus') === 'success') {
      banner.hidden = false;
      banner.innerHTML = '<strong>Welcome to Veil Plus.</strong> Open the extension → Settings → Veil Plus to add trusted contacts.';
    } else if (params.get('plus') === 'cancel') {
      banner.hidden = false;
      banner.textContent = 'Checkout cancelled — you can upgrade anytime from the extension settings.';
    }

    const plusPrice = document.querySelector('[data-price-plus]');
    if (plusPrice && global.GoldspirePricing?.formatMoney) {
      const currency = global.GoldspirePricing.detectCurrency?.() || 'USD';
      const row = global.GoldspirePricing.priceRow?.(currency) || { plus: 4.99, locale: 'en-US' };
      plusPrice.textContent = `${global.GoldspirePricing.formatMoney(row.plus, currency, row.locale)} / month · cancel anytime`;
    }
  }

  global.GoldspirePlusPage = { init };
})(typeof globalThis !== 'undefined' ? globalThis : self);
