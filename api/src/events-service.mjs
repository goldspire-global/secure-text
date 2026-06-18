import { getPool } from './db.mjs';
import { authenticateRequest } from './auth.mjs';
import { httpError } from './org-service.mjs';

const ALLOWED_TYPES = new Set([
  'detection',
  'action',
  'policy_block',
  'lifecycle',
  'unknown',
]);

const MAX_BATCH = 100;
const MAX_HOST_LEN = 253;

function sanitizeEvent(raw = {}) {
  const atMs = Number(raw.at);
  const eventAt = Number.isFinite(atMs) && atMs > 0 ? new Date(atMs) : new Date();

  return {
    eventAt,
    eventType: ALLOWED_TYPES.has(String(raw.type || '').toLowerCase())
      ? String(raw.type).toLowerCase()
      : 'unknown',
    category: String(raw.category || '').slice(0, 64),
    severity: String(raw.severity || '').slice(0, 16),
    host: String(raw.host || '').slice(0, MAX_HOST_LEN),
    source: String(raw.source || '').slice(0, 32),
    action: String(raw.action || '').slice(0, 32),
    confidence: Math.min(100, Math.max(0, Math.round(Number(raw.confidence) || 0))),
    outcome: String(raw.outcome || '').slice(0, 24),
  };
}

function formatActionWithOutcome(action, outcome) {
  const base = String(action || '').slice(0, 24);
  const tag = String(outcome || '').slice(0, 8);
  if (!tag) return base;
  const combined = `${base}:${tag}`;
  return combined.slice(0, 32);
}

function rejectIfContainsContent(event) {
  const blob = JSON.stringify(event).toLowerCase();
  const blocked = ['matchedtext', 'plaintext', 'payload', 'secret', 'passphrase', 'token_value'];
  for (const key of blocked) {
    if (blob.includes(key)) {
      throw httpError(400, 'Events must not include matched content or secrets.');
    }
  }
}

async function loadOrgAnalytics(orgId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT settings FROM organizations WHERE id = $1',
    [orgId],
  );
  if (result.rowCount === 0) return {};
  const settings = typeof result.rows[0].settings === 'object' ? result.rows[0].settings : {};
  return settings.analytics && typeof settings.analytics === 'object' ? settings.analytics : {};
}

async function dispatchSiemWebhook(orgId, events) {
  const analytics = await loadOrgAnalytics(orgId);
  const url = String(analytics.siemWebhookUrl || '').trim();
  if (!url) return;

  const secret = String(analytics.siemWebhookSecret || '').trim();
  const payload = {
    source: 'veil',
    orgId,
    at: new Date().toISOString(),
    events: events.map((row) => ({
      at: row.eventAt.toISOString(),
      type: row.eventType,
      category: row.category,
      severity: row.severity,
      host: row.host,
      source: row.source,
      action: row.action,
      confidence: row.confidence,
    })),
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Veil-Secret': secret } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[veil/siem] webhook failed:', error?.message || error);
  }
}

export async function ingestExtensionEvents(token, deviceId, body = {}) {
  const auth = await authenticateRequest(token, deviceId);
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return { ok: true, ingested: 0 };
  if (events.length > MAX_BATCH) {
    throw httpError(400, `Maximum ${MAX_BATCH} events per batch.`);
  }

  const rows = [];
  for (const raw of events) {
    rejectIfContainsContent(raw);
    rows.push(sanitizeEvent(raw));
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO security_events (
           org_id, device_id, member_email, event_at, event_type,
           category, severity, host, source, action, confidence
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          auth.org_id,
          auth.device_id,
          auth.member_email || null,
          row.eventAt,
          row.eventType,
          row.category,
          row.severity,
          row.host,
          row.source,
          formatActionWithOutcome(row.action, row.outcome),
          row.confidence,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  dispatchSiemWebhook(auth.org_id, rows).catch(() => {});

  return { ok: true, ingested: rows.length };
}

export async function getSecurityEventSummary(admin, query = {}) {
  const days = Math.min(90, Math.max(1, Number(query.days) || 30));
  const pool = getPool();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const totals = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE event_type = 'detection')::int AS detections,
       COUNT(*) FILTER (WHERE action IN ('block', 'policy_block'))::int AS blocks,
       COUNT(*) FILTER (WHERE source = 'ai_prompt')::int AS ai_incidents,
       COUNT(*) FILTER (WHERE action = 'encrypt')::int AS encrypt_actions,
       COUNT(*) FILTER (WHERE action = 'mask')::int AS mask_actions
     FROM security_events
     WHERE org_id = $1 AND event_at >= $2`,
    [admin.org.id, since],
  );

  const byCategory = await pool.query(
    `SELECT category, COUNT(*)::int AS count
     FROM security_events
     WHERE org_id = $1 AND event_at >= $2 AND category <> ''
     GROUP BY category
     ORDER BY count DESC
     LIMIT 15`,
    [admin.org.id, since],
  );

  const bySource = await pool.query(
    `SELECT source, COUNT(*)::int AS count
     FROM security_events
     WHERE org_id = $1 AND event_at >= $2 AND source <> ''
     GROUP BY source
     ORDER BY count DESC
     LIMIT 10`,
    [admin.org.id, since],
  );

  const recent = await pool.query(
    `SELECT event_at, event_type, category, severity, host, source, action, confidence
     FROM security_events
     WHERE org_id = $1
     ORDER BY event_at DESC
     LIMIT 25`,
    [admin.org.id],
  );

  const row = totals.rows[0] || {};
  return {
    days,
    totals: {
      total: row.total || 0,
      detections: row.detections || 0,
      blocks: row.blocks || 0,
      aiIncidents: row.ai_incidents || 0,
      encryptActions: row.encrypt_actions || 0,
      maskActions: row.mask_actions || 0,
    },
    byCategory: byCategory.rows.map((r) => ({ category: r.category, count: r.count })),
    bySource: bySource.rows.map((r) => ({ source: r.source, count: r.count })),
    recent: recent.rows.map((r) => ({
      at: r.event_at,
      type: r.event_type,
      category: r.category,
      severity: r.severity,
      host: r.host,
      source: r.source,
      action: r.action,
      confidence: r.confidence,
    })),
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function exportSecurityEvents(admin, query = {}) {
  const days = Math.min(90, Math.max(1, Number(query.days) || 30));
  const format = String(query.format || 'json').toLowerCase();
  const pool = getPool();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `SELECT event_at, event_type, category, severity, host, source, action, confidence, device_id, member_email
     FROM security_events
     WHERE org_id = $1 AND event_at >= $2
     ORDER BY event_at DESC
     LIMIT 10000`,
    [admin.org.id, since],
  );

  const rows = result.rows.map((r) => ({
    at: r.event_at,
    type: r.event_type,
    category: r.category,
    severity: r.severity,
    host: r.host,
    source: r.source,
    action: r.action,
    confidence: r.confidence,
    deviceId: r.device_id,
    memberEmail: r.member_email,
  }));

  if (format === 'csv') {
    const header = ['at', 'type', 'category', 'severity', 'host', 'source', 'action', 'confidence', 'deviceId', 'memberEmail'];
    const lines = [
      header.join(','),
      ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(',')),
    ];
    return { format: 'csv', days, content: lines.join('\n') };
  }

  return { format: 'json', days, events: rows };
}
