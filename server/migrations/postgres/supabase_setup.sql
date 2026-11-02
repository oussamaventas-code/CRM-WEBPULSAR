-- Web Pulsar CRM · esquema Supabase PostgreSQL
-- Ejecuta este archivo una sola vez en un proyecto Supabase nuevo, desde SQL Editor.
-- Luego importa las filas locales con: npm run db:import-supabase -- --confirm
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);

-- 001_core.sql
BEGIN;
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
INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (1, '001_core.sql', '1f0ea5bc6a8d8279e049b9040fd60ab7e91f10be4eea9a693b80a72050d30299', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
COMMIT;

-- 002_crm.sql
BEGIN;
-- 002 · CRM: clientes, contactos, comunicaciones, proyectos, tareas, servicios, documentos y testimonios.

CREATE TABLE clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT NOT NULL DEFAULT 'España',
  fiscal_name TEXT,
  fiscal_address TEXT,
  onboarded_at TEXT,
  source TEXT,
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'archived')),
  archived_at TEXT,
  deleted_at TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_clients_status ON clients(status, deleted_at);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_tax_id ON clients(tax_id);

CREATE TABLE client_contacts (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  phone TEXT,
  is_primary BIGINT NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);

CREATE TABLE client_communications (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'call', 'email', 'meeting', 'whatsapp', 'other')),
  subject TEXT,
  body TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_client_comms_client ON client_communications(client_id, occurred_at);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('website', 'ecommerce', 'crm', 'webapp', 'custom_software', 'automation', 'api_integration', 'maintenance', 'infrastructure', 'other')),
  description TEXT,
  owner_user_id BIGINT REFERENCES users(id),
  start_date TEXT,
  due_date TEXT,
  budget_cents BIGINT NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'quote' CHECK (status IN ('quote', 'pending_approval', 'approved', 'in_development', 'in_review', 'waiting_client', 'finished', 'delivered', 'cancelled')),
  progress BIGINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_mode TEXT NOT NULL DEFAULT 'tasks' CHECK (progress_mode IN ('tasks', 'manual')),
  completed_at TEXT,
  deleted_at TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status, deleted_at);
CREATE INDEX idx_projects_owner ON projects(owner_user_id);

CREATE TABLE project_tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_user_id BIGINT REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  position BIGINT NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_tasks_project ON project_tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON project_tasks(assignee_user_id, due_date);

