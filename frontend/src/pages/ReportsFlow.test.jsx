import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardPage from './DashboardPage.jsx';
import ReportsPage from './ReportsPage.jsx';
import { reportsApi } from '../services/reports.service.js';
import { dependenciesApi, categoriesApi } from '../services/catalog.service.js';
import { formatHours, formatPercent, monthLabel, formatYmd } from '../utils/reports.js';
import { adminUser, apiError, funcionarioUser, renderWithAuth, studentUser } from '../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../services/reports.service.js', () => ({
  reportsApi: { dashboard: vi.fn(), byStatus: vi.fn(), byCategory: vi.fn(), byDependency: vi.fn(), byPeriod: vi.fn(), exportCsv: vi.fn() },
}));
vi.mock('../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const PERIODO = { desde: '2026-01-01', hasta: '2026-01-31', por_defecto: false };
const envelope = (over = {}) => ({ periodo: PERIODO, ambito: 'todas las solicitudes del sistema', criterio: 'Solicitudes registradas entre 01/01/2026 y 31/01/2026; todas las solicitudes del sistema', ...over });
const metrics = (over = {}) => ({
  total: 5, pendientes: 2, en_proceso: 1, resueltas: 1, cerradas: 1, rechazadas: 0, abiertas: 3, con_retraso: 3,
  tiempo_atencion_horas: 15, tiempo_resolucion_horas: 35, cumplimiento_sla: 50, ...over,
});
const STATES = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA'];

function mockReports({ status, period, category, dependency } = {}) {
  reportsApi.byStatus.mockResolvedValue(envelope({ filas: status ?? STATES.map((estado, i) => ({ estado, total: i === 0 ? 2 : 1 })) }));
  reportsApi.byPeriod.mockResolvedValue(envelope({ filas: period ?? [{ periodo: '2026-01', total: 5, resueltas: 2, rechazadas: 0 }, { periodo: '2026-02', total: 0, resueltas: 0, rechazadas: 0 }] }));
  reportsApi.byCategory.mockResolvedValue(envelope({ filas: category ?? [{ id_categoria: 1, categoria: 'Académico', ...metrics() }] }));
  reportsApi.byDependency.mockResolvedValue(envelope({ filas: dependency ?? [{ id_dependencia: 1, dependencia: 'Registro', ...metrics({ con_retraso: 0, tiempo_atencion_horas: 0.5 }) }] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dependenciesApi.list.mockResolvedValue({ items: [{ id_dependencia: 1, nombre: 'Registro' }, { id_dependencia: 2, nombre: 'Bienestar' }], meta: {} });
  categoriesApi.list.mockResolvedValue({ items: [{ id_categoria: 1, nombre: 'Académico' }], meta: {} });
});

afterEach(() => vi.useRealTimers());

describe('formato de indicadores', () => {
  test('horas, días y minutos', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(0.5)).toBe('30 min');
    expect(formatHours(15)).toBe('15 h');
    expect(formatHours(11.25)).toBe('11,3 h');
    expect(formatHours(72)).toBe('3 días');
    expect(formatHours(60)).toBe('2,5 días');
  });
  test('porcentaje, mes y fecha', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(66.7)).toBe('66,7 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(monthLabel('2026-03')).toBe('mar 2026');
    expect(formatYmd('2026-03-01')).toBe('01/03/2026');
  });
});

describe('DashboardPage: indicadores por perfil', () => {
  const renderDash = (user) => renderWithAuth(<MemoryRouter><DashboardPage /></MemoryRouter>, user);

  test('personal: muestra tarjetas, retraso, SLA y el criterio del periodo', async () => {
    reportsApi.dashboard.mockResolvedValue(envelope({ indicadores: metrics() }));
    renderDash(adminUser);
    const section = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(section).getByText(/Solicitudes registradas entre 01\/01\/2026/)).toBeInTheDocument();
    expect(within(section).getByText('Con retraso').parentElement).toHaveTextContent('3');
    expect(within(section).getByText('Cumplimiento del SLA').parentElement).toHaveTextContent('50 %');
    expect(within(section).getByText('Tiempo de atención').parentElement).toHaveTextContent('15 h');
    expect(within(section).getByText('Tiempo de resolución').parentElement).toHaveTextContent('35 h');
    expect(reportsApi.dashboard).toHaveBeenCalledWith({});
  });

  test('estudiante: sin retraso ni SLA, solo sus cifras', async () => {
    reportsApi.dashboard.mockResolvedValue(envelope({ ambito: 'tus solicitudes', indicadores: metrics({ total: 2 }) }));
    renderDash(studentUser);
    const section = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(section).getByText('Registradas').parentElement).toHaveTextContent('2');
    expect(within(section).queryByText('Con retraso')).not.toBeInTheDocument();
    expect(within(section).queryByText('Cumplimiento del SLA')).not.toBeInTheDocument();
  });

  test('sin datos muestra guiones en los promedios', async () => {
    reportsApi.dashboard.mockResolvedValue(envelope({ indicadores: metrics({ total: 0, pendientes: 0, en_proceso: 0, resueltas: 0, cerradas: 0, abiertas: 0, con_retraso: 0, tiempo_atencion_horas: null, tiempo_resolucion_horas: null, cumplimiento_sla: null }) }));
    renderDash(funcionarioUser);
    const section = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(section).getByText('Tiempo de resolución').parentElement).toHaveTextContent('—');
    expect(within(section).getByText('Cumplimiento del SLA').parentElement).toHaveTextContent('—');
  });

  test('error de la API: avisa y la pantalla sigue usable', async () => {
    reportsApi.dashboard.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'Falla del servidor'));
    renderDash(adminUser);
    expect(await screen.findByText('Falla del servidor')).toBeInTheDocument();
  });
});

