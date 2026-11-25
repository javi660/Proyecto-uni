import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Card, EmptyState, PageHeader, PriorityBadge, Select, Spinner, StatusBadge } from '../../components/common/index.js';
import AttachmentList from '../../components/requests/AttachmentList.jsx';
import AssignModal from '../../components/requests/AssignModal.jsx';
import AssignmentHistory from '../../components/requests/AssignmentHistory.jsx';
import StatusActionModal from '../../components/requests/StatusActionModal.jsx';
import ResponseForm from '../../components/requests/ResponseForm.jsx';
import Timeline from '../../components/requests/Timeline.jsx';
import { PRIORITIES, availableActions, canChangePriority, canRespond } from '../../utils/workflow.js';
import { canAssign, assignActionLabel } from '../../utils/assignments.js';
import { useAuth } from '../../hooks/useAuth.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { requestsApi } from '../../services/requests.service.js';
import { errorMessage } from '../../utils/formErrors.js';
import { ACCEPT_ATTRIBUTE, MAX_ATTACHMENTS, canUploadTo, validateFile } from '../../utils/attachments.js';
import { formatDateTime } from '../../utils/format.js';

function Field({ label, children }) {
  return (
    <div>
      <dt style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ request: null, loading: true, error: null });
  const [uploading, setUploading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [action, setAction] = useState(null);
  const inputRef = useRef(null);
  usePageTitle(state.request ? state.request.codigo : 'Solicitud');

  const load = useCallback(async () => {
    try {
      const [request, history, events] = await Promise.all([
        requestsApi.get(id),
        requestsApi.listAssignments(id).catch(() => []), // el historial es complementario: no bloquea el detalle
        requestsApi.getTimeline(id).catch(() => []),
      ]);
      setAssignments(history);
      setTimeline(events);
      setState({ request, loading: false, error: null });
    } catch (error) {
      setState({ request: null, loading: false, error });
    }
  }, [id]);

  useEffect(() => {
    setState({ request: null, loading: true, error: null });
    load();
  }, [load]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = validateFile(file, []);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      await requestsApi.uploadAttachment(state.request.id_solicitud, file);
      toast.success('Archivo adjuntado correctamente');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const back = (
    <Link to="/solicitudes" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <ArrowLeft size={16} aria-hidden="true" /> Volver al listado
    </Link>
  );

  if (state.loading) return <Spinner label="Cargando solicitud…" />;

  if (state.error) {
    const missing = state.error.status === 404;
    return (
      <>
        <PageHeader title="Solicitud" actions={back} />
        <Card>
          {missing ? (
            <EmptyState title="No encontramos la solicitud" description="No existe o no tienes acceso a ella." />
          ) : (
            <Alert type="error" title="No se pudo cargar la solicitud">
              {state.error.message}{' '}
              <Button size="sm" variant="secondary" onClick={() => { setState({ request: null, loading: true, error: null }); load(); }}>
                Reintentar
              </Button>
            </Alert>
          )}
        </Card>
      </>
    );
  }

  const { request } = state;
  const canUpload = canUploadTo(request, user);
  const showAssign = canAssign(request, user);

  const actions = availableActions(request, user);
  const showResponse = canRespond(request, user);

  const handleDone = async () => {
    setAction(null);
    await load();
  };

  const handlePriority = async (event) => {
    try {
      await requestsApi.changePriority(request.id_solicitud, event.target.value);
      toast.success('Prioridad actualizada');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleAssigned = async () => {
    setAssigning(false);
    await load();
  };

  return (
    <>
      <PageHeader
        title={request.codigo}
        description={request.asunto}
        actions={
          <>
            {showAssign ? (
              <Button icon={UserCheck} onClick={() => setAssigning(true)}>
                {assignActionLabel(request)}
              </Button>
            ) : null}
            {actions.map((item) => (
              <Button key={item.estado} variant={item.variant === 'primary' ? 'primary' : item.variant} onClick={() => setAction(item)}>
                {item.label}
              </Button>
            ))}
            {back}
          </>
        }
      />

      <Card>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <StatusBadge status={request.estado} />
          <PriorityBadge priority={request.prioridad} />
        </div>
        {canChangePriority(request, user) ? (
          <div style={{ maxWidth: 240, marginBottom: 'var(--space-4)' }}>
            <Select label="Prioridad" value={request.prioridad} options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))} onChange={handlePriority} />
          </div>
        ) : null}
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', margin: 0 }}>
          <Field label="Servicio">{request.servicio}</Field>
          <Field label="Categoría">{request.categoria}</Field>
          <Field label="Dependencia">{request.dependencia}</Field>
          <Field label="Tiempo de atención (SLA)">{request.sla_horas} horas</Field>
          <Field label="Estudiante">{request.estudiante}</Field>
          <Field label="Atiende">{request.funcionario ?? 'Sin asignar'}</Field>
          <Field label="Registrada">{formatDateTime(request.fecha_registro)}</Field>
          <Field label="Última actualización">{formatDateTime(request.fecha_actualizacion)}</Field>
          {request.fecha_resolucion ? <Field label="Resuelta">{formatDateTime(request.fecha_resolucion)}</Field> : null}
          {request.fecha_cierre ? <Field label="Cerrada">{formatDateTime(request.fecha_cierre)}</Field> : null}
        </dl>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0, fontSize: 'var(--font-size-lg)' }}>Descripción</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{request.descripcion}</p>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0, fontSize: 'var(--font-size-lg)' }}>Línea de tiempo</h2>
        <Timeline events={timeline} />
        {showResponse ? <ResponseForm idSolicitud={request.id_solicitud} onAdded={load} /> : null}
      </Card>

      <Card>
        <h2 style={{ marginTop: 0, fontSize: 'var(--font-size-lg)' }}>Historial de asignaciones</h2>
        <AssignmentHistory assignments={assignments} />
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
            Archivos adjuntos ({request.adjuntos.length}/{MAX_ATTACHMENTS})
          </h2>
          {canUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={handleUpload}
                aria-label="Seleccionar archivo para adjuntar"
                style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
                tabIndex={-1}
              />
              <Button variant="secondary" icon={Paperclip} loading={uploading} onClick={() => inputRef.current?.click()}>
                Adjuntar archivo
              </Button>
            </>
          ) : null}
        </div>
        <AttachmentList attachments={request.adjuntos} />
      </Card>

      {action ? <StatusActionModal request={request} action={action} onClose={() => setAction(null)} onDone={handleDone} /> : null}
      {assigning ? <AssignModal request={request} onClose={() => setAssigning(false)} onAssigned={handleAssigned} /> : null}
    </>
  );
}