CREATE TABLE task_comments (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

CREATE TABLE services (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('web_design', 'web_dev', 'crm_dev', 'software_dev', 'hosting', 'maintenance', 'automation', 'integrations', 'consulting', 'other')),
  description TEXT,
  price_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  modality TEXT NOT NULL DEFAULT 'fixed' CHECK (modality IN ('fixed', 'hourly', 'recurring', 'custom')),
  billing_period TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_period IN ('one_time', 'monthly', 'quarterly', 'yearly')),
  internal_cost_cents BIGINT CHECK (internal_cost_cents IS NULL OR internal_cost_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_services_category ON services(category, status);

CREATE TABLE client_services (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  project_id BIGINT REFERENCES projects(id),
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('one_time', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'finished')),
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_client_services_client ON client_services(client_id, status);
CREATE INDEX idx_client_services_service ON client_services(service_id);

-- Los archivos se guardan fuera de la web pública con nombre aleatorio (storage_key)
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('contract', 'invoice', 'quote', 'technical', 'manual', 'deliverable', 'receipt', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  deleted_at TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_documents_client ON documents(client_id, deleted_at);
CREATE INDEX idx_documents_project ON documents(project_id);

-- Testimonios: nunca publicables sin autorización expresa registrada
CREATE TABLE testimonials (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  received_at TEXT NOT NULL,
  service_id BIGINT REFERENCES services(id),
  project_id BIGINT REFERENCES projects(id),
  channel TEXT NOT NULL CHECK (channel IN ('call', 'meeting', 'in_person', 'video_call', 'whatsapp', 'email', 'other')),
  internal_notes TEXT,
  draft_text TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending_draft', 'pending_approval', 'authorized', 'rejected')),
  approved_at TEXT,
  approved_by_name TEXT,
  approval_evidence TEXT,
  can_publish BIGINT NOT NULL DEFAULT 0 CHECK (can_publish IN (0, 1)),
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CHECK (can_publish = 0 OR (status = 'authorized' AND approved_at IS NOT NULL AND draft_text IS NOT NULL))
);
CREATE INDEX idx_testimonials_client ON testimonials(client_id);
CREATE INDEX idx_testimonials_status ON testimonials(status);
INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (2, '002_crm.sql', '8287bb407ad59b5b422c81a1d29b55d7c0e82742829207258818d11a070c7285', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
COMMIT;

-- 003_infrastructure.sql
BEGIN;
-- 003 · Infraestructura: proveedores, integraciones, servidores, métricas, dominios, DNS, bases de datos,
-- aplicaciones, buckets y relaciones entre recursos.

CREATE TABLE providers (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  website TEXT
);
INSERT INTO providers (key, name, website) VALUES
  ('hostinger', 'Hostinger', 'https://www.hostinger.es'),
  ('cloudflare', 'Cloudflare', 'https://www.cloudflare.com'),
  ('other', 'Otro proveedor', NULL);

-- Una fila por integración. El token va cifrado (AES-256-GCM) y nunca sale del backend.
CREATE TABLE integrations (
  id BIGSERIAL PRIMARY KEY,
  provider_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'pending', 'connected', 'error', 'unauthorized')),
  secret_enc TEXT,
  secret_hint TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  capabilities TEXT NOT NULL DEFAULT '{}',
  last_verified_at TEXT,
  last_sync_at TEXT,
  last_sync_report TEXT,
  last_error TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
INSERT INTO integrations (provider_key, name) VALUES
  ('hostinger', 'Hostinger API'),
  ('cloudflare', 'Cloudflare API'),
  ('smtp', 'Correo saliente (SMTP)');

CREATE TABLE infrastructure_accounts (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  integration_id BIGINT REFERENCES integrations(id),
  name TEXT NOT NULL,
  external_id TEXT,
  client_id BIGINT REFERENCES clients(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (provider_id, external_id)
);

-- status solo es 'operational' cuando una comprobación propia lo ha verificado.
CREATE TABLE servers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  account_id BIGINT REFERENCES infrastructure_accounts(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'hostinger')),
  external_id TEXT,
  hostname TEXT,
  ipv4 TEXT,
  ipv6 TEXT,
  os TEXT,
  region TEXT,
  plan TEXT,
  cpu_cores BIGINT,
  ram_mb BIGINT,
  disk_mb BIGINT,
  bandwidth_mb BIGINT,
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'operational', 'warning', 'down')),
  status_reason TEXT,
  provider_state TEXT,
  last_check_at TEXT,
  last_heartbeat_at TEXT,
  agent_token_hash TEXT,
  agent_version TEXT,
  provisioned_at TEXT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (provider_id, external_id)
);
CREATE INDEX idx_servers_client ON servers(client_id);
CREATE INDEX idx_servers_project ON servers(project_id);
CREATE INDEX idx_servers_status ON servers(status);

-- Métricas reales: proceden del agente instalado en el VPS o de la API de Hostinger.
CREATE TABLE server_metrics (
  id BIGSERIAL PRIMARY KEY,
  server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('agent', 'hostinger')),
  collected_at TEXT NOT NULL,
  cpu_pct DOUBLE PRECISION,
  ram_used_bytes BIGINT,
  ram_total_bytes BIGINT,
  disk_used_bytes BIGINT,
  disk_total_bytes BIGINT,
  net_in_bytes BIGINT,
  net_out_bytes BIGINT,
  load_1 DOUBLE PRECISION,
  uptime_s BIGINT,
  UNIQUE (server_id, source, collected_at)
);
CREATE INDEX idx_server_metrics_server ON server_metrics(server_id, collected_at);

CREATE TABLE domains (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  registrar TEXT,
  hostinger_domain_id TEXT,
  dns_provider TEXT CHECK (dns_provider IS NULL OR dns_provider IN ('cloudflare', 'hostinger', 'other')),
  cloudflare_zone_id TEXT,
  cloudflare_account_id TEXT,
  zone_status TEXT,
  nameservers TEXT NOT NULL DEFAULT '[]',
  ssl_mode TEXT,
  ssl_expires_at TEXT,
  expires_at TEXT,
  auto_renew BIGINT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'operational', 'warning', 'down')),
  status_reason TEXT,
  last_check_at TEXT,
  last_synced_at TEXT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_domains_client ON domains(client_id);
CREATE INDEX idx_domains_expires ON domains(expires_at);
CREATE INDEX idx_domains_zone ON domains(cloudflare_zone_id);

CREATE TABLE dns_records (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('cloudflare', 'hostinger', 'manual')),
  external_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  ttl BIGINT,
  proxied BIGINT,
  priority BIGINT,
  comment TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (domain_id, source, external_id)
);
CREATE INDEX idx_dns_domain ON dns_records(domain_id, type);

CREATE TABLE databases (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  engine TEXT NOT NULL CHECK (engine IN ('d1', 'mysql', 'mariadb', 'postgresql', 'sqlite', 'mongodb', 'redis', 'other')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'cloudflare')),
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'development', 'testing')),
  external_id TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'operational', 'warning', 'down')),
  status_reason TEXT,
  last_check_at TEXT,
  provider_created_at TEXT,
  size_bytes BIGINT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (provider_id, external_id)
);
CREATE INDEX idx_databases_client ON databases(client_id);
CREATE INDEX idx_databases_project ON databases(project_id);

