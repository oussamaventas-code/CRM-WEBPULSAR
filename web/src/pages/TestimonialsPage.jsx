import { useState } from 'react';
import { BadgeCheck, Ban, Copy, Lock, MoreHorizontal, PenLine, Plus, Quote, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, emitRefresh } from '../lib/api.js';
import { useApi, useLookups } from '../lib/hooks.js';
import { date, isDemoLabel, todayIso } from '../lib/format.js';
import { CHANNEL, TESTIMONIAL_STATUS } from '../lib/labels.js';
import { FormModal } from '../components/FormModal.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { Badge, Button, Chips, DemoTag, EmptyState, Glass, IconButton, LabelBadge, Menu, Notice, PageHeader, Skeleton } from '../components/ui.jsx';

const opt = (list = []) => list.map((x) => ({ value: x.id, label: x.label }));

export default function TestimonialsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects', 'services']);
  const [status, setStatus] = useState('');
  const { data, loading } = useApi('/testimonials', { status });
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState(null);
  const [authorize, setAuthorize] = useState(null);
  const [reject, setReject] = useState(null);
  const [remove, setRemove] = useState(null);

  const baseFields = [
    { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, required: true, options: opt(lk.clients) },
    { name: 'received_at', label: 'Fecha en que lo comentó', type: 'date', required: true, default: todayIso() },
    { name: 'channel', label: 'Canal de procedencia', type: 'select', options: CHANNEL.options, required: true, default: 'call' },
    { name: 'service_id', label: 'Servicio relacionado', type: 'select', numeric: true, options: opt(lk.services) },
    { name: 'project_id', label: 'Proyecto relacionado', type: 'select', numeric: true, options: (v) => opt((lk.projects ?? []).filter((p) => !v.client_id || String(p.client_id) === String(v.client_id))), span: 2 },
    { name: 'internal_notes', label: 'Notas internas sobre lo que comentó', type: 'textarea', rows: 4, span: 2, hint: 'Resume con tus palabras lo que dijo. No es un texto publicable.' },
  ];

  return (
    <div>
      <PageHeader
        title="Testimonios"
        subtitle="Opiniones transmitidas verbalmente por los clientes y su autorización"
        meta={<Badge tone="violet"><Lock className="h-3 w-3" />Módulo privado</Badge>}
        actions={can('testimonials.write') && <Button icon={Plus} onClick={() => setForm({})}>Registrar opinión</Button>}
      />
      <Notice tone="brand" icon={ShieldCheck} className="mb-5">
        Nunca se inventan testimonios ni se atribuyen frases sin confirmación. Una opinión verbal se convierte en propuesta de texto y solo puede marcarse como publicable cuando el cliente aprueba ese texto exacto (fecha, persona y evidencia quedan registradas). Si se modifica el texto, la autorización se revoca.
      </Notice>
      <div className="mb-4 overflow-x-auto">
        <Chips options={[{ value: '', label: 'Todos' }, ...TESTIMONIAL_STATUS.options]} value={status} onChange={setStatus} />
      </div>
      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48 rounded-card" /><Skeleton className="h-48 rounded-card" /></div>
      ) : !data?.length ? (
        <Glass><EmptyState icon={Quote} title="Sin opiniones registradas" description="Cuando un cliente te transmita su opinión en una llamada o reunión, regístrala aquí para pedirle después autorización." /></Glass>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((t) => (
            <Glass key={t.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[14.5px] font-medium">{t.client_company || t.client_name}{t.is_demo || isDemoLabel(t.client_name) ? <DemoTag /> : null}</p>
                  <p className="text-[12px] text-ink-soft">{date(t.received_at)} · {CHANNEL.label(t.channel)}{t.service_name ? ` · ${t.service_name}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <LabelBadge set={TESTIMONIAL_STATUS} value={t.status} />
                  {can('testimonials.write') && (
                    <Menu
                      trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                      items={[
                        { label: 'Editar datos', icon: PenLine, onClick: () => setForm(t) },
                        { label: 'Eliminar registro', icon: Trash2, danger: true, onClick: () => setRemove(t) },
                      ]}
                    />
                  )}
                </div>
              </div>
              {t.internal_notes && (
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">Notas internas</p>
                  <p className="mt-1 whitespace-pre-line text-[13px] text-ink-soft">{t.internal_notes}</p>
                </div>
              )}
              <div className="mt-4 flex-1 rounded-[16px] border border-surface/80 bg-surface/60 p-4">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft"><Quote className="h-3 w-3" />Propuesta de texto</p>
                {t.draft_text ? <p className="whitespace-pre-line text-[13.5px] italic text-ink">«{t.draft_text}»</p> : <p className="text-[12.5px] text-ink-faint">Sin redactar todavía.</p>}
              </div>
              {t.status === 'authorized' && (
                <div className="mt-3 rounded-[14px] bg-ok-soft px-3.5 py-2.5 text-[12px] text-ok-ink">
                  <p className="font-medium">Aprobado por {t.approved_by_name} el {date(t.approved_at)}</p>
                  <p>{t.approval_evidence}</p>
                  <p className="mt-0.5 font-medium">{t.can_publish ? 'Con permiso para publicar' : 'Sin permiso para publicar (uso interno)'}</p>
                </div>
              )}
              {t.status === 'rejected' && t.approval_evidence && <p className="mt-3 rounded-[14px] bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger-ink">{t.approval_evidence}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {can('testimonials.write') && t.status !== 'authorized' && <Button size="sm" variant="secondary" icon={PenLine} onClick={() => setDraft(t)}>{t.draft_text ? 'Editar propuesta' : 'Redactar propuesta'}</Button>}
                {can('testimonials.approve') && t.draft_text && t.status !== 'authorized' && <Button size="sm" icon={BadgeCheck} onClick={() => setAuthorize(t)}>Registrar autorización</Button>}
                {can('testimonials.approve') && t.status !== 'rejected' && t.status !== 'authorized' && <Button size="sm" variant="ghost" icon={Ban} onClick={() => setReject(t)}>No autorizado</Button>}
                {t.status === 'authorized' && t.can_publish ? (
                  <Button size="sm" variant="secondary" icon={Copy} onClick={async () => { await navigator.clipboard.writeText(t.draft_text); toast.success('Texto autorizado copiado'); }}>Copiar texto autorizado</Button>
                ) : null}
                {t.status === 'authorized' && can('testimonials.write') && <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setDraft(t)}>Modificar (revoca la autorización)</Button>}
              </div>
            </Glass>
          ))}
        </div>
      )}

      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar registro' : 'Registrar opinión verbal'}
        icon={Quote}
        fields={baseFields}
        initial={form}
        onSubmit={async (v) => {
          if (form.id) await api.patch(`/testimonials/${form.id}`, v);
          else await api.post('/testimonials', v);
          toast.success('Registro guardado');
          emitRefresh();
        }}
      />
      <FormModal
        open={!!draft}
        onClose={() => setDraft(null)}
        title="Propuesta de testimonio"
        subtitle="Redacta el texto que enviarás al cliente para su aprobación. No lo publiques hasta tener su autorización."
        icon={PenLine}
        fields={[{ name: 'draft_text', label: 'Texto propuesto', type: 'textarea', rows: 6, required: true, span: 2 }]}
        initial={draft}
        notice={draft?.status === 'authorized' && <Notice tone="warn">Este testimonio está autorizado. Si cambias el texto, la autorización se revocará y deberás pedirla de nuevo.</Notice>}
        onSubmit={async (v) => {
          await api.patch(`/testimonials/${draft.id}`, v);
          toast.success('Propuesta guardada · pendiente de aprobación');
          emitRefresh();
        }}
      />
      <FormModal
        open={!!authorize}
        onClose={() => setAuthorize(null)}
        title="Registrar autorización del cliente"
        icon={BadgeCheck}
        notice={authorize && <div className="rounded-[14px] bg-surface/70 p-3 text-[13px] italic">«{authorize.draft_text}»</div>}
        fields={[
          { name: 'approved_at', label: 'Fecha de aprobación', type: 'date', required: true, default: todayIso() },
          { name: 'approved_by_name', label: 'Persona que lo aprueba', required: true },
          { name: 'approval_evidence', label: 'Cómo consta la aprobación', type: 'textarea', required: true, span: 2, placeholder: 'Ej.: respuesta por email del 12/03 conservada en Documentación' },
          { name: 'can_publish', label: 'Publicación', type: 'switch', switchLabel: 'El cliente permite publicarlo', description: 'Web, redes, propuestas comerciales…', span: 2 },
          { name: 'confirm', label: 'Confirmación', type: 'switch', switchLabel: 'Confirmo que el cliente ha aprobado este texto exacto', required: true, span: 2 },
        ]}
        onSubmit={async (v) => {
          await api.post(`/testimonials/${authorize.id}/authorize`, { ...v, confirm: v.confirm === true ? true : undefined });
          toast.success('Autorización registrada');
          emitRefresh();
        }}
        submitLabel="Registrar autorización"
      />
      <FormModal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Marcar como no autorizado"
        icon={Ban}
        fields={[{ name: 'reason', label: 'Motivo u observaciones', type: 'textarea', span: 2 }]}
        onSubmit={async (v) => {
          await api.post(`/testimonials/${reject.id}/reject`, v);
          toast.success('Marcado como no autorizado');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Eliminar registro"
        message="Se eliminará el registro de esta opinión. La acción queda auditada."
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/testimonials/${remove.id}`);
          toast.success('Registro eliminado');
          emitRefresh();
        }}
      />
    </div>
  );
}
