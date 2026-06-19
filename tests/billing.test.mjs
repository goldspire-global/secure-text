import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preserveServerBilling } from '../api/src/billing-guard.mjs';
import {
  isEarlyAccess,
  orgBillingState,
  initialBillingSettings,
  platformConfig,
} from '../api/src/billing.mjs';

test('isEarlyAccess respects VEIL_EARLY_ACCESS=false', () => {
  assert.equal(isEarlyAccess({ VEIL_EARLY_ACCESS: 'false' }), false);
});

test('isEarlyAccess ends after VEIL_EARLY_ACCESS_END', () => {
  const env = {
    VEIL_EARLY_ACCESS: 'true',
    VEIL_EARLY_ACCESS_END: '2020-01-01',
  };
  assert.equal(isEarlyAccess(env), false);
});

test('orgBillingState is exempt during early access', () => {
  const state = orgBillingState({ settings: { billing: { status: 'none' } } }, {
    VEIL_EARLY_ACCESS: 'true',
  });
  assert.equal(state.canOperate, true);
  assert.equal(state.earlyAccess, true);
});

test('orgBillingState requires payment after grace', () => {
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const state = orgBillingState(
    { settings: { billing: { status: 'none' } }, created_at: old },
    { VEIL_EARLY_ACCESS: 'false', VEIL_BILLING_GRACE_DAYS: '14' },
  );
  assert.equal(state.canOperate, false);
  assert.equal(state.needsPayment, true);
});

test('orgBillingState blocks past_due', () => {
  const state = orgBillingState(
    { settings: { billing: { status: 'past_due' } }, created_at: new Date().toISOString() },
    { VEIL_EARLY_ACCESS: 'false' },
  );
  assert.equal(state.canOperate, false);
});

test('orgBillingState grandfathers orgs created before early access end', () => {
  const state = orgBillingState(
    { settings: {}, created_at: '2025-01-01T00:00:00.000Z' },
    { VEIL_EARLY_ACCESS: 'false', VEIL_EARLY_ACCESS_END: '2026-01-01' },
  );
  assert.equal(state.canOperate, true);
  assert.equal(state.status, 'exempt');
});

test('orgBillingState active subscription can operate', () => {
  const state = orgBillingState(
    { settings: { billing: { status: 'active' } }, created_at: new Date().toISOString() },
    { VEIL_EARLY_ACCESS: 'false' },
  );
  assert.equal(state.canOperate, true);
});

test('initialBillingSettings uses exempt during early access', () => {
  assert.equal(initialBillingSettings({ VEIL_EARLY_ACCESS: 'true' }).status, 'exempt');
  assert.equal(initialBillingSettings({ VEIL_EARLY_ACCESS: 'false' }).status, 'none');
});

test('platformConfig exposes early access flag', () => {
  const cfg = platformConfig({ VEIL_EARLY_ACCESS: 'true', VEIL_EARLY_ACCESS_END: '2026-12-31' });
  assert.equal(cfg.earlyAccess, true);
  assert.equal(cfg.teamMinSeats, 5);
});

test('preserveServerBilling ignores client billing tampering', () => {
  const current = { policyPackId: 'finance', billing: { status: 'none' } };
  const merged = preserveServerBilling(current, {
    policyPackId: 'healthcare',
    billing: { status: 'active', stripeSubscriptionId: 'sub_fake' },
  });
  assert.equal(merged.policyPackId, 'healthcare');
  assert.equal(merged.billing.status, 'none');
  assert.equal(merged.billing.stripeSubscriptionId, undefined);
});
