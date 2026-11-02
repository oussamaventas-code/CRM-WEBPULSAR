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
