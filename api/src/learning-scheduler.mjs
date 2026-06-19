import { getPool } from './db.mjs';
import { runFullLearningTrain } from './learning-train.mjs';
import { raiseOpsAlert } from './ops-alerts.mjs';

let trainMutex = false;
let debounceTimer = null;
let pendingIngestCount = 0;

export function parseLearningTrainConfig(env = {}) {
  const autoRaw = String(
    env.LEARNING_AUTO_TRAIN ?? process.env.LEARNING_AUTO_TRAIN ?? 'true',
  ).toLowerCase();
  const enabled = autoRaw !== 'false' && autoRaw !== '0' && autoRaw !== 'off';

  return {
    enabled,
    cooldownHours: Math.max(1, Number(env.LEARNING_TRAIN_COOLDOWN_HOURS || process.env.LEARNING_TRAIN_COOLDOWN_HOURS || 4) || 4),
    minNewDecisions: Math.max(5, Number(env.LEARNING_TRAIN_MIN_DECISIONS || process.env.LEARNING_TRAIN_MIN_DECISIONS || 20) || 20),
    minSamples: Math.max(1, Number(env.LEARNING_TRAIN_MIN_SAMPLES || process.env.LEARNING_TRAIN_MIN_SAMPLES || 10) || 10),
    dailyBackstop: true,
  };
}

export function recordDecisionIngest(count = 1) {
  pendingIngestCount += Math.max(0, Number(count) || 0);
}

export function scheduleLearningTrain(env, reason = 'ingest') {
  const config = parseLearningTrainConfig(env);
  if (!config.enabled) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const batch = pendingIngestCount;
    pendingIngestCount = 0;
    triggerLearningTrain(env, reason, { ingestedBatch: batch }).catch((error) => {
      console.error('[veil/learning] scheduled train failed', error);
    });
  }, 90_000);
  debounceTimer.unref?.();
}

async function getLastCompletedTrain() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, started_at, completed_at, trigger_reason, status, bundle_version, sample_count, result, error_message
     FROM learning_train_runs
     WHERE status IN ('completed', 'skipped')
     ORDER BY completed_at DESC NULLS LAST, started_at DESC
     LIMIT 1`,
  );
  return result.rows[0] || null;
}

async function countDecisionsSince(since) {
  if (!since) return 0;
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM security_events
        WHERE event_type = 'decision' AND event_at >= $1) +
       (SELECT COUNT(*)::int FROM platform_decision_events
        WHERE event_type = 'decision' AND event_at >= $1) AS total`,
    [since],
  );
  return Number(result.rows[0]?.total || 0);
}

async function insertTrainRun(triggerReason) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO learning_train_runs (trigger_reason, status)
     VALUES ($1, 'running')
     RETURNING id`,
    [String(triggerReason || 'manual').slice(0, 64)],
  );
  return result.rows[0].id;
}

async function finishTrainRun(runId, patch = {}) {
  const pool = getPool();
  await pool.query(
    `UPDATE learning_train_runs SET
       completed_at = now(),
       status = $2,
       bundle_version = $3,
       sample_count = $4,
       result = $5,
       error_message = $6
     WHERE id = $1`,
    [
      runId,
      patch.status || 'completed',
      patch.bundleVersion || null,
      patch.sampleCount ?? null,
      patch.result ? JSON.stringify(patch.result) : null,
      patch.errorMessage ? String(patch.errorMessage).slice(0, 500) : null,
    ],
  );
}

export async function getLearningTrainStatus(env = {}) {
  const config = parseLearningTrainConfig(env);
  const last = await getLastCompletedTrain();
  const since = last?.completed_at || last?.started_at || null;
  const newDecisions = since ? await countDecisionsSince(since) : await countDecisionsSince(new Date(0));

  return {
    autoTrainEnabled: config.enabled,
    cooldownHours: config.cooldownHours,
    minNewDecisions: config.minNewDecisions,
    minSamples: config.minSamples,
    newDecisionsSinceLastTrain: newDecisions,
    readyForTrain: config.enabled && newDecisions >= config.minNewDecisions,
    lastRun: last ? {
      at: last.completed_at || last.started_at,
      triggerReason: last.trigger_reason,
      status: last.status,
      bundleVersion: last.bundle_version,
      sampleCount: last.sample_count,
      errorMessage: last.error_message || '',
    } : null,
  };
}

export async function triggerLearningTrain(env, reason = 'manual', options = {}) {
  const { force = false, ingestedBatch = 0 } = options;
  const fullForce = force === true;
  const dailyForce = force === 'daily';
  const config = parseLearningTrainConfig(env);

  if (!config.enabled && !fullForce) {
    return { skipped: true, reason: 'auto_train_disabled' };
  }

  if (trainMutex) {
    return { skipped: true, reason: 'train_in_progress' };
  }

  const last = await getLastCompletedTrain();
  const since = last?.completed_at || last?.started_at || null;
  const newDecisions = since ? await countDecisionsSince(since) : await countDecisionsSince(new Date(0));

  if (!fullForce && !dailyForce) {
    if (since) {
      const hoursSince = (Date.now() - new Date(since).getTime()) / (3600 * 1000);
      if (hoursSince < config.cooldownHours && newDecisions < config.minNewDecisions * 2) {
        return {
          skipped: true,
          reason: 'cooldown',
          newDecisions,
          hoursSince: Math.round(hoursSince * 10) / 10,
        };
      }
    }
    if (newDecisions < config.minNewDecisions) {
      return {
        skipped: true,
        reason: 'insufficient_decisions',
        newDecisions,
        required: config.minNewDecisions,
      };
    }
  }

  trainMutex = true;
  const runId = await insertTrainRun(reason);

  try {
    const result = await runFullLearningTrain(30, env, {
      publish: true,
      minPublishSamples: fullForce ? 0 : config.minSamples,
    });
    const samples = result.artifact?.samples ?? 0;

    if (result.publishSkipped) {
      await finishTrainRun(runId, {
        status: 'skipped',
        sampleCount: samples,
        result: { ...result, publishSkipped: true },
        errorMessage: `Only ${samples} labeled samples (min ${config.minSamples} to publish).`,
      });
      console.log(`[veil/learning] analysis complete, publish deferred — ${samples} samples (min ${config.minSamples})`);
      return { skipped: true, reason: 'insufficient_samples', samples, analysis: result };
    }

    const bundleVersion = result.globalBundle?.bundleVersion || '';
    await finishTrainRun(runId, {
      status: 'completed',
      bundleVersion,
      sampleCount: samples,
      result,
    });

    console.log(
      `[veil/learning] train complete (${reason}) — bundle ${bundleVersion} · `
      + `samples ${samples} · proposals ${result.proposalsGenerated} · auto-approved ${result.autoApproved}`,
    );

    return { ok: true, reason, ingestedBatch, newDecisions, ...result };
  } catch (error) {
    const message = String(error?.message || error);
    await finishTrainRun(runId, {
      status: 'failed',
      errorMessage: message,
    });
    console.error(`[veil/learning] train failed (${reason}):`, message);
    await raiseOpsAlert({
      key: 'learning_train_failed',
      severity: 'error',
      title: 'Veil learning train failed',
      body: `${reason}: ${message}`,
      env,
    }).catch(() => {});
    throw error;
  } finally {
    trainMutex = false;
  }
}

export async function runDailyLearningBackstop(env) {
  return triggerLearningTrain(env, 'daily', { force: 'daily' });
}
