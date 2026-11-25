import { useEffect } from 'react';

const BASE = 'SGSSU';

/** Fija el título de la pestaña del navegador: "Título · SGSSU". */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE;
  }, [title]);
}
