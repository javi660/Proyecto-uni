import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServicesPage from './ServicesPage.jsx';
import { categoriesApi, dependenciesApi, servicesApi } from '../../services/catalog.service.js';
import { listResult } from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

beforeEach(() => {
  vi.clearAllMocks();
  servicesApi.list.mockResolvedValue(listResult([
    { id_servicio: 5, nombre: 'Certificado de notas', descripcion: null, id_categoria: 1, categoria: 'Académico', id_dependencia: 7, dependencia: 'Registro', sla_horas: 48, activo: true },
  ]));
  categoriesApi.list.mockResolvedValue(listResult([{ id_categoria: 1, nombre: 'Académico', activo: true }]));
  dependenciesApi.list.mockResolvedValue(listResult([{ id_dependencia: 7, nombre: 'Registro', activo: true }]));
});

async function openCreate() {
  render(<ServicesPage />);
  await screen.findByText('Certificado de notas');
  await userEvent.click(screen.getByRole('button', { name: /nuevo servicio/i }));
  return screen.findByRole('dialog', { name: /nuevo servicio/i });
}

describe('ServicesPage', () => {
  test('lista servicios con categoría, dependencia y SLA', async () => {
    render(<ServicesPage />);
    expect(await screen.findByText('Certificado de notas')).toBeInTheDocument();
    expect(screen.getAllByText('Académico').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Registro').length).toBeGreaterThan(0);
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  test('crear envía ids y SLA como números', async () => {
    servicesApi.create.mockResolvedValue({});
    const dialog = await openCreate();
    expect(within(dialog).getByLabelText(/tiempo de atención/i)).toHaveDisplayValue('72');
    await userEvent.type(within(dialog).getByLabelText(/nombre/i), 'Constancia');
    await userEvent.selectOptions(within(dialog).getByLabelText(/categoría/i), 'Académico');
    await userEvent.selectOptions(within(dialog).getByLabelText(/dependencia responsable/i), 'Registro');
    const sla = within(dialog).getByLabelText(/tiempo de atención/i);
    await userEvent.clear(sla);
    await userEvent.type(sla, '24');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(servicesApi.create).toHaveBeenCalled());
    expect(servicesApi.create.mock.calls[0][0]).toMatchObject({ nombre: 'Constancia', id_categoria: 1, id_dependencia: 7, sla_horas: 24 });
  });

  test.each(['0', '8761', '-3'])('SLA %s fuera de rango no se envía', async (value) => {
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText(/nombre/i), 'Constancia');
    await userEvent.selectOptions(within(dialog).getByLabelText(/categoría/i), 'Académico');
    await userEvent.selectOptions(within(dialog).getByLabelText(/dependencia responsable/i), 'Registro');
    const sla = within(dialog).getByLabelText(/tiempo de atención/i);
    await userEvent.clear(sla);
    await userEvent.type(sla, value);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(servicesApi.create).not.toHaveBeenCalled();
  });

  test('los filtros consultan por categoría y dependencia', async () => {
    render(<ServicesPage />);
    await screen.findByText('Certificado de notas');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Académico');
    await waitFor(() => expect(servicesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ id_categoria: '1', page: 1 })));
  });
});
