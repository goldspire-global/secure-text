#!/usr/bin/env node
/**
 * Run Veil learning analysis — refresh buckets, auto-generate proposals.
 */
import { loadEnv } from '../../scripts/load-env.mjs';
import { runLearningAnalysis } from '../src/learning-service.mjs';
import { closePool } from '../src/db.mjs';

loadEnv();

const days = Number(process.argv[2]) || 30;

try {
  const result = await runLearningAnalysis(days);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closePool?.().catch(() => {});
}
