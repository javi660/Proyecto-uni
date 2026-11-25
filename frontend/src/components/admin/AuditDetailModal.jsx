import { Badge, Button, Modal } from '../common/index.js';
import { formatDateTime } from '../../utils/format.js';
import styles from './AuditDetailModal.module.css';

/** Detalle de un registro de auditoría: datos del evento y el JSON de `detalle` (ya sin credenciales desde la API). */
export default function AuditDetailModal({ entry, onClose }) {
  const rows = [
    ['Fecha', formatDateTime(entry.creado_en)],
    ['Usuario', entry.usuario ? `${entry.usuario} (${entry.correo})` : 'Sistema / sin sesión'],
    ['Operación', entry.operacion],
    ['Recurso', entry.id_recurso ? `${entry.recurso} #${entry.id_recurso}` : entry.recurso],
    ['IP', entry.ip ?? '—'],
  ];
  return (
    <Modal open title={`Registro de auditoría #${entry.id_auditoria}`} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <dl className={styles.list}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className={styles.row}>
          <dt>Resultado</dt>
          <dd><Badge color={entry.resultado === 'EXITO' ? 'var(--color-success, #198754)' : 'var(--color-danger, #b02a37)'}>{entry.resultado === 'EXITO' ? 'Éxito' : 'Fallo'}</Badge></dd>
        </div>
      </dl>
      <h3 className={styles.heading}>Detalle</h3>
      {entry.detalle ? <pre className={styles.json} tabIndex={0} aria-label="Detalle en formato JSON">{JSON.stringify(entry.detalle, null, 2)}</pre> : <p className={styles.none}>Sin detalle adicional.</p>}
    </Modal>
  );
}
