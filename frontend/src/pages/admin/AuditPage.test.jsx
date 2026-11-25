import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AuditPage from './AuditPage.jsx';
import { auditApi } from '../../services/audit.service.js';
import { adminUser, apiError, listResult, renderWithAuth } from '../../test/helpers.jsx';

vi.mock('../../services/audit.service.js', () => ({ auditApi: { list: vi.fn(), get: vi.fn(), filters: vi.fn() } }));

const entry = (over = {}) => ({
  id_auditoria: 10, id_usuario: 2, usuario: 'Ana Pérez', correo: 'ana@uni.edu', operacion: 'USUARIO_EDITAR', recurso: 'usuarios', id_recurso: '5',
  resultado: 'EXITO', detalle: { nombres: { antes: 'A', despues: 'B' }, password: '[oculto]' }, ip: '10.0.0.5', creado_en: '2026-03-05T15:00:00Z', ...over,
});

const setup = () => userEvent.setup({ applyAccept: false });
const renderPage = () => renderWithAuth(<MemoryRouter><AuditPage /></MemoryRouter>, adminUser);

beforeEach(() => {
  vi.clearAllMocks();
  auditApi.filters.mockResolvedValue({ operaciones: ['LOGIN', 'USUARIO_EDITAR'], recursos: ['auth', 'usuarios'] });
  auditApi.list.mockResolvedValue(listResult([entry()]));
});

describe('AuditPage', () => {
  test('lista los registros con usuario, operación, recurso, resultado e IP', async () => {
    auditApi.list.mockResolvedValue(listResult([entry(), entry({ id_auditoria: 11, usuario: null, correo: null, operacion: 'LOGIN', recurso: 'auth', id_recurso: null, resultado: 'FALLO', ip: null })]));
    renderPage();
    const table = await screen.findByRole('table', { name: 'Registros de auditoría' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Ana Pérez');
    expect(rows[1]).toHaveTextContent('USUARIO_EDITAR');
    expect(rows[1]).toHaveTextContent('usuarios #5');
    expect(rows[1]).toHaveTextContent('Éxito');
    expect(rows[1]).toHaveTextContent('10.0.0.5');
    expect(rows[2]).toHaveTextContent('Sistema / sin sesión');
    expect(rows[2]).toHaveTextContent('Fallo');
    expect(rows[2]).toHaveTextContent('—');
    expect(auditApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  test('las opciones de operación y recurso vienen de la API', async () => {
    renderPage();
    const select = await screen.findByLabelText('Operación');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'USUARIO_EDITAR' })).toBeInTheDocument());
    expect(within(screen.getByLabelText('Recurso')).getByRole('option', { name: 'auth' })).toBeInTheDocument();
  });

  test('los filtros se envían al servidor y vuelven a la página 1', async () => {
    const user = setup();
    renderPage();
    await screen.findByRole('table', { name: 'Registros de auditoría' });
    await waitFor(() => expect(within(screen.getByLabelText('Operación')).getByRole('option', { name: 'LOGIN' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Operación'), 'LOGIN');
    await waitFor(() => expect(auditApi.list).toHaveBeenLastCalledWith({ operacion: 'LOGIN', page: 1, pageSize: 20 }));
    await user.selectOptions(screen.getByLabelText('Resultado'), 'FALLO');
    await waitFor(() => expect(auditApi.list).toHaveBeenLastCalledWith({ operacion: 'LOGIN', resultado: 'FALLO', page: 1, pageSize: 20 }));
    await user.type(screen.getByLabelText('Desde'), '2026-03-01');
    await waitFor(() => expect(auditApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-03-01' })));
    await user.selectOptions(screen.getByLabelText('Operación'), '');
    await waitFor(() => expect(auditApi.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ operacion: expect.anything() })));
  });

  test('el detalle muestra el JSON con las credenciales ya enmascaradas', async () => {
    const user = setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver detalle del registro 10' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Registro de auditoría #10')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana Pérez (ana@uni.edu)')).toBeInTheDocument();
    const json = within(dialog).getByLabelText('Detalle en formato JSON');
    expect(json).toHaveTextContent('"antes": "A"');
    expect(json).toHaveTextContent('[oculto]');
    await user.click(within(dialog).getAllByRole('button', { name: 'Cerrar' }).at(-1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('registro sin detalle ni usuario', async () => {
    const user = setup();
    auditApi.list.mockResolvedValue(listResult([entry({ id_auditoria: 12, detalle: null, usuario: null, correo: null, ip: null })]));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver detalle del registro 12' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Sin detalle adicional.')).toBeInTheDocument();
    expect(within(dialog).getByText('Sistema / sin sesión')).toBeInTheDocument();
  });

  test('vacío y error con reintento; si fallan las opciones la pantalla sigue', async () => {
    const user = setup();
    auditApi.filters.mockRejectedValue(apiError(500, 'INTERNAL_ERROR', 'x'));
    auditApi.list.mockResolvedValueOnce(listResult([])).mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR', 'Falla del servidor'));
    renderPage();
    expect(await screen.findByText('Sin registros')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Resultado'), 'EXITO');
    expect(await screen.findByText('Falla del servidor')).toBeInTheDocument();
    auditApi.list.mockResolvedValue(listResult([entry()]));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });
});
