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
