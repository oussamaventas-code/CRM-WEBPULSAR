-- Web Pulsar CRM · reinicio total del esquema de la aplicación en Supabase
-- DESTRUCTIVO: elimina las tablas y datos del CRM en public. No toca data/webpulsar.db local, Supabase Auth ni el bucket Storage.
-- Ejecuta este archivo en SQL Editor y después ejecuta supabase_setup.sql para crear de nuevo el esquema vacío.
BEGIN;
DROP TABLE IF EXISTS
  public.access_logs,
  public.activity_logs,
  public.applications,
  public.audit_logs,
  public.client_communications,
  public.client_contacts,
  public.client_services,
  public.clients,
  public.databases,
  public.deployment_migrations,
  public.dns_records,
  public.documents,
  public.domains,
  public.expenses,
  public.incident_events,
  public.incidents,
  public.infrastructure_accounts,
  public.infrastructure_relationships,
  public.integrations,
  public.invoice_items,
  public.invoice_series,
  public.invoice_series_counters,
  public.invoices,
  public.job_runs,
  public.monitoring_alerts,
  public.monitoring_checks,
  public.monitoring_results,
  public.notifications,
  public.password_resets,
  public.payments,
  public.permissions,
  public.project_tasks,
  public.projects,
  public.providers,
  public.recurring_payments,
  public.role_permissions,
  public.roles,
  public.schema_migrations,
  public.secrets,
  public.server_metrics,
  public.servers,
  public.services,
  public.sessions,
  public.settings,
  public.storage_buckets,
  public.task_comments,
  public.testimonials,
  public.users
CASCADE;
DROP FUNCTION IF EXISTS public.guard_issued_invoice_delete() CASCADE;
DROP FUNCTION IF EXISTS public.guard_issued_invoice_item() CASCADE;
DROP FUNCTION IF EXISTS public.guard_issued_invoice_update() CASCADE;
DROP FUNCTION IF EXISTS public.reject_immutable_row() CASCADE;
COMMIT;

-- Los archivos binarios de crm-documents deben borrarse desde Supabase Dashboard → Storage → crm-documents → Empty bucket.