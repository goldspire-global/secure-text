import { randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { verifyClientIngestKey } from './ops-service.mjs';
import { canAutoApplyHint, clampAdjust, SECRET_CATEGORIES, MIN_SAMPLES_FOR_SUPPRESS } from './learning-feature-schema.mjs';

const MAX_BATCH = 100;
const BLOCKED_BLOB_KEYS = ['matchedtext', 'plaintext', 'passphrase', 'secret', 'payload', 'token_value'];

function makeProposalRef() {
  return `LRN-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function bucketKey({ host = '', category = '', intent = '', fieldSemantic = '' }) {
  return [host, category, intent, fieldSemantic].map((v) => String(v || '').toLowerCase()).join('|');
}

function rejectIfContainsSecrets(obj) {
  const blob = JSON.stringify(obj).toLowerCase();
  for (const key of BLOCKED_BLOB_KEYS) {
    if (blob.includes(key)) {
      throw httpError(400, 'Learning telemetry must not include matched content or secrets.');
    }
  }
}

function sanitizeFeatures(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw).slice(0, 12)) {
    const k = String(key).slice(0, 32);
    if (Array.isArray(value)) {
      out[k] = value.slice(0, 8).map((item) => String(item).slice(0, 64));
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[k] = value;
    } else if (typeof value === 'boolean') {
      out[k] = value;
    } else {
      out[k] = String(value ?? '').slice(0, 128);
    }
  }
  return out;
}

function sanitizeDecisionEvent(raw = {}) {
  rejectIfContainsSecrets(raw);
  const atMs = Number(raw.at);
  return {
    eventAt: Number.isFinite(atMs) && atMs > 0 ? new Date(atMs) : new Date(),
    eventType: String(raw.type || 'decision').slice(0, 24),
    category: String(raw.category || '').slice(0, 64),
    severity: String(raw.severity || '').slice(0, 16),
    host: String(raw.host || '').slice(0, 253),
    source: String(raw.source || '').slice(0, 32),
    action: String(raw.action || '').slice(0, 32),
    confidence: Math.min(100, Math.max(0, Math.round(Number(raw.confidence) || 0))),
    outcome: String(raw.outcome || '').slice(0, 24),
    features: sanitizeFeatures(raw.features),
    extensionVersion: String(raw.extensionVersion || '').slice(0, 24),
    browser: String(raw.browser || '').slice(0, 32),
    profile: String(raw.profile || 'personal').slice(0, 16),
    deviceHash: String(raw.deviceHash || '').slice(0, 64),
  };
}

function parseActionOutcome(action = '', outcome = '') {
  const act = String(action || '');
  const out = String(outcome || '');
  if (act === 'prompt' || act.endsWith(':prompt')) return { kind: 'prompt' };
  if (act === 'dismiss' || out === 'ignored') return { kind: 'dismiss' };
  if (out === 'agreed') return { kind: 'agree', choice: act.split(':')[0] };
  if (out === 'overrode') return { kind: 'override', choice: act.split(':')[0] };
  if (act === 'ignore' || act.startsWith('ignore')) return { kind: 'override', choice: 'ignore' };
  if (['encrypt', 'mask', 'tokenize', 'block'].some((id) => act.startsWith(id))) {
    return { kind: 'agree', choice: act.split(':')[0] };
  }
  return { kind: 'other', choice: act };
}

function featureIntent(features = {}) {
  return String(features.intent || '').slice(0, 32);
}

function featureFieldSemantic(features = {}) {
  const sem = features.fieldSemantics;
  if (Array.isArray(sem) && sem.length) return String(sem[0]).slice(0, 32);
  return '';
}

async function aggregateDecisionRows(pool, since) {
  const orgRows = await pool.query(
    `SELECT host, category, source, action, outcome, confidence, features, event_at
     FROM security_events
     WHERE event_type = 'decision' AND event_at >= $1`,
    [since],
  );
  const personalRows = await pool.query(
    `SELECT host, category, source, action, outcome, confidence, features, event_at
     FROM platform_decision_events
     WHERE event_type = 'decision' AND event_at >= $1`,
    [since],
  );
  return [...orgRows.rows, ...personalRows.rows];
}

function buildBucketStats(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const features = typeof row.features === 'object' && row.features ? row.features : {};
    const intent = featureIntent(features);
    const fieldSemantic = featureFieldSemantic(features);
    const key = bucketKey({
      host: row.host,
      category: row.category,
      intent,
      fieldSemantic,
    });

    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketKey: key,
        host: row.host || '',
        category: row.category || '',
        intent,
        fieldSemantic,
        prompts: 0,
        overrides: 0,
        agrees: 0,
        dismissals: 0,
        firstSeen: row.event_at,
        lastSeen: row.event_at,
        samples: [],
      });
    }

    const bucket = buckets.get(key);
    bucket.firstSeen = bucket.firstSeen && row.event_at < bucket.firstSeen ? row.event_at : bucket.firstSeen;
    bucket.lastSeen = bucket.lastSeen && row.event_at > bucket.lastSeen ? row.event_at : row.lastSeen;

    const parsed = parseActionOutcome(row.action, row.outcome);
    if (parsed.kind === 'prompt') bucket.prompts += 1;
    else if (parsed.kind === 'dismiss') bucket.dismissals += 1;
    else if (parsed.kind === 'override') bucket.overrides += 1;
    else if (parsed.kind === 'agree') bucket.agrees += 1;

    if (bucket.samples.length < 5) {
      bucket.samples.push({
        action: row.action,
        outcome: row.outcome,
        source: row.source,
        at: row.event_at,
      });
    }
  }

  return [...buckets.values()].map((bucket) => {
    const decisions = bucket.overrides + bucket.agrees + bucket.dismissals;
    const overridePct = decisions > 0
      ? Math.round((1000 * bucket.overrides) / decisions) / 10
      : 0;
    let priority = 'low';
    if (overridePct >= 50 && bucket.prompts >= 3) priority = 'high';
    else if (overridePct >= 30 && bucket.prompts >= 2) priority = 'normal';
    return { ...bucket, overridePct, priority };
  });
}

async function countFalsePositiveTickets(pool, since) {
  const result = await pool.query(
    `SELECT page_host, diagnostics, COUNT(*)::int AS count
     FROM support_tickets
     WHERE kind = 'falsePositive' AND created_at >= $1
     GROUP BY page_host, diagnostics`,
    [since],
  );
  const map = new Map();
  for (const row of result.rows) {
    const host = String(row.page_host || '').toLowerCase();
    const diag = row.diagnostics || {};
    const cat = String(diag.category || diag.detectorCategory || '').toLowerCase();
    const key = `${host}|${cat}`;
    map.set(key, (map.get(key) || 0) + Number(row.count || 0));
  }
  return map;
}

export async function ingestPlatformDecisions(env, req, body = {}) {
  if (!verifyClientIngestKey(env, req)) {
    throw httpError(401, 'Invalid ingest key.');
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (events.length === 0) return { ok: true, ingested: 0 };

  const pool = getPool();
  let ingested = 0;

  for (const raw of events) {
    const row = sanitizeDecisionEvent(raw);
    await pool.query(
      `INSERT INTO platform_decision_events (
         event_at, device_hash, extension_version, browser, profile,
         event_type, category, severity, host, source, action, confidence, outcome, features
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        row.eventAt,
        row.deviceHash,
        row.extensionVersion,
        row.browser,
        row.profile,
        row.eventType,
        row.category,
        row.severity,
        row.host,
        row.source,
        row.action,
        row.confidence,
        row.outcome,
        JSON.stringify(row.features),
      ],
    );
    ingested += 1;
  }

  return { ok: true, ingested };
}

