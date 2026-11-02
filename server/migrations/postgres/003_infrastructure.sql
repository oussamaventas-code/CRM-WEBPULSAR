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
