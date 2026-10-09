// KDCN Platform V2 — minimal HTTP server (stdlib)
// Full routing/auth added in Session 2.

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
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const m = match(req.method, url.pathname);

    if (!m) {
      sendJson(res, 404, errorEnvelope('NOT_FOUND', `No route for ${req.method} ${url.pathname}`, requestId), requestId);
      return;
    }

    try {
      const ctx = { req, url, requestId, params: m.params, query: Object.fromEntries(url.searchParams) };
      const result = await m.handler(ctx);
      const [status, payload] = Array.isArray(result) ? result : [200, result];
      if (payload === null || payload === undefined) { sendJson(res, status, {}, requestId); return; }
      const body = (typeof payload === 'object' && 'ok' in payload) ? payload : successEnvelope(payload);
      sendJson(res, status, body, requestId);
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
