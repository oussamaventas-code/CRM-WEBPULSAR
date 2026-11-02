// Crea un usuario desde la terminal.
//   npm run user:create -- --email ana@empresa.com --name "Ana" [--role admin|tecnico|finanzas|lectura] [--password-stdin]
// El primer usuario creado es el administrador principal.
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { migrate } from '../src/db/migrate.js';
import { syncRbac, ROLE_DEFINITIONS } from '../src/auth/rbac.js';
import { db } from '../src/db/index.js';
import { hashPassword, passwordProblem } from '../src/lib/password.js';
import { record } from '../src/lib/audit.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'admin' },
    'password-stdin': { type: 'boolean', default: false },
  },
});

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : '');
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    if (hidden) process.stdout.write('\n');
    resolve(answer.trim());
  }));
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

await migrate({ log: () => {} });
await syncRbac();

const email = (values.email ?? (await ask('Email: '))).toLowerCase();
const name = values.name ?? (await ask('Nombre: '));
const role = values.role;
if (!ROLE_DEFINITIONS[role]) throw new Error(`Rol no válido. Usa: ${Object.keys(ROLE_DEFINITIONS).join(', ')}`);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email no válido');
if (await db.value('SELECT 1 FROM users WHERE email = ?', [email])) throw new Error('Ya existe un usuario con ese email');

let password = values['password-stdin'] ? await readStdin() : await ask('Contraseña (mín. 12 caracteres): ', { hidden: true });
let problem = passwordProblem(password, { email, name });
while (problem && !values['password-stdin']) {
  console.log(`✗ ${problem}`);
  password = await ask('Contraseña: ', { hidden: true });
  problem = passwordProblem(password, { email, name });
}
if (problem) throw new Error(problem);
if (!values['password-stdin'] && (await ask('Repite la contraseña: ', { hidden: true })) !== password) throw new Error('Las contraseñas no coinciden');

const isOwner = !await db.value('SELECT COUNT(*) FROM users');
const id = Number(
  (await db.run('INSERT INTO users (email, name, password_hash, role_id, is_owner, password_changed_at) VALUES (?, ?, ?, (SELECT id FROM roles WHERE key = ?), ?, ?)', [
    email, name, await hashPassword(password), role, isOwner ? 1 : 0, new Date().toISOString(),
  ])).lastInsertRowid,
);
await record({ system: true }, { action: 'user.created', entityType: 'user', entityId: id, label: name, summary: `Usuario creado desde terminal: ${name} (${ROLE_DEFINITIONS[role].name})` });
console.log(`✓ Usuario creado: ${name} <${email}> · ${ROLE_DEFINITIONS[role].name}${isOwner ? ' · administrador principal' : ''}`);
