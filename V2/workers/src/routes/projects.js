// KDCN Platform V2 — projects CRUD (Workers)

import { ApiError } from '../lib/errors.js';
import { one, all, run } from '../lib/db.js';
import { requireAuth, requireStaff } from '../lib/deps.js';
import { generateId } from '../lib/security.js';

function nowISO() { return new Date().toISOString(); }

const VALID_STATUS = ['pending', 'active', 'completed', 'cancelled'];

export async function listProjects(ctx) {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  let where = '1=1';
  const params = [];
  if (ctx.query.status) {
    where += ' AND p.status = ?';
    params.push(ctx.query.status);
  }
  if (ctx.query.client_id) {
    where += ' AND p.client_id = ?';
    params.push(ctx.query.client_id);
  }

  const totalRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM projects p WHERE ${where}`, ...params);
  const total = totalRow ? totalRow.c : 0;

  const rows = await all(
    ctx.db,
    `SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date,
            p.client_id, c.company_name AS client_name, p.created_at
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE ${where}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    ...params, perPage, offset
  );

  return {
    ok: true,
    data: rows,
    meta: { page, per_page: perPage, total, pages: Math.ceil(total / perPage) },
  };
}

export async function getProject(ctx) {
  await requireAuth(ctx);
  const p = await one(
    ctx.db,
    `SELECT p.*, c.company_name AS client_name
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = ?`,
    ctx.params.id
  );
  if (!p) throw new ApiError('NOT_FOUND', 'Project not found.', 404);
  return { ok: true, data: p };
}

export async function createProject(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};

  if (!b.name) throw new ApiError('VALIDATION_FAILED', 'name is required.', 400);
  if (b.status && !VALID_STATUS.includes(b.status)) {
    throw new ApiError('VALIDATION_FAILED', `status must be one of: ${VALID_STATUS.join(', ')}.`, 400);
  }

  if (b.client_id) {
    const c = await one(ctx.db, `SELECT id FROM clients WHERE id = ?`, b.client_id);
    if (!c) throw new ApiError('NOT_FOUND', `Client ${b.client_id} not found.`, 404);
  }

  const id = generateId('prj');
  const now = nowISO();
  const status = b.status || 'pending';

  await ctx.db.batch([
    ctx.db.prepare(
      `INSERT INTO projects (id, name, description, client_id, status, start_date, end_date, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, b.name, b.description || null, b.client_id || null, status,
           b.start_date || null, b.end_date || null, now, now, user.id),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'projects.create', 'projects', ?, ?, 'info', ?)`
    ).bind(generateId('aud'), user.id, id, JSON.stringify({ name: b.name, status }), now),
  ]);

  const project = await one(ctx.db, `SELECT * FROM projects WHERE id = ?`, id);
  return [201, { ok: true, data: project }];
}

export async function updateProject(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const before = await one(ctx.db, `SELECT * FROM projects WHERE id = ?`, id);
  if (!before) throw new ApiError('NOT_FOUND', 'Project not found.', 404);

  const fields = ['name', 'description', 'client_id', 'status', 'start_date', 'end_date'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
      if (f === 'status' && !VALID_STATUS.includes(b[f])) {
        throw new ApiError('VALIDATION_FAILED', `status must be one of: ${VALID_STATUS.join(', ')}.`, 400);
      }
      sets.push(`${f} = ?`);
      params.push(b[f]);
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
    if (Object.prototype.hasOwnProperty.call(b, f)) after[f] = b[f];
  }
  after.updated_at = nowISO();

  await ctx.db.batch([
    ctx.db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...params),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'projects.update', 'projects', ?, ?, ?, 'info', ?)`
    ).bind(generateId('aud'), user.id, id, JSON.stringify(before), JSON.stringify(after), nowISO()),
  ]);

  return { ok: true, data: after };
}
