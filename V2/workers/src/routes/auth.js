// KDCN Platform V2 — auth routes (Workers)

import { ApiError } from '../lib/errors.js';
import { one, run } from '../lib/db.js';
import {
  verifyPassword, signJWT, generateId,
  generateRefreshToken, hashRefreshToken,
} from '../lib/security.js';
import { requireAuth } from '../lib/deps.js';

const MAX_FAILED = 5;

function nowISO() { return new Date().toISOString(); }
function futureISO(days) {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export async function login(ctx) {
  const body = ctx.body || {};
  const email = body.email;
  const password = body.password;

  if (!email || !password) {
    throw new ApiError('VALIDATION_FAILED', 'email and password are required.', 400);
  }

  const user = await one(
    ctx.db,
    `SELECT id, email, display_name, password_hash,
            is_active, is_staff, is_locked, failed_login_count
     FROM users WHERE email = ?`,
    email
  );

  if (!user) throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
  if (user.is_locked) throw new ApiError('PERMISSION_DENIED', 'Account is locked.', 403);
  if (!user.is_active) throw new ApiError('PERMISSION_DENIED', 'Account is disabled.', 403);

const result = await verifyPassword(password, user.password_hash);
if (!result.ok) {
  if (result.reason === 'crypto_error') {
    throw new ApiError('INTERNAL_ERROR', `Crypto failed: ${result.error}`, 500);
  }
  const fails = (user.failed_login_count || 0) + 1;
  const lock = fails >= MAX_FAILED ? 1 : 0;
  await run(ctx.db,
    `UPDATE users SET failed_login_count = ?, is_locked = ?, updated_at = ? WHERE id = ?`,
    fails, lock, nowISO(), user.id
  );
  throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
}

  await run(ctx.db,
    `UPDATE users SET failed_login_count = 0, last_login_at = ?, updated_at = ? WHERE id = ?`,
    nowISO(), nowISO(), user.id
  );

  const accessToken = await signJWT(
    { sub: user.id, email: user.email, is_staff: Boolean(user.is_staff) },
    ctx.env.JWT_SECRET,
    Number(ctx.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    ctx.env.JWT_ISSUER,
    ctx.env.JWT_AUDIENCE
  );

  const refreshToken = generateRefreshToken();
  const sessionId = generateId('ses');

  await run(ctx.db,
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    sessionId,
    user.id,
    await hashRefreshToken(refreshToken),
    ctx.req.headers.get('user-agent') || null,
    ctx.req.headers.get('cf-connecting-ip') || null,
    futureISO(Number(ctx.env.REFRESH_TOKEN_TTL_DAYS || 7)),
    nowISO()
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number(ctx.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      is_staff: Boolean(user.is_staff),
    },
  };
}

export async function refresh(ctx) {
  const body = ctx.body || {};
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    throw new ApiError('VALIDATION_FAILED', 'refresh_token is required.', 400);
  }

  const hash = await hashRefreshToken(refreshToken);
  const session = await one(ctx.db,
    `SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = ?`,
    hash
  );

  if (!session) throw new ApiError('UNAUTHENTICATED', 'Invalid refresh token.', 401);
  if (session.revoked_at) throw new ApiError('UNAUTHENTICATED', 'Refresh token revoked.', 401);
  if (session.expires_at < nowISO()) {
    throw new ApiError('UNAUTHENTICATED', 'Refresh token expired.', 401);
  }

  const user = await one(ctx.db,
    `SELECT id, email, display_name, is_active, is_staff FROM users
     WHERE id = ? AND is_active = 1 AND is_locked = 0`,
    session.user_id
  );
  if (!user) throw new ApiError('UNAUTHENTICATED', 'User unavailable.', 401);

  await run(ctx.db, `UPDATE sessions SET revoked_at = ? WHERE id = ?`, nowISO(), session.id);

  const newRefresh = generateRefreshToken();
  const newSessionId = generateId('ses');
  await run(ctx.db,
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newSessionId,
    user.id,
    await hashRefreshToken(newRefresh),
    ctx.req.headers.get('user-agent') || null,
    ctx.req.headers.get('cf-connecting-ip') || null,
    futureISO(Number(ctx.env.REFRESH_TOKEN_TTL_DAYS || 7)),
    nowISO()
  );

  const accessToken = await signJWT(
    { sub: user.id, email: user.email, is_staff: Boolean(user.is_staff) },
    ctx.env.JWT_SECRET,
    Number(ctx.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    ctx.env.JWT_ISSUER,
    ctx.env.JWT_AUDIENCE
  );

  return {
    access_token: accessToken,
    refresh_token: newRefresh,
    expires_in: Number(ctx.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  };
}

export async function logout(ctx) {
  const user = await requireAuth(ctx);
  const body = ctx.body || {};
  const refreshToken = body.refresh_token;

  if (refreshToken) {
    const hash = await hashRefreshToken(refreshToken);
    await run(ctx.db,
      `UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND user_id = ?`,
      nowISO(), hash, user.id
    );
  } else {
    await run(ctx.db,
      `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
      nowISO(), user.id
    );
  }
  return [204, null];
}

export async function me(ctx) {
  const user = await requireAuth(ctx);
  return { ok: true, data: user };
}
