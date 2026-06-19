#!/usr/bin/env node
/** Full learning train — analyze, auto-approve safe proposals, publish signed bundle. */
import { loadEnv } from '../../scripts/load-env.mjs';
import { triggerLearningTrain } from '../src/learning-scheduler.mjs';
import { closePool } from '../src/db.mjs';

const env = loadEnv();
const days = Number(process.argv[2]) || 30;

try {
  const result = await triggerLearningTrain(env, 'cli', { force: true });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closePool().catch(() => {});
}
