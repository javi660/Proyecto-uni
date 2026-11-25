import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import RequestDetailPage from './RequestDetailPage.jsx';
import Timeline from '../../components/requests/Timeline.jsx';
import { requestsApi } from '../../services/requests.service.js';
import { availableActions, canChangePriority, canRespond, canSeeInternal, isFinal } from '../../utils/workflow.js';
import {
  adminUser, apiError, funcionarioUser, makeRequest, renderWithAuth, studentUser, supervisorUser,
} from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/requests.service.js', () => ({
  requestsApi: {
    list: vi.fn(), get: vi.fn(), assign: vi.fn(), listAssignments: vi.fn(), uploadAttachment: vi.fn(), downloadAttachment: vi.fn(),
    getTimeline: vi.fn(), changeStatus: vi.fn(), changePriority: vi.fn(), addResponse: vi.fn(), listResponses: vi.fn(),
  },
  officialsApi: { list: vi.fn() },
}));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const setup = () => userEvent.setup({ applyAccept: false });
const mine = { id_funcionario: 20, funcionario: 'Fer Func' };

function renderDetail(user) {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/solicitudes/100']}>
      <Routes><Route path="/solicitudes/:id" element={<RequestDetailPage />} /></Routes>
    </MemoryRouter>,
    user,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestsApi.listAssignments.mockResolvedValue([]);
  requestsApi.getTimeline.mockResolvedValue([]);
});

describe('reglas de presentación del flujo', () => {
  const labels = (request, user) => availableActions(request, user).map((a) => a.estado);

  test('funcionario asignado: iniciar y resolver; otro funcionario nada', () => {
    expect(labels(makeRequest({ estado: 'ASIGNADA', ...mine }), funcionarioUser)).toEqual(['EN_PROCESO']);
    expect(labels(makeRequest({ estado: 'REABIERTA', ...mine }), funcionarioUser)).toEqual(['EN_PROCESO']);
    expect(labels(makeRequest({ estado: 'EN_PROCESO', ...mine }), funcionarioUser)).toEqual(['RESUELTA']);
    expect(labels(makeRequest({ estado: 'EN_PROCESO', id_funcionario: 99 }), funcionarioUser)).toEqual([]);
  });

  test('resuelta: estudiante dueño cierra o reabre (con motivo); admin/supervisor cierran; ajeno nada', () => {
    const resolved = makeRequest({ estado: 'RESUELTA', ...mine });
    expect(labels(resolved, studentUser)).toEqual(['CERRADA', 'REABIERTA']);
    expect(availableActions(resolved, studentUser).find((a) => a.estado === 'REABIERTA').reasonRequired).toBe(true);
    expect(labels(resolved, adminUser)).toEqual(['CERRADA']);
    expect(labels(resolved, supervisorUser)).toEqual(['CERRADA']);
    expect(labels(resolved, funcionarioUser)).toEqual([]);
    expect(labels(resolved, { ...studentUser, id_usuario: 11 })).toEqual([]);
  });

  test('rechazar: solo admin/supervisor y solo REGISTRADA, con motivo', () => {
    const registered = makeRequest({ estado: 'REGISTRADA' });
    expect(labels(registered, adminUser)).toEqual(['RECHAZADA']);
    expect(availableActions(registered, supervisorUser)[0]).toEqual(expect.objectContaining({ reasonRequired: true, variant: 'danger' }));
    expect(labels(registered, studentUser)).toEqual([]);
    expect(labels(makeRequest({ estado: 'ASIGNADA', ...mine }), adminUser)).toEqual([]);
  });

  test('estados finales no ofrecen nada', () => {
    for (const estado of ['CERRADA', 'RECHAZADA']) {
      expect(isFinal({ estado })).toBe(true);
      expect(labels(makeRequest({ estado }), adminUser)).toEqual([]);
      expect(canChangePriority({ estado }, adminUser)).toBe(false);
    }
  });

  test('responder, prioridad e internas', () => {
    expect(canRespond(makeRequest({ estado: 'EN_PROCESO', ...mine }), funcionarioUser)).toBe(true);
    expect(canRespond(makeRequest({ estado: 'RESUELTA', ...mine }), funcionarioUser)).toBe(false);
    expect(canRespond(makeRequest({ estado: 'EN_PROCESO', ...mine }), adminUser)).toBe(false);
    expect(canChangePriority(makeRequest(), supervisorUser)).toBe(true);
    expect(canChangePriority(makeRequest(), funcionarioUser)).toBe(false);
    expect(canSeeInternal(studentUser)).toBe(false);
    expect(canSeeInternal(funcionarioUser)).toBe(true);
  });
});

