import { useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../common/index.js';
import { requestsApi } from '../../services/requests.service.js';
import { errorMessage } from '../../utils/formErrors.js';
import { formatBytes } from '../../utils/attachments.js';
import { formatDateTime } from '../../utils/format.js';
import styles from './RequestComponents.module.css';

/** Adjuntos ya guardados de una solicitud, con descarga a través del backend. */
export default function AttachmentList({ attachments }) {
  const [downloading, setDownloading] = useState(null);

  const download = async (attachment) => {
    setDownloading(attachment.id_adjunto);
    try {
      await requestsApi.downloadAttachment(attachment);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(null);
    }
  };

  if (attachments.length === 0) return <p className={styles.empty}>Esta solicitud no tiene archivos adjuntos.</p>;

  return (
    <ul className={styles.fileList} aria-label="Archivos adjuntos">
      {attachments.map((item) => (
        <li key={item.id_adjunto} className={styles.fileItem}>
          <span className={styles.fileInfo}>
            <Paperclip size={16} aria-hidden="true" />
            <span className={styles.fileName}>{item.nombre_original}</span>
            <span className={styles.fileMeta}>
              {formatBytes(item.tamano_bytes)} · {item.subido_por} · {formatDateTime(item.creado_en)}
            </span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon={Download}
            loading={downloading === item.id_adjunto}
            onClick={() => download(item)}
            aria-label={`Descargar ${item.nombre_original}`}
          >
            Descargar
          </Button>
        </li>
      ))}
    </ul>
  );
}
