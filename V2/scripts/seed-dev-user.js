// KDCN Platform V2 — seed a dev admin user
// Usage: node scripts/seed-dev-user.js

import { withConn } from '../api/app/db.js';
import { hashPassword, generateId } from '../api/app/security.js';

const EMAIL = 'admin@kingmandigital.co.ke';
const PASSWORD = 'Kdcn@2026!Dev';
const DISPLAY = 'KDCN Dev Admin';

function nowISO() { return new Date().toISOString(); }

async function main() {
  const hash = await hashPassword(PASSWORD);

  await withConn((db) => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(hash, nowISO(), existing.id);
      console.log(`↻ Updated existing user ${EMAIL}`);
    } else {
      const id = generateId('usr');
      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, is_active, is_staff, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 1, ?, ?)`
      ).run(id, EMAIL, hash, DISPLAY, nowISO(), nowISO());
      console.log(`✅ Created dev admin ${EMAIL}`);
    }
  });

  console.log('');
  console.log('   Email:    ' + EMAIL);
  console.log('   Password: ' + PASSWORD);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
