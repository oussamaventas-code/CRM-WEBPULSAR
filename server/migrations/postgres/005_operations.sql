-- 005 · Operaciones: incidencias, monitorización, alertas, almacén de credenciales y ejecuciones programadas.

CREATE TABLE incidents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'infrastructure' CHECK (category IN ('infrastructure', 'application', 'billing', 'support', 'security', 'other')),
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  domain_id BIGINT REFERENCES domains(id),
  database_id BIGINT REFERENCES databases(id),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'in_progress', 'pending', 'resolved', 'closed')),
  assignee_user_id BIGINT REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'alert')),
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  closed_at TEXT,
  resolution TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_incidents_status ON incidents(status, priority);
CREATE INDEX idx_incidents_client ON incidents(client_id);
CREATE INDEX idx_incidents_server ON incidents(server_id);

CREATE TABLE incident_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('created', 'comment', 'status_change', 'priority_change', 'assignment', 'alert')),
  body TEXT,
  from_value TEXT,
  to_value TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_incident_events_incident ON incident_events(incident_id, created_at);

CREATE TABLE monitoring_checks (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'heartbeat', 'domain_expiry', 'ssl_expiry', 'integration', 'd1_query')),
  target TEXT,
  entity_type TEXT CHECK (entity_type IS NULL OR entity_type IN ('server', 'domain', 'database', 'application', 'integration')),
  entity_id BIGINT,
  interval_s BIGINT NOT NULL DEFAULT 300 CHECK (interval_s >= 30),
  timeout_ms BIGINT NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 60000),
  expected_status TEXT NOT NULL DEFAULT '200-399',
  keyword TEXT,
  failure_threshold BIGINT NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 20),
  latency_warn_ms BIGINT,
  enabled BIGINT NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_status TEXT NOT NULL DEFAULT 'unknown' CHECK (last_status IN ('unknown', 'up', 'degraded', 'down')),
  last_latency_ms BIGINT,
  last_checked_at TEXT,
  last_message TEXT,
  consecutive_failures BIGINT NOT NULL DEFAULT 0,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_checks_entity ON monitoring_checks(entity_type, entity_id);
CREATE INDEX idx_checks_due ON monitoring_checks(enabled, last_checked_at);

CREATE TABLE monitoring_results (
  id BIGSERIAL PRIMARY KEY,
  check_id BIGINT NOT NULL REFERENCES monitoring_checks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('up', 'degraded', 'down')),
  latency_ms BIGINT,
  status_code BIGINT,
  message TEXT,
  checked_at TEXT NOT NULL
);
CREATE INDEX idx_results_check ON monitoring_results(check_id, checked_at);

CREATE TABLE monitoring_alerts (
  id BIGSERIAL PRIMARY KEY,
  check_id BIGINT REFERENCES monitoring_checks(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id BIGINT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  dedupe_key TEXT NOT NULL,
  occurrences BIGINT NOT NULL DEFAULT 1,
  incident_id BIGINT REFERENCES incidents(id),
  opened_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by BIGINT REFERENCES users(id),
  resolved_at TEXT
);
CREATE UNIQUE INDEX uq_alerts_active ON monitoring_alerts(dedupe_key) WHERE status <> 'resolved';
CREATE INDEX idx_alerts_status ON monitoring_alerts(status, severity);
CREATE INDEX idx_alerts_entity ON monitoring_alerts(entity_type, entity_id);

-- Almacén de credenciales: valor cifrado con AES-256-GCM, nunca se devuelve en listados.
CREATE TABLE secrets (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'password' CHECK (kind IN ('password', 'api_key', 'ssh_key', 'database', 'other')),
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  database_id BIGINT REFERENCES databases(id),
  username TEXT,
  url TEXT,
  secret_enc TEXT NOT NULL,
  notes TEXT,
  last_used_at TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_secrets_client ON secrets(client_id);

CREATE TABLE job_runs (
  id BIGSERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  details TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_job_runs_job ON job_runs(job, started_at);
