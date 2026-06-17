import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directUrl, withClient } from '../src/db.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client) {
  const result = await client.query('SELECT name FROM _schema_migrations ORDER BY name');
  return new Set(result.rows.map((row) => row.name));
}

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  await withClient(directUrl(), async (client) => {
    await ensureMigrationsTable(client);
    const done = await appliedMigrations(client);

    for (const file of files) {
      if (done.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  });

  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
