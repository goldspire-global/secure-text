/**
 * Zip extension/dist for Chrome Web Store / Edge Add-ons submission.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(repoRoot, 'extension', 'dist');
const outDir = join(repoRoot, 'extension', 'store');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(dist)) {
  console.error('Missing extension/dist — run: npm run package');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '0.0.0';
const zipName = `veil-${version}.zip`;
const zipPath = join(outDir, zipName);

function zipDist() {
  if (process.platform === 'win32') {
    const ps = `$dist = ${JSON.stringify(dist)}; $zip = ${JSON.stringify(zipPath)}; if (Test-Path $zip) { Remove-Item $zip -Force }; Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force`;
    execSync(`powershell -NoProfile -Command ${JSON.stringify(ps)}`, { stdio: 'inherit' });
    return;
  }
  execSync(`cd ${JSON.stringify(dist)} && zip -r ${JSON.stringify(zipPath)} .`, { stdio: 'inherit' });
}

zipDist();

function privacyPolicyUrl() {
  const constantsPath = join(repoRoot, 'extension', 'src', 'constants.js');
  if (!existsSync(constantsPath)) return '';
  const text = readFileSync(constantsPath, 'utf8');
  const originMatch = text.match(/PORTAL_ORIGIN:\s*("([^"]*)"|'([^']*)')/);
  const origin = originMatch?.[2] || originMatch?.[3] || '';
  return origin ? `${origin.replace(/\/$/, '')}/privacy.html` : '';
}

const listing = {
  name: 'Veil by Goldspire',
  version,
  zip: zipName,
  privacyPolicy: privacyPolicyUrl(),
  submit: {
    chrome: 'https://chrome.google.com/webstore/devconsole',
    edge: 'https://partner.microsoft.com/dashboard/microsoftedge/overview',
  },
};

writeFileSync(join(outDir, 'listing.json'), `${JSON.stringify(listing, null, 2)}\n`);
console.log(`Store package: ${zipPath}`);
console.log(`Listing meta: ${join(outDir, 'listing.json')}`);
