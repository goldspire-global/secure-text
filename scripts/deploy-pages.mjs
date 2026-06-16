import { cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const unlockDeploy = join(repoRoot, 'extension', 'dist', 'unlock-deploy');

for (const file of readdirSync(unlockDeploy)) {
  cpSync(join(unlockDeploy, file), join(repoRoot, file), { force: true });
}

console.log(`Deployed unlock page to repo root (GitHub Pages): ${repoRoot}`);
