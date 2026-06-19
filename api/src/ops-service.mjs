import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';

const MAX_CLIENT_BATCH = 25;
const MAX_MESSAGE_LEN = 240;
const ALLOWED_KINDS = new Set([
  'client_error',
  'sync_failure',
  'org_revoked',
  'event_upload_failure',
  'health',
  'notice',
]);

const BLOCKED_META_KEYS = ['passphrase', 'secret', 'token_value', 'plaintext', 'matchedtext', 'payload'];

function sanitizeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    const k = String(key).slice(0, 32);
    if (BLOCKED_META_KEYS.some((blocked) => k.toLowerCase().includes(blocked))) continue;
    if (typeof value === 'string') out[k] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[k] = value;
  }
  return out;
}

function sanitizeClientEvent(raw = {}) {
  const kind = String(raw.kind || raw.type || 'client_error').toLowerCase();
  return {
    eventAt: Number(raw.at) > 0 ? new Date(Number(raw.at)) : new Date(),
    kind: ALLOWED_KINDS.has(kind) ? kind : 'client_error',
    code: String(raw.code || '').slice(0, 64),
    message: String(raw.message || '').slice(0, MAX_MESSAGE_LEN),
    source: String(raw.source || '').slice(0, 32),
    extensionVersion: String(raw.extensionVersion || raw.version || '').slice(0, 24),
    browser: String(raw.browser || '').slice(0, 32),
    host: String(raw.host || '').slice(0, 253),
    meta: sanitizeMeta(raw.meta),
  };
}

export async function recordHealthCheck({ ok, dbOk, version, uptimeSec }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_health_checks (ok, db_ok, version, uptime_sec)
     VALUES ($1, $2, $3, $4)`,
    [Boolean(ok), Boolean(dbOk), String(version || '').slice(0, 24), Math.max(0, Number(uptimeSec) || 0)],
  );
  await pool.query(
    `INSERT INTO platform_ops_events (event_at, kind, code, message, source, extension_version, browser, host, meta)
     VALUES (now(), 'health', $1, $2, 'api', $3, '', '', '{}'::jsonb)`,
    [ok ? 'ok' : 'degraded', dbOk ? 'db_ok' : 'db_down', String(version || '').slice(0, 24)],
  );
}

export async function ingestClientEvents(events = []) {
  const list = Array.isArray(events) ? events.slice(0, MAX_CLIENT_BATCH) : [];
  if (list.length === 0) return { ingested: 0 };

  const pool = getPool();
  let ingested = 0;

  for (const raw of list) {
    const row = sanitizeClientEvent(raw);
    const blob = JSON.stringify({ ...row, meta: row.meta }).toLowerCase();
    if (BLOCKED_META_KEYS.some((key) => blob.includes(key))) {
      throw httpError(400, 'Ops events must not include secrets or matched content.');
    }
    await pool.query(
      `INSERT INTO platform_ops_events
        (event_at, kind, code, message, source, extension_version, browser, host, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.eventAt,
        row.kind,
        row.code,
        row.message,
        row.source,
        row.extensionVersion,
        row.browser,
        row.host,
        JSON.stringify(row.meta),
      ],
    );
    ingested += 1;
  }

  return { ingested };
}

export async function getOpsSummary(days = 7) {
  const windowDays = Math.min(30, Math.max(1, Number(days) || 7));
  const pool = getPool();

  const [health, eventsByKind, recent, securityVolume] = await Promise.all([
    pool.query(
      `SELECT checked_at, ok, db_ok, version, uptime_sec
       FROM platform_health_checks
       ORDER BY checked_at DESC
       LIMIT 48`,
    ),
    pool.query(
      `SELECT kind, COUNT(*)::int AS count
       FROM platform_ops_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
       GROUP BY kind
       ORDER BY count DESC`,
      [String(windowDays)],
    ),
    pool.query(
      `SELECT event_at, kind, code, message, source, extension_version, browser, host
       FROM platform_ops_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
       ORDER BY event_at DESC
       LIMIT 100`,
      [String(windowDays)],
    ),
    pool.query(
      `SELECT date_trunc('day', event_at) AS day, COUNT(*)::int AS count
       FROM security_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
       GROUP BY 1
       ORDER BY 1 DESC`,
      [String(windowDays)],
    ),
  ]);

  return {
    windowDays,
    health: health.rows,
    eventsByKind: eventsByKind.rows,
    recentEvents: recent.rows,
    securityEventsByDay: securityVolume.rows,
  };
}

export async function pingDatabase() {
  const pool = getPool();
  await pool.query('SELECT 1');
  return true;
}

let lastHealthRecordedAt = 0;
const HEALTH_RECORD_INTERVAL_MS = 5 * 60 * 1000;

export async function maybeRecordHealthCheck(payload) {
  const now = Date.now();
  if (now - lastHealthRecordedAt < HEALTH_RECORD_INTERVAL_MS) return;
  lastHealthRecordedAt = now;
  await recordHealthCheck(payload);
}