-- Aplicaciones desplegadas (webs, APIs, Workers de Cloudflare, tareas programadas…)
CREATE TABLE applications (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('website', 'webapp', 'api', 'worker', 'cron', 'other')),
  provider_id BIGINT REFERENCES providers(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'cloudflare')),
  external_id TEXT,
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  domain_id BIGINT REFERENCES domains(id),
  database_id BIGINT REFERENCES databases(id),
  url TEXT,
  runtime TEXT,
  repository_url TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'operational', 'warning', 'down')),
  status_reason TEXT,
  last_check_at TEXT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (provider_id, external_id)
);
CREATE INDEX idx_applications_project ON applications(project_id);
CREATE INDEX idx_applications_server ON applications(server_id);

CREATE TABLE storage_buckets (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id BIGINT NOT NULL REFERENCES providers(id),
  external_id TEXT NOT NULL,
  location TEXT,
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  provider_created_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (provider_id, external_id)
);

-- Relaciones adicionales a las que ya expresan las claves foráneas (p. ej. "esta app usa esta base de datos")
CREATE TABLE infrastructure_relationships (
  id BIGSERIAL PRIMARY KEY,
  from_type TEXT NOT NULL CHECK (from_type IN ('client', 'project', 'domain', 'server', 'application', 'database', 'bucket')),
  from_id BIGINT NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('client', 'project', 'domain', 'server', 'application', 'database', 'bucket')),
  to_id BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'uses',
  notes TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (from_type, from_id, to_type, to_id, kind)
);
CREATE INDEX idx_relationships_to ON infrastructure_relationships(to_type, to_id);
INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (3, '003_infrastructure.sql', '8d262631e85b0bfdf866950dac138e99ea4777cd0f114845fb26485180de9a42', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
COMMIT;

-- 004_finance.sql
BEGIN;
-- 004 · Finanzas: series de facturación, facturas, líneas, cobros, pagos recurrentes y gastos.
-- Las facturas emitidas son inmutables a nivel de base de datos (solo cambian estado y cobros).

CREATE TABLE invoice_series (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '{PREFIX}{YYYY}-{NUM}',
  padding BIGINT NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 10),
  reset_yearly BIGINT NOT NULL DEFAULT 1 CHECK (reset_yearly IN (0, 1)),
  kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'rectifying')),
  is_default BIGINT NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  active BIGINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
INSERT INTO invoice_series (code, name, prefix, kind, is_default) VALUES
  ('F', 'Serie general', 'F', 'standard', 1),
  ('R', 'Facturas rectificativas', 'R', 'rectifying', 0);

CREATE TABLE invoice_series_counters (
  series_id BIGINT NOT NULL REFERENCES invoice_series(id),
  year BIGINT NOT NULL,
  last_number BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, year)
);

CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES invoice_series(id),
  number TEXT,
  sequence BIGINT,
  year BIGINT,
  kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'rectifying')),
  rectifies_invoice_id BIGINT REFERENCES invoices(id),
  rectification_reason TEXT,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  global_discount_pct DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (global_discount_pct BETWEEN 0 AND 100),
  withholding_pct DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (withholding_pct BETWEEN 0 AND 100),
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  tax_cents BIGINT NOT NULL DEFAULT 0,
  withholding_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  paid_cents BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  footer TEXT,
  client_snapshot TEXT,
  issuer_snapshot TEXT,
  issued_at TEXT,
  sent_at TEXT,
  cancelled_at TEXT,
  verifactu_status TEXT NOT NULL DEFAULT 'not_configured',
  record_hash TEXT,
  prev_record_hash TEXT,
  record_payload TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (series_id, year, sequence)
);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status, due_date);
CREATE INDEX idx_invoices_issue ON invoices(issue_date);
CREATE INDEX idx_invoices_project ON invoices(project_id);

