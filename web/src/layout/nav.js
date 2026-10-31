import { Activity, FileText, FolderKanban, Briefcase, LayoutDashboard, Package, Quote, Server, Settings, TrendingUp, TriangleAlert, Users, Wallet } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users, perm: 'clients.read' },
  { to: '/ventas', label: 'Ventas', icon: TrendingUp, perm: 'sales.read' },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban, perm: 'projects.read' },
  { to: '/trabajo', label: 'Trabajo', icon: Briefcase, perm: 'projects.read' },
  { to: '/infraestructura', label: 'Infraestructura', icon: Server, perm: 'infrastructure.read' },
  { to: '/finanzas', label: 'Finanzas', icon: Wallet, perm: 'finance.read' },
  { to: '/servicios', label: 'Servicios', icon: Package, perm: 'services.read' },
  { to: '/incidencias', label: 'Incidencias', icon: TriangleAlert, perm: 'incidents.read', badge: 'incidents' },
  { to: '/testimonios', label: 'Testimonios', icon: Quote, perm: 'testimonials.read' },
  { to: '/documentacion', label: 'Documentación', icon: FileText, perm: 'documents.read' },
  { to: '/actividad', label: 'Actividad', icon: Activity, perm: 'activity.read' },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
];

export const MOBILE_NAV = ['/', '/clientes', '/proyectos', '/infraestructura', '/finanzas'];
