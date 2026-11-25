import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  ClipboardList,
  BarChart3,
  Users,
  Tags,
  Wrench,
  Building2,
  ShieldCheck,
  Bell,
  UserCircle,
} from 'lucide-react';
import { ROLES } from './constants.js';

const { ADMINISTRADOR: ADM, ESTUDIANTE: EST, FUNCIONARIO: FUN, SUPERVISOR: SUP } = ROLES;
const ALL = [ADM, EST, FUN, SUP];

/**
 * Definición ÚNICA de las rutas autenticadas y de qué perfiles pueden verlas.
 * La barra lateral y el enrutador se generan de aquí, de modo que nunca se desincronizan.
 * Esto es solo presentación: el backend vuelve a verificar el perfil en cada petición.
 *
 *  - path: ruta del navegador
 *  - label: texto del menú (puede variar por perfil con `labelByRole`)
 *  - roles: perfiles autorizados
 *  - section: grupo del menú (null = no aparece en el menú)
 *  - phase: fase del plan en la que se construye el contenido real
 */
export const APP_ROUTES = [
  { path: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ALL, section: 'Principal', phase: 10 },
  {
    path: '/solicitudes',
    label: 'Solicitudes',
    labelByRole: { [EST]: 'Mis solicitudes' },
    icon: FileText,
    roles: ALL,
    section: 'Principal',
    phase: 6,
  },
  { path: '/solicitudes/nueva', label: 'Nueva solicitud', icon: FilePlus2, roles: [EST], section: 'Principal', phase: 6 },
  { path: '/asignaciones', label: 'Mis asignaciones', icon: ClipboardList, roles: [FUN], section: 'Principal', phase: 7 },
  { path: '/reportes', label: 'Reportes', icon: BarChart3, roles: [ADM, FUN, SUP], section: 'Principal', phase: 10 },
  { path: '/admin/usuarios', label: 'Usuarios', icon: Users, roles: [ADM], section: 'Administración', phase: 5 },
  { path: '/admin/categorias', label: 'Categorías', icon: Tags, roles: [ADM], section: 'Administración', phase: 5 },
  { path: '/admin/servicios', label: 'Servicios', icon: Wrench, roles: [ADM], section: 'Administración', phase: 5 },
  { path: '/admin/dependencias', label: 'Dependencias', icon: Building2, roles: [ADM], section: 'Administración', phase: 5 },
  { path: '/admin/auditoria', label: 'Auditoría', icon: ShieldCheck, roles: [ADM], section: 'Administración', phase: 11 },
  { path: '/notificaciones', label: 'Notificaciones', icon: Bell, roles: ALL, section: 'Cuenta', phase: 9 },
  { path: '/perfil', label: 'Mi perfil', icon: UserCircle, roles: ALL, section: 'Cuenta', phase: 4 },
];

/** Etiqueta del menú para un perfil. */
export function labelFor(route, role) {
  return route.labelByRole?.[role] ?? route.label;
}

/** Rutas visibles para un perfil. */
export function routesForRole(role) {
  return APP_ROUTES.filter((route) => route.roles.includes(role));
}

/** Rutas del menú de un perfil agrupadas por sección, en orden de aparición. */
export function menuSectionsForRole(role) {
  const sections = [];
  routesForRole(role).forEach((route) => {
    if (!route.section) return;
    let group = sections.find((s) => s.title === route.section);
    if (!group) {
      group = { title: route.section, items: [] };
      sections.push(group);
    }
    group.items.push({ ...route, label: labelFor(route, role) });
  });
  return sections;
}

/** Pantalla de inicio de todos los perfiles (el contenido cambia según el perfil). */
export const HOME_PATH = '/dashboard';

/** Nombre legible del perfil. */
export const ROLE_LABELS = Object.freeze({
  [ADM]: 'Administrador',
  [EST]: 'Estudiante',
  [FUN]: 'Funcionario',
  [SUP]: 'Supervisor',
});
