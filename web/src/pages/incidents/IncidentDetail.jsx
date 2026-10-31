import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightLeft, BellRing, CircleCheck, Flag, MessageSquare, Pencil, PlusCircle, Send, TriangleAlert, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useLookups } from '../../lib/hooks.js';
import { dateTime, relative } from '../../lib/format.js';
import { ALERT_STATUS, INCIDENT_CATEGORY, INCIDENT_STATUS, PRIORITY } from '../../lib/labels.js';
import { incidentFields } from '../../forms.js';
import { FormModal } from '../../components/FormModal.jsx';
import { Avatar, Button, DemoTag, ErrorState, LabelBadge, Menu, Notice, PageHeader, Section, Skeleton, Stat, Textarea, cx } from '../../components/ui.jsx';

const EVENT_ICON = { created: PlusCircle, comment: MessageSquare, status_change: ArrowRightLeft, priority_change: Flag, assignment: UserRound, alert: BellRing };

function describe(e) {
  switch (e.type) {
    case 'created': return 'abrió la incidencia';
    case 'status_change': return `cambió el estado: ${INCIDENT_STATUS.label(e.from_value)} → ${INCIDENT_STATUS.label(e.to_value)}`;
    case 'priority_change': return `cambió la prioridad: ${PRIORITY.label(e.from_value)} → ${PRIORITY.label(e.to_value)}`;
    case 'assignment': return `asignó a ${e.to_value}`;
    case 'alert': return 'Monitorización';
    default: return 'comentó';
  }
}

export default function IncidentDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects', 'users', 'servers', 'domains']);
  const { data, error, reload } = useApi(`/incidents/${id}`);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [resolve, setResolve] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-72 rounded-card" /></div>;
  const { incident: i, events, alerts } = data;
  const closed = ['resolved', 'closed'].includes(i.status);

  const patch = async (body, msg) => {
    try {
      await api.patch(`/incidents/${id}`, body);
      toast.success(msg);
      emitRefresh();
    } catch (err) {
      toast.error(err);
    }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/comments`, { body: comment });
      setComment('');
      emitRefresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: '/incidencias', label: 'Incidencias' }}
        eyebrow={`Incidencia #${i.id} · ${INCIDENT_CATEGORY.label(i.category)}`}
        title={i.title}
        meta={
          <>
            <LabelBadge set={PRIORITY} value={i.priority} />
            <LabelBadge set={INCIDENT_STATUS} value={i.status} />
            {i.source === 'alert' && <LabelBadge set={{ label: () => 'Creada desde alerta', tone: () => 'violet' }} value="alert" />}
            {i.is_demo ? <DemoTag /> : null}
          </>
        }
        actions={
          can('incidents.write') && (
            <>
              <Menu
                trigger={({ toggle }) => <Button variant="secondary" onClick={toggle}>Cambiar estado</Button>}
                items={INCIDENT_STATUS.options.map((o) => ({
                  label: o.label,
                  disabled: o.value === i.status,
                  onClick: () => (o.value === 'resolved' && !i.resolution ? setResolve(true) : patch({ status: o.value }, `Estado: ${o.label}`)),
                }))}
              />
              <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>
              {!closed && <Button icon={CircleCheck} onClick={() => setResolve(true)}>Resolver</Button>}
            </>
          )
        }
      />
      {i.priority === 'critical' && !closed && (
        <Notice tone="danger" icon={TriangleAlert} className="mb-6" title="Incidencia crítica">Requiere atención inmediata. Mantén el historial actualizado para que todo el equipo vea su evolución.</Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {i.description && (
            <Section title="Descripción">
              <p className="whitespace-pre-line text-[13.5px]">{i.description}</p>
            </Section>
          )}
          {i.resolution && (
            <Section title="Resolución" icon={CircleCheck}>
              <p className="whitespace-pre-line text-[13.5px]">{i.resolution}</p>
            </Section>
          )}
          <Section title="Historial" icon={MessageSquare}>
            <ol className="space-y-4">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.type] ?? MessageSquare;
                return (
                  <li key={e.id} className="flex gap-3">
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', e.type === 'comment' ? 'bg-brand-ice text-brand' : e.type === 'alert' ? 'bg-violet-soft text-violet' : 'bg-mute-soft text-ink-soft')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink-soft">
                        <span className="font-medium text-ink">{e.user_name ?? 'Sistema'}</span> {describe(e)} · {relative(e.created_at)}
                      </p>
                      {e.body && <p className={cx('mt-1 whitespace-pre-line text-[13px]', e.type === 'comment' && 'rounded-[14px] bg-surface/70 px-3 py-2')}>{e.body}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {can('incidents.write') && (
              <div className="mt-5 flex gap-2 border-t border-line/70 pt-4">
                <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Añade una actualización, diagnóstico o siguiente paso…" />
                <Button icon={Send} loading={busy} onClick={addComment} disabled={!comment.trim()} className="self-end">Publicar</Button>
              </div>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Detalles">
            <dl className="space-y-3">
              <Stat label="Responsable">{i.assignee_name ? <span className="inline-flex items-center gap-2"><Avatar name={i.assignee_name} size={22} />{i.assignee_name}</span> : null}</Stat>
              <Stat label="Cliente">{i.client_id ? <Link to={`/clientes/${i.client_id}`} className="text-brand hover:underline">{i.client_name}</Link> : null}</Stat>
              <Stat label="Proyecto">{i.project_id ? <Link to={`/proyectos/${i.project_id}`} className="text-brand hover:underline">{i.project_name}</Link> : null}</Stat>
              <Stat label="Servidor">{i.server_id ? <Link to={`/infraestructura/servidores/${i.server_id}`} className="text-brand hover:underline">{i.server_name}</Link> : null}</Stat>
              <Stat label="Dominio">{i.domain_id ? <Link to={`/infraestructura/dominios/${i.domain_id}`} className="mono text-brand hover:underline">{i.domain_name}</Link> : null}</Stat>
              <Stat label="Apertura" value={dateTime(i.opened_at)} />
              <Stat label="Resolución" value={i.resolved_at ? dateTime(i.resolved_at) : null} />
              <Stat label="Cierre" value={i.closed_at ? dateTime(i.closed_at) : null} />
            </dl>
          </Section>
          {alerts.length > 0 && (
            <Section title="Alertas vinculadas" icon={BellRing} flush>
              <ul className="divide-y divide-line/60 pb-2">
                {alerts.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <div className="flex items-center gap-2"><LabelBadge set={ALERT_STATUS} value={a.status} /><span className="text-[11.5px] text-ink-soft">{relative(a.opened_at)}</span></div>
                    <p className="mt-1 text-[13px]">{a.title}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <FormModal
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar incidencia"
        size="lg"
        fields={incidentFields(lk, { editing: true })}
        initial={i}
        onSubmit={async (v) => {
          await api.patch(`/incidents/${id}`, v);
          toast.success('Incidencia actualizada');
          emitRefresh();
        }}
      />
      <FormModal
        open={resolve}
        onClose={() => setResolve(false)}
        title="Resolver incidencia"
        icon={CircleCheck}
        fields={[{ name: 'resolution', label: 'Cómo se resolvió', type: 'textarea', rows: 4, required: true, span: 2 }]}
        initial={{ resolution: i.resolution }}
        onSubmit={async (v) => {
          await api.patch(`/incidents/${id}`, { status: 'resolved', resolution: v.resolution });
          toast.success('Incidencia resuelta');
          emitRefresh();
        }}
        submitLabel="Marcar como resuelta"
      />
    </div>
  );
}
