#!/usr/bin/env node
/**
 * Store-readiness gate — static checks, unit tests, portal walk, extension smoke, package build.
 * Run: npm run test:store-ready
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

const steps = [
  ['Static: extension globals', 'node', ['scripts/check-extension-globals.mjs']],
  ['Unit + scenario tests', 'npm', ['test']],
  ['Portal product walk', 'node', ['scripts/product-walk.mjs']],
  ['Product E2E walk', 'node', ['scripts/product-e2e-walk.mjs']],
  ['Package extension', 'npm', ['run', 'package']],
];

async function main() {
  console.log('=== Veil store-readiness ===\n');
  for (const [label, cmd, args] of steps) {
    console.log(`--- ${label} ---`);
    await run(cmd, args);
    console.log('');
  }
  console.log('=== All store-readiness checks passed ===');
}

main().catch((error) => {
  console.error('\nStore-readiness FAILED:', error.message || error);
  process.exit(1);
});
