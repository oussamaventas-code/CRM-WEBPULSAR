// Etiquetas en español y tono visual de cada valor enumerado.
// Tonos: ok (verde), warn (amarillo), danger (rojo), mute (gris), brand (azul), violet.

const opts = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v[0] }));
const make = (map) => ({
  map,
  label: (k) => (map[k] ? (typeof map[k] === 'string' ? map[k] : map[k][0]) : k ?? '—'),
  tone: (k) => (Array.isArray(map[k]) ? map[k][1] : 'mute'),
  options: opts(map),
});

export const CLIENT_STATUS = make({ active: ['Activo', 'ok'], pending: ['Pendiente', 'warn'], inactive: ['Inactivo', 'mute'], archived: ['Archivado', 'mute'] });

export const PROJECT_TYPE = make({
  website: 'Página web', ecommerce: 'Tienda online', crm: 'CRM', webapp: 'Aplicación web', custom_software: 'Software personalizado',
  automation: 'Automatización', api_integration: 'Integración API', maintenance: 'Mantenimiento', infrastructure: 'Infraestructura', other: 'Otros',
});

export const PROJECT_STATUS = make({
  quote: ['Presupuesto', 'mute'], pending_approval: ['Pendiente de aprobación', 'warn'], approved: ['Aprobado', 'brand'], in_development: ['En desarrollo', 'brand'],
  in_review: ['En revisión', 'violet'], waiting_client: ['Pendiente del cliente', 'warn'], finished: ['Finalizado', 'ok'], delivered: ['Entregado', 'ok'], cancelled: ['Cancelado', 'mute'],
});
export const KANBAN_COLUMNS = ['quote', 'pending_approval', 'approved', 'in_development', 'in_review', 'waiting_client', 'finished', 'delivered'];

