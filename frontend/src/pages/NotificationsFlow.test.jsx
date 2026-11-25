import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import NotificationsPage from './NotificationsPage.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { NotificationsProvider, POLL_INTERVAL_MS, useNotifications } from '../context/NotificationsContext.jsx';
import { notificationsApi } from '../services/notifications.service.js';
import { adminUser, apiError, listResult, renderWithAuth, studentUser } from '../test/helpers.jsx';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../services/notifications.service.js', () => ({
  notificationsApi: { list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

const item = (over = {}) => ({
  id_notificacion: 1, id_solicitud: 100, codigo: 'SGSSU-2026-000100', titulo: 'Atención iniciada', mensaje: 'Tu solicitud está en proceso',
  tipo: 'SOLICITUD_INICIADA', leida: false, creada_en: '2026-03-05T15:00:00Z', ...over,
});

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.clearAllMocks();
  notificationsApi.unreadCount.mockResolvedValue(0);
  notificationsApi.list.mockResolvedValue(listResult([]));
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('NotificationsProvider: contador con polling cada 30 s', () => {
  const wrapper = ({ children }) => <NotificationsProvider>{children}</NotificationsProvider>;

  test('consulta al montar y luego cada 30 segundos', async () => {
    vi.useFakeTimers();
    notificationsApi.unreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(5).mockResolvedValue(5);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await act(async () => {});
    expect(result.current.unread).toBe(2);
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(2);
    expect(result.current.unread).toBe(5);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(3);
  });

  test('el intervalo es de 30 segundos', () => {
    expect(POLL_INTERVAL_MS).toBe(30000);
  });

  test('un error de red conserva el último valor y no rompe el ciclo', async () => {
    vi.useFakeTimers();
    notificationsApi.unreadCount.mockResolvedValueOnce(3).mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR', 'sin red')).mockResolvedValue(4);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(result.current.unread).toBe(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(result.current.unread).toBe(4);
  });

  test('se pausa con la pestaña oculta y se actualiza al volver', async () => {
    vi.useFakeTimers();
    renderHook(() => useNotifications(), { wrapper });
    await act(async () => {});
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1);

    act(() => setVisibility('hidden'));
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await act(async () => {});
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(3);
  });

  test('al desmontar deja de consultar', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useNotifications(), { wrapper });
    await act(async () => {});
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2); });
    expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1);
  });
});

describe('Topbar: campana', () => {
  const renderBar = (provider = true) => {
    const bar = (
      <MemoryRouter>
        <Topbar user={adminUser} onMenuClick={() => {}} onLogout={() => {}} loggingOut={false} />
      </MemoryRouter>
    );
    return render(provider ? <NotificationsProvider>{bar}</NotificationsProvider> : bar);
  };

  test('muestra el contador y lo anuncia en la etiqueta accesible', async () => {
    notificationsApi.unreadCount.mockResolvedValue(7);
    renderBar();
    const link = await screen.findByRole('link', { name: 'Notificaciones (7 sin leer)' });
    expect(link).toHaveAttribute('href', '/notificaciones');
    expect(link).toHaveTextContent('7');
  });

  test('con más de 99 muestra 99+', async () => {
    notificationsApi.unreadCount.mockResolvedValue(150);
    renderBar();
    expect(await screen.findByRole('link', { name: /150 sin leer/ })).toHaveTextContent('99+');
  });

  test('sin no leídas no hay insignia', async () => {
    renderBar();
    const link = await screen.findByRole('link', { name: 'Notificaciones' });
    expect(link).toHaveTextContent('');
  });

  test('sin proveedor se comporta como 0 sin leer', () => {
    renderBar(false);
    expect(screen.getByRole('link', { name: 'Notificaciones' })).toBeInTheDocument();
  });
});

describe('NotificationsPage', () => {
  const setup = () => userEvent.setup({ applyAccept: false });
  const renderPage = (user = studentUser) => renderWithAuth(
    <MemoryRouter initialEntries={['/notificaciones']}>
      <NotificationsProvider>
        <Routes>
          <Route path="/notificaciones" element={<NotificationsPage />} />
          <Route path="/solicitudes/:id" element={<p>Detalle de la solicitud</p>} />
        </Routes>
      </NotificationsProvider>
    </MemoryRouter>,
    user,
  );

  test('lista las notificaciones y resalta las no leídas', async () => {
    notificationsApi.unreadCount.mockResolvedValue(1);
    notificationsApi.list.mockResolvedValue(listResult([item(), item({ id_notificacion: 2, titulo: 'Solicitud cerrada', leida: true })]));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Notificaciones' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Atención iniciada');
    expect(rows[0]).toHaveTextContent('Nueva');
    expect(rows[0]).toHaveTextContent('SGSSU-2026-000100');
    expect(rows[1]).not.toHaveTextContent('Nueva');
    expect(notificationsApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  test('estado vacío', async () => {
    renderPage();
    expect(await screen.findByText('No hay notificaciones')).toBeInTheDocument();
  });

  test('abrir una no leída la marca, actualiza el contador y navega a la solicitud', async () => {
    const user = setup();
    notificationsApi.unreadCount.mockResolvedValueOnce(1).mockResolvedValue(0);
    notificationsApi.list.mockResolvedValue(listResult([item()]));
    notificationsApi.markRead.mockResolvedValue(item({ leida: true }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Atención iniciada/ }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Detalle de la solicitud')).toBeInTheDocument();
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(2));
  });

  test('abrir una ya leída no vuelve a marcarla', async () => {
    const user = setup();
    notificationsApi.list.mockResolvedValue(listResult([item({ leida: true })]));
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Atención iniciada/ }));
    expect(await screen.findByText('Detalle de la solicitud')).toBeInTheDocument();
    expect(notificationsApi.markRead).not.toHaveBeenCalled();
  });

  test('si no se puede marcar, avisa y no navega', async () => {
    const user = setup();
    notificationsApi.list.mockResolvedValue(listResult([item()]));
    notificationsApi.markRead.mockRejectedValue(apiError(404, 'NOT_FOUND', 'La notificación no existe'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Atención iniciada/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('La notificación no existe'));
    expect(screen.queryByText('Detalle de la solicitud')).not.toBeInTheDocument();
  });

  test('marcar todas como leídas: deshabilitado sin no leídas; con no leídas llama y recarga', async () => {
    const user = setup();
    notificationsApi.unreadCount.mockResolvedValue(0);
    const first = renderPage();
    expect(await screen.findByRole('button', { name: /marcar todas/i })).toBeDisabled();
    first.unmount();
    notificationsApi.list.mockClear();

    notificationsApi.unreadCount.mockResolvedValue(3);
    notificationsApi.list.mockResolvedValue(listResult([item()]));
    notificationsApi.markAllRead.mockResolvedValue({ actualizadas: 3 });
    renderPage();
    const button = screen.getByRole('button', { name: /marcar todas/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalled();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalledTimes(2));
  });

  test('filtrar por no leídas consulta al servidor', async () => {
    const user = setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Mostrar'), 'false');
    await waitFor(() => expect(notificationsApi.list).toHaveBeenLastCalledWith({ leida: 'false', page: 1, pageSize: 20 }));
  });

  test('error al cargar permite reintentar', async () => {
    const user = setup();
    notificationsApi.list.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR', 'Falla del servidor')).mockResolvedValue(listResult([item()]));
    renderPage();
    expect(await screen.findByText('Falla del servidor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Atención iniciada')).toBeInTheDocument();
  });
});
