import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import styles from './ListToolbar.module.css';

const DEBOUNCE_MS = 350;

/**
 * Barra de filtros de un listado: búsqueda de texto con retardo (no consulta en cada tecla)
 * y espacio para filtros adicionales (`children`, normalmente <Select>).
 */
export default function ListToolbar({ searchLabel = 'Buscar', searchPlaceholder = 'Buscar…', onSearch, children }) {
  const [text, setText] = useState('');
  const applied = useRef('');

  useEffect(() => {
    const value = text.trim();
    if (value === applied.current) return undefined;
    const timer = setTimeout(() => {
      applied.current = value;
      onSearch(value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, onSearch]);

  return (
    <div className={styles.toolbar} role="search">
      <label className={styles.search}>
        <span className={styles.srOnly}>{searchLabel}</span>
        <Search size={16} aria-hidden="true" className={styles.icon} />
        <input
          type="search"
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={searchPlaceholder}
          maxLength={100}
        />
      </label>
      {children}
    </div>
  );
}
