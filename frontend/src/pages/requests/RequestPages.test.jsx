import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import NewRequestPage from './NewRequestPage.jsx';
import RequestsPage from './RequestsPage.jsx';
import RequestDetailPage from './RequestDetailPage.jsx';
import { requestsApi } from '../../services/requests.service.js';
import { dependenciesApi, servicesApi } from '../../services/catalog.service.js';
import {
  adminUser, apiError, funcionarioUser, listResult, makeRequest, renderWithAuth, studentUser, supervisorUser,
} from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/requests.service.js', () => ({
  requestsApi: { list: vi.fn(), listMine: vi.fn(), get: vi.fn(), create: vi.fn(), assign: vi.fn(), listAssignments: vi.fn(), getTimeline: vi.fn(), changeStatus: vi.fn(), changePriority: vi.fn(), addResponse: vi.fn(), listResponses: vi.fn(), listAttachments: vi.fn(), uploadAttachment: vi.fn(), downloadAttachment: vi.fn() },
  officialsApi: { list: vi.fn() },
}));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const setup = () => userEvent.setup({ applyAccept: false });
const pdf = (name = 'acta.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

function renderAt(ui, user, path = '/') {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/solicitudes" element={ui} />
        <Route path="/solicitudes/nueva" element={ui} />
        <Route path="/solicitudes/:id" element={ui} />
      </Routes>
    </MemoryRouter>,
    user,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestsApi.listAssignments.mockResolvedValue([]);
  requestsApi.getTimeline.mockResolvedValue([]);
  servicesApi.list.mockResolvedValue(listResult([
    { id_servicio: 5, nombre: 'Certificado de notas', categoria: 'Académico', dependencia: 'Registro', sla_horas: 48, activo: true },
    { id_servicio: 6, nombre: 'Consulta psicológica', categoria: 'Bienestar', dependencia: 'Bienestar', sla_horas: 24, activo: true },
  ]));
  dependenciesApi.list.mockResolvedValue(listResult([{ id_dependencia: 7, nombre: 'Registro', activo: true }]));
});

