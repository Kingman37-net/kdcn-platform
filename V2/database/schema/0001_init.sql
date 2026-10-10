-- ============================================================================
-- KDCN Platform V2 — Core Schema
-- File:   database/schema/0001_init.sql
-- Target: SQLite (Cloudflare D1 compatible)
-- Scope:  users, sessions, clients, projects, services, audit_logs
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. users — auth accounts
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                   TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    password_hash        TEXT NOT NULL,
    display_name         TEXT NOT NULL,
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    is_staff             INTEGER NOT NULL DEFAULT 0 CHECK (is_staff IN (0,1)),
    is_locked            INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
    failed_login_count   INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    last_login_at        TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active ON users (is_active);

-- ----------------------------------------------------------------------------
-- 2. sessions — refresh tokens / active logins
-- ----------------------------------------------------------------------------
CREATE TABLE sessions (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    user_agent         TEXT,
    ip_address         TEXT,
    expires_at         TEXT NOT NULL,
    revoked_at         TEXT,
    created_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user  ON sessions (user_id, expires_at);
CREATE INDEX idx_sessions_token ON sessions (refresh_token_hash);

-- ----------------------------------------------------------------------------
-- 3. clients — companies/organizations KDCN serves
-- ----------------------------------------------------------------------------
CREATE TABLE clients (
    id             TEXT PRIMARY KEY,
    user_id        TEXT,
    company_name   TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    address        TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    created_by     TEXT,
    FOREIGN KEY (user_id)    REFERENCES users(id)  ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_clients_company ON clients (company_name);
CREATE INDEX idx_clients_created ON clients (created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. projects — work done for clients
-- ----------------------------------------------------------------------------
CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    client_id      TEXT,
    status         TEXT NOT NULL CHECK (status IN ('pending','active','completed','cancelled')),
    start_date     TEXT,
    end_date       TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    created_by     TEXT,
    FOREIGN KEY (client_id)  REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)   ON DELETE SET NULL
);
CREATE INDEX idx_projects_client  ON projects (client_id, status);
CREATE INDEX idx_projects_status  ON projects (status, created_at DESC);
CREATE INDEX idx_projects_created ON projects (created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. services — catalog of what KDCN offers
-- ----------------------------------------------------------------------------
CREATE TABLE services (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    price_minor    INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
    currency       TEXT NOT NULL DEFAULT 'KES',
    is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    created_by     TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_services_active ON services (is_active, name);

-- ----------------------------------------------------------------------------
-- 6. audit_logs — append-only
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id             TEXT PRIMARY KEY,
    user_id        TEXT,
    action         TEXT NOT NULL,
    resource_type  TEXT NOT NULL,
    resource_id    TEXT,
    before_json    TEXT,
    after_json     TEXT,
    ip_address     TEXT,
    user_agent     TEXT,
    severity       TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
    created_at     TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_audit_user_date   ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_resource    ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_action_date ON audit_logs (action, created_at DESC);

-- Prevent UPDATE on audit_logs
CREATE TRIGGER trg_audit_block_update
BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE not permitted');
END;

-- Prevent DELETE on audit_logs
CREATE TRIGGER trg_audit_block_delete
BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE not permitted');
END;

-- ----------------------------------------------------------------------------
-- Auto-update updated_at triggers
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_users_updated_at
AFTER UPDATE ON users FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_clients_updated_at
AFTER UPDATE ON clients FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE clients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_projects_updated_at
AFTER UPDATE ON projects FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE projects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_services_updated_at
AFTER UPDATE ON services FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE services SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0001_init.sql
-- ============================================================================
