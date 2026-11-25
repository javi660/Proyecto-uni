import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsApi } from '../services/notifications.service.js';

/** Intervalo de consulta del contador de no leídas (DECISIONES §9: 30 segundos). */
export const POLL_INTERVAL_MS = 30000;

const NotificationsContext = createContext({ unread: 0, refresh: async () => {}, setUnread: () => {} });

/**
 * Mantiene el contador de no leídas con polling cada 30 s. Se pausa mientras la pestaña está oculta y
 * se actualiza al volver a verla. Un fallo de red no interrumpe la app: conserva el último valor.
 */
export function NotificationsProvider({ children }) {
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const total = await notificationsApi.unreadCount();
      if (mounted.current) setUnread(total);
    } catch {
      // se reintenta en el siguiente ciclo
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    let timer = null;
    const start = () => {
      if (timer === null) timer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        refresh();
        start();
      }
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread }), [unread, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** Contador y acciones de notificaciones. Fuera del proveedor devuelve un valor inerte (0 sin leer). */
export const useNotifications = () => useContext(NotificationsContext);
