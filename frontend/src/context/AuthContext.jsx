import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/auth.service.js';
import { setSessionExpiredHandler } from '../services/api.js';

/**
 * Estado global de la sesión.
 *  status: 'loading' (verificando la sesión al abrir la app) | 'authenticated' | 'anonymous'
 *
 * El usuario viene SIEMPRE del servidor (GET /auth/me); el navegador no guarda tokens ni perfil.
 * El perfil que se usa para mostrar u ocultar opciones es solo de presentación:
 * la autorización real la hace el backend en cada petición.
 */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [sessionExpired, setSessionExpired] = useState(false);

  // Verifica la sesión al abrir la aplicación
  useEffect(() => {
    let cancelled = false;
    authService
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Si el cliente HTTP no logra renovar la sesión, se pasa a "anónimo"
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus((current) => {
        if (current === 'authenticated') setSessionExpired(true);
        return 'anonymous';
      });
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (credentials) => {
    const me = await authService.login(credentials);
    setUser(me);
    setStatus('authenticated');
    setSessionExpired(false);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Aunque falle la red, la sesión local se descarta
      setUser(null);
      setStatus('anonymous');
      setSessionExpired(false);
    }
  }, []);

  const changePassword = useCallback(async (payload) => {
    const me = await authService.changePassword(payload);
    setUser(me);
    return me;
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      sessionExpired,
      clearSessionExpired,
      login,
      logout,
      changePassword,
    }),
    [user, status, sessionExpired, clearSessionExpired, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
