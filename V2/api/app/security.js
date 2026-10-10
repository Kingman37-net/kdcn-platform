// KDCN Platform V2 — Password hashing (scrypt) + JWT (HS256). Stdlib only.

import crypto from 'node:crypto';
import { config } from './config.js';

// ---------------- Password hashing ----------------

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS, (err, hash) => {
      if (err) return reject(err);
      const saltB64 = salt.toString('base64url');
      const hashB64 = hash.toString('base64url');
      resolve(
        `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${saltB64}$${hashB64}`
      );
    });
  });
}

export function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    try {
      const parts = stored.split('$');
      if (parts.length !== 4 || parts[0] !== 'scrypt') return resolve(false);
      const params = Object.fromEntries(
        parts[1].split(',').map((kv) => {
          const [k, v] = kv.split('=');
          return [k, Number(v)];
        })
      );
      const salt = Buffer.from(parts[2], 'base64url');
      const expected = Buffer.from(parts[3], 'base64url');

      crypto.scrypt(password, salt, expected.length,
        { N: params.N, r: params.r, p: params.p },
        (err, actual) => {
          if (err) return resolve(false);
          if (actual.length !== expected.length) return resolve(false);
          resolve(crypto.timingSafeEqual(actual, expected));
        }
      );
    } catch {
      resolve(false);
    }
  });
}

// ---------------- JWT (HS256) ----------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function hmac(data) {
  return crypto.createHmac('sha256', config.jwtSecret).update(data).digest();
}

export function signJWT(payload, ttlSeconds = config.accessTokenTtlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iss: config.jwtIssuer, aud: config.jwtAudience, iat: now, exp: now + ttlSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(full));
  const sig = b64url(hmac(`${h}.${p}`));
  return `${h}.${p}.${sig}`;
}

export function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const [h, p, sig] = parts;
    const expected = b64url(hmac(`${h}.${p}`));
    if (expected !== sig) throw new Error('Bad signature');
    const payload = JSON.parse(b64urlDecode(p).toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error('Expired');
    if (payload.iss !== config.jwtIssuer) throw new Error('Bad issuer');
    if (payload.aud !== config.jwtAudience) throw new Error('Bad audience');
    return payload;
  } catch (e) {
    throw new Error(`Invalid token: ${e.message}`);
  }
}

// ---------------- Misc ----------------

export function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
