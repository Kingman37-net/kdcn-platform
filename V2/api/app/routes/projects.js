// KDCN Platform V2 — project CRUD

import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireAuth, requireStaff } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

const VALID_STATUS = ['pending', 'active', 'completed', 'cancelled'];

// ---------------- GET /projects ----------------

route('GET', '/projects', async (ctx) => {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  const result = await withConn((db) => {
    const params = [];
    let where = '1=1';
    if (ctx.query.status) {
      where += ' AND p.status = ?';
      params.push(ctx.query.status);
    }
    if (ctx.query.client_id) {
      where += ' AND p.client_id = ?';
      params.push(ctx.query.client_id);
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM projects p WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date,
              p.client_id, c.company_name AS client_name, p.created_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE ${where}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);
    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: { page, per_page: perPage, total: result.total, pages: Math.ceil(result.total / perPage) },
  };
});

// ---------------- GET /projects/:id ----------------

route('GET', '/projects/{id}', async (ctx) => {
  await requireAuth(ctx);
  const p = await withConn((db) =>
    db.prepare(
      `SELECT p.*, c.company_name AS client_name
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.id = ?`
    ).get(ctx.params.id)
  );
  if (!p) throw new ApiError('NOT_FOUND', 'Project not found.', 404);
  return { ok: true, data: p };
});

// ---------------- POST /projects ----------------

route('POST', '/projects', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  if (!b.name) throw new ApiError('VALIDATION_FAILED', 'name is required.', 400);
  if (b.status && !VALID_STATUS.includes(b.status)) {
    throw new ApiError('VALIDATION_FAILED', `status must be one of: ${VALID_STATUS.join(', ')}.`, 400);
  }

  const result = await withTx((db) => {
    // Validate client if provided
    if (b.client_id) {
      const c = db.prepare('SELECT id FROM clients WHERE id = ?').get(b.client_id);
      if (!c) throw new ApiError('NOT_FOUND', `Client ${b.client_id} not found.`, 404);
    }

    const id = generateId('prj');
    const now = nowISO();
    db.prepare(
      `INSERT INTO projects (id, name, description, client_id, status, start_date, end_date, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, b.name, b.description || null, b.client_id || null,
      b.status || 'pending', b.start_date || null, b.end_date || null,
      now, now, user.id
    );

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'projects.create', 'projects', ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify({ name: b.name, status: b.status || 'pending' }), now);

    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  return [201, { ok: true, data: result }];
});

// ---------------- PATCH /projects/:id ----------------

route('PATCH', '/projects/{id}', async (ctx) => {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const result = await withTx((db) => {
    const before = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!before) throw new ApiError('NOT_FOUND', 'Project not found.', 404);

    const fields = ['name', 'description', 'client_id', 'status', 'start_date', 'end_date'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (f in b) {
        if (f === 'status' && !VALID_STATUS.includes(b[f])) {
          throw new ApiError('VALIDATION_FAILED', `status must be one of: ${VALID_STATUS.join(', ')}.`, 400);
        }
        sets.push(`${f} = ?`);
        params.push(b[f]);
      }
    }
    if (sets.length === 0) throw new ApiError('VALIDATION_FAILED', 'No fields to update.', 400);

    sets.push('updated_at = ?');
    params.push(nowISO());
    params.push(id);

    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    const after = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'projects.update', 'projects', ?, ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.id, id, JSON.stringify(before), JSON.stringify(after), nowISO());

    return after;
  });

  return { ok: true, data: result };
});
