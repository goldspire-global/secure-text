import { generateKeyPairSync } from 'node:crypto';
import { getPool, closePool } from '../src/db.mjs';

const DEMO_ORG = {
  id: 'nova-care',
  displayName: 'Nova Care',
  teamPassphrase: 'NovaCare-Team-Demo-2024!',
  policyVersion: 1,
  settings: {
    passphraseFromVault: false,
    useSavedPassphrase: true,
    defaultSecureMode: 'team',
    enforceStrongPassphrase: true,
  },
};

const DEMO_JOIN_CODES = ['DEMO-N0VA7', 'DEMO-NOVA7'];

const DEMO_MEMBERS = [
  { email: 'alice@novacare.demo', displayName: 'Alice Demo' },
  { email: 'bob@novacare.demo', displayName: 'Bob Demo' },
];

function demoPublicJwk() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return publicKey.export({ format: 'jwk' });
}

async function main() {
  const pool = getPool();

  await pool.query(
    `INSERT INTO organizations (id, display_name, team_passphrase, policy_version, settings)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       team_passphrase = EXCLUDED.team_passphrase,
       policy_version = EXCLUDED.policy_version,
       settings = EXCLUDED.settings,
       updated_at = now()`,
    [
      DEMO_ORG.id,
      DEMO_ORG.displayName,
      DEMO_ORG.teamPassphrase,
      DEMO_ORG.policyVersion,
      JSON.stringify(DEMO_ORG.settings),
    ],
  );

  for (const code of DEMO_JOIN_CODES) {
    await pool.query(
      `INSERT INTO join_codes (code, org_id, active)
       VALUES ($1, $2, true)
       ON CONFLICT (code) DO UPDATE SET
         org_id = EXCLUDED.org_id,
         active = true`,
      [code, DEMO_ORG.id],
    );
  }

  for (const member of DEMO_MEMBERS) {
    await pool.query(
      `INSERT INTO org_members (org_id, email, display_name, public_key_jwk, active)
       VALUES ($1, $2, $3, $4::jsonb, true)
       ON CONFLICT (org_id, email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         active = true`,
      [DEMO_ORG.id, member.email, member.displayName, JSON.stringify(demoPublicJwk())],
    );
  }

  console.log(`Seeded org "${DEMO_ORG.displayName}" (${DEMO_ORG.id})`);
  console.log(`Join codes: ${DEMO_JOIN_CODES.join(', ')}`);
  console.log(`Directory: ${DEMO_MEMBERS.map((m) => m.email).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(() => closePool());
