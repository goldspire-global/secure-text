import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { getActiveLearningHints } from './learning-service.mjs';

function bundleSecret(env = {}) {
  return String(env.LEARNING_BUNDLE_SECRET || process.env.LEARNING_BUNDLE_SECRET || '').trim();
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function signBundlePayload(payload, env = {}) {
  const secret = bundleSecret(env);
  if (!secret) throw httpError(503, 'Learning bundle signing is not configured.');
  const body = stableStringify(payload);
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyBundleSignature(payload, signature, env = {}) {
  const secret = bundleSecret(env);
  if (!secret || !payload || !signature) return false;
  const expected = signBundlePayload(payload, env);
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(String(signature).toLowerCase()).digest();
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function rowToBundle(row) {
  if (!row) return null;
  return {
    bundleVersion: row.bundle_version,
    schemaVersion: row.schema_version,
    orgId: row.org_id || '',
    payload: row.payload,
    signature: row.signature,
    changelog: row.changelog,
    sampleCount: row.sample_count,
    createdAt: row.created_at,
  };
}

export async function getActiveBundle(orgId = '', env = {}) {
  const pool = getPool();
  const org = String(orgId || '').trim();

  let globalRow = null;
  let orgRow = null;

  const globalResult = await pool.query(
    `SELECT * FROM learning_bundles WHERE org_id IS NULL AND active = true ORDER BY created_at DESC LIMIT 1`,
  );
  globalRow = globalResult.rows[0] || null;

  if (org) {
    const orgResult = await pool.query(
      `SELECT * FROM learning_bundles WHERE org_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1`,
      [org],
    );
    orgRow = orgResult.rows[0] || null;
  }

  const globalBundle = rowToBundle(globalRow);
  const orgBundle = rowToBundle(orgRow);

  if (!globalBundle && !orgBundle) {
    const hints = await getActiveLearningHints();
    if (!hints.length) return null;
    const payload = {
      schemaVersion: 1,
      bundleVersion: `hints-${Date.now()}`,
      trainedAt: new Date().toISOString(),
      sampleCount: 0,
      hints,
      scorers: [],
      gatingOverrides: [],
      changelog: ['Legacy hints fallback'],
    };
    const signature = bundleSecret(env) ? signBundlePayload(payload, env) : '';
    return { bundle: payload, signature, source: 'hints_fallback' };
  }

  const merged = {
    ...(globalBundle?.payload || {}),
    ...(orgBundle?.payload || {}),
    hints: [
      ...(globalBundle?.payload?.hints || []),
      ...(orgBundle?.payload?.hints || []),
    ],
    scorers: [
      ...(globalBundle?.payload?.scorers || []),
      ...(orgBundle?.payload?.scorers || []),
    ],
    gatingOverrides: [
      ...(globalBundle?.payload?.gatingOverrides || []),
      ...(orgBundle?.payload?.gatingOverrides || []),
    ],
    bundleVersion: orgBundle?.bundleVersion || globalBundle?.bundleVersion,
    schemaVersion: orgBundle?.schemaVersion || globalBundle?.schemaVersion || 1,
    orgOverlay: Boolean(orgBundle),
  };

  const signature = orgBundle?.signature || globalBundle?.signature || '';
  return { bundle: merged, signature, global: globalBundle, org: orgBundle };
}

export async function publishLearningBundle({
  payload,
  orgId = null,
  changelog = '',
  sampleCount = 0,
  env = {},
}) {
  if (!payload || typeof payload !== 'object') {
    throw httpError(400, 'Bundle payload required.');
  }

  const version = String(payload.bundleVersion || '').trim();
  if (!version) throw httpError(400, 'bundleVersion required.');

  const signature = signBundlePayload(payload, env);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (orgId) {
      await client.query(
        `UPDATE learning_bundles SET active = false WHERE org_id = $1 AND active = true`,
        [orgId],
      );
    } else {
      await client.query(
        `UPDATE learning_bundles SET active = false WHERE org_id IS NULL AND active = true`,
      );
    }

    const insert = await client.query(
      `INSERT INTO learning_bundles (
         bundle_version, org_id, schema_version, payload, signature, changelog, sample_count, active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, bundle_version, created_at`,
      [
        version,
        orgId || null,
        Number(payload.schemaVersion) || 1,
        JSON.stringify(payload),
        signature,
        String(changelog || '').slice(0, 4000),
        Math.max(0, Number(sampleCount) || 0),
      ],
    );

    if (!orgId) {
      await client.query(`UPDATE organizations SET policy_version = policy_version + 1, updated_at = now()`);
    } else {
      await client.query(
        `UPDATE organizations SET policy_version = policy_version + 1, updated_at = now() WHERE id = $1`,
        [orgId],
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      bundleVersion: insert.rows[0].bundle_version,
      signature,
      createdAt: insert.rows[0].created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listLearningBundles({ limit = 20 } = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT bundle_version, org_id, schema_version, changelog, sample_count, active, created_at
     FROM learning_bundles
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(50, Math.max(1, Number(limit) || 20))],
  );
  return {
    bundles: result.rows.map((row) => ({
      bundleVersion: row.bundle_version,
      orgId: row.org_id || '',
      schemaVersion: row.schema_version,
      changelog: row.changelog,
      sampleCount: row.sample_count,
      active: row.active === true,
      createdAt: row.created_at,
    })),
  };
}
