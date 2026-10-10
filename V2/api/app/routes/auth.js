// KDCN Platform V2 — auth routes

import { route } from '../server.js';
import { withConn } from '../db.js';
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import {
  verifyPassword, signJWT, generateId, generateRefreshToken, hashRefreshToken,
} from '../security.js';
import { requireAuth } from '../deps.js';

const MAX_FAILED = 5;

function nowISO() { return new Date().toISOString(); }
function futureISO(days = 0, seconds = 0) {
  const t = Date.now() + days * 86400_000 + seconds * 1000;
  return new Date(t).toISOString();
}

// ---------------- POST /auth/login ----------------

route('POST', '/auth/login', async (ctx) => {
  const { email, password } = ctx.body || {};
  if (!email || !password) {
    throw new ApiError('VALIDATION_FAILED', 'email and password are required.', 400);
  }

  return withConn(async (db) => {
    const user = db.prepare(
      `SELECT id, email, display_name, password_hash,
              is_active, is_staff, is_locked, failed_login_count
       FROM users WHERE email = ?`
    ).get(email);

    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }
    if (user.is_locked) {
      throw new ApiError('PERMISSION_DENIED', 'Account is locked.', 403);
    }
    if (!user.is_active) {
      throw new ApiError('PERMISSION_DENIED', 'Account is disabled.', 403);
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const fails = (user.failed_login_count || 0) + 1;
      const lock = fails >= MAX_FAILED ? 1 : 0;
      db.prepare(
        `UPDATE users SET failed_login_count = ?, is_locked = ?, updated_at = ? WHERE id = ?`
      ).run(fails, lock, nowISO(), user.id);
      throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    db.prepare(
      `UPDATE users SET failed_login_count = 0, last_login_at = ?, updated_at = ? WHERE id = ?`
    ).run(nowISO(), nowISO(), user.id);

    const accessToken = signJWT({
      sub: user.id,
      email: user.email,
      is_staff: !!user.is_staff,
    });

    const refreshToken = generateRefreshToken();
    const sessionId = generateId('ses');
    db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, user.id, hashRefreshToken(refreshToken),
      ctx.req.headers['user-agent'] || null,
      ctx.req.headers['x-forwarded-for'] || null,
      futureISO(config.refreshTokenTtlDays), nowISO()
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: config.accessTokenTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        is_staff: !!user.is_staff,
      },
    };
  });
});

// ---------------- POST /auth/refresh ----------------

route('POST', '/auth/refresh', async (ctx) => {
  const { refresh_token } = ctx.body || {};
  if (!refresh_token) {
    throw new ApiError('VALIDATION_FAILED', 'refresh_token is required.', 400);
  }

  return withConn(async (db) => {
    const hash = hashRefreshToken(refresh_token);
    const session = db.prepare(
      `SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = ?`
    ).get(hash);

    if (!session) throw new ApiError('UNAUTHENTICATED', 'Invalid refresh token.', 401);
    if (session.revoked_at) throw new ApiError('UNAUTHENTICATED', 'Refresh token revoked.', 401);
    if (session.expires_at < nowISO()) {
      throw new ApiError('UNAUTHENTICATED', 'Refresh token expired.', 401);
    }

    const user = db.prepare(
      `SELECT id, email, display_name, is_active, is_staff FROM users
       WHERE id = ? AND is_active = 1 AND is_locked = 0`
    ).get(session.user_id);
    if (!user) throw new ApiError('UNAUTHENTICATED', 'User unavailable.', 401);

    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(nowISO(), session.id);

    const newRefresh = generateRefreshToken();
    const newSessionId = generateId('ses');
    db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newSessionId, user.id, hashRefreshToken(newRefresh),
      ctx.req.headers['user-agent'] || null,
      ctx.req.headers['x-forwarded-for'] || null,
      futureISO(config.refreshTokenTtlDays), nowISO()
    );

    const accessToken = signJWT({
      sub: user.id, email: user.email, is_staff: !!user.is_staff,
    });

    return {
      access_token: accessToken,
      refresh_token: newRefresh,
      expires_in: config.accessTokenTtlSeconds,
    };
  });
});

// ---------------- POST /auth/logout ----------------

route('POST', '/auth/logout', async (ctx) => {
  const user = await requireAuth(ctx);
  const { refresh_token } = ctx.body || {};

  await withConn((db) => {
    if (refresh_token) {
      const hash = hashRefreshToken(refresh_token);
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND user_id = ?`
      ).run(nowISO(), hash, user.id);
    } else {
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
      ).run(nowISO(), user.id);
    }
  });

  return [204, null];
});

// ---------------- GET /auth/me ----------------

route('GET', '/auth/me', async (ctx) => {
  const user = await requireAuth(ctx);
  return { ok: true, data: user };
});
