/**
 * Localized list prices for the pricing page (marketing amounts, not live FX).
 */
(function (global) {
  const LIST_PRICES = {
    USD: { plus: 4.99, plusContact: 1.49, team: 7, enterpriseFrom: 12, locale: 'en-US' },
    EUR: { plus: 4.49, plusContact: 1.29, team: 6, enterpriseFrom: 11, locale: 'de-DE' },
    GBP: { plus: 3.99, plusContact: 1.19, team: 5.5, enterpriseFrom: 10, locale: 'en-GB' },
    AUD: { plus: 7.99, plusContact: 2.29, team: 11, enterpriseFrom: 18, locale: 'en-AU' },
    CAD: { plus: 6.99, plusContact: 1.99, team: 10, enterpriseFrom: 16, locale: 'en-CA' },
    CHF: { plus: 4.49, plusContact: 1.29, team: 6, enterpriseFrom: 11, locale: 'de-CH' },
    SEK: { plus: 49, plusContact: 15, team: 75, enterpriseFrom: 125, locale: 'sv-SE' },
    NOK: { plus: 49, plusContact: 15, team: 75, enterpriseFrom: 125, locale: 'nb-NO' },
    DKK: { plus: 35, plusContact: 11, team: 49, enterpriseFrom: 85, locale: 'da-DK' },
    INR: { plus: 399, plusContact: 119, team: 599, enterpriseFrom: 999, locale: 'en-IN' },
    SGD: { plus: 6.99, plusContact: 1.99, team: 9, enterpriseFrom: 16, locale: 'en-SG' },
    JPY: { plus: 680, plusContact: 198, team: 980, enterpriseFrom: 1680, locale: 'ja-JP' },
  };

  const REGION_CURRENCY = {
    US: 'USD',
    GB: 'GBP',
    IE: 'EUR',
    DE: 'EUR',
    FR: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    NL: 'EUR',
    AT: 'EUR',
    BE: 'EUR',
    PT: 'EUR',
    FI: 'EUR',
    LU: 'EUR',
    AU: 'AUD',
    CA: 'CAD',
    CH: 'CHF',
    SE: 'SEK',
    NO: 'NOK',
    DK: 'DKK',
    IN: 'INR',
    SG: 'SGD',
    JP: 'JPY',
  };

  function detectCurrency() {
    const locale = navigator.language || 'en-US';
    const region = (locale.split('-')[1] || '').toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    if (locale.toLowerCase().startsWith('en-gb')) return 'GBP';
    if (locale.toLowerCase().startsWith('en-au')) return 'AUD';
    if (locale.toLowerCase().startsWith('en-ca')) return 'CAD';
    if (locale.toLowerCase().startsWith('en-in')) return 'INR';
    return 'USD';
  }

  function formatMoney(amount, currency, locale) {
    const decimals = currency === 'JPY' ? 0 : (amount % 1 ? 2 : 0);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }

  function priceRow(currency) {
    return LIST_PRICES[currency] || LIST_PRICES.USD;
  }

  function apply() {
    const currency = detectCurrency();
    const row = priceRow(currency);
    const locale = navigator.language || row.locale;
    const teamMonthly = row.team;
    const teamAnnual = teamMonthly * 12;
    const usd = LIST_PRICES.USD;

    const teamEl = document.querySelector('[data-price-team]');
    const plusEl = document.querySelector('[data-price-plus]');
    const enterpriseEl = document.querySelector('[data-price-enterprise]');
    const noteEl = document.querySelector('[data-price-currency-note]');

    if (plusEl) {
      plusEl.innerHTML = `${formatMoney(row.plus, currency, locale)} <span class="price-card__unit">/ mo</span>`;
    }
    document.querySelectorAll('[data-local-price="plus-monthly"]').forEach((el) => {
      el.textContent = formatMoney(row.plus, currency, locale);
    });
    document.querySelectorAll('[data-local-price="plus-contact-addon"]').forEach((el) => {
      el.textContent = formatMoney(row.plusContact, currency, locale);
    });

    if (teamEl) {
      teamEl.innerHTML = `${formatMoney(teamMonthly, currency, locale)} <span class="price-card__unit">/ user / mo</span>`;
    }
    if (enterpriseEl) {
      enterpriseEl.textContent = `From ${formatMoney(row.enterpriseFrom, currency, locale)} / user / mo at 100+ seats (annual billing)`;
    }

    document.querySelectorAll('[data-local-price="team-annual"]').forEach((el) => {
      el.textContent = `${formatMoney(teamAnnual, currency, locale)} / user / year`;
    });
    document.querySelectorAll('[data-local-price="team-monthly"]').forEach((el) => {
      el.textContent = `${formatMoney(teamMonthly, currency, locale)} / user / mo`;
    });
    document.querySelectorAll('[data-local-price="team-annual-equiv"]').forEach((el) => {
      el.textContent = `${formatMoney(teamAnnual, currency, locale)} / user / year (${formatMoney(teamMonthly, currency, locale)} / mo)`;
    });
    document.querySelectorAll('[data-local-price="billing-line"]').forEach((el) => {
      el.innerHTML = `<strong>${formatMoney(teamAnnual, currency, locale)} / user / year</strong> (min. 5 seats), billed annually through Stripe.`;
    });

    if (noteEl && currency !== 'USD') {
      const usdAnnual = usd.team * 12;
      noteEl.textContent = `Prices in ${currency} for your region. USD list: ${formatMoney(usd.team, 'USD', 'en-US')} / user / mo (${formatMoney(usdAnnual, 'USD', 'en-US')} / year, min. 5 seats).`;
      noteEl.hidden = false;
    } else if (noteEl) {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }
  }

  global.GoldspirePricing = { apply, detectCurrency, formatMoney, priceRow };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
