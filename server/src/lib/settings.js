import { db, nowIso } from '../db/index.js';
import { parseJson } from './query.js';

export const SETTING_DEFAULTS = {
  company: {
    name: 'Web Pulsar',
    legal_name: '',
    tax_id: '',
    address: '',
    postal_code: '',
    city: '',
    province: '',
    country: 'España',
    email: '',
    phone: '',
    website: '',
    iban: '',
  },
  invoicing: {
    currency: 'EUR',
    tax_rates: [21, 10, 4, 0],
    default_tax_rate: 21,
    withholding_rates: [0, 7, 15],
    default_withholding: 0,
    payment_terms_days: 30,
    footer: '',
    verifactu_mode: 'not_configured',
  },
  monitoring: {
    default_interval_s: 300,
    failure_threshold: 3,
    latency_warn_ms: 1500,
    heartbeat_stale_s: 180,
    cpu_warn_pct: 85,
    ram_warn_pct: 90,
    disk_warn_pct: 85,
    domain_expiry_days: 30,
    ssl_expiry_days: 14,
    results_retention_days: 90,
    metrics_retention_days: 30,
  },
  automations: {
    payment_due_reminder: true,
    invoice_overdue: true,
    server_down: true,
    domain_expiry: true,
    alert_to_incident: true,
    project_status_change: true,
    task_reminders: true,
    recurring_generation: true,
    integration_sync_hours: 6,
  },
  demo: { loaded: false, loaded_at: null },
};

export async function getSetting(key) {
  const row = await (db.get('SELECT value FROM settings WHERE key = ?', [key]));
  const stored = parseJson(row?.value, {});
  const defaults = SETTING_DEFAULTS[key] ?? {};
  return Array.isArray(defaults) ? stored : { ...defaults, ...stored };
}

export async function setSetting(key, value, userId = null) {
  await (db.run(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), userId, nowIso()],
  ));
  return await (getSetting(key));
}
