// KDCN Platform V2 — client CRUD

import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireAuth, requireStaff } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

// ---------------- GET /clients ----------------

route('GET', '/clients', async (ctx) => {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;
  const q = (ctx.query.q || '').trim();

  const result = await withConn((db) => {
    const params = [];
    let where = '1=1';
    if (q) {
      where += ' AND (company_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM clients WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT id, company_name, phone, email, address, created_at, updated_at
       FROM clients WHERE ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);
    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: { page, per_page: perPage, total: result.total, pages: Math.ceil(result.total / perPage) },
  };
});

// ---------------- GET /clients/:id ----------------

route('GET', '/clients/{id}', async (ctx) => {
  await requireAuth(ctx);
  const result = await withConn((db) => {
    const c = db.prepare(
      `SELECT id, company_name, phone, email, address, created_at, updated_at
       FROM clients WHERE id = ?`
    ).get(ctx.params.id);
    if (!c) return null;
    const projects = db.prepare(
      `SELECT id, name, status, start_date, end_date FROM projects
       WHERE client_id = ? ORDER BY created_at DESC`
    ).all(c.id);
    return { ...c, projects };
  });
  if (!result) throw new ApiError('NOT_FOUND', 'Client not found.', 404);
  return { ok: true, data: result };
});

// ---------------- POST /clients ----------------

route('POST', '/clients', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  if (!b.company_name) {
    throw new ApiError('VALIDATION_FAILED', 'company_name is required.', 400);
  }

  const result = await withTx((db) => {
    const id = generateId('cli');
    const now = nowISO();
    db.prepare(
      `INSERT INTO clients (id, company_name, phone, email, address, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, b.company_name, b.phone || null, b.email || null, b.address || null, now, now, user.id);

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'clients.create', 'clients', ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify({ company_name: b.company_name }), now);

    return { id, company_name: b.company_name, created_at: now };
  });

  return [201, { ok: true, data: result }];
});

// ---------------- PATCH /clients/:id ----------------

route('PATCH', '/clients/{id}', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const result = await withTx((db) => {
    const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!before) throw new ApiError('NOT_FOUND', 'Client not found.', 404);

    const fields = ['company_name', 'phone', 'email', 'address'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (f in b) { sets.push(`${f} = ?`); params.push(b[f]); }
    }
    if (sets.length === 0) throw new ApiError('VALIDATION_FAILED', 'No fields to update.', 400);

    sets.push('updated_at = ?');
    params.push(nowISO());
    params.push(id);

    db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    const after = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'clients.update', 'clients', ?, ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify(before), JSON.stringify(after), nowISO());

    return after;
  });

  return { ok: true, data: result };
});