describe('Timeline', () => {
  const events = [
    { tipo: 'ESTADO', id: 'e-1', fecha: '2026-03-05T15:00:00Z', usuario: 'Ana Pérez', rol_usuario: 'ESTUDIANTE', estado_anterior: null, estado_nuevo: 'REGISTRADA', observacion: null },
    { tipo: 'ESTADO', id: 'e-2', fecha: '2026-03-06T15:00:00Z', usuario: 'Gestión de solicitudes', rol_usuario: null, estado_anterior: 'REGISTRADA', estado_nuevo: 'ASIGNADA', observacion: null },
    { tipo: 'RESPUESTA', id: 'r-1', fecha: '2026-03-07T15:00:00Z', usuario: 'Fer Func', rol_usuario: 'FUNCIONARIO', contenido: 'Estamos revisando', visibilidad: 'PUBLICA' },
    { tipo: 'RESPUESTA', id: 'r-2', fecha: '2026-03-07T16:00:00Z', usuario: 'Fer Func', rol_usuario: 'FUNCIONARIO', contenido: 'Pedir dato a Registro', visibilidad: 'INTERNA' },
    { tipo: 'ESTADO', id: 'e-3', fecha: '2026-03-08T15:00:00Z', usuario: 'Fer Func', rol_usuario: 'FUNCIONARIO', estado_anterior: 'EN_PROCESO', estado_nuevo: 'RESUELTA', observacion: 'Todo listo' },
  ];

  test('muestra eventos en orden con autor, observaciones y marca de interna', () => {
    render(<Timeline events={events} />);
    const items = within(screen.getByRole('list', { name: /línea de tiempo/i })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[1]).toHaveTextContent('Gestión de solicitudes');
    expect(items[2]).toHaveTextContent('Estamos revisando');
    expect(items[3]).toHaveTextContent('Interna');
    expect(items[2]).not.toHaveTextContent('Interna');
    expect(items[4]).toHaveTextContent('Todo listo');
    expect(items[4]).toHaveTextContent('Funcionario');
  });

  test('vacío', () => {
    render(<Timeline events={[]} />);
    expect(screen.getByText(/aún no hay actividad/i)).toBeInTheDocument();
  });
});

describe('detalle: acciones de estado', () => {
  test('funcionario inicia la atención sin motivo obligatorio', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', ...mine }));
    requestsApi.changeStatus.mockResolvedValue(makeRequest({ estado: 'EN_PROCESO', ...mine }));
    renderDetail(funcionarioUser);
    await user.click(await screen.findByRole('button', { name: 'Iniciar atención' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Iniciar atención' }));
    await waitFor(() => expect(requestsApi.changeStatus).toHaveBeenCalledWith(100, { estado: 'EN_PROCESO', observacion: null }));
    expect(toast.success).toHaveBeenCalledWith('Atención iniciada');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestsApi.get).toHaveBeenCalledTimes(2); // recarga el detalle
  });

  test('reabrir exige motivo y lo envía recortado', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'RESUELTA', ...mine }));
    requestsApi.changeStatus.mockResolvedValue({});
    renderDetail(studentUser);
    await user.click(await screen.findByRole('button', { name: 'Reabrir' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reabrir' }));
    expect(await within(dialog).findByText('El motivo es obligatorio')).toBeInTheDocument();
    expect(requestsApi.changeStatus).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/motivo/i), '  Sigue fallando  ');
    await user.click(within(dialog).getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(requestsApi.changeStatus).toHaveBeenCalledWith(100, { estado: 'REABIERTA', observacion: 'Sigue fallando' }));
  });

  test('rechazar (admin) con motivo; el error del servidor se muestra y el modal sigue abierto', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'REGISTRADA' }));
    requestsApi.changeStatus.mockRejectedValue(apiError(409, 'REQUEST_CLOSED', 'La solicitud ya está cerrada'));
    renderDetail(adminUser);
    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Duplicada');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(await within(dialog).findByText('La solicitud ya está cerrada')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('cancelar no llama a la API', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'RESUELTA', ...mine }));
    renderDetail(supervisorUser);
    await user.click(await screen.findByRole('button', { name: 'Cerrar solicitud' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(requestsApi.changeStatus).not.toHaveBeenCalled();
  });

  test('solicitud cerrada: sin acciones ni formulario de respuesta', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'CERRADA', ...mine }));
    renderDetail(funcionarioUser);
    await screen.findByText('SGSSU-2026-000100');
    expect(screen.queryByRole('button', { name: /iniciar|resuelta|cerrar solicitud|reabrir|rechazar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /nueva respuesta/i })).not.toBeInTheDocument();
  });
});

