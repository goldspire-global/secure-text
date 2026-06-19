#!/usr/bin/env node
/**
 * Copy store capture PNGs into docs/screenshots for user guides.
 * Run after: npm run capture:store
 */
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = join(repoRoot, 'extension', 'store', 'screenshots');
const docsDir = join(repoRoot, 'docs', 'screenshots');

const MAP = {
  '01-popup-checklist.png': 'popup-home-checklist.png',
  '02-copilot-compose.png': 'copilot-paste-modal.png',
  '03-email-redacted.png': 'email-redacted-unlock.png',
  '04-email-token.png': 'email-veil-token.png',
};

mkdirSync(docsDir, { recursive: true });

let copied = 0;
for (const [srcName, destName] of Object.entries(MAP)) {
  const src = join(storeDir, srcName);
  const dest = join(docsDir, destName);
  if (!existsSync(src)) {
    console.warn(`skip (missing): ${srcName} — run npm run capture:store first`);
    continue;
  }
  cpSync(src, dest, { force: true });
  console.log(`${destName} ← ${srcName}`);
  copied += 1;
}

console.log(copied ? `\nSynced ${copied} screenshot(s) to docs/screenshots/` : '\nNo screenshots synced.');
