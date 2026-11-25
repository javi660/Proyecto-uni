import { Select } from '../common/index.js';

const OPTIONS = [
  { value: 'true', label: 'Activos' },
  { value: 'false', label: 'Inactivos' },
];

/** Filtro de estado. Entrega true, false o undefined (todos) a `onChange`. */
export default function ActiveFilter({ value, onChange, label = 'Estado' }) {
  const text = value === undefined ? '' : String(value);
  return (
    <Select
      label={label}
      placeholder="Todos"
      options={OPTIONS}
      value={text}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}
    />
  );
}
