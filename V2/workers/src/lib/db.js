// KDCN Platform V2 — D1 helpers

export function getDB(env) {
  if (!env.DB) throw new Error('D1 binding "DB" missing. Check wrangler.jsonc.');
  return env.DB;
}

// Read helpers
export async function one(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export async function all(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

// Batch inside a transaction
export async function transaction(db, statements) {
  return db.batch(statements);
}
