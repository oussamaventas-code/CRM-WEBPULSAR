// Definiciones de formularios compartidas (alta rápida, edición y fichas).
import {
  BILLING_PERIOD, DEAL_STAGE, CLIENT_STATUS, DB_ENGINE, ENVIRONMENT, APP_KIND, INCIDENT_CATEGORY, INCIDENT_STATUS, PAYMENT_METHOD, PRIORITY, PROJECT_STATUS, PROJECT_TYPE, PROVIDER,
  SERVICE_CATEGORY, SERVICE_MODALITY,
} from './lib/labels.js';
import { todayIso } from './lib/format.js';

const opt = (list = []) => list.map((x) => ({ value: x.id, label: x.label }));
const byClient = (list = [], clientId) => opt(clientId ? list.filter((x) => String(x.client_id) === String(clientId)) : list);
const statusOpts = (set, keys) => set.options.filter((o) => !keys || keys.includes(o.value));

export const clientFields = () => [
  { name: 'name', label: 'Nombre y apellidos', required: true },
  { name: 'company', label: 'Empresa' },
  { name: 'tax_id', label: 'CIF / NIF', mono: true, hint: 'Se valida automáticamente si el país es España' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Teléfono', type: 'tel' },
  { name: 'address', label: 'Dirección', span: 2 },
  { name: 'city', label: 'Ciudad' },
  { name: 'postal_code', label: 'Código postal' },
  { name: 'province', label: 'Provincia' },
  { name: 'country', label: 'País', default: 'España', required: true },
  { name: 'fiscal_name', label: 'Razón social (facturación)', hint: 'Si es distinta del nombre de empresa' },
  { name: 'fiscal_address', label: 'Domicilio fiscal', hint: 'Si es distinto de la dirección' },
  { name: 'onboarded_at', label: 'Fecha de incorporación', type: 'date', default: todayIso() },
  { name: 'source', label: 'Fuente de captación', placeholder: 'Recomendación, web, redes…' },
  { name: 'status', label: 'Estado', type: 'select', options: statusOpts(CLIENT_STATUS, ['active', 'pending', 'inactive']), default: 'active', required: true },
  { name: 'tags', label: 'Etiquetas', type: 'tags', placeholder: 'vip, ecommerce…', hint: 'Separadas por comas' },
  { name: 'notes', label: 'Notas internas', type: 'textarea', span: 2 },
];

export const projectFields = (lk = {}) => [
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, required: true, options: opt(lk.clients) },
  { name: 'name', label: 'Nombre del proyecto', required: true },
  { name: 'type', label: 'Tipo', type: 'select', options: PROJECT_TYPE.options, required: true, default: 'website' },
  { name: 'status', label: 'Estado', type: 'select', options: PROJECT_STATUS.options, required: true, default: 'quote' },
  { name: 'owner_user_id', label: 'Responsable', type: 'select', numeric: true, options: opt(lk.users) },
  { name: 'budget_cents', label: 'Presupuesto', type: 'money' },
  { name: 'start_date', label: 'Fecha de inicio', type: 'date' },
  { name: 'due_date', label: 'Entrega estimada', type: 'date' },
  { name: 'progress_mode', label: 'Cálculo del progreso', type: 'select', required: true, default: 'tasks', options: [{ value: 'tasks', label: 'Automático según tareas' }, { value: 'manual', label: 'Manual' }] },
  { name: 'progress', label: 'Progreso (%)', type: 'percent', show: (v) => v.progress_mode === 'manual' },
  { name: 'github_repo', label: 'Repositorio de GitHub', mono: true, placeholder: 'owner/repositorio', hint: 'También admite la URL del repo. Activa la actividad en Desarrollo' },
  { name: 'preview_url', label: 'URL de preview', type: 'url', placeholder: 'https://…' },
  { name: 'description', label: 'Descripción', type: 'textarea', span: 2 },
];

