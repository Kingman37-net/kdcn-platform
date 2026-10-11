// KDCN Platform V2 — dashboard aggregates (Workers)

import { one, all } from '../lib/db.js';
import { requireAuth } from '../lib/deps.js';

export async function getDashboard(ctx) {
  await requireAuth(ctx);

  const clientsRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM clients`);
  const projTotalRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM projects`);
  const projActiveRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM projects WHERE status = 'active'`);
  const projPendingRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM projects WHERE status = 'pending'`);
  const svcTotalRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM services`);
  const svcActiveRow = await one(ctx.db, `SELECT COUNT(*) AS c FROM services WHERE is_active = 1`);

  const counts = {
    clients: clientsRow ? clientsRow.c : 0,
    projects_total: projTotalRow ? projTotalRow.c : 0,
    projects_active: projActiveRow ? projActiveRow.c : 0,
    projects_pending: projPendingRow ? projPendingRow.c : 0,
    services_total: svcTotalRow ? svcTotalRow.c : 0,
    services_active: svcActiveRow ? svcActiveRow.c : 0,
  };

  const recent_clients = await all(
    ctx.db,
    `SELECT id, company_name, created_at FROM clients ORDER BY created_at DESC LIMIT 5`
  );

  const recent_projects = await all(
    ctx.db,
    `SELECT p.id, p.name, p.status, c.company_name AS client_name, p.created_at
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     ORDER BY p.created_at DESC LIMIT 5`
  );

  return { ok: true, data: { counts, recent_clients, recent_projects } };
}
