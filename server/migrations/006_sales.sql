-- 006 · Ventas y GitHub: pipeline comercial (leads → oportunidades) y repositorio/preview por proyecto.
-- Solo añade: no modifica tablas ni datos existentes (las columnas nuevas de projects son opcionales).

CREATE TABLE deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  contact_name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  service_interest TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
  value_cents INTEGER NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  recurring_cents INTEGER NOT NULL DEFAULT 0 CHECK (recurring_cents >= 0),
  probability INTEGER NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date TEXT,
  owner_user_id INTEGER REFERENCES users(id),
  lost_reason TEXT,
  notes TEXT,
  closed_at TEXT,
  next_action TEXT,
  next_action_date TEXT,
  deleted_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_deals_stage ON deals(stage, deleted_at);
CREATE INDEX idx_deals_owner ON deals(owner_user_id);
CREATE INDEX idx_deals_client ON deals(client_id);

ALTER TABLE projects ADD COLUMN github_repo TEXT;
ALTER TABLE projects ADD COLUMN preview_url TEXT;