export const DEAL_STAGE = make({ lead: ['Lead', 'mute'], contacted: ['Contactado', 'brand'], proposal: ['Propuesta', 'violet'], negotiation: ['Negociación', 'warn'], won: ['Ganado', 'ok'], lost: ['Perdido', 'danger'] });
export const DEAL_COLUMNS = ['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];

export const TASK_STATUS = make({ todo: ['Por hacer', 'mute'], in_progress: ['En curso', 'brand'], review: ['En revisión', 'violet'], done: ['Hecha', 'ok'] });
export const PRIORITY = make({ low: ['Baja', 'mute'], medium: ['Media', 'brand'], high: ['Alta', 'warn'], critical: ['Crítica', 'danger'] });

export const SERVICE_CATEGORY = make({
  web_design: 'Diseño web', web_dev: 'Desarrollo web', crm_dev: 'Desarrollo CRM', software_dev: 'Desarrollo de software', hosting: 'Hosting',
  maintenance: 'Mantenimiento', automation: 'Automatización', integrations: 'Integraciones', consulting: 'Consultoría tecnológica', other: 'Otros',
});
export const SERVICE_MODALITY = make({ fixed: 'Precio cerrado', hourly: 'Por horas', recurring: 'Recurrente', custom: 'A medida' });
export const BILLING_PERIOD = make({ one_time: 'Pago único', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' });
export const CS_STATUS = make({ active: ['Activo', 'ok'], paused: ['Pausado', 'warn'], cancelled: ['Cancelado', 'mute'], finished: ['Finalizado', 'mute'] });

export const INVOICE_STATUS = make({ draft: ['Borrador', 'mute'], issued: ['Emitida', 'brand'], partially_paid: ['Cobro parcial', 'violet'], paid: ['Cobrada', 'ok'], overdue: ['Vencida', 'danger'], cancelled: ['Anulada', 'mute'] });
export const PAYMENT_STATUS = make({ pending: ['Pendiente', 'warn'], partially_paid: ['Parcialmente pagado', 'violet'], paid: ['Pagado', 'ok'], overdue: ['Vencido', 'danger'], cancelled: ['Cancelado', 'mute'], refunded: ['Reembolsado', 'mute'] });
export const PAYMENT_METHOD = make({ transfer: 'Transferencia bancaria', card: 'Tarjeta', stripe: 'Stripe', paypal: 'PayPal', cash: 'Efectivo', other: 'Otros' });
export const FREQUENCY = make({ weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral', yearly: 'Anual' });
export const RECURRING_CATEGORY = make({ hosting: 'Hosting', maintenance: 'Mantenimiento', subscription: 'Suscripción', fee: 'Cuota', renewal: 'Renovación anual', other: 'Otro' });
export const RECURRING_STATUS = make({ active: ['Activo', 'ok'], paused: ['Pausado', 'warn'], cancelled: ['Cancelado', 'mute'] });
export const EXPENSE_CATEGORY = make({ hosting: 'Hosting', domains: 'Dominios', software: 'Software', hardware: 'Hardware', marketing: 'Marketing', freelance: 'Colaboradores', taxes: 'Impuestos', office: 'Oficina', training: 'Formación', other: 'Otros' });

export const HEALTH = make({ operational: ['Operativo', 'ok'], warning: ['Advertencia', 'warn'], down: ['Incidencia', 'danger'], unknown: ['Sin verificar', 'mute'] });
export const CHECK_STATUS = make({ up: ['Correcto', 'ok'], degraded: ['Degradado', 'warn'], down: ['Caído', 'danger'], unknown: ['Sin datos', 'mute'] });
export const CHECK_TYPE = make({
  http: 'HTTP(S)', tcp: 'Puerto TCP', heartbeat: 'Heartbeat del agente', domain_expiry: 'Caducidad de dominio', ssl_expiry: 'Certificado SSL', integration: 'Autorización de integración', d1_query: 'Consulta D1',
});
export const ALERT_SEVERITY = make({ info: ['Info', 'brand'], warning: ['Advertencia', 'warn'], critical: ['Crítica', 'danger'] });
export const ALERT_STATUS = make({ open: ['Abierta', 'danger'], acknowledged: ['Reconocida', 'warn'], resolved: ['Resuelta', 'ok'] });
export const DB_ENGINE = make({ d1: 'Cloudflare D1', mysql: 'MySQL', mariadb: 'MariaDB', postgresql: 'PostgreSQL', sqlite: 'SQLite', mongodb: 'MongoDB', redis: 'Redis', other: 'Otro' });
export const ENVIRONMENT = make({ production: ['Producción', 'brand'], development: ['Desarrollo', 'violet'], testing: ['Pruebas', 'mute'] });
export const APP_KIND = make({ website: 'Sitio web', webapp: 'Aplicación web', api: 'API', worker: 'Worker', cron: 'Tarea programada', other: 'Otra' });
export const PROVIDER = make({ hostinger: 'Hostinger', cloudflare: 'Cloudflare', other: 'Otro proveedor' });
export const INTEGRATION_STATUS = make({ not_configured: ['Pendiente de conexión', 'mute'], pending: ['Verificando', 'warn'], connected: ['Conectada', 'ok'], error: ['Error', 'danger'], unauthorized: ['Sin autorización', 'danger'] });

export const INCIDENT_STATUS = make({ open: ['Abierta', 'danger'], investigating: ['En investigación', 'warn'], in_progress: ['En progreso', 'brand'], pending: ['Pendiente', 'violet'], resolved: ['Resuelta', 'ok'], closed: ['Cerrada', 'mute'] });
export const INCIDENT_CATEGORY = make({ infrastructure: 'Infraestructura', application: 'Aplicación', billing: 'Facturación', support: 'Soporte', security: 'Seguridad', other: 'Otra' });

export const TESTIMONIAL_STATUS = make({ received: ['Recibido verbalmente', 'mute'], pending_draft: ['Pendiente de redactar', 'warn'], pending_approval: ['Pendiente de aprobación', 'violet'], authorized: ['Autorizado', 'ok'], rejected: ['No autorizado', 'danger'] });
export const CHANNEL = make({ call: 'Llamada', meeting: 'Reunión', in_person: 'En persona', video_call: 'Videollamada', whatsapp: 'WhatsApp', email: 'Email', other: 'Otro' });
export const COMM_KIND = make({ note: 'Nota interna', call: 'Llamada', email: 'Email', meeting: 'Reunión', whatsapp: 'WhatsApp', other: 'Otro' });

export const DOC_CATEGORY = make({ contract: 'Contratos', invoice: 'Facturas', quote: 'Presupuestos', technical: 'Documentación técnica', manual: 'Manuales', deliverable: 'Entregables', receipt: 'Justificantes', other: 'Otros' });
export const SECRET_KIND = make({ password: 'Contraseña', api_key: 'Clave API', ssh_key: 'Clave SSH', database: 'Base de datos', other: 'Otro' });

export const ROLE = make({ admin: ['Administrador', 'brand'], tecnico: ['Técnico', 'violet'], finanzas: ['Finanzas', 'ok'], lectura: ['Solo lectura', 'mute'] });

export const ACCESS_EVENT = make({
  login_success: ['Inicio de sesión', 'ok'], login_failed: ['Intento fallido', 'danger'], login_blocked: ['Bloqueado', 'danger'], account_locked: ['Cuenta bloqueada', 'danger'],
  logout: ['Cierre de sesión', 'mute'], password_reset_requested: ['Recuperación solicitada', 'warn'], password_reset_done: ['Contraseña restablecida', 'brand'], password_changed: ['Contraseña cambiada', 'brand'],
});
