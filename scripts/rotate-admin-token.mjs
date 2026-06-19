/**
 * Rotate admin sign-in key for an org (by id or display name substring).
 * Usage: node scripts/rotate-admin-token.mjs ayotestinc
 */
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { loadEnv } from './load-env.mjs';

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node scripts/rotate-admin-token.mjs <org-id-or-name>');
  process.exit(1);
}

function hashAdminToken(token) {
  return createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function generateAdminToken() {
  return `gst_${randomBytes(32).toString('base64url')}`;
}

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DIRECT_URL || env.DATABASE_URL });

const { rows } = await pool.query(
  `SELECT id, display_name, admin_email, admin_token_hash IS NOT NULL AS has_admin
   FROM organizations
   WHERE id ILIKE $1 OR display_name ILIKE $1
   ORDER BY created_at DESC`,
  [`%${needle}%`],
);

if (rows.length === 0) {
  console.error(`No organization matching "${needle}".`);
  await pool.end();
  process.exit(1);
}

for (const org of rows) {
  const adminToken = generateAdminToken();
  await pool.query(
    'UPDATE organizations SET admin_token_hash = $1, updated_at = now() WHERE id = $2',
    [hashAdminToken(adminToken), org.id],
  );
  console.log(JSON.stringify({
    id: org.id,
    display_name: org.display_name,
    admin_email: org.admin_email || null,
    adminToken,
  }, null, 2));
}

await pool.end();
