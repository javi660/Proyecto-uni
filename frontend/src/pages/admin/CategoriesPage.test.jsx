import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import CategoriesPage from './CategoriesPage.jsx';
import DependenciesPage from './DependenciesPage.jsx';
import { categoriesApi, dependenciesApi } from '../../services/catalog.service.js';
import { apiError, listResult } from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const cat = (over = {}) => ({ id_categoria: 1, nombre: 'Académico', descripcion: 'Trámites', activo: true, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  categoriesApi.list.mockResolvedValue(listResult([cat(), cat({ id_categoria: 2, nombre: 'Bienestar', descripcion: null, activo: false })]));
  dependenciesApi.list.mockResolvedValue(listResult([]));
});

describe('Categorías (SimpleCatalogPage)', () => {
  test('lista las categorías con su estado', async () => {
    render(<CategoriesPage />);
    expect(await screen.findByText('Académico')).toBeInTheDocument();
    expect(screen.getByText('Bienestar')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar Académico' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar Bienestar' })).toBeInTheDocument();
  });

  test('la búsqueda espera a que el usuario termine de escribir y vuelve a la página 1', async () => {
    render(<CategoriesPage />);
    await screen.findByText('Académico');
    await userEvent.type(screen.getByRole('searchbox'), 'bien');
    await waitFor(() => expect(categoriesApi.list).toHaveBeenLastCalledWith({ q: 'bien', page: 1, pageSize: 20 }));
    // No consultó una vez por tecla
    const withQuery = categoriesApi.list.mock.calls.filter(([params]) => params.q);
    expect(withQuery).toHaveLength(1);
  });

  test('el filtro de estado consulta solo inactivos', async () => {
    render(<CategoriesPage />);
    await screen.findByText('Académico');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Inactivos');
    await waitFor(() => expect(categoriesApi.list).toHaveBeenLastCalledWith({ activo: false, page: 1, pageSize: 20 }));
  });

  test('crear: valida en el cliente y luego envía y recarga', async () => {
    categoriesApi.create.mockResolvedValue(cat({ id_categoria: 9 }));
    render(<CategoriesPage />);
    await screen.findByText('Académico');
    const before = categoriesApi.list.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva categoría/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText('El nombre es obligatorio')).toBeInTheDocument();
    expect(categoriesApi.create).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/nombre/i), '  Servicios TI ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(categoriesApi.create).toHaveBeenCalledWith({ nombre: 'Servicios TI', descripcion: null }));
    expect(toast.success).toHaveBeenCalledWith('Categoría creada correctamente');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(categoriesApi.list.mock.calls.length).toBeGreaterThan(before);
  });

  test('editar: abre con los datos y envía el PUT con el id', async () => {
    categoriesApi.update.mockResolvedValue(cat());
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Académico' }));
    const dialog = await screen.findByRole('dialog', { name: /editar categoría/i });
    const name = within(dialog).getByLabelText(/nombre/i);
    expect(name).toHaveValue('Académico');
    await userEvent.clear(name);
    await userEvent.type(name, 'Académico 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(categoriesApi.update).toHaveBeenCalledWith(1, { nombre: 'Académico 2', descripcion: 'Trámites' }));
  });

  test('error de validación del servidor aparece en el campo; otros errores en el cuadro', async () => {
    categoriesApi.create
      .mockRejectedValueOnce(apiError(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ in: 'body', field: 'nombre', message: 'Nombre no permitido' }]))
      .mockRejectedValueOnce(apiError(409, 'DUPLICATE_NAME', 'Ya existe una categoría con ese nombre'));
    render(<CategoriesPage />);
    await screen.findByText('Académico');
    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombre/i), 'X');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText('Nombre no permitido')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText('Ya existe una categoría con ese nombre')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // no se cierra ante un error
  });

  test('desactivar pide confirmación; si el servidor lo impide, muestra su mensaje', async () => {
    categoriesApi.setStatus.mockRejectedValueOnce(apiError(409, 'HAS_ACTIVE_DEPENDENTS', 'No se puede desactivar la categoría: tiene servicios activos'));
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Académico' }));
    const dialog = await screen.findByRole('dialog', { name: /desactivar categoría/i });
    expect(categoriesApi.setStatus).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(categoriesApi.setStatus).toHaveBeenCalledWith(1, false));
    expect(toast.error).toHaveBeenCalledWith('No se puede desactivar la categoría: tiene servicios activos');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('activar y cancelar la confirmación', async () => {
    categoriesApi.setStatus.mockResolvedValue(cat({ id_categoria: 2, activo: true }));
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Bienestar' }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(categoriesApi.setStatus).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Activar Bienestar' }));
    dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(categoriesApi.setStatus).toHaveBeenCalledWith(2, true));
    expect(toast.success).toHaveBeenCalledWith('Categoría activada');
  });

  test('estado vacío y error de carga con reintento', async () => {
    categoriesApi.list.mockResolvedValueOnce(listResult([]));
    const { unmount } = render(<CategoriesPage />);
    expect(await screen.findByText(/no hay categorías para mostrar/i)).toBeInTheDocument();
    unmount();

    categoriesApi.list.mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR', 'No fue posible comunicarse con el servidor')).mockResolvedValue(listResult([cat()]));
    render(<CategoriesPage />);
    expect(await screen.findByText('No se pudo cargar el listado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Académico')).toBeInTheDocument();
  });
});

describe('Dependencias', () => {
  test('usa la misma pantalla con sus textos y la API de dependencias', async () => {
    dependenciesApi.list.mockResolvedValue(listResult([{ id_dependencia: 7, nombre: 'Registro', descripcion: null, activo: true }]));
    dependenciesApi.create.mockResolvedValue({});
    render(<DependenciesPage />);
    expect(await screen.findByRole('heading', { name: 'Dependencias' })).toBeInTheDocument();
    expect(await screen.findByText('Registro')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /nueva dependencia/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva dependencia/i });
    await userEvent.type(within(dialog).getByLabelText(/nombre/i), 'Bienestar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(dependenciesApi.create).toHaveBeenCalledWith({ nombre: 'Bienestar', descripcion: null }));
    expect(categoriesApi.create).not.toHaveBeenCalled();
  });

  test('límite de longitud del nombre (120)', async () => {
    dependenciesApi.list.mockResolvedValue(listResult([]));
    render(<DependenciesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /nueva dependencia/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombre/i), 'x'.repeat(121));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText(/no puede superar 120 caracteres/i)).toBeInTheDocument();
    expect(dependenciesApi.create).not.toHaveBeenCalled();
  });
});
