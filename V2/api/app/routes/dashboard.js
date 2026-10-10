// KDCN Platform V2 — dashboard aggregates

import { route } from '../server.js';
import { withConn } from '../db.js';
import { requireAuth } from '../deps.js';

route('GET', '/dashboard', async (ctx) => {
  await requireAuth(ctx);
  const data = await withConn((db) => {
    const counts = {
      clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
      projects_total: db.prepare('SELECT COUNT(*) AS c FROM projects').get().c,
      projects_active: db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status = 'active'").get().c,
      projects_pending: db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status = 'pending'").get().c,
      services_total: db.prepare('SELECT COUNT(*) AS c FROM services').get().c,
      services_active: db.prepare('SELECT COUNT(*) AS c FROM services WHERE is_active = 1').get().c,
    };

    const recent_clients = db.prepare(
      `SELECT id, company_name, created_at FROM clients ORDER BY created_at DESC LIMIT 5`
    ).all();

    const recent_projects = db.prepare(
      `SELECT p.id, p.name, p.status, c.company_name AS client_name, p.created_at
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id
       ORDER BY p.created_at DESC LIMIT 5`
    ).all();

    return { counts, recent_clients, recent_projects };
  });

  return { ok: true, data };
});
