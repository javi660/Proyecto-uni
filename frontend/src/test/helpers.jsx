import { render } from '@testing-library/react';
import { AuthContext } from '../context/AuthContext.jsx';
import { ApiError } from '../services/api.js';

/** Respuesta de listado como la entrega services/resource.js. */
export const listResult = (items, meta = {}) => ({
  items,
  meta: { page: 1, pageSize: 20, total: items.length, ...meta },
});

/** Error de la API tal como lo entrega el cliente HTTP normalizado. */
export const apiError = (status, code, message, details = []) => new ApiError({ status, code, message, details });

export const adminUser = {
  id_usuario: 1, nombres: 'Root', apellidos: 'Admin', correo: 'root@uni.edu', rol: 'ADMINISTRADOR',
  id_dependencia: null, dependencia: null, debe_cambiar_password: false,
};

/** Renderiza dentro de un AuthContext con el usuario indicado. */
export function renderWithAuth(ui, user = adminUser) {
  const value = {
    user, status: 'authenticated', isAuthenticated: true, sessionExpired: false,
    clearSessionExpired: () => {}, login: () => {}, logout: () => {}, changePassword: () => {},
  };
  return render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>);
}

export const studentUser = { ...adminUser, id_usuario: 10, nombres: 'Ana', apellidos: 'Pérez', correo: 'ana@uni.edu', rol: 'ESTUDIANTE' };
export const funcionarioUser = { ...adminUser, id_usuario: 20, nombres: 'Fer', apellidos: 'Func', correo: 'fer@uni.edu', rol: 'FUNCIONARIO', id_dependencia: 7, dependencia: 'Registro' };
export const supervisorUser = { ...adminUser, id_usuario: 30, nombres: 'Sofía', apellidos: 'Sup', correo: 'sofia@uni.edu', rol: 'SUPERVISOR' };

/** Una fila de solicitud como la entrega la API. */
export const makeRequest = (over = {}) => ({
  id_solicitud: 100, codigo: 'SGSSU-2026-000100', asunto: 'Certificado de notas', descripcion: 'Lo necesito para una beca',
  estado: 'REGISTRADA', prioridad: 'NORMAL', id_servicio: 5, servicio: 'Certificado', sla_horas: 48, id_categoria: 1, categoria: 'Académico',
  id_dependencia: 7, dependencia: 'Registro', id_estudiante: 10, estudiante: 'Ana Pérez', estudiante_correo: 'ana@uni.edu',
  id_funcionario: null, funcionario: null, fecha_registro: '2026-03-05T15:00:00Z', fecha_actualizacion: '2026-03-05T15:00:00Z',
  fecha_resolucion: null, fecha_cierre: null, total_adjuntos: 0, adjuntos: [], ...over,
});
