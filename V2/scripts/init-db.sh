#!/usr/bin/env bash
# KDCN Platform V2 — build a fresh dev database
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/api/kdcn-platform.db"
SCHEMA="$ROOT/database/schema"

echo "▶ Removing existing dev DB"
rm -f "$DB" "$DB-shm" "$DB-wal"

echo "▶ Applying schema"
for f in "$SCHEMA"/*.sql; do
  echo "  - $(basename "$f")"
  sqlite3 "$DB" < "$f"
done

echo "▶ Done. DB at: $DB"
sqlite3 "$DB" "SELECT COUNT(*) || ' tables' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
