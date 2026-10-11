-- KDCN Platform V2 — dev admin seed
-- Password: Kdcn@2026!Dev
-- Hash: PBKDF2-SHA256, 10000 iterations, 32-byte key

DELETE FROM users WHERE email = 'admin@kingmandigital.co.ke';

INSERT INTO users (id, email, password_hash, display_name, is_active, is_staff, created_at, updated_at)
VALUES (
  'usr_958576424c013ef5a5c15cb3',
  'admin@kingmandigital.co.ke',
  'pbkdf2$10000$AJ1lLUm_tt7CZmalPfGUYQ$XcBb_LCRqg6NoTarOz2Y58zjUABHWLMTk0VMm8vIOGM',
  'KDCN Dev Admin',
  1,
  1,
  '2026-10-11T00:00:00.000Z',
  '2026-10-11T00:00:00.000Z'
);