export async function getActiveLearningHints() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT hint_key, host_pattern, category, field_semantic, intent,
            adjust_confidence, suppress, shipped_in_version
     FROM platform_learning_hints
     WHERE active = true
     ORDER BY id ASC
     LIMIT 200`,
  );
  return result.rows.map((row) => ({
    key: row.hint_key,
    hostPattern: row.host_pattern,
    category: row.category,
    fieldSemantic: row.field_semantic,
    intent: row.intent,
    adjustConfidence: row.adjust_confidence,
    suppress: row.suppress === true,
    version: row.shipped_in_version || '',
  }));
}

export async function getLearningSummary(days = 30) {
  const windowDays = Math.min(90, Math.max(1, Number(days) || 30));
  const pool = getPool();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totals, queueOpen, proposalsPending, hintsActive, overrideTrend] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM security_events WHERE event_type = 'decision' AND event_at >= $1) AS org_decisions,
         (SELECT COUNT(*)::int FROM platform_decision_events WHERE event_at >= $1) AS personal_decisions,
         (SELECT COUNT(*)::int FROM support_tickets WHERE kind = 'falsePositive' AND created_at >= $1) AS false_positive_tickets`,
      [since],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS open_count,
              COUNT(*) FILTER (WHERE priority = 'high')::int AS high_priority
       FROM learning_review_queue WHERE status = 'open'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS pending FROM learning_proposals WHERE status = 'pending'`,
    ),
    pool.query(`SELECT COUNT(*)::int AS active FROM platform_learning_hints WHERE active = true`),
    pool.query(
      `SELECT
         ROUND(AVG(override_pct)::numeric, 1) AS avg_override_pct,
         MAX(override_pct)::float AS max_override_pct
       FROM learning_review_queue
       WHERE status = 'open' AND prompts >= 2`,
    ),
  ]);

  const t = totals.rows[0] || {};
  return {
    windowDays,
    orgDecisions: t.org_decisions || 0,
    personalDecisions: t.personal_decisions || 0,
    falsePositiveTickets: t.false_positive_tickets || 0,
    openQueue: queueOpen.rows[0]?.open_count || 0,
    highPriorityQueue: queueOpen.rows[0]?.high_priority || 0,
    pendingProposals: proposalsPending.rows[0]?.pending || 0,
    activeHints: hintsActive.rows[0]?.active || 0,
    avgOverridePct: overrideTrend.rows[0]?.avg_override_pct ?? null,
    maxOverridePct: overrideTrend.rows[0]?.max_override_pct ?? null,
  };
}

export async function listLearningBuckets({ days = 30, limit = 40, status = 'open' } = {}) {
  const pool = getPool();
  const windowDays = Math.min(90, Math.max(1, Number(days) || 30));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  await refreshLearningQueue(windowDays);

  const result = await pool.query(
    `SELECT id, bucket_key, host, category, intent, field_semantic,
            prompts, overrides, agrees, dismissals, override_pct, ticket_count,
            priority, status, evidence, first_seen, last_seen, updated_at
     FROM learning_review_queue
     WHERE ($1 = '' OR status = $1)
     ORDER BY override_pct DESC, prompts DESC
     LIMIT $2`,
    [String(status || '').trim(), Math.min(100, Math.max(1, Number(limit) || 40))],
  );

  return {
    windowDays,
    buckets: result.rows.map((row) => ({
      id: row.id,
      bucketKey: row.bucket_key,
      host: row.host,
      category: row.category,
      intent: row.intent,
      fieldSemantic: row.field_semantic,
      prompts: row.prompts,
      overrides: row.overrides,
      agrees: row.agrees,
      dismissals: row.dismissals,
      overridePct: Number(row.override_pct) || 0,
      ticketCount: row.ticket_count,
      priority: row.priority,
      status: row.status,
      evidence: row.evidence || {},
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      updatedAt: row.updated_at,
    })),
    analyzedSince: since,
  };
}

export async function refreshLearningQueue(days = 30) {
  const windowDays = Math.min(90, Math.max(1, Number(days) || 30));
  const pool = getPool();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await aggregateDecisionRows(pool, since);
  const buckets = buildBucketStats(rows);
  const ticketMap = await countFalsePositiveTickets(pool, since);

  let upserted = 0;
  for (const bucket of buckets) {
    if (bucket.prompts < 1 && bucket.overrides + bucket.agrees + bucket.dismissals < 1) continue;

    const ticketKey = `${String(bucket.host || '').toLowerCase()}|${String(bucket.category || '').toLowerCase()}`;
    const ticketCount = ticketMap.get(ticketKey) || 0;
    const priority = ticketCount > 0 ? 'high' : bucket.priority;

    await pool.query(
      `INSERT INTO learning_review_queue (
         bucket_key, host, category, intent, field_semantic,
         prompts, overrides, agrees, dismissals, override_pct, ticket_count,
         priority, status, evidence, first_seen, last_seen, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'open', $13, $14, $15, now())
       ON CONFLICT (bucket_key) DO UPDATE SET
         prompts = EXCLUDED.prompts,
         overrides = EXCLUDED.overrides,
         agrees = EXCLUDED.agrees,
         dismissals = EXCLUDED.dismissals,
         override_pct = EXCLUDED.override_pct,
         ticket_count = EXCLUDED.ticket_count,
         priority = CASE
           WHEN learning_review_queue.status = 'resolved' THEN learning_review_queue.priority
           ELSE EXCLUDED.priority
         END,
         evidence = EXCLUDED.evidence,
         first_seen = LEAST(learning_review_queue.first_seen, EXCLUDED.first_seen),
         last_seen = GREATEST(learning_review_queue.last_seen, EXCLUDED.last_seen),
         updated_at = now()`,
      [
        bucket.bucketKey,
        bucket.host,
        bucket.category,
        bucket.intent,
        bucket.fieldSemantic,
        bucket.prompts,
        bucket.overrides,
        bucket.agrees,
        bucket.dismissals,
        bucket.overridePct,
        ticketCount,
        priority,
        JSON.stringify({ samples: bucket.samples }),
        bucket.firstSeen,
        bucket.lastSeen,
      ],
    );
    upserted += 1;
  }

  return { upserted, bucketCount: buckets.length, windowDays };
}

function buildProposalFromBucket(bucket) {
  const adjust = bucket.overridePct >= 60 ? -30 : bucket.overridePct >= 40 ? -20 : -15;
  const title = bucket.fieldSemantic
    ? `Lower ${bucket.category} confidence in ${bucket.fieldSemantic} fields on ${bucket.host || 'any host'}`
    : `Review ${bucket.category} prompts on ${bucket.host || 'any host'} (${bucket.intent || 'general'})`;

  const rationale = [
    `${bucket.overridePct}% override rate over ${bucket.prompts} prompt(s).`,
    bucket.ticketCount ? `${bucket.ticketCount} false-positive ticket(s) on this host.` : '',
    bucket.fieldSemantic
      ? `Users often Allow in "${bucket.fieldSemantic}" field context — apply learning hint.`
      : 'Consider gating tweak or new fieldSemantics row in intent-config.js.',
  ].filter(Boolean).join(' ');

  return {
    proposalType: bucket.fieldSemantic ? 'confidence_adjust' : 'review_gating',
    title,
    rationale,
    suggestedPatch: {
      type: 'learning_hint',
      hostPattern: bucket.host || '*',
      category: bucket.category,
      fieldSemantic: bucket.fieldSemantic || '',
      intent: bucket.intent || '',
      adjustConfidence: adjust,
      suppress: bucket.overridePct >= 70 && bucket.prompts >= 5,
    },
    evidence: {
      bucketKey: bucket.bucketKey,
      overridePct: bucket.overridePct,
      prompts: bucket.prompts,
      overrides: bucket.overrides,
      ticketCount: bucket.ticketCount,
    },
    priority: bucket.priority,
  };
}

export async function generateLearningProposals({ days = 30, minOverridePct = 35, minPrompts = 3 } = {}) {
  await refreshLearningQueue(days);
  const pool = getPool();
  const threshold = Math.max(10, Number(minOverridePct) || 35);
  const minP = Math.max(1, Number(minPrompts) || 3);

  const candidates = await pool.query(
    `SELECT * FROM learning_review_queue
     WHERE status = 'open'
       AND override_pct >= $1
       AND prompts >= $2
       AND NOT EXISTS (
         SELECT 1 FROM learning_proposals lp
         WHERE lp.queue_id = learning_review_queue.id
           AND lp.status IN ('pending', 'approved')
       )
     ORDER BY override_pct DESC
     LIMIT 25`,
    [threshold, minP],
  );

  const created = [];
  for (const row of candidates.rows) {
    const bucket = {
      bucketKey: row.bucket_key,
      host: row.host,
      category: row.category,
      intent: row.intent,
      fieldSemantic: row.field_semantic,
      overridePct: Number(row.override_pct) || 0,
      prompts: row.prompts,
      overrides: row.overrides,
      ticketCount: row.ticket_count,
      priority: row.priority,
    };
    const draft = buildProposalFromBucket(bucket);
    const ref = makeProposalRef();
    const insert = await pool.query(
      `INSERT INTO learning_proposals (
         proposal_ref, queue_id, proposal_type, status, priority,
         title, rationale, suggested_patch, evidence
       ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
       RETURNING id, proposal_ref, title, status, priority, created_at`,
      [
        ref,
        row.id,
        draft.proposalType,
        draft.priority,
        draft.title,
        draft.rationale,
        JSON.stringify(draft.suggestedPatch),
        JSON.stringify(draft.evidence),
      ],
    );
    created.push(insert.rows[0]);
  }

  return { created: created.length, proposals: created };
}

export async function listLearningProposals({ status = '', limit = 50 } = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT p.id, p.proposal_ref, p.queue_id, p.proposal_type, p.status, p.priority,
            p.title, p.rationale, p.suggested_patch, p.evidence, p.reviewer, p.review_notes,
            p.created_at, p.updated_at, p.resolved_at,
            q.host, q.category, q.override_pct
     FROM learning_proposals p
     LEFT JOIN learning_review_queue q ON q.id = p.queue_id
     WHERE ($1 = '' OR p.status = $1)
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [String(status || '').trim(), Math.min(100, Math.max(1, Number(limit) || 50))],
  );

  return {
    proposals: result.rows.map((row) => ({
      id: row.id,
      proposalRef: row.proposal_ref,
      queueId: row.queue_id,
      proposalType: row.proposal_type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      rationale: row.rationale,
      suggestedPatch: row.suggested_patch || {},
      evidence: row.evidence || {},
      reviewer: row.reviewer,
      reviewNotes: row.review_notes,
      host: row.host,
      category: row.category,
      overridePct: row.override_pct != null ? Number(row.override_pct) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    })),
  };
}

async function applyApprovedHint(client, proposal, reviewer = '') {
  const patch = proposal.suggested_patch || {};
  if (patch.type !== 'learning_hint') return null;

  const evidence = proposal.evidence || {};
  const isAuto = String(reviewer || '').toLowerCase().startsWith('auto');
  if (isAuto && !canAutoApplyHint(patch, evidence)) {
    return null;
  }

  let suppress = patch.suppress === true;
  if (suppress) {
    if (SECRET_CATEGORIES.has(String(patch.category || '').toLowerCase())) suppress = false;
    if ((evidence.prompts || 0) < MIN_SAMPLES_FOR_SUPPRESS) suppress = false;
  }

  const hintKey = bucketKey({
    host: patch.hostPattern || '*',
    category: patch.category || '',
    intent: patch.intent || '',
    fieldSemantic: patch.fieldSemantic || '',
  });

  const result = await client.query(
    `INSERT INTO platform_learning_hints (
       hint_key, host_pattern, category, field_semantic, intent,
       adjust_confidence, suppress, source_proposal_id, active, shipped_in_version, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now())
     ON CONFLICT (hint_key) DO UPDATE SET
       adjust_confidence = EXCLUDED.adjust_confidence,
       suppress = EXCLUDED.suppress,
       source_proposal_id = EXCLUDED.source_proposal_id,
       active = true,
       updated_at = now()
     RETURNING id, hint_key`,
    [
      hintKey,
      String(patch.hostPattern || '*').slice(0, 253),
      String(patch.category || '').slice(0, 64),
      String(patch.fieldSemantic || '').slice(0, 64),
      String(patch.intent || '').slice(0, 32),
      clampAdjust(Number(patch.adjustConfidence) || -15),
      suppress,
      proposal.id,
      String(patch.shippedInVersion || process.env.npm_package_version || '').slice(0, 24),
    ],
  );

  await client.query(
    `UPDATE organizations SET policy_version = policy_version + 1, updated_at = now()`,
  );

  return result.rows[0];
}

export async function updateLearningProposal(proposalRef, patch = {}) {
  const ref = String(proposalRef || '').trim().toUpperCase();
  if (!ref) throw httpError(400, 'Proposal ref required.');

  const status = String(patch.status || '').trim().toLowerCase();
  const allowed = new Set(['pending', 'approved', 'rejected', 'shipped']);
  if (status && !allowed.has(status)) {
    throw httpError(400, 'Invalid proposal status.');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM learning_proposals WHERE proposal_ref = $1 FOR UPDATE`,
      [ref],
    );
    if (existing.rowCount === 0) throw httpError(404, 'Proposal not found.');
    const proposal = existing.rows[0];

    const nextStatus = status || proposal.status;
    const reviewer = String(patch.reviewer || proposal.reviewer || '').slice(0, 64);
    const reviewNotes = String(patch.reviewNotes ?? proposal.review_notes ?? '').slice(0, 4000);

    await client.query(
      `UPDATE learning_proposals
       SET status = $2, reviewer = $3, review_notes = $4,
           updated_at = now(),
           resolved_at = CASE WHEN $2 IN ('approved', 'rejected', 'shipped') THEN now() ELSE resolved_at END
       WHERE proposal_ref = $1`,
      [ref, nextStatus, reviewer, reviewNotes],
    );

    let hint = null;
    if (nextStatus === 'approved' && proposal.status !== 'approved') {
      hint = await applyApprovedHint(client, proposal, reviewer);
      if (proposal.queue_id) {
        await client.query(
          `UPDATE learning_review_queue SET status = 'resolved', updated_at = now() WHERE id = $1`,
          [proposal.queue_id],
        );
      }
    }

    if (nextStatus === 'rejected' && proposal.queue_id) {
      await client.query(
        `UPDATE learning_review_queue SET status = 'dismissed', updated_at = now() WHERE id = $1`,
        [proposal.queue_id],
      );
    }

    await client.query('COMMIT');
    return { ok: true, proposalRef: ref, status: nextStatus, hint };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runLearningAnalysis(days = 30) {
  const refreshed = await refreshLearningQueue(days);
  const generated = await generateLearningProposals({ days });
  const summary = await getLearningSummary(days);
  return { ...refreshed, ...generated, summary };
}
