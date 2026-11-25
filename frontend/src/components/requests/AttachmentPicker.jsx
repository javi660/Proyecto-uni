import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '../common/index.js';
import { ACCEPT_ATTRIBUTE, MAX_ATTACHMENTS, formatBytes, validateFile } from '../../utils/attachments.js';
import styles from './RequestComponents.module.css';

/**
 * Selector de adjuntos para una solicitud nueva (aún sin enviar).
 * Valida tipo, tamaño y cantidad en el cliente; el servidor vuelve a validar todo.
 *
 * @param {{files: File[], onChange: (files: File[]) => void, disabled?: boolean, max?: number}} props
 */
export default function AttachmentPicker({ files, onChange, disabled = false, max = MAX_ATTACHMENTS }) {
  const inputRef = useRef(null);
  const [problems, setProblems] = useState([]);

  const handleSelect = (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = ''; // permite volver a elegir el mismo archivo
    const accepted = [...files];
    const found = [];
    for (const file of chosen) {
      if (accepted.length >= max) {
        found.push(`Solo puedes adjuntar hasta ${max} archivos`);
        break;
      }
      const problem = validateFile(file, accepted);
      if (problem) found.push(problem);
      else accepted.push(file);
    }
    setProblems(found);
    onChange(accepted);
  };

  const remove = (index) => {
    setProblems([]);
    onChange(files.filter((_file, i) => i !== index));
  };

  return (
    <div>
      <p className={styles.pickerHint}>Opcional. Hasta {max} archivos PDF, PNG, JPG o DOCX de máximo 5 MB cada uno.</p>
      <input
        ref={inputRef}
        type="file"
        className={styles.hiddenInput}
        accept={ACCEPT_ATTRIBUTE}
        multiple
        onChange={handleSelect}
        disabled={disabled}
        aria-label="Seleccionar archivos adjuntos"
        tabIndex={-1}
      />
      <Button variant="secondary" icon={Paperclip} onClick={() => inputRef.current?.click()} disabled={disabled || files.length >= max}>
        Agregar archivos
      </Button>

      {problems.length > 0 ? (
        <ul className={styles.errors} role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className={styles.fileList} style={{ marginTop: 'var(--space-3)' }} aria-label="Archivos seleccionados">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}`} className={styles.fileItem}>
              <span className={styles.fileInfo}>
                <Paperclip size={16} aria-hidden="true" />
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileMeta}>{formatBytes(file.size)}</span>
              </span>
              <Button size="sm" variant="ghost" icon={X} onClick={() => remove(index)} disabled={disabled} aria-label={`Quitar ${file.name}`}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
