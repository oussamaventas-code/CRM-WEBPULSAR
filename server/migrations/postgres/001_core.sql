-- 001 · Núcleo: usuarios, roles, permisos, sesiones, ajustes, actividad, auditoría y notificaciones.
-- Convenciones: fechas-hora en ISO 8601 UTC (TEXT), fechas en YYYY-MM-DD, importes en céntimos (BIGINT).
-- SQL compatible con SQLite y Cloudflare D1.

CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BIGINT NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  is_owner BIGINT NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_attempts BIGINT NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
CREATE INDEX idx_users_role ON users(role_id);

-- El token de sesión nunca se guarda: id = SHA-256(token)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

-- Registro de accesos (inmutable)
CREATE TABLE access_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  email TEXT,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_access_logs_created ON access_logs(created_at);
CREATE INDEX idx_access_logs_user ON access_logs(user_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by BIGINT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

-- Cronología de negocio visible en la app (inmutable)
CREATE TABLE activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  entity_label TEXT,
  client_id BIGINT,
  summary TEXT NOT NULL,
  data TEXT,
  ip TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_activity_created ON activity_logs(created_at);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_client ON activity_logs(client_id);

-- Auditoría técnica con cadena de hashes (cada fila incluye el hash de la anterior)
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  before_data TEXT,
  after_data TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  prev_hash TEXT,
  hash TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  entity_type TEXT,
  entity_id BIGINT,
  link TEXT,
  dedupe_key TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at);

-- Registros de auditoría: se mantienen inmutables en PostgreSQL igual que en SQLite.
CREATE FUNCTION reject_immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '%', TG_ARGV[0]; END;
$$;
CREATE TRIGGER trg_activity_no_update BEFORE UPDATE ON activity_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de actividad es inmutable');
CREATE TRIGGER trg_activity_no_delete BEFORE DELETE ON activity_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de actividad es inmutable');
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de auditoría es inmutable');
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de auditoría es inmutable');
CREATE TRIGGER trg_access_no_update BEFORE UPDATE ON access_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de accesos es inmutable');
CREATE TRIGGER trg_access_no_delete BEFORE DELETE ON access_logs FOR EACH ROW EXECUTE FUNCTION reject_immutable_row('El registro de accesos es inmutable');
