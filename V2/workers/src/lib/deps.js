// KDCN Platform V2 — auth middleware

import { ApiError } from './errors.js';
import { verifyJWT } from './security.js';
import { one } from './db.js';

export async function authenticate(ctx) {
  const auth = ctx.req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    throw new ApiError('UNAUTHENTICATED', 'Missing or malformed Authorization header.', 401);
  }
  const token = auth.slice(7).trim();

  let payload;
  try {
    payload = await verifyJWT(token, ctx.env.JWT_SECRET, ctx.env.JWT_ISSUER, ctx.env.JWT_AUDIENCE);
  } catch (e) {
    throw new ApiError('UNAUTHENTICATED', e.message, 401);
  }

  const u = await one(
    ctx.db,
    `SELECT id, email, display_name, is_active, is_staff, is_locked
     FROM users WHERE id = ?`,
    payload.sub
  );

  if (!u) throw new ApiError('UNAUTHENTICATED', 'Account not found.', 401);
  if (!u.is_active || u.is_locked) throw new ApiError('UNAUTHENTICATED', 'Account inactive.', 401);

  ctx.user = {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    is_staff: Boolean(u.is_staff),
  };
  return ctx.user;
}

export async function requireAuth(ctx) {
  if (!ctx.user) await authenticate(ctx);
  return ctx.user;
}

export async function requireStaff(ctx) {
  const user = await requireAuth(ctx);
  if (!user.is_staff) throw new ApiError('PERMISSION_DENIED', 'Staff access required.', 403);
  return user;
}
