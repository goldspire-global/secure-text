/**
 * Rule-based disambiguation — applies intent-config field semantics + structural rules.
 * No inference beyond declared configuration in GoldspireIntentConfig.
 */
(function (global) {
  function cfg() {
    return global.GoldspireIntentConfig?.disambiguation || {};
  }

  function fieldSemantics(context = {}) {
    if (context.fieldSemantics) return context.fieldSemantics;
    return global.GoldspireFieldSemantics?.inferFieldSemantics?.(context) || {
      semantics: [],
      suppressCategories: [],
      preferCategories: [],
      isPersonName: false,
      isGovernmentId: false,
      isPaymentAccount: false,
    };
  }

  function isNameFieldContext(context = {}) {
    if (context.isNameField) return true;
    return fieldSemantics(context).isPersonName;
  }

  function isGovernmentIdFieldContext(context = {}) {
    if (context.isGovernmentIdField) return true;
    return fieldSemantics(context).isGovernmentId;
  }

  function isPaymentFieldContext(context = {}) {
    return fieldSemantics(context).isPaymentAccount;
  }

  function originalSlice(text, hit) {
    const raw = String(hit?.matchedTextRaw || '');
    if (!raw) return '';
    const idx = typeof hit.index === 'number' ? hit.index : String(text || '').indexOf(raw);
    if (idx < 0) return raw;
    return String(text).slice(idx, idx + raw.length);
  }

  function isHighConfidenceSecret(hit) {
    const cat = hit?.category || '';
    const conf = Number(hit.confidence) || 0;
    const bypass = cfg().highConfidenceBypass || {};
    const floor = Number(bypass[cat]);
    return floor > 0 && conf >= floor;
  }

  function looksLikeTypedName(text, hit) {
    const slice = originalSlice(text, hit);
    if (!slice || /\d/.test(slice)) return false;
    const wordRe = new RegExp(cfg().typedLowercaseWord || '^[a-z]+$', 'i');
    return slice === slice.toLowerCase() && wordRe.test(slice);
  }

  function compactText(text) {
    return String(text || '').replace(/\s/g, '').toUpperCase();
  }

  function hasIbanLead(text) {
    return new RegExp(cfg().ibanCountryLead || '^[A-Z]{2}\\d{2}').test(compactText(text));
  }

  function looksLikePpsShape(hit) {
    const ppsRe = new RegExp(cfg().irishPpsShape || '^\\d{7}[A-W]', 'i');
    return ppsRe.test(compactText(hit?.matchedTextRaw || ''));
  }

  function resolveDetections(text, detections = [], context = {}) {
    const input = String(text || '');
    if (!input || !detections.length) return detections;

    const semantics = fieldSemantics(context);
    const govIdField = isGovernmentIdFieldContext(context);
    const paymentField = isPaymentFieldContext(context);
    const ibanLead = hasIbanLead(input);

    let out = detections.filter((hit) => {
      const cat = hit?.category || '';

      if (global.GoldspireFieldSemantics?.shouldSuppressCategory?.(cat, { ...context, fieldSemantics: semantics }, hit)) {
        return false;
      }

      if (cat === 'swift_bic' && looksLikeTypedName(input, hit)) {
        return false;
      }

      if (cat === 'api_key' && looksLikeTypedName(input, hit) && !isHighConfidenceSecret(hit)) {
        return false;
      }

      if (cat === 'iban' && !ibanLead && govIdField) {
        return false;
      }

      if (cat === 'iban' && !ibanLead && looksLikePpsShape(hit)) {
        return false;
      }

      if (cat === 'national_id' && ibanLead && paymentField) {
        return false;
      }

      if (paymentField && cat === 'national_id' && ibanLead) {
        return false;
      }

      return true;
    });

    if (govIdField && !ibanLead) {
      out = out.filter((hit) => hit.category !== 'iban' && hit.category !== 'swift_bic');
    }

    if (paymentField && !govIdField) {
      out = out.filter((hit) => hit.category !== 'national_id' || ibanLead);
    }

    const prefer = semantics.preferCategories || [];
    if (prefer.length) {
      const preferred = out.filter((hit) => prefer.includes(hit.category));
      if (preferred.length) {
        out = preferred.concat(out.filter((hit) => !prefer.includes(hit.category)));
      }
    }

    const hintSettings = context.learningBundle || context.learningHints
      ? global.GoldspireDetectionAmbiguity?.mergedSettings?.({
        learningHints: context.learningHints,
        learningBundle: context.learningBundle,
        ...(context.settings || {}),
      }) || context.settings || {}
      : context.settings || {};
    out = global.GoldspireDetectionAmbiguity?.applyLearningHints?.(input, out, context, hintSettings)
      || out;

    return global.GoldspireDetectionLib?.sortDetections?.(out) || out;
  }

  global.GoldspireDetectionContextResolve = {
    resolveDetections,
    isNameFieldContext,
    isGovernmentIdFieldContext,
    isPaymentFieldContext,
    fieldSemantics,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
