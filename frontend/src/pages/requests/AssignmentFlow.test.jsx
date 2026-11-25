import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import RequestDetailPage from './RequestDetailPage.jsx';
import RequestsPage from './RequestsPage.jsx';
import { officialsApi, requestsApi } from '../../services/requests.service.js';
import { dependenciesApi } from '../../services/catalog.service.js';
import { canAssign, assignActionLabel } from '../../utils/assignments.js';
import {
  adminUser, apiError, funcionarioUser, listResult, makeRequest, renderWithAuth, studentUser, supervisorUser,
} from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/requests.service.js', () => ({
  requestsApi: { list: vi.fn(), get: vi.fn(), assign: vi.fn(), listAssignments: vi.fn(), getTimeline: vi.fn(), changeStatus: vi.fn(), changePriority: vi.fn(), addResponse: vi.fn(), listResponses: vi.fn(), uploadAttachment: vi.fn(), downloadAttachment: vi.fn() },
  officialsApi: { list: vi.fn() },
}));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const officials = [
  { id_usuario: 20, nombres: 'Fer', apellidos: 'Func', correo: 'fer@uni.edu', id_dependencia: 7, dependencia: 'Registro', carga_activa: 3 },
  { id_usuario: 21, nombres: 'Gabi', apellidos: 'Gómez', correo: 'gabi@uni.edu', id_dependencia: 7, dependencia: 'Registro', carga_activa: 1 },
];

const history = [
  { id_asignacion: 2, id_funcionario: 21, funcionario: 'Gabi Gómez', id_asignador: 1, asignador: 'Root Admin', asignado_en: '2026-03-06T15:00:00Z', finalizado_en: null, activo: true, observacion: 'Carga de trabajo' },
  { id_asignacion: 1, id_funcionario: 20, funcionario: 'Fer Func', id_asignador: 1, asignador: 'Root Admin', asignado_en: '2026-03-05T16:00:00Z', finalizado_en: '2026-03-06T15:00:00Z', activo: false, observacion: null },
];

function renderDetail(user, path = '/solicitudes/100') {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/solicitudes/:id" element={<RequestDetailPage />} />
      </Routes>
    </MemoryRouter>,
    user,
  );
}

const setup = () => userEvent.setup({ applyAccept: false });

beforeEach(() => {
  vi.clearAllMocks();
  requestsApi.listAssignments.mockResolvedValue([]);
  requestsApi.getTimeline.mockResolvedValue([]);
  officialsApi.list.mockResolvedValue(listResult(officials));
});

describe('reglas de presentación', () => {
  test('canAssign: solo administrador/supervisor y estados asignables', () => {
    for (const estado of ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'REABIERTA']) {
      expect(canAssign({ estado }, adminUser)).toBe(true);
      expect(canAssign({ estado }, supervisorUser)).toBe(true);
    }
    for (const estado of ['RESUELTA', 'CERRADA', 'RECHAZADA']) expect(canAssign({ estado }, adminUser)).toBe(false);
    expect(canAssign({ estado: 'REGISTRADA' }, studentUser)).toBe(false);
    expect(canAssign({ estado: 'REGISTRADA' }, funcionarioUser)).toBe(false);
    expect(canAssign(null, adminUser)).toBe(false);
  });

  test('etiqueta: Asignar sin responsable, Reasignar con responsable', () => {
    expect(assignActionLabel({ id_funcionario: null })).toBe('Asignar');
    expect(assignActionLabel({ id_funcionario: 20 })).toBe('Reasignar');
  });
});