describe('ReportsPage', () => {
  const setup = () => userEvent.setup({ applyAccept: false });
  const renderPage = (user = adminUser) => renderWithAuth(<MemoryRouter><ReportsPage /></MemoryRouter>, user);

  test('carga los cuatro reportes con sus tablas y el criterio', async () => {
    mockReports();
    renderPage();
    expect(await screen.findByText(/Solicitudes registradas entre 01\/01\/2026 y 31\/01\/2026/)).toBeInTheDocument();
    const byStatus = screen.getByRole('table', { name: 'Solicitudes por estado' });
    expect(within(byStatus).getByText('Registrada').closest('tr')).toHaveTextContent('2');
    expect(within(byStatus).getAllByRole('row')).toHaveLength(1 + STATES.length);
    const byMonth = screen.getByRole('table', { name: 'Solicitudes por mes' });
    expect(within(byMonth).getByText('ene 2026').closest('tr')).toHaveTextContent('5');
    expect(within(byMonth).getByText('feb 2026').closest('tr')).toHaveTextContent('0');
    const byCat = screen.getByRole('table', { name: 'Indicadores por categoría' });
    const row = within(byCat).getByText('Académico').closest('tr');
    expect(row).toHaveTextContent('15 h');
    expect(row).toHaveTextContent('35 h');
    expect(row).toHaveTextContent('50 %');
    const byDep = screen.getByRole('table', { name: 'Indicadores por dependencia' });
    expect(within(byDep).getByText('Registro').closest('tr')).toHaveTextContent('30 min');
    expect(screen.getByRole('img', { name: /Solicitudes por estado: Registrada 2/ })).toBeInTheDocument();
    for (const fn of ['byStatus', 'byPeriod', 'byCategory', 'byDependency']) expect(reportsApi[fn]).toHaveBeenCalledWith({});
  });

  test('sin solicitudes: estado vacío y sin botones de exportar', async () => {
    mockReports({ status: STATES.map((estado) => ({ estado, total: 0 })), period: [], category: [], dependency: [] });
    renderPage();
    expect(await screen.findByText('Sin solicitudes en este periodo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar CSV/ })).not.toBeInTheDocument();
  });

  test('los filtros se envían a las cuatro consultas (con pequeña espera)', async () => {
    mockReports();
    const user = setup();
    renderPage();
    await screen.findByRole('table', { name: 'Solicitudes por estado' });
    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.selectOptions(screen.getByLabelText('Dependencia'), '2');
    await waitFor(() => expect(reportsApi.byCategory).toHaveBeenLastCalledWith({ desde: '2026-01-01', id_dependencia: '2' }));
    expect(reportsApi.byPeriod).toHaveBeenLastCalledWith({ desde: '2026-01-01', id_dependencia: '2' });
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(reportsApi.byStatus).toHaveBeenLastCalledWith({}));
  });

  test('exportar CSV usa los filtros aplicados y descarga el archivo', async () => {
    mockReports();
    const blob = new Blob(['a,b'], { type: 'text/csv' });
    reportsApi.exportCsv.mockResolvedValue({ blob, filename: 'solicitudes-por-categoria_2026-01-01_2026-01-31.csv' });
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV: Por categoría' }));
    await waitFor(() => expect(reportsApi.exportCsv).toHaveBeenCalledWith('by-category', {}));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });

  test('si falla la exportación avisa con un toast', async () => {
    mockReports();
    reportsApi.exportCsv.mockRejectedValue(apiError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta acción'));
    const user = setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV: Por dependencia' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No tienes permisos para realizar esta acción'));
  });

  test('error al cargar permite reintentar', async () => {
    mockReports();
    reportsApi.byStatus.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR', 'Falla del servidor'));
    const user = setup();
    renderPage();
    expect(await screen.findByText(/Falla del servidor/)).toBeInTheDocument();
    mockReports();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Solicitudes por estado' })).toBeInTheDocument();
  });

  test('el funcionario ve la descripción de sus propias cifras', async () => {
    mockReports();
    renderPage(funcionarioUser);
    expect(await screen.findByText('Cifras de las solicitudes que se te asignaron.')).toBeInTheDocument();
  });

  test('si no cargan los catálogos, la pantalla funciona igual', async () => {
    mockReports();
    dependenciesApi.list.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'x'));
    renderPage();
    expect(await screen.findByRole('table', { name: 'Solicitudes por estado' })).toBeInTheDocument();
  });
});
