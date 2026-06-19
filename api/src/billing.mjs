import { loadEnv } from '../../scripts/load-env.mjs';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';

const GRACE_DAYS_DEFAULT = 14;

let cachedEnv = null;

export function billingEnv() {
  if (!cachedEnv) cachedEnv = loadEnv();
  return cachedEnv;
}

export function earlyAccessEndMs(env = billingEnv()) {
  const raw = String(env.VEIL_EARLY_ACCESS_END || '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isEarlyAccess(env = billingEnv()) {
  if (String(env.VEIL_EARLY_ACCESS ?? 'true').toLowerCase() === 'false') return false;
  const end = earlyAccessEndMs(env);
  if (end != null && Date.now() >= end) return false;
  return true;
}

export function graceDays(env = billingEnv()) {
  const n = Number(env.VEIL_BILLING_GRACE_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : GRACE_DAYS_DEFAULT;
}

function parseBilling(settings = {}) {
  const billing = settings?.billing && typeof settings.billing === 'object' ? settings.billing : {};
  return {
    status: String(billing.status || 'none'),
    stripeCustomerId: String(billing.stripeCustomerId || ''),
    stripeSubscriptionId: String(billing.stripeSubscriptionId || ''),
    updatedAt: billing.updatedAt || null,
  };
}

export function orgBillingState(org, env = billingEnv()) {
  const settings = typeof org?.settings === 'object' && org.settings ? org.settings : {};
  const createdAt = org?.created_at || org?.createdAt || null;
  const billing = parseBilling(settings);

  if (isEarlyAccess(env)) {
    return {
      phase: 'early',
      status: 'exempt',
      canOperate: true,
      needsPayment: false,
      earlyAccess: true,
    };
  }

  if (billing.status === 'active') {
    return {
      phase: 'paid',
      status: 'active',
      canOperate: true,
      needsPayment: false,
      earlyAccess: false,
    };
  }

  if (billing.status === 'exempt') {
    return {
      phase: 'paid',
      status: 'exempt',
      canOperate: true,
      needsPayment: false,
      earlyAccess: false,
    };
  }

  const eaEnd = earlyAccessEndMs(env);
  if (createdAt && eaEnd && billing.status === 'none') {
    const createdMs = new Date(createdAt).getTime();
    if (Number.isFinite(createdMs) && createdMs < eaEnd) {
      return {
        phase: 'paid',
        status: 'exempt',
        canOperate: true,
        needsPayment: false,
        earlyAccess: false,
      };
    }
  }

  const graceMs = graceDays(env) * 24 * 60 * 60 * 1000;
  if (billing.status === 'none' && createdAt) {
    const age = Date.now() - new Date(createdAt).getTime();
    if (age >= 0 && age < graceMs) {
      return {
        phase: 'grace',
        status: 'grace',
        canOperate: true,
        needsPayment: true,
        earlyAccess: false,
        graceEndsAt: new Date(new Date(createdAt).getTime() + graceMs).toISOString(),
      };
    }
  }

  return {
    phase: 'paid',
    status: billing.status === 'past_due' ? 'past_due' : 'none',
    canOperate: false,
    needsPayment: true,
    earlyAccess: false,
    message: 'Team subscription required. Sign in to Admin → Overview → Billing to subscribe.',
  };
}

export function initialBillingSettings(env = billingEnv()) {
  return {
    status: isEarlyAccess(env) ? 'exempt' : 'none',
    updatedAt: new Date().toISOString(),
  };
}

export function publicBillingSummary(org, env = billingEnv()) {
  const state = orgBillingState(org, env);
  const billing = parseBilling(org?.settings);
  return {
    earlyAccess: state.earlyAccess,
    phase: state.phase,
    status: state.status,
    canOperate: state.canOperate,
    needsPayment: state.needsPayment,
    graceEndsAt: state.graceEndsAt || null,
    stripeConfigured: Boolean(billing.stripeSubscriptionId),
  };
}

export function assertOrgCanOperate(org, env = billingEnv()) {
  const state = orgBillingState(org, env);
  if (state.canOperate) return state;
  throw httpError(402, state.message || 'Team subscription required.');
}

export function platformConfig(env = billingEnv()) {
  return {
    earlyAccess: isEarlyAccess(env),
    earlyAccessEnd: String(env.VEIL_EARLY_ACCESS_END || '').trim() || null,
    billingGraceDays: graceDays(env),
    teamPriceAnnualUsd: 84,
    teamMinSeats: 5,
  };
}

export async function activateOrgBilling(orgId, patch = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT settings FROM organizations WHERE id = $1`,
    [orgId],
  );
  if (result.rowCount === 0) return null;

  const current = typeof result.rows[0].settings === 'object' && result.rows[0].settings
    ? result.rows[0].settings
    : {};
  const prev = parseBilling(current);
  const billing = {
    ...prev,
    status: patch.status || 'active',
    stripeCustomerId: patch.stripeCustomerId || prev.stripeCustomerId,
    stripeSubscriptionId: patch.stripeSubscriptionId || prev.stripeSubscriptionId,
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `UPDATE organizations
     SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{billing}', $2::jsonb, true),
         updated_at = now()
     WHERE id = $1`,
    [orgId, JSON.stringify(billing)],
  );
  return billing;
}

export async function findOrgIdByAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const pool = getPool();
  const result = await pool.query(
    `SELECT id FROM organizations WHERE LOWER(admin_email) = $1 ORDER BY created_at DESC LIMIT 1`,
    [normalized],
  );
  return result.rows[0]?.id || null;
}