describe('asignar desde el detalle', () => {
  test('administrador asigna: envía id numérico y observación, avisa y recarga', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValueOnce(makeRequest()).mockResolvedValue(makeRequest({ estado: 'ASIGNADA', id_funcionario: 20, funcionario: 'Fer Func' }));
    requestsApi.assign.mockResolvedValue({});
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));

    const dialog = await screen.findByRole('dialog', { name: /asignar solicitud/i });
    expect(officialsApi.list).toHaveBeenCalledWith({ id_dependencia: 7, pageSize: 100 });
    expect(await within(dialog).findByRole('option', { name: 'Fer Func · 3 solicitudes activas' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Gabi Gómez · 1 solicitud activa' })).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/^funcionario/i), 'Fer Func · 3 solicitudes activas');
    await user.type(within(dialog).getByLabelText(/observación/i), '  Caso prioritario ');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() => expect(requestsApi.assign).toHaveBeenCalledWith(100, { id_funcionario: 20, observacion: 'Caso prioritario' }));
    expect(toast.success).toHaveBeenCalledWith('Solicitud asignada correctamente');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requestsApi.get).toHaveBeenCalledTimes(2); // recargó
    expect(await screen.findByRole('button', { name: 'Reasignar' })).toBeInTheDocument();
  });

  test('exige elegir un funcionario y la observación vacía se envía como null', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest());
    requestsApi.assign.mockResolvedValue({});
    renderDetail(supervisorUser);
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: /Fer Func/ });
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    await waitFor(() => expect(within(dialog).getAllByText('Selecciona un funcionario')).toHaveLength(2)); // opción vacía + mensaje de error
    expect(requestsApi.assign).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText(/^funcionario/i), 'Gabi Gómez · 1 solicitud activa');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    await waitFor(() => expect(requestsApi.assign).toHaveBeenCalledWith(100, { id_funcionario: 21, observacion: null }));
  });

  test('reasignar excluye al responsable actual y advierte de las notificaciones', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'EN_PROCESO', id_funcionario: 20, funcionario: 'Fer Func' }));
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Reasignar' }));
    const dialog = await screen.findByRole('dialog', { name: /reasignar solicitud/i });
    expect(await within(dialog).findByRole('option', { name: /Gabi Gómez/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /Fer Func/ })).toBeNull();
    expect(within(dialog).getByText(/Actualmente la atiende Fer Func/)).toBeInTheDocument();
  });

  test('errores del servidor se muestran sin cerrar el cuadro', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest());
    requestsApi.assign.mockRejectedValue(apiError(409, 'OFFICIAL_INACTIVE', 'El funcionario seleccionado está inactivo'));
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: /Fer Func/ });
    await user.selectOptions(within(dialog).getByLabelText(/^funcionario/i), 'Fer Func · 3 solicitudes activas');
    await user.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(await within(dialog).findByText('El funcionario seleccionado está inactivo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled();
  });

  test('sin otros funcionarios en la dependencia: aviso y botón deshabilitado', async () => {
    const user = setup();
    officialsApi.list.mockResolvedValue(listResult([]));
    requestsApi.get.mockResolvedValue(makeRequest());
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/No hay otros funcionarios activos en Registro/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeDisabled();
  });

  test('cancelar cierra el cuadro sin enviar', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest());
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsApi.assign).not.toHaveBeenCalled();
  });

  test.each([
    ['estudiante', studentUser, {}],
    ['funcionario', funcionarioUser, { id_funcionario: 20 }],
    ['administrador con solicitud RESUELTA', adminUser, { estado: 'RESUELTA' }],
    ['administrador con solicitud CERRADA', adminUser, { estado: 'CERRADA' }],
    ['supervisor con solicitud RECHAZADA', supervisorUser, { estado: 'RECHAZADA' }],
  ])('%s no ve los botones de asignar', async (_n, user, over) => {
    requestsApi.get.mockResolvedValue(makeRequest(over));
    renderDetail(user);
    await screen.findByRole('heading', { name: 'SGSSU-2026-000100' });
    expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).toBeNull();
  });
});

describe('historial de asignaciones en el detalle', () => {
  test('lista responsables, quién asignó, fechas y observación; marca la actual', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', id_funcionario: 21, funcionario: 'Gabi Gómez' }));
    requestsApi.listAssignments.mockResolvedValue(history);
    renderDetail(adminUser);
    const list = await screen.findByRole('list', { name: 'Historial de asignaciones' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Gabi Gómez')).toBeInTheDocument();
    expect(within(items[0]).getByText('Actual')).toBeInTheDocument();
    expect(within(items[0]).getByText('Carga de trabajo')).toBeInTheDocument();
    expect(within(items[1]).getByText('Fer Func')).toBeInTheDocument();
    expect(within(items[1]).queryByText('Actual')).toBeNull();
    expect(within(items[1]).getByText(/hasta/)).toBeInTheDocument();
  });

  test('sin asignaciones muestra un mensaje; si el historial falla, el detalle igual carga', async () => {
    requestsApi.get.mockResolvedValue(makeRequest());
    requestsApi.listAssignments.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'Error'));
    renderDetail(studentUser);
    expect(await screen.findByRole('heading', { name: 'SGSSU-2026-000100' })).toBeInTheDocument();
    expect(screen.getByText('Aún no ha sido asignada a ningún funcionario.')).toBeInTheDocument();
  });
});

describe('bandeja y accesos rápidos en el listado', () => {
  const rows = [makeRequest({ estado: 'REGISTRADA' })];

  beforeEach(() => {
    requestsApi.list.mockResolvedValue(listResult(rows));
    dependenciesApi.list.mockResolvedValue(listResult([{ id_dependencia: 7, nombre: 'Registro', activo: true }]));
  });

  const renderList = (user) => renderWithAuth(<MemoryRouter><RequestsPage /></MemoryRouter>, user);

  test('"Por asignar" filtra las REGISTRADA y se puede quitar', async () => {
    const user = setup();
    renderList(adminUser);
    const toggle = await screen.findByRole('button', { name: 'Por asignar' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'REGISTRADA', page: 1 })));
    expect(screen.getByRole('button', { name: 'Por asignar' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Por asignar' }));
    await waitFor(() => expect(requestsApi.list.mock.calls.at(-1)[0].estado).toBeUndefined());
  });

  test('estudiante no tiene "Por asignar"; el funcionario ve "Mis asignaciones"', async () => {
    const { unmount } = renderList(studentUser);
    await screen.findByRole('heading', { name: 'Mis solicitudes' });
    expect(screen.queryByRole('button', { name: 'Por asignar' })).toBeNull();
    unmount();
    renderList(funcionarioUser);
    expect(await screen.findByRole('heading', { name: 'Mis asignaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Por asignar' })).toBeNull();
  });
});
