// KDCN Platform V2 — service catalog CRUD

import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireAuth, requireStaff } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

// ---------------- GET /services ----------------

route('GET', '/services', async (ctx) => {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  const result = await withConn((db) => {
    const params = [];
    let where = '1=1';
    if (ctx.query.is_active !== undefined) {
      where += ' AND is_active = ?';
      params.push(ctx.query.is_active === '1' || ctx.query.is_active === 'true' ? 1 : 0);
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM services WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT id, name, description, price_minor, currency, is_active, created_at, updated_at
       FROM services WHERE ${where}
       ORDER BY name ASC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);
    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: { page, per_page: perPage, total: result.total, pages: Math.ceil(result.total / perPage) },
  };
});

// ---------------- GET /services/:id ----------------

route('GET', '/services/{id}', async (ctx) => {
  await requireAuth(ctx);
  const s = await withConn((db) =>
    db.prepare('SELECT * FROM services WHERE id = ?').get(ctx.params.id)
  );
  if (!s) throw new ApiError('NOT_FOUND', 'Service not found.', 404);
  return { ok: true, data: s };
});

// ---------------- POST /services ----------------

route('POST', '/services', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  if (!b.name) throw new ApiError('VALIDATION_FAILED', 'name is required.', 400);
  if (b.price_minor != null && (!Number.isInteger(b.price_minor) || b.price_minor < 0)) {
    throw new ApiError('VALIDATION_FAILED', 'price_minor must be a non-negative integer.', 400);
  }

  const result = await withTx((db) => {
    const id = generateId('svc');
    const now = nowISO();
    db.prepare(
      `INSERT INTO services (id, name, description, price_minor, currency, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, b.name, b.description || null, b.price_minor ?? null,
      b.currency || 'KES', b.is_active === false ? 0 : 1, now, now, user.id
    );

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'services.create', 'services', ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify({ name: b.name }), now);

    return db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  });

  return [201, { ok: true, data: result }];
});

// ---------------- PATCH /services/:id ----------------

route('PATCH', '/services/{id}', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const result = await withTx((db) => {
    const before = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    if (!before) throw new ApiError('NOT_FOUND', 'Service not found.', 404);

    const fields = ['name', 'description', 'price_minor', 'currency', 'is_active'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (f in b) {
        if (f === 'price_minor' && b[f] != null && (!Number.isInteger(b[f]) || b[f] < 0)) {
          throw new ApiError('VALIDATION_FAILED', 'price_minor must be a non-negative integer.', 400);
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
    if (sets.length === 0) throw new ApiError('VALIDATION_FAILED', 'No fields to update.', 400);

    sets.push('updated_at = ?');
    params.push(nowISO());
    params.push(id);

    db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    const after = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'services.update', 'services', ?, ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify(before), JSON.stringify(after), nowISO());

    return after;
  });

  return { ok: true, data: result };
});
