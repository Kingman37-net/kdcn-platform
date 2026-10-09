// KDCN Platform V2 — config loader (Node stdlib only)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '..');

function loadDotenv() {
  const envPath = path.join(API_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf-8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv();

const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters.');
}

const rawDbPath = process.env.DATABASE_PATH || './kdcn-platform.db';
const dbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(API_DIR, rawDbPath);

export const config = {
  apiDir: API_DIR,
  dbPath,
  jwtSecret,
  jwtIssuer: process.env.JWT_ISSUER || 'admin.kingmandigital.co.ke',
  jwtAudience: process.env.JWT_AUDIENCE || 'kdcn-platform-api',
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7),
  environment: process.env.ENVIRONMENT || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8000),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  isProduction: (process.env.ENVIRONMENT || 'development').toLowerCase() === 'production',
};
