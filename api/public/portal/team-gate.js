/**
 * Team creation is gated through pricing so admins see billing before provisioning.
 */
(function (global) {
  const ACK_KEY = 'veil_team_billing_ack';

  function rememberBillingAck() {
    const params = new URLSearchParams(global.location.search);
    if (params.get('billing') !== '1') return false;
    try {
      sessionStorage.setItem(ACK_KEY, '1');
    } catch {
      /* ignore */
    }
    return true;
  }

  function hasBillingAck() {
    if (rememberBillingAck()) return true;
    try {
      return sessionStorage.getItem(ACK_KEY) === '1';
    } catch {
      return false;
    }
  }

  function gateCreatePage() {
    if (hasBillingAck()) return;
    global.location.replace('pricing.html#team');
  }

  function createTeamHref() {
    return 'create.html?billing=1';
  }

  function pricingTeamHref() {
    return 'pricing.html#team';
  }

  global.GoldspireTeamGate = {
    gateCreatePage,
    createTeamHref,
    pricingTeamHref,
    hasBillingAck,
  };
})(typeof window !== 'undefined' ? window : globalThis);
