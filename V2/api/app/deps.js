// KDCN Platform V2 — auth middleware

import { ApiError } from './errors.js';
import { verifyJWT } from './security.js';
import { withConn } from './db.js';

export async function authenticate(ctx) {
  const auth = ctx.req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) {
    throw new ApiError('UNAUTHENTICATED', 'Missing or malformed Authorization header.', 401);
  }
  const token = auth.slice(7).trim();

  let payload;
  try {
    payload = verifyJWT(token);
  } catch (e) {
    throw new ApiError('UNAUTHENTICATED', e.message, 401);
  }

  const user = await withConn((db) => {
    const u = db.prepare(
      `SELECT id, email, display_name, is_active, is_staff, is_locked
       FROM users WHERE id = ?`
    ).get(payload.sub);

    if (!u) return null;
    if (!u.is_active || u.is_locked) return null;

    return {
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      is_staff: !!u.is_staff,
    };
  });

  if (!user) throw new ApiError('UNAUTHENTICATED', 'Account not found or inactive.', 401);
  ctx.user = user;
  return user;
}

export async function requireAuth(ctx) {
  if (!ctx.user) await authenticate(ctx);
  return ctx.user;
}

export async function requireStaff(ctx) {
  const user = await requireAuth(ctx);
  if (!user.is_staff) {
    throw new ApiError('PERMISSION_DENIED', 'Staff access required.', 403);
  }
  return user;
}
