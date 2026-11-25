import { useEffect, useState } from 'react';

/**
 * Carga una vez una lista (por ejemplo, las dependencias activas para un desplegable).
 * Si falla devuelve una lista vacía y `error` con el motivo.
 *
 * @param {(params: object) => Promise<{items: any[]}>} fetcher  referencia estable
 * @param {object} [params]
 * @param {{enabled?: boolean}} [options]
 */
export function useLoadedList(fetcher, params = {}, { enabled = true } = {}) {
  const [state, setState] = useState({ items: [], loading: enabled, error: null });
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetcher(params)
      .then(({ items }) => {
        if (!cancelled) setState({ items, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ items: [], loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // `params` se compara por su contenido (key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, key, enabled]);

  return state;
}