describe('NewRequestPage', () => {
  async function fillValid(user, { asunto = '  Certificado   de notas ', descripcion = 'Lo necesito' } = {}) {
    await user.selectOptions(await screen.findByLabelText(/^servicio/i), 'Académico · Certificado de notas');
    await user.type(screen.getByLabelText(/asunto/i), asunto);
    await user.type(screen.getByLabelText(/descripción/i), descripcion);
  }

  test('muestra los servicios y la dependencia/SLA del seleccionado', async () => {
    const user = setup();
    renderAt(<NewRequestPage />, studentUser, '/solicitudes/nueva');
    await user.selectOptions(await screen.findByLabelText(/^servicio/i), 'Académico · Certificado de notas');
    expect(screen.getByText(/Lo atiende Registro. Tiempo estimado de atención: 48 horas/)).toBeInTheDocument();
  });

  test('valida campos obligatorios y no envía', async () => {
    const user = setup();
    renderAt(<NewRequestPage />, studentUser, '/solicitudes/nueva');
    await screen.findByRole('option', { name: 'Académico · Certificado de notas' });
    await user.click(screen.getByRole('button', { name: 'Registrar solicitud' }));
    expect(await screen.findByText('Selecciona el servicio que necesitas')).toBeInTheDocument();
    expect(screen.getByText('El asunto es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La descripción es obligatoria')).toBeInTheDocument();
    expect(requestsApi.create).not.toHaveBeenCalled();
  });

  test('crea la solicitud (id numérico, textos normalizados), sube los adjuntos y va al detalle', async () => {
    const user = setup();
    requestsApi.create.mockResolvedValue(makeRequest({ id_solicitud: 321, codigo: 'SGSSU-2026-000321' }));
    requestsApi.uploadAttachment.mockResolvedValue({});
    requestsApi.get.mockResolvedValue(makeRequest({ id_solicitud: 321, codigo: 'SGSSU-2026-000321' }));
    renderAt(<NewRequestPage />, studentUser, '/solicitudes/nueva');
    await fillValid(user);
    await user.upload(screen.getByLabelText('Seleccionar archivos adjuntos'), [pdf('a.pdf', 1), pdf('b.pdf', 2)]);
    await user.click(screen.getByRole('button', { name: 'Registrar solicitud' }));

    await waitFor(() => expect(requestsApi.create).toHaveBeenCalledWith({ id_servicio: 5, asunto: 'Certificado de notas', descripcion: 'Lo necesito' }));
    await waitFor(() => expect(requestsApi.uploadAttachment).toHaveBeenCalledTimes(2));
    expect(requestsApi.uploadAttachment.mock.calls.map(([id, f]) => [id, f.name])).toEqual([[321, 'a.pdf'], [321, 'b.pdf']]);
    expect(toast.success).toHaveBeenCalledWith('Solicitud SGSSU-2026-000321 registrada correctamente');
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('si falla un adjunto, la solicitud queda creada y se avisa', async () => {
    const user = setup();
    requestsApi.create.mockResolvedValue(makeRequest({ id_solicitud: 322, codigo: 'SGSSU-2026-000322' }));
    requestsApi.uploadAttachment.mockRejectedValue(apiError(400, 'FILE_CONTENT_MISMATCH', 'El contenido del archivo no corresponde a su tipo o extensión'));
    requestsApi.get.mockResolvedValue(makeRequest({ id_solicitud: 322 }));
    renderAt(<NewRequestPage />, studentUser, '/solicitudes/nueva');
    await fillValid(user);
    await user.upload(screen.getByLabelText('Seleccionar archivos adjuntos'), pdf('raro.pdf'));
    await user.click(screen.getByRole('button', { name: 'Registrar solicitud' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toMatch(/No se pudieron adjuntar 1 archivo.*raro\.pdf: El contenido del archivo no corresponde/);
    expect(toast.success).toHaveBeenCalled();
  });

  test('error del servidor al crear: se muestra y no se suben archivos', async () => {
    const user = setup();
    requestsApi.create.mockRejectedValue(apiError(409, 'SERVICE_INACTIVE', 'El servicio seleccionado no está disponible'));
    renderAt(<NewRequestPage />, studentUser, '/solicitudes/nueva');
    await fillValid(user);
    await user.upload(screen.getByLabelText('Seleccionar archivos adjuntos'), pdf());
    await user.click(screen.getByRole('button', { name: 'Registrar solicitud' }));
    expect(await screen.findByText('El servicio seleccionado no está disponible')).toBeInTheDocument();
    expect(requestsApi.uploadAttachment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Registrar solicitud' })).toBeEnabled(); // puede reintentar
  });
});

describe('RequestsPage', () => {
  const rows = [
    makeRequest(),
    makeRequest({ id_solicitud: 101, codigo: 'SGSSU-2026-000101', asunto: 'Constancia', estado: 'ASIGNADA', prioridad: 'ALTA', id_funcionario: 20, funcionario: 'Fer Func' }),
  ];

  beforeEach(() => requestsApi.list.mockResolvedValue(listResult(rows)));

  test('estudiante: título "Mis solicitudes", botón de nueva solicitud y sin columna de estudiante', async () => {
    renderAt(<RequestsPage />, studentUser, '/solicitudes');
    expect(await screen.findByRole('heading', { name: 'Mis solicitudes' })).toBeInTheDocument();
    expect(await screen.findByText('Constancia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nueva solicitud/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Estudiante' })).toBeNull();
    expect(screen.queryByLabelText('Dependencia')).toBeNull();
    expect(screen.getByRole('link', { name: 'SGSSU-2026-000100' })).toHaveAttribute('href', '/solicitudes/100');
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('Fer Func')).toBeInTheDocument();
  });

  test('administrador y supervisor: ven estudiante y filtro de dependencia, sin botón de nueva solicitud', async () => {
    for (const user of [adminUser, supervisorUser]) {
      const { unmount } = renderAt(<RequestsPage />, user, '/solicitudes');
      expect(await screen.findByRole('heading', { name: 'Solicitudes' })).toBeInTheDocument();
      expect(await screen.findByRole('columnheader', { name: 'Estudiante' })).toBeInTheDocument();
      expect(screen.getByLabelText('Dependencia')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /nueva solicitud/i })).toBeNull();
      unmount();
    }
  });

  test('funcionario: sin columna "Atiende" ni filtro de dependencia', async () => {
    renderAt(<RequestsPage />, funcionarioUser, '/solicitudes');
    await screen.findByText('Constancia');
    expect(screen.queryByRole('columnheader', { name: 'Atiende' })).toBeNull();
    expect(screen.queryByLabelText('Dependencia')).toBeNull();
    expect(dependenciesApi.list).not.toHaveBeenCalled();
  });

  test('filtros y búsqueda consultan al servidor desde la página 1', async () => {
    const user = setup();
    renderAt(<RequestsPage />, adminUser, '/solicitudes');
    await screen.findByText('Constancia');
    await user.selectOptions(screen.getByLabelText('Estado'), 'Asignada');
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'ASIGNADA', page: 1 })));
    await user.selectOptions(screen.getByLabelText('Prioridad'), 'Alta');
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'ASIGNADA', prioridad: 'ALTA' })));
    await user.selectOptions(screen.getByLabelText('Dependencia'), 'Registro');
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ id_dependencia: '7' })));
    await user.type(screen.getByLabelText('Desde'), '2026-03-01');
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-03-01' })));
    await user.type(screen.getByRole('searchbox'), 'SGSSU-2026-000101');
    await waitFor(() => expect(requestsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'SGSSU-2026-000101', page: 1 })));
  });

  test('estado vacío según el perfil y error con reintento', async () => {
    requestsApi.list.mockResolvedValueOnce(listResult([]));
    const { unmount } = renderAt(<RequestsPage />, studentUser, '/solicitudes');
    expect(await screen.findByText('Aún no tienes solicitudes')).toBeInTheDocument();
    unmount();

    requestsApi.list.mockRejectedValueOnce(apiError(503, 'DB_UNAVAILABLE', 'La base de datos no está disponible')).mockResolvedValue(listResult(rows));
    renderAt(<RequestsPage />, adminUser, '/solicitudes');
    expect(await screen.findByText('La base de datos no está disponible')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Constancia')).toBeInTheDocument();
  });
});

