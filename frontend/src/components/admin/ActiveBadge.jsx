import { Badge } from '../common/index.js';

/** Estado activo/inactivo de un registro administrado. */
export default function ActiveBadge({ active }) {
  return active ? <Badge color="var(--color-success)">Activo</Badge> : <Badge color="var(--color-text-muted)">Inactivo</Badge>;
}
