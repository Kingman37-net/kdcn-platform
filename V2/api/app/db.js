// KDCN Platform V2 — SQLite wrapper (Node 22+ native node:sqlite)

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { config } from './config.js';

export function connect() {
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  return db;
}

// Read-only or single-statement operations. Auto-commit.
export async function withConn(fn) {
  const db = connect();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

// Atomic write operations. BEGIN ... COMMIT, rollback on error.
export async function withTx(fn) {
  const db = connect();
  try {
    db.exec('BEGIN');
    const result = await fn(db);
    db.exec('COMMIT');
    return result;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally {
    db.close();
  }
}

export function healthcheck() {
  if (!fs.existsSync(config.dbPath)) return false;
  try {
    const db = connect();
    const row = db.prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='users';"
    ).get();
    db.close();
    return row.c === 1;
  } catch {
    return false;
  }
}
