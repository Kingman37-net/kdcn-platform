import crypto from 'node:crypto';

const PASSWORD = 'Kdcn@2026!Dev';
const ITERATIONS = 10000;

const salt = crypto.randomBytes(16);
const bits = crypto.pbkdf2Sync(PASSWORD, salt, ITERATIONS, 32, 'sha256');
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const hash = `pbkdf2$${ITERATIONS}$` + b64url(salt) + '$' + b64url(bits);
const id = 'usr_' + crypto.randomBytes(12).toString('hex');
const now = new Date().toISOString();

console.log(`DELETE FROM users WHERE email='admin@kingmandigital.co.ke';`);
console.log(`INSERT INTO users (id, email, password_hash, display_name, is_active, is_staff, created_at, updated_at) VALUES ('${id}', 'admin@kingmandigital.co.ke', '${hash}', 'KDCN Dev Admin', 1, 1, '${now}', '${now}');`);
