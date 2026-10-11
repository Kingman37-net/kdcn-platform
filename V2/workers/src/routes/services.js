// KDCN Platform V2 — services CRUD (Workers)

import { ApiError } from '../lib/errors.js';
import { one, all, run } from '../lib/db.js';
import { requireAuth, requireStaff } from '../lib/deps.js';
import { generateId } from '../lib/security.js';

function nowISO() { return new Date().toISOString(); }

export async function listServices(ctx) {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  let where = '1=1';
  const params = [];
  if (ctx.query.is_active !== undefined) {
    where += ' AND is_active = ?';
    params.push(ctx.query.is_active === '1' || ctx.query.is_active === 'true' ? 1 : 0);
  }

  const totalRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM services WHERE ${where}`, ...params);
  const total = totalRow ? totalRow.c : 0;

  const rows = await all(
    ctx.db,
    `SELECT id, name, description, price_minor, currency, is_active, created_at, updated_at
     FROM services WHERE ${where}
     ORDER BY name ASC LIMIT ? OFFSET ?`,
    ...params, perPage, offset
  );

  return {
    ok: true,
    data: rows,
    meta: { page, per_page: perPage, total, pages: Math.ceil(total / perPage) },
  };
}

export async function getService(ctx) {
  await requireAuth(ctx);
  const s = await one(ctx.db, `SELECT * FROM services WHERE id = ?`, ctx.params.id);
  if (!s) throw new ApiError('NOT_FOUND', 'Service not found.', 404);
  return { ok: true, data: s };
}

export async function createService(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};

  if (!b.name) throw new ApiError('VALIDATION_FAILED', 'name is required.', 400);
  if (b.price_minor !== undefined && b.price_minor !== null) {
    if (!Number.isInteger(b.price_minor) || b.price_minor < 0) {
      throw new ApiError('VALIDATION_FAILED', 'price_minor must be a non-negative integer.', 400);
    }
  }

  const id = generateId('svc');
  const now = nowISO();
  const active = b.is_active === false ? 0 : 1;

  await ctx.db.batch([
    ctx.db.prepare(
      `INSERT INTO services (id, name, description, price_minor, currency, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, b.name, b.description || null,
      b.price_minor !== undefined && b.price_minor !== null ? b.price_minor : null,
      b.currency || 'KES', active, now, now, user.id
    ),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'services.create', 'services', ?, ?, 'info', ?)`
    ).bind(generateId('aud'), user.id, id, JSON.stringify({ name: b.name }), now),
  ]);

  const service = await one(ctx.db, `SELECT * FROM services WHERE id = ?`, id);
  return [201, { ok: true, data: service }];
}

export async function updateService(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const before = await one(ctx.db, `SELECT * FROM services WHERE id = ?`, id);
  if (!before) throw new ApiError('NOT_FOUND', 'Service not found.', 404);

  const fields = ['name', 'description', 'price_minor', 'currency', 'is_active'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
      if (f === 'price_minor' && b[f] !== null) {
        if (!Number.isInteger(b[f]) || b[f] < 0) {
          throw new ApiError('VALIDATION_FAILED', 'price_minor must be a non-negative integer.', 400);
        }
      }
      if (f === 'is_active') {
        sets.push('is_active = ?');
        params.push(b[f] ? 1 : 0);
      } else {
        sets.push(`${f} = ?`);
        params.push(b[f]);
      }
    }
  }
  if (sets.length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update.', 400);
  }

  sets.push('updated_at = ?');
  params.push(nowISO());
  params.push(id);

  const after = { ...before };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
      after[f] = f === 'is_active' ? (b[f] ? 1 : 0) : b[f];
    }
  }
  after.updated_at = nowISO();

  await ctx.db.batch([
    ctx.db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).bind(...params),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'services.update', 'services', ?, ?, ?, 'info', ?)`
    ).bind(generateId('aud'), user.id, id, JSON.stringify(before), JSON.stringify(after), nowISO()),
  ]);

  return { ok: true, data: after };
}
