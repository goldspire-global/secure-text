import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../../scripts/load-env.mjs';
import { closePool } from './db.mjs';
import { joinWithCode, syncPolicy, httpError } from './org-service.mjs';
import {
  registerMember,
  listMembers,
  createShares,
  listPendingShares,
  claimShare,
} from './share-service.mjs';
import { parseAuthHeaders } from './auth.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(apiRoot, 'public');
const env = loadEnv();
const port = Number(env.API_PORT) || 3015;

function parseAllowedOrigins() {
  const raw = String(env.CORS_ALLOW_ORIGINS || '').trim();
  const values = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  // IMPORTANT: If unset, CORS is effectively disabled (no Access-Control-Allow-Origin).
  return new Set(values);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function getCorsOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return '';
  return ALLOWED_ORIGINS.has(origin) ? origin : '';
}

function writeCors(res, req) {
  const allowOrigin = getCorsOrigin(req);
  if (!allowOrigin) return;
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function json(res, req, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-Policy-Version, X-Extension-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  writeCors(res, req);
  res.end(payload);
}

function text(res, req, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
  });
  writeCors(res, req);
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const MAX_BYTES = 256 * 1024;
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  if (total > MAX_BYTES) {
    throw httpError(413, 'Request body too large.');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid JSON body.');
  }
}

function serveStatic(pathname, res) {
  const safePath = pathname.replace(/\.\./g, '');
  const filePath = join(publicDir, safePath === '/' ? 'join.html' : safePath);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) return false;

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const body = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  res.end(body);
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-Policy-Version, X-Extension-Version',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' });
    writeCors(res, req);
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/health') {
      json(res, req, 200, { ok: true, service: 'goldspire-secure-text-api' });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/org/join') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const body = await readBody(req);
      const deviceId = req.headers['x-device-id'] || body.deviceId;
      const payload = await joinWithCode(body.joinCode, deviceId);
      json(res, req, 200, payload);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/sync') {
      const { token, deviceId } = parseAuthHeaders(req);
      const clientVersion = req.headers['x-policy-version'];
      const result = await syncPolicy(token, deviceId, clientVersion);
      if (result.unchanged) {
        res.writeHead(304);
        writeCors(res, req);
        res.end();
        return;
      }
      json(res, req, 200, result.payload);
      return;
    }

    if (req.method === 'PUT' && pathname === '/v1/extension/org/member') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await registerMember(token, deviceId, body);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/members') {
      const { token, deviceId } = parseAuthHeaders(req);
      const query = url.searchParams.get('q') || '';
      const result = await listMembers(token, deviceId, query);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/org/shares') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await createShares(token, deviceId, body);
      json(res, req, 201, result);
      return;
    }

    const claimMatch = pathname.match(/^\/v1\/extension\/org\/shares\/([^/]+)\/claim$/);
    if (req.method === 'POST' && claimMatch) {
      const { token, deviceId } = parseAuthHeaders(req);
      const result = await claimShare(token, deviceId, claimMatch[1]);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/shares/pending') {
      const { token, deviceId } = parseAuthHeaders(req);
      const result = await listPendingShares(token, deviceId);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && (pathname === '/secure-text/join' || pathname.startsWith('/secure-text/join/'))) {
      if (serveStatic('join.html', res)) return;
    }

    if (req.method === 'GET' && pathname.startsWith('/public/')) {
      if (serveStatic(pathname.slice('/public/'.length), res)) return;
    }

    json(res, req, 404, { error: 'Not found' });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    if (status >= 500) console.error(err);
    json(res, req, status, { error: message, message });
  }
});

server.listen(port, () => {
  console.log(`Goldspire org API listening on http://localhost:${port}`);
  console.log(`Join portal: http://localhost:${port}/secure-text/join`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await closePool();
    process.exit(0);
  });
}