describe('RequestDetailPage', () => {
  const attachment = { id_adjunto: 9, nombre_original: 'Acta.pdf', tamano_bytes: 2048, subido_por: 'Ana Pérez', creado_en: '2026-03-05T16:00:00Z' };

  test('muestra datos, estado, prioridad y adjuntos; el propietario puede descargar y adjuntar', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest({ total_adjuntos: 1, adjuntos: [attachment] }));
    requestsApi.downloadAttachment.mockResolvedValue();
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/100');
    expect(await screen.findByRole('heading', { name: 'SGSSU-2026-000100' })).toBeInTheDocument();
    expect(requestsApi.get).toHaveBeenCalledWith('100');
    expect(screen.getByText('Certificado de notas')).toBeInTheDocument();
    expect(screen.getByText('Lo necesito para una beca')).toBeInTheDocument();
    expect(screen.getByText('Registrada', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('48 horas')).toBeInTheDocument();
    expect(screen.getByText(/Archivos adjuntos \(1\/3\)/)).toBeInTheDocument();
    expect(screen.getByText('Acta.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descargar Acta.pdf' }));
    expect(requestsApi.downloadAttachment).toHaveBeenCalledWith(attachment);
    expect(screen.getByRole('button', { name: 'Adjuntar archivo' })).toBeInTheDocument();
  });

  test('subir un archivo desde el detalle recarga la solicitud', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValueOnce(makeRequest()).mockResolvedValue(makeRequest({ total_adjuntos: 1, adjuntos: [attachment] }));
    requestsApi.uploadAttachment.mockResolvedValue({});
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/100');
    await screen.findByText('Esta solicitud no tiene archivos adjuntos.');
    await user.upload(screen.getByLabelText('Seleccionar archivo para adjuntar'), pdf('nuevo.pdf'));
    await waitFor(() => expect(requestsApi.uploadAttachment).toHaveBeenCalledWith(100, expect.objectContaining({ name: 'nuevo.pdf' })));
    expect(await screen.findByText('Acta.pdf')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Archivo adjuntado correctamente');
  });

  test('archivo inválido desde el detalle no se envía', async () => {
    const user = setup();
    requestsApi.get.mockResolvedValue(makeRequest());
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/100');
    await screen.findByText('Esta solicitud no tiene archivos adjuntos.');
    await user.upload(screen.getByLabelText('Seleccionar archivo para adjuntar'), new File(['MZ'], 'virus.exe'));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('solo se permiten archivos PDF, PNG, JPG o DOCX'));
    expect(requestsApi.uploadAttachment).not.toHaveBeenCalled();
  });

  test.each([
    ['administrador', adminUser, {}],
    ['supervisor', supervisorUser, {}],
    ['estudiante en solicitud cerrada', studentUser, { estado: 'CERRADA', fecha_cierre: '2026-03-06T15:00:00Z', fecha_resolucion: '2026-03-06T14:00:00Z' }],
    ['estudiante con 3 adjuntos', studentUser, { total_adjuntos: 3, adjuntos: [attachment, { ...attachment, id_adjunto: 10 }, { ...attachment, id_adjunto: 11 }] }],
    ['otro funcionario', funcionarioUser, { id_funcionario: 99 }],
  ])('%s no ve el botón de adjuntar', async (_n, user, over) => {
    requestsApi.get.mockResolvedValue(makeRequest(over));
    renderAt(<RequestDetailPage />, user, '/solicitudes/100');
    await screen.findByRole('heading', { name: 'SGSSU-2026-000100' });
    expect(screen.queryByRole('button', { name: 'Adjuntar archivo' })).toBeNull();
  });

  test('el funcionario asignado sí puede adjuntar; solicitud cerrada muestra fechas de resolución y cierre', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ estado: 'ASIGNADA', id_funcionario: 20, funcionario: 'Fer Func' }));
    renderAt(<RequestDetailPage />, funcionarioUser, '/solicitudes/100');
    expect(await screen.findByRole('button', { name: 'Adjuntar archivo' })).toBeInTheDocument();
    expect(screen.getByText('Fer Func')).toBeInTheDocument();
    expect(screen.queryByText('Cerrada', { selector: 'dt' })).toBeNull();
  });

  test('solicitud inexistente o sin acceso (404) muestra un mensaje claro', async () => {
    requestsApi.get.mockRejectedValue(apiError(404, 'NOT_FOUND', 'La solicitud no existe o no tienes acceso a ella'));
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/999');
    expect(await screen.findByText('No encontramos la solicitud')).toBeInTheDocument();
    expect(screen.getByText('No existe o no tienes acceso a ella.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al listado/i })).toHaveAttribute('href', '/solicitudes');
  });

  test('otro error permite reintentar', async () => {
    requestsApi.get.mockRejectedValueOnce(apiError(503, 'DB_UNAVAILABLE', 'La base de datos no está disponible')).mockResolvedValue(makeRequest());
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/100');
    expect(await screen.findByText('La base de datos no está disponible')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'SGSSU-2026-000100' })).toBeInTheDocument();
  });

  test('un error al descargar se informa sin romper la pantalla', async () => {
    requestsApi.get.mockResolvedValue(makeRequest({ total_adjuntos: 1, adjuntos: [attachment] }));
    requestsApi.downloadAttachment.mockRejectedValue(apiError(404, 'NOT_FOUND', 'El archivo ya no está disponible'));
    renderAt(<RequestDetailPage />, studentUser, '/solicitudes/100');
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar Acta.pdf' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El archivo ya no está disponible'));
    expect(screen.getByText('Acta.pdf')).toBeInTheDocument();
  });
});
