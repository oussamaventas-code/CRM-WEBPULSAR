import { db, tx } from '../db/index.js';

export const PERMISSIONS = {
  'clients.read': 'Ver clientes',
  'clients.write': 'Crear y editar clientes',
  'clients.delete': 'Eliminar clientes',
  'projects.read': 'Ver proyectos y tareas',
  'projects.write': 'Crear y editar proyectos y tareas',
  'projects.delete': 'Eliminar proyectos',
  'sales.read': 'Ver pipeline de ventas',
  'sales.write': 'Gestionar leads y oportunidades de venta',
  'services.read': 'Ver catálogo de servicios',
  'services.write': 'Gestionar servicios y contrataciones',
  'documents.read': 'Ver y descargar documentos',
  'documents.write': 'Subir y editar documentos',
  'documents.delete': 'Eliminar documentos',
  'secrets.use': 'Usar credenciales del almacén cifrado',
  'secrets.write': 'Gestionar credenciales del almacén cifrado',
  'finance.read': 'Ver finanzas',
  'finance.write': 'Registrar cobros, gastos y borradores de factura',
  'invoices.issue': 'Emitir, rectificar y enviar facturas',
  'infrastructure.read': 'Ver infraestructura',
  'infrastructure.write': 'Gestionar servidores, dominios, DNS y bases de datos',
  'integrations.manage': 'Configurar integraciones y credenciales de proveedores',
  'monitoring.read': 'Ver monitorización y alertas',
  'monitoring.write': 'Configurar comprobaciones y gestionar alertas',
  'incidents.read': 'Ver incidencias',
  'incidents.write': 'Gestionar incidencias',
  'testimonials.read': 'Ver testimonios',
  'testimonials.write': 'Registrar y redactar testimonios',
  'testimonials.approve': 'Registrar la autorización de testimonios',
  'activity.read': 'Ver registro de actividad',
  'audit.read': 'Ver auditoría técnica y accesos',
  'users.manage': 'Gestionar usuarios y roles',
  'settings.manage': 'Modificar configuración general',
  'backups.manage': 'Gestionar copias de seguridad y datos DEMO',
};

const ALL = Object.keys(PERMISSIONS);
const READS = ALL.filter((p) => p.endsWith('.read') && p !== 'audit.read');

export const ROLE_DEFINITIONS = {
  admin: { name: 'Administrador', description: 'Acceso completo a todos los módulos', permissions: ALL },
  tecnico: {
    name: 'Técnico',
    description: 'Proyectos, infraestructura, monitorización e incidencias',
    permissions: [
      'clients.read', 'projects.read', 'projects.write', 'sales.read', 'services.read', 'documents.read', 'documents.write',
      'secrets.use', 'secrets.write', 'infrastructure.read', 'infrastructure.write', 'monitoring.read',
      'monitoring.write', 'incidents.read', 'incidents.write', 'activity.read',
    ],
  },
  finanzas: {
    name: 'Finanzas',
    description: 'Clientes, facturación, cobros y gastos',
    permissions: [
      'clients.read', 'clients.write', 'projects.read', 'sales.read', 'sales.write', 'services.read', 'services.write', 'documents.read',
      'documents.write', 'finance.read', 'finance.write', 'invoices.issue', 'incidents.read', 'testimonials.read',
      'activity.read',
    ],
  },
  lectura: { name: 'Solo lectura', description: 'Consulta sin cambios', permissions: READS },
};

/** Sincroniza permisos y roles de sistema con la definición en código (idempotente). */
export function syncRbac() {
  tx(() => {
    for (const [key, description] of Object.entries(PERMISSIONS)) {
      db.run('INSERT INTO permissions (key, description) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET description = excluded.description', [key, description]);
    }
    for (const [key, role] of Object.entries(ROLE_DEFINITIONS)) {
      db.run(
        'INSERT INTO roles (key, name, description, is_system) VALUES (?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET name = excluded.name, description = excluded.description',
        [key, role.name, role.description],
      );
      const roleId = db.value('SELECT id FROM roles WHERE key = ?', [key]);
      db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const perm of role.permissions) {
        db.run('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE key = ?', [roleId, perm]);
      }
    }
  });
}

export function permissionsForRole(roleId) {
  return new Set(
    db.all('SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?', [roleId]).map((r) => r.key),
  );
}
