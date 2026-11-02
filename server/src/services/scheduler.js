import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { getSetting } from '../lib/settings.js';
import { purgeExpiredSessions } from '../auth/session.js';
import { hasCredential, getIntegration } from '../integrations/store.js';
import { runDueChecks } from './monitoring.js';
import { runAutomations } from './automations.js';
import { syncIntegration } from './integrations.js';
import { createBackup, listBackups } from './backup.js';
import { today } from '../lib/dates.js';

const SYSTEM = { system: true };

async function tracked(job, fn) {
  const id = Number(await (await (db.run("INSERT INTO job_runs (job, status, started_at) VALUES (?, 'running', ?)", [job, nowIso()]))).lastInsertRowid);
  try {
    const details = await fn();
    await (db.run("UPDATE job_runs SET status = 'ok', finished_at = ?, details = ? WHERE id = ?", [nowIso(), details ? JSON.stringify(details).slice(0, 2000) : null, id]));
  } catch (err) {
    console.error(`[scheduler] ${job}:`, err.message);
    await (db.run("UPDATE job_runs SET status = 'error', finished_at = ?, details = ? WHERE id = ?", [nowIso(), err.message.slice(0, 2000), id]));
  }
}

export async function runScheduledTask(task) {
  if (task === 'monitoring') return runDueChecks();
  if (task === 'automations') return tracked('automations', async () => runAutomations());
  if (task === 'integrations') return tracked('integrations', syncDueIntegrations);
  if (task === 'maintenance') return tracked('maintenance', maintenance);
  throw new Error('Tarea programada no reconocida');
}

async function syncDueIntegrations() {
  const hours = Number(await (getSetting('automations')).integration_sync_hours || 0);
  if (!hours) return { skipped: true };
  const done = {};
  for (const key of ['hostinger', 'cloudflare']) {
    if (!await (hasCredential(key))) continue;
    const last = await (getIntegration(key))?.last_sync_at;
    if (last && Date.now() - Date.parse(last) < hours * 3600_000) continue;
    try {
      await syncIntegration(SYSTEM, key);
      done[key] = 'ok';
    } catch (err) {
      done[key] = err.message;
    }
  }
  return done;
}

async function maintenance() {
  const m = await (getSetting('monitoring'));
  const days = (n) => new Date(Date.now() - n * 86400_000).toISOString();
  const out = {
    results: Number(await (await (db.run('DELETE FROM monitoring_results WHERE checked_at < ?', [days(m.results_retention_days)]))).changes),
    metrics: Number(await (await (db.run('DELETE FROM server_metrics WHERE collected_at < ?', [days(m.metrics_retention_days)]))).changes),
    notifications: Number(await (await (db.run('DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?', [days(90)]))).changes),
    jobs: Number(await (await (db.run('DELETE FROM job_runs WHERE started_at < ?', [days(30)]))).changes),
    sessions: Number(await (await (purgeExpiredSessions())).changes),
  };
  return out;
}

async function backupIfDue() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()));
  const stamp = today().replaceAll('-', '');
  const already = listBackups().some((b) => b.name.includes(`-${stamp}-`));
  if (hour >= config.backups.hour && !already) return await (createBackup());
  return null;
}

const timers = [];

export function startScheduler() {
  if (!config.schedulerEnabled) return;
  const every = (ms, fn) => timers.push(setInterval(fn, ms).unref());
  let monitoring = false;
  every(30_000, async () => {
    if (monitoring) return;
    monitoring = true;
    try {
      await runDueChecks();
    } catch (err) {
      console.error('[scheduler] monitorización:', err.message);
    } finally {
      monitoring = false;
    }
  });
  every(15 * 60_000, async () => await (tracked('automations', async () => await (runAutomations()))));
  every(60 * 60_000, async () => await (tracked('integrations', syncDueIntegrations)));
  every(60 * 60_000, async () => await (tracked('maintenance', async () => ({ ...await (maintenance()), backup: await (backupIfDue()) }))));
  // Primera ejecución poco después del arranque
  setTimeout(async () => await (tracked('automations', async () => await (runAutomations()))), 5_000).unref();
  setTimeout(async () => await (tracked('maintenance', async () => ({ ...await (maintenance()), backup: await (backupIfDue()) }))), 20_000).unref();
  setTimeout(async () => await (tracked('integrations', syncDueIntegrations)), 30_000).unref();
  console.log('[scheduler] Monitorización, automatizaciones y copias programadas activas');
}

export function stopScheduler() {
  timers.splice(0).forEach(clearInterval);
}
