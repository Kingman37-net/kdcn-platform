// KDCN Platform V2 — minimal HTTP server (stdlib)
// Includes JSON body parsing for POST/PATCH/PUT and CORS for dashboard.

import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

import { config } from './config.js';
import { errorEnvelope, successEnvelope } from './errors.js';

const routes = [];

export function route(method, path, handler) {
  const params = [];
  const regexPath = path.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => {
    params.push(n);
    return '([^/]+)';
  });
  routes.push({ method: method.toUpperCase(), regex: new RegExp(`^${regexPath}$`), params, handler });
}

function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.params.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return null;
}

// ---------- CORS ----------

function setCorsHeaders(res, origin) {
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('Vary', 'Origin');
  }
}

// ---------- Body parsing ----------

async function parseBody(req) {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return null;
  }

  const chunks = [];
  let size = 0;
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB hard cap

  const raw = await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

  if (!raw) return null;

  const ctype = (req.headers['content-type'] || '').toLowerCase();
  if (ctype.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      const err = new Error(`Invalid JSON: ${e.message}`);
      err.code = 'VALIDATION_FAILED';
      err.statusCode = 400;
      throw err;
    }
  }
  return raw;
}

function sendJson(res, status, body, requestId) {
  const payload = JSON.stringify(body, (_k, v) => typeof v === 'bigint' ? Number(v) : v);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Request-Id': requestId,
    'X-Powered-By': 'KDCN-Platform-V2',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(payload);
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    const requestId = req.headers['x-request-id'] || `req_${crypto.randomBytes(12).toString('hex')}`;
    const origin = req.headers['origin'] || '';

    // ---------- CORS ----------
    setCorsHeaders(res, origin);

    // ---------- Preflight ----------
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'X-Request-Id': requestId });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const m = match(req.method, url.pathname);

    if (!m) {
      sendJson(res, 404, errorEnvelope('NOT_FOUND', `No route for ${req.method} ${url.pathname}`, requestId), requestId);
      return;
    }

    // ---------- Parse body ----------
    let body = null;
    try {
      body = await parseBody(req);
    } catch (err) {
      const status = err.statusCode || 400;
      const code = err.code || 'VALIDATION_FAILED';
      sendJson(res, status, errorEnvelope(code, err.message, requestId), requestId);
      return;
    }

    try {
      const ctx = {
        req,
        url,
        requestId,
        params: m.params,
        body,
        query: Object.fromEntries(url.searchParams),
      };

      const result = await m.handler(ctx);
      const [status, payload] = Array.isArray(result) ? result : [200, result];

      if (payload === null || payload === undefined) {
        sendJson(res, status, {}, requestId);
        return;
      }

      const wrapped = (typeof payload === 'object' && 'ok' in payload)
        ? payload
        : successEnvelope(payload);

      sendJson(res, status, wrapped, requestId);
    } catch (err) {
      const status = err.statusCode || 500;
      const code = err.code || 'INTERNAL_ERROR';
      const msg = config.isProduction ? 'Something went wrong.' : err.message;
      sendJson(res, status, errorEnvelope(code, msg, requestId), requestId);
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`▶ KDCN Platform V2 API on http://${config.host}:${config.port}`);
    console.log(`▶ Environment: ${config.environment}`);
    console.log(`▶ DB path: ${config.dbPath}`);
    console.log('▶ Press Ctrl+C to stop.');
  });
  return server;
}
