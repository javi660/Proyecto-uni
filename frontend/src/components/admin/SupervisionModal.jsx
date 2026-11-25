import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, Button, Modal, Spinner } from '../common/index.js';
import { usersApi } from '../../services/users.service.js';
import { errorMessage } from '../../utils/formErrors.js';
import styles from './SupervisionModal.module.css';

/**
 * Dependencias que supervisa un supervisor. Al guardar se reemplaza el conjunto completo.
 * Solo se pueden agregar dependencias activas; las ya asignadas se conservan aunque estén inactivas.
 *
 * @param {{user: object|null, dependencies: object[], onClose: () => void}} props  dependencies: activas
 */
export default function SupervisionModal({ user, dependencies, onClose }) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Dependencias que supervisa" size="md">
      {user ? <SupervisionForm key={user.id_usuario} user={user} dependencies={dependencies} onClose={onClose} /> : null}
    </Modal>
  );
}

function SupervisionForm({ user, dependencies, onClose }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState([]); // dependencias ya asignadas (pueden incluir inactivas)
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getSupervision(user.id_usuario)
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.dependencias);
        setSelected(new Set(data.dependencias.map((d) => d.id_dependencia)));
      })
      .catch((error) => !cancelled && setLoadError(errorMessage(error)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user.id_usuario]);

  // Activas + las ya asignadas que estén inactivas
  const options = [...dependencies.map((d) => ({ id: d.id_dependencia, nombre: d.nombre, activo: true }))];
  current.forEach((d) => {
    if (!options.some((o) => o.id === d.id_dependencia)) options.push({ id: d.id_dependencia, nombre: d.nombre, activo: d.activo });
  });
  options.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const toggle = (id) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setServerError('');
    try {
      await usersApi.setSupervision(user.id_usuario, [...selected]);
      toast.success('Supervisión actualizada');
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner label="Cargando supervisión…" />
      </div>
    );
  }
  if (loadError) return <Alert type="error">{loadError}</Alert>;

  return (
    <div className={styles.wrapper}>
      <p>
        Selecciona las dependencias que supervisa <strong>{user.nombres} {user.apellidos}</strong>. Verá y podrá asignar las solicitudes de sus servicios.
      </p>
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      {options.length === 0 ? (
        <Alert type="info">No hay dependencias activas. Crea una primero en Administración → Dependencias.</Alert>
      ) : (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Dependencias</legend>
          {options.map((option) => (
            <label key={option.id} className={styles.option}>
              <input type="checkbox" checked={selected.has(option.id)} onChange={() => toggle(option.id)} />
              <span>
                {option.nombre}
                {!option.activo ? <em className={styles.inactive}> (inactiva)</em> : null}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <p className={styles.count} aria-live="polite">
        {selected.size === 0 ? 'Sin dependencias seleccionadas' : `${selected.size} seleccionada${selected.size === 1 ? '' : 's'}`}
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={save} loading={saving}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
