// KDCN Platform V2 — clients CRUD (Workers)

import { ApiError } from '../lib/errors.js';
import { one, all, run } from '../lib/db.js';
import { requireAuth, requireStaff } from '../lib/deps.js';
import { generateId } from '../lib/security.js';

function nowISO() { return new Date().toISOString(); }

export async function listClients(ctx) {
  await requireAuth(ctx);
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;
  const q = (ctx.query.q || '').trim();

  let where = '1=1';
  const params = [];
  if (q) {
    where += ' AND (company_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const totalRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM clients WHERE ${where}`, ...params);
  const total = totalRow ? totalRow.c : 0;

  const rows = await all(
    ctx.db,
    `SELECT id, company_name, phone, email, address, created_at, updated_at
     FROM clients WHERE ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, perPage, offset
  );

  return {
    ok: true,
    data: rows,
    meta: { page, per_page: perPage, total, pages: Math.ceil(total / perPage) },
  };
}

export async function getClient(ctx) {
  await requireAuth(ctx);
  const id = ctx.params.id;
  const client = await one(
    ctx.db,
    `SELECT id, company_name, phone, email, address, created_at, updated_at
     FROM clients WHERE id = ?`,
    id
  );
  if (!client) throw new ApiError('NOT_FOUND', 'Client not found.', 404);

  const projects = await all(
    ctx.db,
    `SELECT id, name, status, start_date, end_date FROM projects
     WHERE client_id = ? ORDER BY created_at DESC`,
    id
  );

  return { ok: true, data: { ...client, projects } };
}

export async function createClient(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};

  if (!b.company_name) {
    throw new ApiError('VALIDATION_FAILED', 'company_name is required.', 400);
  }

  const id = generateId('cli');
  const now = nowISO();

  await ctx.db.batch([
    ctx.db.prepare(
      `INSERT INTO clients (id, company_name, phone, email, address, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, b.company_name, b.phone || null, b.email || null, b.address || null, now, now, user.id),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, 'clients.create', 'clients', ?, ?, 'info', ?)`
    ).bind(generateId('aud'), user.id, id, JSON.stringify({ company_name: b.company_name }), now),
  ]);

  return [201, { ok: true, data: { id, company_name: b.company_name, created_at: now } }];
}

export async function updateClient(ctx) {
  const user = await requireStaff(ctx);
  const b = ctx.body || {};
  const id = ctx.params.id;

  const before = await one(ctx.db, `SELECT * FROM clients WHERE id = ?`, id);
  if (!before) throw new ApiError('NOT_FOUND', 'Client not found.', 404);

  const fields = ['company_name', 'phone', 'email', 'address'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
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
    ctx.db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).bind(...params),
    ctx.db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, before_json, after_json, severity, created_at)
       VALUES (?, ?, 'clients.update', 'clients', ?, ?, ?, 'info', ?)`
    ).bind(
      generateId('aud'),
      user.id,
      id,
      JSON.stringify(before),
      JSON.stringify(after),
      nowISO()
    ),
  ]);

  return { ok: true, data: after };
}
