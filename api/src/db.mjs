import pg from 'pg';
import { loadEnv } from '../../scripts/load-env.mjs';

const { Pool } = pg;

let pool;

function sslConfig() {
  return { rejectUnauthorized: false };
}

export function databaseUrl() {
  const env = loadEnv();
  const url = env.API_DATABASE_URL || env.DATABASE_URL || env.DIRECT_URL;
  if (!url) {
    throw new Error('Set DATABASE_URL (runtime) or DIRECT_URL in .env');
  }
  // Supabase transaction pooler (:6543) is unreliable with node-pg prepared queries.
  if (url.includes(':6543') && env.DIRECT_URL) {
    return env.DIRECT_URL;
  }
  return url;
}

export function directUrl() {
  const env = loadEnv();
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) {
    throw new Error('Set DIRECT_URL (migrations) or DATABASE_URL in .env');
  }
  return url;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      ssl: sslConfig(),
    });
  }
  return pool;
}

export async function withClient(connectionString, fn) {
  const client = new pg.Client({
    connectionString,
    ssl: sslConfig(),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
