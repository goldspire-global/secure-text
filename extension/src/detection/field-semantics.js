/**
 * Field semantics — maps labels/autocomplete to expected data types.
 * Shared by intent inference and context-resolve (not hardcoded per detector).
 */
(function (global) {
  const SEMANTICS = Object.freeze([
    {
      id: 'person_name',
      labelPatterns: [
        /\b(first|last|full|given|family|sur|middle|maiden|student)\s*name\b/i,
      ],
      autocomplete: new Set(['name', 'given-name', 'family-name', 'nickname', 'additional-name']),
      suppressCategories: new Set([
        'api_key', 'jwt', 'swift_bic', 'iban', 'credit_card', 'routing_number',
        'phone', 'email', 'customer_id', 'internal_company_reference',
      ]),
      preferCategories: new Set(),
    },
    {
      id: 'government_id',
      labelPatterns: [
        /\b(pps|personal public service|national id|national insurance|nino|social security|ssn|student id)\b/i,
      ],
      autocomplete: new Set(['off']),
      suppressCategories: new Set(['iban', 'swift_bic', 'api_key', 'jwt', 'credit_card']),
      preferCategories: new Set(['national_id', 'ssn', 'tax_id']),
    },
    {
      id: 'payment_account',
      labelPatterns: [
        /\b(iban|bank account|account number|sort code|routing|swift|bic|payment reference)\b/i,
      ],
      autocomplete: new Set(['cc-number', 'cc-name']),
      suppressCategories: new Set(['national_id', 'ssn']),
      preferCategories: new Set(['iban', 'bank_account', 'routing_number', 'swift_bic', 'credit_card']),
    },
    {
      id: 'contact',
      labelPatterns: [/\b(e-?mail|phone|mobile|tel)\b/i],
      autocomplete: new Set(['email', 'tel']),
      suppressCategories: new Set(['api_key', 'jwt', 'swift_bic']),
      preferCategories: new Set(['email', 'phone']),
    },
    {
      id: 'secret_credential',
      labelPatterns: [/\b(api key|token|secret|password|passphrase|credential)\b/i],
      autocomplete: new Set(['new-password', 'current-password']),
      suppressCategories: new Set(['iban', 'national_id', 'phone', 'email']),
      preferCategories: new Set(['api_key', 'jwt', 'password']),
    },
  ]);

  function fieldTextFromContext(context = {}) {
    return `${context.fieldLabel || ''} ${context.fieldPlaceholder || ''} ${context.fieldName || ''} ${context.fieldId || ''}`.trim();
  }

  function inferFieldSemantics(context = {}) {
    const text = fieldTextFromContext(context);
    const auto = String(context.autocomplete || context.fieldAutocomplete || '').toLowerCase();
    const matched = [];
    const suppress = new Set();
    const prefer = new Set();

    for (const rule of SEMANTICS) {
      const labelHit = rule.labelPatterns.some((re) => re.test(text));
      const autoHit = auto && rule.autocomplete.has(auto);
      if (!labelHit && !autoHit) continue;
      matched.push(rule.id);
      for (const cat of rule.suppressCategories) suppress.add(cat);
      for (const cat of rule.preferCategories) prefer.add(cat);
    }

    return {
      semantics: matched,
      suppressCategories: [...suppress],
      preferCategories: [...prefer],
      isPersonName: matched.includes('person_name'),
      isGovernmentId: matched.includes('government_id'),
      isPaymentAccount: matched.includes('payment_account'),
    };
  }

  global.GoldspireFieldSemantics = {
    SEMANTICS,
    inferFieldSemantics,
    fieldTextFromContext,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
