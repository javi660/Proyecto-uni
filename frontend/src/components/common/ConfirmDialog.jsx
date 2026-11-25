import Modal from './Modal.jsx';
import Button from './Button.jsx';

/**
 * Confirmación de acciones sensibles (desactivar, rechazar, cerrar…).
 * `danger` pinta el botón de confirmar en rojo. `loading` evita dobles confirmaciones.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={loading ? () => {} : onCancel}
      closeOnBackdrop={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
