import { Button, Input, Select } from '../common/index.js';
import styles from './Reports.module.css';

/** Filtros comunes de los reportes: fechas, dependencia y categoría. `value` y `onChange` manejan un objeto de filtros. */
export default function ReportFilters({ value, onChange, dependencies, categories, onReset }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value || undefined });
  const options = (items, id, name) => [{ value: '', label: 'Todas' }, ...items.map((item) => ({ value: String(item[id]), label: item[name] }))];
  return (
    <form className={styles.filters} onSubmit={(event) => event.preventDefault()} aria-label="Filtros del reporte">
      <Input label="Desde" type="date" value={value.desde ?? ''} max={value.hasta} onChange={set('desde')} />
      <Input label="Hasta" type="date" value={value.hasta ?? ''} min={value.desde} onChange={set('hasta')} />
      <Select label="Dependencia" value={value.id_dependencia ?? ''} options={options(dependencies, 'id_dependencia', 'nombre')} onChange={set('id_dependencia')} />
      <Select label="Categoría" value={value.id_categoria ?? ''} options={options(categories, 'id_categoria', 'nombre')} onChange={set('id_categoria')} />
      <div><Button variant="secondary" onClick={onReset}>Limpiar filtros</Button></div>
    </form>
  );
}