CREATE TABLE invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES services(id),
  description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  unit_price_cents BIGINT NOT NULL,
  discount_pct DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  tax_rate DOUBLE PRECISION NOT NULL DEFAULT 21 CHECK (tax_rate BETWEEN 0 AND 100),
  base_cents BIGINT NOT NULL,
  discount_cents BIGINT NOT NULL,
  tax_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL,
  position BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE FUNCTION guard_issued_invoice_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND OLD.is_demo = 0 AND
     ROW(OLD.series_id, OLD.client_id, OLD.number, OLD.sequence, OLD.year, OLD.kind, OLD.issue_date, OLD.currency,
         OLD.global_discount_pct, OLD.withholding_pct, OLD.subtotal_cents, OLD.discount_cents, OLD.tax_cents,
         OLD.withholding_cents, OLD.total_cents, OLD.client_snapshot, OLD.issuer_snapshot, OLD.record_hash, OLD.record_payload)
     IS DISTINCT FROM
     ROW(NEW.series_id, NEW.client_id, NEW.number, NEW.sequence, NEW.year, NEW.kind, NEW.issue_date, NEW.currency,
         NEW.global_discount_pct, NEW.withholding_pct, NEW.subtotal_cents, NEW.discount_cents, NEW.tax_cents,
         NEW.withholding_cents, NEW.total_cents, NEW.client_snapshot, NEW.issuer_snapshot, NEW.record_hash, NEW.record_payload) THEN
    RAISE EXCEPTION 'Una factura emitida no puede modificarse: emite una factura rectificativa';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_invoices_issued_immutable BEFORE UPDATE OF series_id, client_id, number, sequence, year, kind, issue_date, currency,
  global_discount_pct, withholding_pct, subtotal_cents, discount_cents, tax_cents, withholding_cents, total_cents,
  client_snapshot, issuer_snapshot, record_hash, record_payload ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_update();

CREATE FUNCTION guard_issued_invoice_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND OLD.is_demo = 0 THEN RAISE EXCEPTION 'Una factura emitida no puede eliminarse'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_invoices_issued_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_delete();

CREATE FUNCTION guard_issued_invoice_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_invoice_id BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN target_invoice_id := OLD.invoice_id; ELSE target_invoice_id := NEW.invoice_id; END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE id = target_invoice_id AND status <> 'draft' AND is_demo = 0) THEN
    RAISE EXCEPTION 'Las líneas de una factura emitida no pueden modificarse';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_invoice_items_lock_insert BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_item();
CREATE TRIGGER trg_invoice_items_lock_update BEFORE UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_item();
CREATE TRIGGER trg_invoice_items_lock_delete BEFORE DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice_item();

CREATE TABLE recurring_payments (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  client_service_id BIGINT REFERENCES client_services(id),
  project_id BIGINT REFERENCES projects(id),
  concept TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('hosting', 'maintenance', 'subscription', 'fee', 'renewal', 'other')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  start_date TEXT NOT NULL,
  next_due_date TEXT NOT NULL,
  end_date TEXT,
  reminder_days BIGINT NOT NULL DEFAULT 7 CHECK (reminder_days BETWEEN 0 AND 90),
  auto_generate BIGINT NOT NULL DEFAULT 1 CHECK (auto_generate IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  last_generated_at TEXT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_recurring_due ON recurring_payments(status, next_due_date);
CREATE INDEX idx_recurring_client ON recurring_payments(client_id);

-- Cobros: importes esperados o recibidos. Si invoice_id está informado, son abonos contra esa factura.
CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  invoice_id BIGINT REFERENCES invoices(id),
  recurring_payment_id BIGINT REFERENCES recurring_payments(id),
  period_date TEXT,
  concept TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  issued_on TEXT NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  method TEXT CHECK (method IS NULL OR method IN ('transfer', 'card', 'stripe', 'paypal', 'cash', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded')),
  external_ref TEXT,
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (recurring_payment_id, period_date)
);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status, due_date);
CREATE INDEX idx_payments_paid ON payments(paid_at);

CREATE TABLE expenses (
  id BIGSERIAL PRIMARY KEY,
  supplier TEXT NOT NULL,
  concept TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  tax_cents BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hosting', 'domains', 'software', 'hardware', 'marketing', 'freelance', 'taxes', 'office', 'training', 'other')),
  client_id BIGINT REFERENCES clients(id),
  project_id BIGINT REFERENCES projects(id),
  server_id BIGINT REFERENCES servers(id),
  document_id BIGINT REFERENCES documents(id),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('transfer', 'card', 'stripe', 'paypal', 'cash', 'other')),
  notes TEXT,
  is_demo BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_client ON expenses(client_id);
INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (4, '004_finance.sql', '10b0bb4a06b907e83f1523337ff290e259b9447b028021264fa318323cce0b30', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
COMMIT;

-- 005_operations.sql
BEGIN;
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
INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (5, '005_operations.sql', 'c8af2b3541cc13c22860fdf9faa9ef5b4b569dfcaf3255e19f9db2e3226f3d7b', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
COMMIT;

-- Bucket privado para documentos; el backend firma las cargas y las descargas.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('crm-documents', 'crm-documents', false, 25000000)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = false, file_size_limit = 25000000;
  ELSE
    RAISE NOTICE 'Supabase Storage no está habilitado todavía; el backend lo creará al subir el primer documento.';
  END IF;
END
$$;
