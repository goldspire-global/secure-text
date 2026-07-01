import { createHash, randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { billingEnv } from './billing.mjs';
import {
  assertPersonalEmailDomainResolvable,
  assertPersonalEmailFormat,
} from './personal-email-validation.mjs';
import {
  isEmailVerified,
  assertEmailVerified,
  maybeAutoVerifyForDev,
  sendPersonalVerificationEmail,
} from './personal-verification-service.mjs';

export const PLUS_INCLUDED_CONTACTS = () => {
  const n = Number(billingEnv().VEIL_PLUS_INCLUDED_CONTACTS ?? billingEnv().VEIL_PLUS_CONTACT_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
};

/** @deprecated use PLUS_INCLUDED_CONTACTS */
export const PLUS_CONTACT_LIMIT = PLUS_INCLUDED_CONTACTS;

export function effectiveContactLimit(account) {
  const included = PLUS_INCLUDED_CONTACTS();
  const extra = Math.max(0, Number(account?.extra_contact_slots) || 0);
  return included + extra;
}

export function contactSlotsPayload(account) {
  const includedContacts = PLUS_INCLUDED_CONTACTS();
  const extraContactSlots = Math.max(0, Number(account?.extra_contact_slots) || 0);
  return {
    includedContacts,
    extraContactSlots,
    contactLimit: includedContacts + extraContactSlots,
  };
}

export { isEmailVerified, assertEmailVerified } from './personal-verification-service.mjs';

export function normalizePersonalEmail(value) {
  return assertPersonalEmailFormat(String(value || '').trim().toLowerCase());
}

function newAccountId() {
  return `pa_${randomBytes(8).toString('hex')}`;
}

function newProvisionToken() {
  return `ppt_${randomBytes(24).toString('base64url')}`;
}

export async function authenticatePersonalRequest(token, deviceId) {
  const bearer = String(token || '').trim();
  const device = String(deviceId || '').trim();
  if (!bearer) throw httpError(401, 'Missing personal provision token.');
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM personal_accounts WHERE provision_token = $1 AND owner_device_id = $2`,
    [bearer, device],
  );
  if (result.rowCount === 0) throw httpError(401, 'Invalid personal token.');
  return result.rows[0];
}

export function isPlusActive(account) {
  return account?.plus_status === 'active';
}

export function assertPlusActive(account) {
  if (!isPlusActive(account)) {
    throw httpError(402, 'Veil Plus is required for this feature.');
  }
}

export async function registerPersonalAccount(deviceId, body = {}) {
  const device = String(deviceId || '').trim();
  const email = assertPersonalEmailFormat(body.email);
  await assertPersonalEmailDomainResolvable(email);
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const existing = await pool.query(
    `SELECT * FROM personal_accounts WHERE owner_device_id = $1`,
    [device],
  );
  let row;
  let provisionToken = '';

  if (existing.rowCount > 0) {
    row = existing.rows[0];
    provisionToken = row.provision_token;
    if (row.owner_email !== email) {
      const updated = await pool.query(
        `UPDATE personal_accounts SET
           owner_email = $2,
           email_verified_at = NULL,
           email_verify_token_hash = NULL,
           email_verify_sent_at = NULL,
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [row.id, email],
      );
      row = updated.rows[0];
    }
  } else {
    const id = newAccountId();
    provisionToken = newProvisionToken();
    const insert = await pool.query(
      `INSERT INTO personal_accounts (id, owner_email, owner_device_id, provision_token)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, email, device, provisionToken],
    );
    row = insert.rows[0];
  }

  await maybeAutoVerifyForDev(row.id);
  const refreshed = await pool.query(`SELECT * FROM personal_accounts WHERE id = $1`, [row.id]);
  row = refreshed.rows[0];

  const account = publicAccount(row, provisionToken);
  let verification = null;
  if (!isEmailVerified(row)) {
    try {
      verification = await sendPersonalVerificationEmail(provisionToken, device);
    } catch (error) {
      verification = {
        ok: false,
        error: error?.message || 'Could not send verification email.',
      };
    }
  }
  return { ...account, verification };
}

function publicAccount(row, provisionToken = '') {
  const slots = contactSlotsPayload(row);
  return {
    accountId: row.id,
    email: row.owner_email,
    emailVerified: isEmailVerified(row),
    plusActive: isPlusActive(row),
    plusStatus: row.plus_status,
    ...slots,
    provisionToken: provisionToken || undefined,
  };
}

export async function getPersonalStatus(token, deviceId) {
  const account = await authenticatePersonalRequest(token, deviceId);
  const pool = getPool();
  const contacts = await pool.query(
    `SELECT COUNT(*)::int AS count FROM personal_contacts WHERE account_id = $1 AND active = true`,
    [account.id],
  );
  const pendingShares = await pool.query(
    `SELECT COUNT(*)::int AS count FROM personal_pending_unlocks
     WHERE lower(recipient_email) = lower($1)
       AND claimed_at IS NULL
       AND expires_at > now()`,
    [account.owner_email],
  );
  return {
    ...publicAccount(account),
    contactCount: contacts.rows[0]?.count || 0,
    pendingShareCount: pendingShares.rows[0]?.count || 0,
  };
}

export async function activatePersonalPlus(accountId, patch = {}) {
  const pool = getPool();
  await pool.query(
    `UPDATE personal_accounts SET
       plus_status = $2,
       stripe_customer_id = COALESCE(NULLIF($3, ''), stripe_customer_id),
       stripe_subscription_id = COALESCE(NULLIF($4, ''), stripe_subscription_id),
       updated_at = now()
     WHERE id = $1`,
    [
      accountId,
      patch.status || 'active',
      patch.stripeCustomerId || '',
      patch.stripeSubscriptionId || '',
    ],
  );
}

export async function findPersonalAccountBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const pool = getPool();
  const result = await pool.query(
    `SELECT id FROM personal_accounts WHERE stripe_subscription_id = $1 LIMIT 1`,
    [String(subscriptionId)],
  );
  return result.rows[0]?.id || null;
}

function validatePublicKeyJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') throw httpError(400, 'publicKeyJwk is required.');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw httpError(400, 'publicKeyJwk must be a P-256 EC key.');
  }
}

export async function listPersonalContacts(token, deviceId) {
  const account = await authenticatePersonalRequest(token, deviceId);
  const pool = getPool();
  const result = await pool.query(
    `SELECT email, display_name, public_key_jwk, (device_id IS NOT NULL AND public_key_jwk IS NOT NULL) AS registered
     FROM personal_contacts
     WHERE account_id = $1 AND active = true
     ORDER BY email
     LIMIT 100`,
    [account.id],
  );
  return {
    selfEmail: account.owner_email,
    ...contactSlotsPayload(account),
    plusActive: isPlusActive(account),
    contacts: result.rows.map((row) => ({
      email: row.email,
      displayName: row.display_name || '',
      registered: row.registered,
      publicKeyJwk: row.public_key_jwk || null,
    })),
  };
}

export async function addPersonalContact(token, deviceId, body = {}) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertPlusActive(account);
  assertEmailVerified(account);

  const email = normalizePersonalEmail(body.email);
  if (email === account.owner_email) throw httpError(400, 'You cannot add yourself as a contact.');

  const pool = getPool();
  const count = await pool.query(
    `SELECT COUNT(*)::int AS count FROM personal_contacts WHERE account_id = $1 AND active = true`,
    [account.id],
  );
  const currentCount = count.rows[0]?.count || 0;
  const limit = effectiveContactLimit(account);
  if (currentCount >= limit) {
    const included = PLUS_INCLUDED_CONTACTS();
    const extra = Math.max(0, Number(account.extra_contact_slots) || 0);
    if (extra === 0 && currentCount >= included) {
      throw httpError(402, 'All included contact slots are in use. Add a contact slot or set up a Team plan.');
    }
    throw httpError(402, `Contact limit reached (${limit}). Add another slot or remove a contact.`);
  }

  await pool.query(
    `INSERT INTO personal_contacts (account_id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id, email) DO UPDATE SET
       active = true,
       display_name = COALESCE(EXCLUDED.display_name, personal_contacts.display_name),
       updated_at = now()`,
    [account.id, email, String(body.displayName || '').trim() || null],
  );

  return { ok: true, email };
}

export async function registerPersonalContact(token, deviceId, body = {}) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertEmailVerified(account);
  const email = normalizePersonalEmail(body.email || account.owner_email);
  if (email !== account.owner_email) {
    throw httpError(400, 'Registered email must match your verified Veil email.');
  }
  validatePublicKeyJwk(body.publicKeyJwk);

  const pool = getPool();
  await pool.query(
    `INSERT INTO personal_contacts (account_id, email, display_name, public_key_jwk, device_id, active)
     VALUES ($1, $2, $3, $4::jsonb, $5, true)
     ON CONFLICT (account_id, email) DO UPDATE SET
       public_key_jwk = EXCLUDED.public_key_jwk,
       device_id = EXCLUDED.device_id,
       active = true,
       updated_at = now()`,
    [
      account.id,
      email,
      String(body.displayName || '').trim() || null,
      JSON.stringify(body.publicKeyJwk),
      deviceId,
    ],
  );

  // Link this device to every sender who added this email as a trusted contact.
  await pool.query(
    `UPDATE personal_contacts SET
       public_key_jwk = $1::jsonb,
       device_id = $2,
       updated_at = now()
     WHERE lower(email) = $3 AND account_id <> $4 AND active = true`,
    [JSON.stringify(body.publicKeyJwk), deviceId, email, account.id],
  );

  return { ok: true, email };
}

export function personalInboxKey(accountId, recipientEmail) {
  const pepper = process.env.ORG_INBOX_ENC_KEY || process.env.DATABASE_URL || 'goldspire-inbox-dev-key';
  return createHash('sha256').update(`${pepper}:personal:${accountId}:${recipientEmail}`, 'utf8').digest();
}

export function hashClaimToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export async function syncPersonalContactSlotsFromStripe(accountId, subscription) {
  const env = billingEnv();
  const addonPriceId = String(env.STRIPE_PRICE_ID_PLUS_CONTACT_MONTHLY || '').trim();
  let extra = 0;
  if (addonPriceId && subscription?.items?.data) {
    for (const item of subscription.items.data) {
      if (item.price?.id === addonPriceId) {
        extra += Math.max(0, Number(item.quantity) || 0);
      }
    }
  }
  const pool = getPool();
  await pool.query(
    `UPDATE personal_accounts SET extra_contact_slots = $2, updated_at = now() WHERE id = $1`,
    [accountId, extra],
  );
  const row = { extra_contact_slots: extra };
  return contactSlotsPayload(row);
}