export const dealFields = (lk = {}) => [
  { name: 'title', label: 'Oportunidad', required: true, span: 2, placeholder: 'Web corporativa para…' },
  { name: 'stage', label: 'Etapa', type: 'select', options: DEAL_STAGE.options, required: true, default: 'lead' },
  { name: 'client_id', label: 'Cliente existente', type: 'select', numeric: true, options: opt(lk.clients), hint: 'Déjalo vacío si aún es un contacto nuevo' },
  { name: 'company', label: 'Empresa' },
  { name: 'contact_name', label: 'Persona de contacto' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Teléfono', type: 'tel' },
  { name: 'value_cents', label: 'Valor del proyecto', type: 'money' },
  { name: 'recurring_cents', label: 'Cuota mensual recurrente', type: 'money', hint: 'Mantenimiento, hosting o suscripción SaaS' },
  { name: 'probability', label: 'Probabilidad (%)', type: 'percent', hint: 'Si lo dejas vacío se ajusta según la etapa' },
  { name: 'expected_close_date', label: 'Cierre previsto', type: 'date' },
  { name: 'owner_user_id', label: 'Responsable', type: 'select', numeric: true, options: opt(lk.users) },
  { name: 'source', label: 'Origen', placeholder: 'Recomendación, web, WhatsApp…' },
  { name: 'service_interest', label: 'Servicio de interés' },
  { name: 'next_action', label: 'Próxima acción' },
  { name: 'next_action_date', label: 'Fecha de la próxima acción', type: 'date' },
  { name: 'lost_reason', label: 'Motivo de la pérdida', show: (v) => v.stage === 'lost', span: 2 },
  { name: 'notes', label: 'Notas', type: 'textarea', span: 2 },
];

export const taskFields = (lk = {}) => [
  { name: 'title', label: 'Tarea', required: true, span: 2 },
  { name: 'assignee_user_id', label: 'Responsable', type: 'select', numeric: true, options: opt(lk.users) },
  { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY.options, default: 'medium', required: true },
  { name: 'due_date', label: 'Fecha límite', type: 'date' },
  { name: 'status', label: 'Estado', type: 'select', required: true, default: 'todo', options: [{ value: 'todo', label: 'Por hacer' }, { value: 'in_progress', label: 'En curso' }, { value: 'review', label: 'En revisión' }, { value: 'done', label: 'Hecha' }] },
  { name: 'description', label: 'Descripción', type: 'textarea', span: 2 },
];

export const serviceFields = () => [
  { name: 'name', label: 'Nombre', required: true },
  { name: 'category', label: 'Categoría', type: 'select', options: SERVICE_CATEGORY.options, required: true, default: 'web_dev' },
  { name: 'price_cents', label: 'Precio', type: 'money', required: true },
  { name: 'internal_cost_cents', label: 'Coste interno (opcional)', type: 'money' },
  { name: 'modality', label: 'Modalidad', type: 'select', options: SERVICE_MODALITY.options, required: true, default: 'fixed' },
  { name: 'billing_period', label: 'Periodicidad', type: 'select', options: BILLING_PERIOD.options, required: true, default: 'one_time' },
  { name: 'status', label: 'Estado', type: 'select', required: true, default: 'active', options: [{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }] },
  { name: 'description', label: 'Descripción', type: 'textarea', span: 2 },
];

export const paymentFields = (lk = {}) => [
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, required: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'concept', label: 'Concepto', required: true, span: 2 },
  { name: 'amount_cents', label: 'Importe', type: 'money', required: true },
  { name: 'amount_paid_cents', label: 'Importe ya cobrado', type: 'money', default: 0, hint: 'Déjalo en 0 si aún no se ha cobrado' },
  { name: 'issued_on', label: 'Fecha', type: 'date', required: true, default: todayIso() },
  { name: 'due_date', label: 'Fecha de vencimiento', type: 'date' },
  { name: 'paid_at', label: 'Fecha de cobro', type: 'date', show: (v) => v.amount_paid_cents && v.amount_paid_cents !== '0' && v.amount_paid_cents !== '0,00' },
  { name: 'method', label: 'Método de pago', type: 'select', options: PAYMENT_METHOD.options },
  { name: 'external_ref', label: 'Referencia externa', mono: true, placeholder: 'ID de Stripe, nº de transferencia…' },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
];

