import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Listado paginado con filtros. Ignora respuestas atrasadas (si el usuario cambia el filtro
 * rápido, solo cuenta la última petición). Al cambiar un filtro vuelve a la página 1.
 *
 * @param {(params: object) => Promise<{items: any[], meta: {page: number, pageSize: number, total: number}}>} fetcher
 *        Debe ser una referencia estable (función de módulo).
 * @param {object} [initialFilters]
 * @param {{pageSize?: number}} [options]
 */
export function usePagedList(fetcher, initialFilters = {}, { pageSize = 20 } = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: null });
  const lastRequest = useRef(0);

  useEffect(() => {
    const requestId = (lastRequest.current += 1);
    setState((current) => ({ ...current, loading: true, error: null }));

    fetcher({ ...filters, page, pageSize })
      .then(({ items, meta }) => {
        if (requestId === lastRequest.current) setState({ items, meta, loading: false, error: null });
      })
      .catch((error) => {
        if (requestId === lastRequest.current) setState((current) => ({ ...current, loading: false, error }));
      });
  }, [fetcher, filters, page, pageSize, version]);

  const updateFilters = useCallback((patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { ...state, page, setPage, pageSize, filters, updateFilters, reload };
}
