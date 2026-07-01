/**
 * Veil Plus capability checks.
 */
(function (global) {
  function hasPersonalAccount(settings) {
    return Boolean(String(settings?.personalAccountId || '').trim());
  }

  function isPlusActive(settings) {
    return settings?.personalPlusActive === true && hasPersonalAccount(settings);
  }

  function canUseDirectShare(settings) {
    if (settings?.securityProfile === 'organization') return false;
    return isPlusActive(settings)
      && settings?.personalEmailVerified === true
      && Boolean(global.GoldspireConstants?.ORG_API_BASE);
  }

  function canReceivePlusShares(settings) {
    if (settings?.securityProfile === 'organization') return false;
    return hasPersonalAccount(settings)
      && settings?.personalEmailVerified === true
      && Boolean(String(settings?.personalEmail || '').trim())
      && Boolean(global.GoldspireConstants?.ORG_API_BASE);
  }

  function canUseMagicLinks(settings) {
    return canUseDirectShare(settings);
  }

  function directShareLabel() {
    return 'Trusted contact';
  }

  global.GoldspirePersonalCapability = {
    hasPersonalAccount,
    isPlusActive,
    canUseDirectShare,
    canReceivePlusShares,
    canUseMagicLinks,
    directShareLabel,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
