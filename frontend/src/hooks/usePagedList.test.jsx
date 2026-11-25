import { describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedList } from './usePagedList.js';
import { listResult } from '../test/helpers.jsx';

describe('usePagedList', () => {
  test('carga, cambia de página y al filtrar vuelve a la página 1', async () => {
    const fetcher = vi.fn(async ({ page }) => listResult([{ id: page }], { page, total: 50 }));
    const { result } = renderHook(() => usePagedList(fetcher, {}, { pageSize: 10 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 });

    act(() => result.current.setPage(3));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith({ page: 3, pageSize: 10 }));

    act(() => result.current.updateFilters({ q: 'ana' }));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith({ q: 'ana', page: 1, pageSize: 10 }));
    expect(result.current.page).toBe(1);
  });

  test('ignora respuestas atrasadas: gana la última petición', async () => {
    let releaseSlow;
    const fetcher = vi.fn(({ q }) => {
      if (q === 'lento') return new Promise((resolve) => { releaseSlow = () => resolve(listResult([{ id: 'viejo' }])); });
      return Promise.resolve(listResult([{ id: 'nuevo' }]));
    });
    const { result } = renderHook(() => usePagedList(fetcher, { q: 'lento' }));
    act(() => result.current.updateFilters({ q: 'rapido' }));
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'nuevo' }]));

    await act(async () => releaseSlow());
    expect(result.current.items).toEqual([{ id: 'nuevo' }]);
  });

  test('un error queda en `error` y reload reintenta', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('falló')).mockResolvedValue(listResult([{ id: 1 }]));
    const { result } = renderHook(() => usePagedList(fetcher));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }]));
    expect(result.current.error).toBeNull();
  });
});
