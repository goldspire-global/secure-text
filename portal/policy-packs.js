/**
 * Veil org DLP policy packs — shared by admin portal.
 */
(function (global) {
  const PACKS = Object.freeze({
    observational: {
      id: 'observational',
      label: 'Observational',
      description: 'Copilot suggests actions; no automatic blocks. Good for rollout.',
      dlp: {
        version: 1,
        enabled: false,
        defaultAction: 'warn',
        categories: {},
        aiSurfaces: { defaultAction: 'block', categories: {} },
      },
    },
    finance: {
      id: 'finance',
      label: 'Finance',
      description: 'Block cards, IBANs, routing/SWIFT, tax IDs, and secrets in compose.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          credit_card: { action: 'block', minSeverity: 'medium' },
          bank_account: { action: 'block', minSeverity: 'high' },
          iban: { action: 'block', minSeverity: 'high' },
          routing_number: { action: 'block', minSeverity: 'high' },
          swift_bic: { action: 'block', minSeverity: 'high' },
          tax_id: { action: 'block', minSeverity: 'high' },
          ssn: { action: 'block', minSeverity: 'high' },
          national_id: { action: 'block', minSeverity: 'high' },
          api_key: { action: 'block', minSeverity: 'high' },
          jwt: { action: 'block', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            credit_card: { action: 'block' },
            iban: { action: 'block' },
            tax_id: { action: 'block' },
            api_key: { action: 'block' },
            jwt: { action: 'block' },
          },
        },
      },
    },
    healthcare: {
      id: 'healthcare',
      label: 'Healthcare',
      description: 'HIPAA-oriented: block MRNs, NHS numbers, SSNs, DOB, and payment data.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          medical_record_number: { action: 'block', minSeverity: 'high' },
          nhs_number: { action: 'block', minSeverity: 'high' },
          ssn: { action: 'block', minSeverity: 'high' },
          date_of_birth: { action: 'block', minSeverity: 'high' },
          credit_card: { action: 'block', minSeverity: 'high' },
          national_id: { action: 'block', minSeverity: 'high' },
          passport: { action: 'block', minSeverity: 'high' },
          email: { action: 'warn', minSeverity: 'high' },
          phone: { action: 'warn', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            medical_record_number: { action: 'block' },
            nhs_number: { action: 'block' },
            ssn: { action: 'block' },
            date_of_birth: { action: 'block' },
            credit_card: { action: 'block' },
          },
        },
      },
    },
    gdpr: {
      id: 'gdpr',
      label: 'GDPR / EU privacy',
      description: 'Warn or block personal and financial identifiers common in EU workflows.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          email: { action: 'warn', minSeverity: 'medium' },
          phone: { action: 'warn', minSeverity: 'medium' },
          national_id: { action: 'block', minSeverity: 'high' },
          iban: { action: 'block', minSeverity: 'high' },
          tax_id: { action: 'block', minSeverity: 'high' },
          swift_bic: { action: 'block', minSeverity: 'high' },
          date_of_birth: { action: 'block', minSeverity: 'high' },
          passport: { action: 'block', minSeverity: 'high' },
          api_key: { action: 'block', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            email: { action: 'warn' },
            phone: { action: 'warn' },
            iban: { action: 'block' },
            national_id: { action: 'block' },
            api_key: { action: 'block' },
          },
        },
      },
    },
    engineering: {
      id: 'engineering',
      label: 'Engineering',
      description: 'Block secrets and tokens; warn on internal references.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          api_key: { action: 'block', minSeverity: 'high' },
          jwt: { action: 'block', minSeverity: 'high' },
          password: { action: 'warn', minSeverity: 'medium' },
          internal_company_reference: { action: 'warn', minSeverity: 'medium' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            api_key: { action: 'block' },
            jwt: { action: 'block' },
            password: { action: 'warn' },
          },
        },
      },
    },
  });

  const INDUSTRIES = Object.freeze({
    technology: {
      id: 'technology',
      label: 'Technology / SaaS',
      hint: 'Software, IT, and product teams',
      recommendedPackId: 'engineering',
      starterPackIds: ['engineering', 'observational', 'finance', 'gdpr'],
    },
    finance: {
      id: 'finance',
      label: 'Financial services',
      hint: 'Banking, fintech, accounting, insurance',
      recommendedPackId: 'finance',
      starterPackIds: ['finance', 'observational', 'engineering', 'gdpr'],
    },
    healthcare: {
      id: 'healthcare',
      label: 'Healthcare',
      hint: 'Hospitals, clinics, and health tech',
      recommendedPackId: 'healthcare',
      starterPackIds: ['healthcare', 'observational', 'finance', 'gdpr'],
    },
    eu_privacy: {
      id: 'eu_privacy',
      label: 'EU / privacy-focused',
      hint: 'GDPR-heavy workflows across Europe',
      recommendedPackId: 'gdpr',
      starterPackIds: ['gdpr', 'observational', 'finance', 'engineering'],
    },
    other: {
      id: 'other',
      label: 'Other / mixed',
      hint: 'Start in observational mode — switch when ready',
      recommendedPackId: 'observational',
      starterPackIds: ['observational', 'engineering', 'finance', 'healthcare', 'gdpr'],
    },
  });

  const ACTION_GLOSSARY = Object.freeze({
    allow: 'Detection still runs for audit, but Veil will not warn or block.',
    warn: 'Show the copilot suggestion — the user can proceed or mask.',
    block: 'Prevent paste/send until the sensitive value is removed or masked.',
    auto_mask: 'Replace the detected value with a Veil token automatically.',
  });

  const CATEGORY_GLOSSARY = Object.freeze({
    national_id: 'Government IDs — PPS (Ireland), national insurance, generic national ID patterns.',
    iban: 'International bank account numbers (must start with country code, e.g. IE12…).',
    credit_card: 'Payment card numbers (Luhn-validated).',
    api_key: 'API keys, secrets, and high-entropy tokens.',
    jwt: 'JSON Web Tokens.',
    ssn: 'US Social Security numbers.',
    email: 'Email addresses.',
    phone: 'Phone numbers.',
    swift_bic: 'Bank SWIFT/BIC codes (8–11 uppercase alphanumerics).',
    password: 'Password fields and obvious password-like strings.',
  });

  function buildSampleOverlay(packId) {
    const pack = PACKS[String(packId || '').trim()] || PACKS.engineering;
    const base = pack.dlp || PACKS.observational.dlp;
    return {
      version: 1,
      enabled: true,
      defaultAction: base.defaultAction || 'warn',
      categories: {
        national_id: base.categories?.national_id || { action: 'block', minSeverity: 'high' },
        iban: base.categories?.iban || { action: 'warn', minSeverity: 'high' },
        api_key: base.categories?.api_key || { action: 'block', minSeverity: 'high' },
        jwt: base.categories?.jwt || { action: 'block', minSeverity: 'high' },
        email: { action: 'allow', minSeverity: 'high' },
      },
      aiSurfaces: {
        defaultAction: base.aiSurfaces?.defaultAction || 'block',
        categories: {
          api_key: { action: 'block' },
          jwt: { action: 'block' },
          national_id: { action: 'block' },
          iban: { action: 'block' },
        },
      },
    };
  }

  function policyExplainerHtml() {
    const actions = Object.entries(ACTION_GLOSSARY)
      .map(([key, text]) => `<li><code>${key}</code> — ${text}</li>`)
      .join('');
    return `
      <p class="hint" style="margin:0.35rem 0 0;">
        A <strong>policy pack</strong> is a pre-built rule set (which data types to warn/block, especially in email and AI tools).
        Your <strong>company default</strong> applies to everyone unless they are on a sub-team with its own pack.
        <strong>Custom JSON</strong> below overrides individual categories — you only need keys you want to change.
      </p>
      <details style="margin-top:0.5rem;">
        <summary class="hint" style="cursor:pointer;">What each action means</summary>
        <ul class="hint" style="margin:0.35rem 0 0;padding-left:1.1rem;">${actions}</ul>
      </details>`;
  }

  function normalizeEnabledPackIds(enabledPackIds, { industryId, policyPackId } = {}) {
    const industry = INDUSTRIES[String(industryId || '').trim()] || INDUSTRIES.other;
    const seeds = [
      ...(Array.isArray(enabledPackIds) ? enabledPackIds : []),
      ...industry.starterPackIds,
      industry.recommendedPackId,
      'observational',
      policyPackId,
    ].filter(Boolean);
    return [...new Set(seeds.filter((id) => PACKS[id]))];
  }

  global.GoldspirePolicyPacks = {
    list() {
      return Object.values(PACKS);
    },
    get(id) {
      return PACKS[String(id || '').trim()] || null;
    },
    listIndustries() {
      return Object.values(INDUSTRIES);
    },
    getIndustry(id) {
      return INDUSTRIES[String(id || '').trim()] || INDUSTRIES.other;
    },
    normalizeEnabledPackIds,
    packsForIndustry(industryId) {
      const industry = INDUSTRIES[String(industryId || '').trim()] || INDUSTRIES.other;
      return industry.starterPackIds.map((packId) => PACKS[packId]).filter(Boolean);
    },
    listPacksByIds(packIds) {
      return (packIds || []).map((packId) => PACKS[packId]).filter(Boolean);
    },
    packsForOrg(orgSettings = {}) {
      const ids = normalizeEnabledPackIds(orgSettings.enabledPackIds, {
        industryId: orgSettings.industry,
        policyPackId: orgSettings.policyPackId,
      });
      return ids.map((packId) => PACKS[packId]).filter(Boolean);
    },
    recommendedPackForIndustry(industryId) {
      const industry = INDUSTRIES[String(industryId || '').trim()] || INDUSTRIES.other;
      return PACKS[industry.recommendedPackId] || PACKS.observational;
    },
    actionGlossary() {
      return ACTION_GLOSSARY;
    },
    categoryGlossary() {
      return CATEGORY_GLOSSARY;
    },
    buildSampleOverlay,
    sampleOverlayJson(packId) {
      return JSON.stringify(buildSampleOverlay(packId), null, 2);
    },
    policyExplainerHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
