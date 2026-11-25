import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import UsersPage from './UsersPage.jsx';
import { usersApi } from '../../services/users.service.js';
import { dependenciesApi } from '../../services/catalog.service.js';
import { apiError, listResult, renderWithAuth } from '../../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/users.service.js', () => ({
  usersApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), resetPassword: vi.fn(), getSupervision: vi.fn(), setSupervision: vi.fn() },
}));
vi.mock('../../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const user = (over = {}) => ({
  id_usuario: 2, nombres: 'Ana', apellidos: 'Pérez', correo: 'ana@uni.edu', rol: 'ESTUDIANTE',
  id_dependencia: null, dependencia: null, activo: true, debe_cambiar_password: false, ...over,
});
const rows = [
  user({ id_usuario: 1, nombres: 'Root', apellidos: 'Admin', correo: 'root@uni.edu', rol: 'ADMINISTRADOR' }),
  user(),
  user({ id_usuario: 3, nombres: 'Sofía', apellidos: 'Sup', correo: 'sofia@uni.edu', rol: 'SUPERVISOR' }),
  user({ id_usuario: 4, nombres: 'Fer', apellidos: 'Func', correo: 'fer@uni.edu', rol: 'FUNCIONARIO', id_dependencia: 7, dependencia: 'Registro', activo: false, debe_cambiar_password: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
  usersApi.list.mockResolvedValue(listResult(rows));
  dependenciesApi.list.mockResolvedValue(listResult([
    { id_dependencia: 7, nombre: 'Registro', activo: true },
    { id_dependencia: 8, nombre: 'Bienestar', activo: true },
  ]));
});

describe('UsersPage', () => {
  test('lista usuarios con perfil, dependencia y estado', async () => {
    renderWithAuth(<UsersPage />);
    expect(await screen.findByText('ana@uni.edu')).toBeInTheDocument();
    expect(screen.getAllByText('Registro').length).toBeGreaterThan(0);
    expect(screen.getByText('Cambio de contraseña pendiente')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  test('la fila propia no ofrece desactivar ni restablecer contraseña', async () => {
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    expect(screen.queryByRole('button', { name: /Desactivar Root/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Restablecer contraseña de Root/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Desactivar Ana/ })).toBeInTheDocument();
  });

  test('Supervisión solo aparece para supervisores', async () => {
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    expect(screen.getAllByRole('button', { name: /Supervisión/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Supervisión de Sofía/ })).toBeInTheDocument();
  });

  test('buscar y filtrar envía los parámetros al servidor', async () => {
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    await userEvent.type(screen.getByRole('searchbox'), 'ana');
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ana', page: 1 })));
    await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'SUPERVISOR');
    await waitFor(() => expect(usersApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ rol: 'SUPERVISOR' })));
  });

  test('crear estudiante: sin dependencia, payload con id_dependencia null', async () => {
    usersApi.create.mockResolvedValue(user());
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });
    expect(within(dialog).queryByLabelText(/dependencia/i)).toBeNull();

    await userEvent.type(within(dialog).getByLabelText(/nombres/i), 'Luz');
    await userEvent.type(within(dialog).getByLabelText(/apellidos/i), 'Gómez');
    await userEvent.type(within(dialog).getByLabelText(/correo institucional/i), 'luz@uni.edu');
    await userEvent.type(within(dialog).getByLabelText(/contraseña inicial/i), 'Valida12345');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(usersApi.create).toHaveBeenCalledTimes(1));
    expect(usersApi.create.mock.calls[0][0]).toMatchObject({
      nombres: 'Luz', apellidos: 'Gómez', correo: 'luz@uni.edu', rol: 'ESTUDIANTE', id_dependencia: null, password_inicial: 'Valida12345',
    });
    expect(toast.success).toHaveBeenCalled();
  });

  test('funcionario exige dependencia y la envía como número', async () => {
    usersApi.create.mockResolvedValue(user());
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombres/i), 'Pedro');
    await userEvent.type(within(dialog).getByLabelText(/apellidos/i), 'Ruiz');
    await userEvent.type(within(dialog).getByLabelText(/correo institucional/i), 'pedro@uni.edu');
    await userEvent.type(within(dialog).getByLabelText(/contraseña inicial/i), 'Valida12345');
    await userEvent.selectOptions(within(dialog).getByLabelText(/perfil/i), 'FUNCIONARIO');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByText(/dependencia/i, { selector: '[role="alert"], p, span' })).toBeInTheDocument();
    expect(usersApi.create).not.toHaveBeenCalled();

    await userEvent.selectOptions(within(dialog).getByLabelText(/dependencia/i), 'Registro');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(usersApi.create).toHaveBeenCalled());
    expect(usersApi.create.mock.calls[0][0]).toMatchObject({ rol: 'FUNCIONARIO', id_dependencia: 7 });
  });

  test('contraseña inicial débil no se envía', async () => {
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombres/i), 'Luz');
    await userEvent.type(within(dialog).getByLabelText(/apellidos/i), 'Gómez');
    await userEvent.type(within(dialog).getByLabelText(/correo institucional/i), 'luz@uni.edu');
    await userEvent.type(within(dialog).getByLabelText(/contraseña inicial/i), 'corta');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(usersApi.create).not.toHaveBeenCalled();
  });

  test('correo duplicado: el mensaje del servidor queda en el formulario abierto', async () => {
    usersApi.create.mockRejectedValue(apiError(409, 'DUPLICATE_EMAIL', 'Ya existe un usuario con ese correo'));
    renderWithAuth(<UsersPage />);
    await screen.findByText('ana@uni.edu');
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombres/i), 'Luz');
    await userEvent.type(within(dialog).getByLabelText(/apellidos/i), 'Gómez');
    await userEvent.type(within(dialog).getByLabelText(/correo institucional/i), 'ana@uni.edu');
    await userEvent.type(within(dialog).getByLabelText(/contraseña inicial/i), 'Valida12345');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect(await within(dialog).findByText('Ya existe un usuario con ese correo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('desactivar con confirmación; el error del servidor se informa', async () => {
    usersApi.setStatus.mockRejectedValueOnce(apiError(409, 'HAS_ACTIVE_ASSIGNMENTS', 'El usuario tiene asignaciones activas'));
    renderWithAuth(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Desactivar Ana/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(usersApi.setStatus).toHaveBeenCalledWith(2, false));
    expect(toast.error).toHaveBeenCalledWith('El usuario tiene asignaciones activas');
  });

  test('restablecer contraseña envía la nueva clave', async () => {
    usersApi.resetPassword.mockResolvedValue({});
    renderWithAuth(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Restablecer contraseña de Ana/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/contraseña temporal/i), 'OtraClave2026');
    await userEvent.click(within(dialog).getByRole('button', { name: /restablecer/i }));
    await waitFor(() => expect(usersApi.resetPassword).toHaveBeenCalledWith(2, 'OtraClave2026'));
  });

  test('supervisión: carga las dependencias asignadas y guarda el conjunto', async () => {
    usersApi.getSupervision.mockResolvedValue({ dependencias: [{ id_dependencia: 7 }] });
    usersApi.setSupervision.mockResolvedValue({});
    renderWithAuth(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Supervisión de Sofía/ }));
    const dialog = await screen.findByRole('dialog');
    const registro = await within(dialog).findByRole('checkbox', { name: 'Registro' });
    expect(registro).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Bienestar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(usersApi.setSupervision).toHaveBeenCalledWith(3, expect.arrayContaining([7, 8])));
  });
});
