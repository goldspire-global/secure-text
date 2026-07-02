#!/usr/bin/env node
/**
 * Fail if extension scripts use `global.` without defining `global`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = join(repoRoot, 'extension');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(path, out);
    } else if (name.endsWith('.js')) {
      out.push(path);
    }
  }
  return out;
}

function definesGlobal(source) {
  return (
    /\(function\s*\(\s*global\s*\)/.test(source)
    || /\bconst\s+global\s*=\s*globalThis\b/.test(source)
    || /\bvar\s+global\s*=\s*globalThis\b/.test(source)
    || /\blet\s+global\s*=\s*globalThis\b/.test(source)
  );
}

const offenders = [];
for (const file of walk(extensionRoot)) {
  const source = readFileSync(file, 'utf8');
  if (!/(?:^|[^a-zA-Z0-9_$\-])global\.[a-zA-Z_$]/.test(source)) continue;
  if (!definesGlobal(source)) {
    offenders.push(file.replace(/\\/g, '/').replace(`${repoRoot}/`, ''));
  }
}

if (offenders.length) {
  console.error('Extension files reference `global` without defining it:');
  for (const file of offenders) console.error(`  ${file}`);
  process.exit(1);
}

console.log('✓ Extension global references OK');
