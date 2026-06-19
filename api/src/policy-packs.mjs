/** Veil DLP policy packs — server-side catalog (mirrors portal/policy-packs.js). */

export const POLICY_PACKS = Object.freeze({
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
    packIds: ['engineering', 'observational'],
  },
  finance: {
    id: 'finance',
    label: 'Financial services',
    hint: 'Banking, fintech, accounting, insurance',
    recommendedPackId: 'finance',
    packIds: ['finance', 'observational'],
  },
  healthcare: {
    id: 'healthcare',
    label: 'Healthcare',
    hint: 'Hospitals, clinics, and health tech',
    recommendedPackId: 'healthcare',
    packIds: ['healthcare', 'observational'],
  },
  eu_privacy: {
    id: 'eu_privacy',
    label: 'EU / privacy-focused',
    hint: 'GDPR-heavy workflows across Europe',
    recommendedPackId: 'gdpr',
    packIds: ['gdpr', 'observational'],
  },
  other: {
    id: 'other',
    label: 'Other / mixed',
    hint: 'Start in observational mode — switch when ready',
    recommendedPackId: 'observational',
    packIds: ['observational', 'engineering', 'gdpr'],
  },
});

export function listIndustries() {
  return Object.values(INDUSTRIES);
}

export function getIndustry(id) {
  return INDUSTRIES[String(id || '').trim()] || INDUSTRIES.other;
}

export function packsForIndustry(industryId) {
  const industry = getIndustry(industryId);
  return industry.packIds.map((packId) => getPolicyPack(packId)).filter(Boolean);
}

export function resolveIndustrySettings(industryId) {
  const industry = getIndustry(industryId);
  const pack = getPolicyPack(industry.recommendedPackId);
  if (!pack) {
    return { industry: industry.id, policyPackId: 'observational', dlp: POLICY_PACKS.observational.dlp };
  }
  return {
    industry: industry.id,
    policyPackId: pack.id,
    dlp: pack.dlp,
  };
}

export function listPolicyPacks() {
  return Object.values(POLICY_PACKS);
}

export function getPolicyPack(id) {
  return POLICY_PACKS[String(id || '').trim()] || null;
}
