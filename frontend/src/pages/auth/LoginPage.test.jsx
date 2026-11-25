import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import LoginPage from './LoginPage.jsx';
import { ApiError } from '../../services/api.js';

function setup(loginImpl, extra = {}) {
  const login = vi.fn(loginImpl);
  const value = { user: null, status: 'anonymous', sessionExpired: false, clearSessionExpired: vi.fn(), login, ...extra };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/solicitudes' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/solicitudes" element={<p>PANTALLA SOLICITUDES</p>} />
          <Route path="/dashboard" element={<p>PANTALLA INICIO</p>} />
          <Route path="/cambiar-password" element={<p>PANTALLA CAMBIO</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return login;
}

describe('LoginPage', () => {
  test('valida campos vacíos y correo inválido sin llamar al servidor', async () => {
    const login = setup(async () => ({}));
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText(/ingresa tu correo institucional/i)).toBeInTheDocument();
    expect(screen.getByText(/ingresa tu contraseña/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/correo institucional/i), 'no-es-correo');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText(/ingresa un correo válido/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  test('inicio de sesión correcto: vuelve a la ruta pedida', async () => {
    const login = setup(async () => ({ debe_cambiar_password: false }));
    await userEvent.type(screen.getByLabelText(/correo institucional/i), 'ana@uni.edu');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'Valida12345');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText('PANTALLA SOLICITUDES')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ correo: 'ana@uni.edu', password: 'Valida12345' });
  });

  test('si debe cambiar la contraseña, va a la pantalla de cambio', async () => {
    setup(async () => ({ debe_cambiar_password: true }));
    await userEvent.type(screen.getByLabelText(/correo institucional/i), 'ana@uni.edu');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'Valida12345');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText('PANTALLA CAMBIO')).toBeInTheDocument();
  });

  test('credenciales inválidas: muestra el mensaje del servidor y permanece en el login', async () => {
    setup(async () => {
      throw new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' });
    });
    await userEvent.type(screen.getByLabelText(/correo institucional/i), 'ana@uni.edu');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'Incorrecta123');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  test('no redirige a direcciones externas', async () => {
    const login = vi.fn(async () => ({ debe_cambiar_password: false }));
    render(
      <AuthContext.Provider value={{ user: null, status: 'anonymous', sessionExpired: false, clearSessionExpired: vi.fn(), login }}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '//sitio-malo.com' } }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<p>PANTALLA INICIO</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText(/correo institucional/i), 'ana@uni.edu');
    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'Valida12345');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    await waitFor(() => expect(screen.getByText('PANTALLA INICIO')).toBeInTheDocument());
  });

  test('avisa cuando la sesión expiró y permite mostrar la contraseña', async () => {
    setup(async () => ({}), { sessionExpired: true });
    expect(screen.getByText(/tu sesión expiró/i)).toBeInTheDocument();
    const field = screen.getByLabelText(/^contraseña/i);
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(field).toHaveAttribute('type', 'text');
  });
});