export const serverFields = (lk = {}) => [
  { name: 'name', label: 'Nombre del servidor', required: true },
  { name: 'provider_key', label: 'Proveedor', type: 'select', options: PROVIDER.options, required: true, default: 'other' },
  { name: 'hostname', label: 'Hostname', mono: true },
  { name: 'ipv4', label: 'IP pública (IPv4)', mono: true },
  { name: 'ipv6', label: 'IPv6', mono: true },
  { name: 'os', label: 'Sistema operativo' },
  { name: 'region', label: 'Región' },
  { name: 'plan', label: 'Plan' },
  { name: 'cpu_cores', label: 'vCPU', type: 'number' },
  { name: 'ram_mb', label: 'RAM (MB)', type: 'number' },
  { name: 'disk_mb', label: 'Disco (MB)', type: 'number' },
  { name: 'client_id', label: 'Cliente propietario', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto asociado', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
];

export const domainFields = (lk = {}, { editing = false } = {}) => [
  { name: 'name', label: 'Dominio', required: true, mono: true, placeholder: 'ejemplo.com', disabled: editing, readOnly: editing },
  { name: 'registrar', label: 'Registrador' },
  { name: 'expires_at', label: 'Fecha de caducidad', type: 'date' },
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'server_id', label: 'Servidor (VPS)', type: 'select', numeric: true, options: opt(lk.servers) },
  { name: 'monitor', label: 'Monitorizar', type: 'switch', switchLabel: 'Crear comprobaciones automáticas', description: 'Disponibilidad HTTPS, certificado SSL y caducidad', default: !editing, span: 2 },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
];

export const databaseFields = (lk = {}) => [
  { name: 'name', label: 'Nombre', required: true, mono: true },
  { name: 'engine', label: 'Motor', type: 'select', options: DB_ENGINE.options, required: true, default: 'mysql' },
  { name: 'provider_key', label: 'Proveedor', type: 'select', options: PROVIDER.options, required: true, default: 'other' },
  { name: 'environment', label: 'Entorno', type: 'select', options: ENVIRONMENT.options, required: true, default: 'production' },
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'server_id', label: 'Servidor', type: 'select', numeric: true, options: opt(lk.servers) },
  { name: 'external_id', label: 'Identificador externo', mono: true },
  { name: 'region', label: 'Región' },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2, hint: 'No escribas aquí contraseñas: usa el almacén de credenciales.' },
];

export const applicationFields = (lk = {}) => [
  { name: 'name', label: 'Nombre', required: true },
  { name: 'kind', label: 'Tipo', type: 'select', options: APP_KIND.options, required: true, default: 'website' },
  { name: 'url', label: 'URL', type: 'url', mono: true, placeholder: 'https://' },
  { name: 'runtime', label: 'Tecnología', placeholder: 'Node 22, PHP 8.3, WordPress…' },
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'server_id', label: 'Servidor', type: 'select', numeric: true, options: opt(lk.servers) },
  { name: 'domain_id', label: 'Dominio', type: 'select', numeric: true, options: opt(lk.domains) },
  { name: 'database_id', label: 'Base de datos', type: 'select', numeric: true, options: opt(lk.databases) },
  { name: 'repository_url', label: 'Repositorio', type: 'url', mono: true },
  { name: 'monitor', label: 'Monitorizar', type: 'switch', switchLabel: 'Comprobar la URL periódicamente', span: 2 },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
];

export const incidentFields = (lk = {}, { editing = false } = {}) => [
  { name: 'title', label: 'Título', required: true, span: 2 },
  { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY.options, required: true, default: 'medium' },
  { name: 'category', label: 'Categoría', type: 'select', options: INCIDENT_CATEGORY.options, required: true, default: 'infrastructure' },
  editing && { name: 'status', label: 'Estado', type: 'select', options: INCIDENT_STATUS.options, required: true },
  { name: 'assignee_user_id', label: 'Responsable', type: 'select', numeric: true, options: opt(lk.users) },
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => byClient(lk.projects, v.client_id) },
  { name: 'server_id', label: 'Servidor relacionado', type: 'select', numeric: true, options: opt(lk.servers) },
  { name: 'domain_id', label: 'Dominio relacionado', type: 'select', numeric: true, options: opt(lk.domains) },
  { name: 'description', label: 'Descripción', type: 'textarea', span: 2, rows: 4 },
  editing && { name: 'resolution', label: 'Resolución', type: 'textarea', span: 2, show: (v) => ['resolved', 'closed'].includes(v.status) },
].filter(Boolean);
