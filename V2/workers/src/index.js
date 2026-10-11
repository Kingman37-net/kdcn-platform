// KDCN Platform V2 — Cloudflare Worker entrypoint

import { ApiError, errorEnvelope, successEnvelope } from './lib/errors.js';
import { getDB } from './lib/db.js';
import { login, refresh, logout, me } from './routes/auth.js';

const routes = [];

function route(method, pattern, handler) {
  const paramNames = [];
  const regexPath = pattern.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => {
    paramNames.push(n);
    return '([^/]+)';
  });
  routes.push({ method, regex: new RegExp(`^${regexPath}$`), paramNames, handler });
}

function match(method, path) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.regex);
    if (!m) continue;
    const params = {};
    r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return null;
}

// ---------- Health ----------
route('GET', '/health', async (ctx) => ({
  ok: true,
  data: {
    status: 'alive',
    service: 'kdcn-platform-api',
    runtime: 'cloudflare-workers',
    environment: ctx.env.ENVIRONMENT || 'production',
    phase: '5c',
    timestamp: new Date().toISOString(),
  },
}));

// ---------- Auth ----------
route('POST', '/auth/login', login);
route('POST', '/auth/refresh', refresh);
route('POST', '/auth/logout', logout);
route('GET', '/auth/me', me);

// ---------- Root ----------
route('GET', '/', async () => ({
  ok: true,
  data: {
    service: 'KDCN Platform API',
    phase: '5c',
    endpoints: ['/health', '/auth/login', '/auth/refresh', '/auth/logout', '/auth/me'],
  },
}));

// ---------- Response helpers ----------
function sendJson(body, status, requestId, corsOrigin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Powered-By': 'KDCN-Platform',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Request-Id';
    headers['Access-Control-Expose-Headers'] = 'X-Request-Id';
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

const ALLOWED_ORIGINS = [
  'https://admin.kingmandigital.co.ke',
  'https://platform.kingmandigital.co.ke',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestId = request.headers.get('X-Request-Id')
      || `req_${crypto.randomUUID().slice(0, 24)}`;

    // CORS preflight
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'X-Request-Id': requestId,
          ...(corsOrigin ? {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
            'Access-Control-Expose-Headers': 'X-Request-Id',
            'Vary': 'Origin',
          } : {}),
        },
      });
    }

    // Match route
    const m = match(request.method, url.pathname);
    if (!m) {
      return sendJson(errorEnvelope('NOT_FOUND', `No route for ${request.method} ${url.pathname}`, requestId), 404, requestId, corsOrigin);
    }

    // Parse body
    let body = null;
    if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
      try {
        const ctype = (request.headers.get('content-type') || '').toLowerCase();
        if (ctype.includes('application/json')) {
          const raw = await request.text();
          if (raw) body = JSON.parse(raw);
        }
      } catch (e) {
        return sendJson(errorEnvelope('VALIDATION_FAILED', `Invalid JSON: ${e.message}`, requestId), 400, requestId, corsOrigin);
      }
    }

    try {
      const ctx = {
        req: request,
        url,
        env,
        db: getDB(env),
        requestId,
        params: m.params,
        body,
        query: Object.fromEntries(url.searchParams),
      };

      const result = await m.handler(ctx);
      const [status, payload] = Array.isArray(result) ? result : [200, result];

      if (payload === null || payload === undefined) {
        return sendJson({}, status, requestId, corsOrigin);
      }

      const wrapped = (typeof payload === 'object' && 'ok' in payload)
        ? payload
        : successEnvelope(payload);

      return sendJson(wrapped, status, requestId, corsOrigin);
    } catch (err) {
      const status = err.statusCode || 500;
      const code = err.code || 'INTERNAL_ERROR';
      const msg = env.ENVIRONMENT === 'production' ? 'Something went wrong.' : err.message;
      return sendJson(errorEnvelope(code, msg, requestId), status, requestId, corsOrigin);
    }
  },
};
