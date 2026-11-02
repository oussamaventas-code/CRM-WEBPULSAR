// Copia de seguridad manual (útil desde cron del sistema o antes de actualizar).
import { createBackup } from '../src/services/backup.js';
import { record } from '../src/lib/audit.js';

const backup = await createBackup();
await record({ system: true }, { action: 'backup.created', entityType: 'backup', label: backup.name, summary: `Copia de seguridad creada desde terminal: ${backup.name}` });
console.log(`✓ ${backup.name} (${(backup.size_bytes / 1024).toFixed(0)} KB)`);
