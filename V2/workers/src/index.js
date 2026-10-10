// KDCN Platform V2 — Cloudflare Worker (API + dashboard assets)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestId = request.headers.get('X-Request-Id') || `req_${crypto.randomUUID().slice(0, 24)}`;

    if (url.pathname === '/health') {
      return json({
        ok: true,
        data: {
          status: 'alive',
          service: 'kdcn-platform-api',
          runtime: 'cloudflare-workers',
          environment: env.ENVIRONMENT || 'production',
          phase: '5a',
          timestamp: new Date().toISOString(),
        },
      }, 200, requestId);
    }

    if (url.pathname === '/') {
      return json({
        ok: true,
        data: {
          service: 'KDCN Platform API',
          phase: '5a — scaffold',
          endpoints: ['/health'],
        },
      }, 200, requestId);
    }

    return json({
      ok: false,
      error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${url.pathname}`, request_id: requestId },
    }, 404, requestId);
  },
};

function json(data, status, requestId) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      'X-Powered-By': 'KDCN-Platform',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