describe('detalle: respuestas y prioridad', () => {
  test('funcionario publica una respuesta (pública por defecto) y la línea de tiempo se recarga', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'EN_PROCESO', ...mine }));
    requestsApi.addResponse.mockResolvedValue({});
    renderDetail(funcionarioUser);
    const form = await screen.findByRole('form', { name: /nueva respuesta/i });
    await user.click(within(form).getByRole('button', { name: 'Publicar' }));
    expect(await within(form).findByText(/escribe el contenido/i)).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Nueva respuesta'), '  Revisé tu caso  ');
    await user.click(within(form).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(requestsApi.addResponse).toHaveBeenCalledWith(100, { contenido: 'Revisé tu caso', visibilidad: 'PUBLICA' }));
    expect(toast.success).toHaveBeenCalledWith('Respuesta publicada');
    await waitFor(() => expect(requestsApi.getTimeline).toHaveBeenCalledTimes(2));
  });

  test('nota interna', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', ...mine }));
    requestsApi.addResponse.mockResolvedValue({});
    renderDetail(funcionarioUser);
    const form = await screen.findByRole('form', { name: /nueva respuesta/i });
    await user.type(within(form).getByLabelText('Nueva respuesta'), 'Consultar con jefe');
    await user.selectOptions(within(form).getByLabelText('Visibilidad'), 'INTERNA');
    await user.click(within(form).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(requestsApi.addResponse).toHaveBeenCalledWith(100, { contenido: 'Consultar con jefe', visibilidad: 'INTERNA' }));
    expect(toast.success).toHaveBeenCalledWith('Nota interna guardada');
  });

  test('el estudiante y el administrador no ven el formulario de respuesta', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'EN_PROCESO', ...mine }));
    const first = renderDetail(studentUser);
    await screen.findByText('SGSSU-2026-000100');
    expect(screen.queryByRole('form', { name: /nueva respuesta/i })).not.toBeInTheDocument();
    first.unmount();
    renderDetail(adminUser);
    await screen.findByText('SGSSU-2026-000100');
    expect(screen.queryByRole('form', { name: /nueva respuesta/i })).not.toBeInTheDocument();
  });

  test('admin cambia la prioridad; el estudiante no ve el selector', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', ...mine }));
    requestsApi.changePriority.mockResolvedValue({});
    const first = renderDetail(adminUser);
    await user.selectOptions(await screen.findByLabelText('Prioridad'), 'URGENTE');
    await waitFor(() => expect(requestsApi.changePriority).toHaveBeenCalledWith(100, 'URGENTE'));
    expect(toast.success).toHaveBeenCalledWith('Prioridad actualizada');
    first.unmount();
    renderDetail(studentUser);
    await screen.findByText('SGSSU-2026-000100');
    expect(screen.queryByLabelText('Prioridad')).not.toBeInTheDocument();
  });

  test('la línea de tiempo del detalle se pinta con lo que devuelve la API; si falla, el detalle sigue', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', ...mine }));
    requestsApi.getTimeline.mockResolvedValue([
      { tipo: 'ESTADO', id: 'e-1', fecha: '2026-03-05T15:00:00Z', usuario: 'Ana Pérez', rol_usuario: 'ESTUDIANTE', estado_anterior: null, estado_nuevo: 'REGISTRADA', observacion: null },
    ]);
    const first = renderDetail(studentUser);
    expect(await screen.findByRole('list', { name: /línea de tiempo/i })).toBeInTheDocument();
    first.unmount();
    requestsApi.getTimeline.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'x'));
    renderDetail(studentUser);
    expect(await screen.findByText(/aún no hay actividad/i)).toBeInTheDocument();
  });
});
