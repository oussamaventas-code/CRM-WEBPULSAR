import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, AppWindow, GitBranch, CalendarRange, Database, FileText, FolderKanban, Globe, ListTodo, MessageSquare, MoreHorizontal, Pencil, Plus, Receipt, Send, Server, Trash2, User, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useLookups } from '../../lib/hooks.js';
import { date, isDemoLabel, money, relative } from '../../lib/format.js';
import { PRIORITY, PROJECT_STATUS, PROJECT_TYPE, TASK_STATUS } from '../../lib/labels.js';
import { projectFields, taskFields } from '../../forms.js';
import { FormModal, FormFields, collectValues, useFormState } from '../../components/FormModal.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { Avatar, Badge, Button, DemoTag, EmptyState, ErrorState, Glass, IconButton, LabelBadge, Menu, PageHeader, Progress, Section, Skeleton, Tabs, Textarea, cx } from '../../components/ui.jsx';
import { DocumentsPanel, DueDate, InvoicesTable, PaymentsTable } from '../../components/lists.jsx';
import { Timeline } from '../../components/Timeline.jsx';
import { HealthPill } from '../../components/Health.jsx';
import { NoReposState, RepoCard } from '../../components/GithubActivity.jsx';

const TASK_COLUMNS = ['todo', 'in_progress', 'review', 'done'];

function TaskModal({ task, projectId, onClose }) {
  const toast = useToast();
  const { can } = useAuth();
  const lk = useLookups(['users']);
  const fields = taskFields(lk);
  const isNew = task && !task.id;
  const [values, setValues] = useFormState(fields, task, !!task);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const comments = useApi(task?.id ? `/tasks/${task.id}/comments` : null);
  const [remove, setRemove] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = collectValues(fields, values);
      if (isNew) await api.post(`/projects/${projectId}/tasks`, body);
      else await api.patch(`/tasks/${task.id}`, body);
      toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada');
      emitRefresh();
      onClose();
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!err.fields || !Object.keys(err.fields).length) toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/tasks/${task.id}/comments`, { body: comment });
      setComment('');
      comments.reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={isNew ? 'Nueva tarea' : 'Tarea'}
      icon={ListTodo}
      size="lg"
      footer={
        <>
          {!isNew && can('projects.write') && (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-danger" onClick={() => setRemove(true)}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {can('projects.write') && <Button onClick={save} loading={busy}>{isNew ? 'Crear tarea' : 'Guardar'}</Button>}
        </>
      }
    >
      <FormFields fields={fields} values={values} setValues={setValues} errors={errors} />
      {!isNew && (
        <div className="mt-6 border-t border-line/70 pt-5">
          <p className="mb-3 flex items-center gap-2 text-[13px] font-medium"><MessageSquare className="h-4 w-4 text-brand" /> Comentarios</p>
          <ul className="space-y-3">
            {(comments.data ?? []).map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.user_name} size={28} />
                <div className="min-w-0 flex-1 rounded-[14px] bg-surface/70 px-3 py-2">
                  <p className="text-[11.5px] text-ink-soft">{c.user_name} · {relative(c.created_at)}</p>
                  <p className="whitespace-pre-line text-[13px]">{c.body}</p>
                </div>
              </li>
            ))}
            {comments.data?.length === 0 && <p className="text-[12.5px] text-ink-soft">Sin comentarios todavía.</p>}
          </ul>
          {can('projects.write') && (
            <div className="mt-3 flex gap-2">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escribe un comentario…" />
              <IconButton icon={Send} label="Enviar comentario" onClick={addComment} className="self-end bg-brand text-white hover:bg-brand-600 hover:text-white" />
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar tarea"
        message={task?.title}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/tasks/${task.id}`);
          toast.success('Tarea eliminada');
          emitRefresh();
          onClose();
        }}
      />
    </Modal>
  );
}

function TasksBoard({ projectId }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, setData } = useApi(`/projects/${projectId}/tasks`);
  const [open, setOpen] = useState(null);
  const [dragging, setDragging] = useState(null);

  const move = async (task, status) => {
    if (task.status === status) return;
    const prev = data;
    setData((d) => d.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      emitRefresh();
    } catch (err) {
      setData(prev);
      toast.error(err);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-ink-soft">{data ? `${data.filter((t) => t.status === 'done').length} de ${data.length} tareas completadas` : ' '}</p>
        {can('projects.write') && <Button size="sm" icon={Plus} onClick={() => setOpen({ status: 'todo' })}>Nueva tarea</Button>}
      </div>
      {loading && !data ? (
        <Skeleton className="h-64 rounded-card" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_COLUMNS.map((status) => {
            const tasks = (data ?? []).filter((t) => t.status === status);
            return (
              <div
                key={status}
                className="glass flex flex-col rounded-[20px] p-2.5"
                onDragOver={(e) => can('projects.write') && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) move(dragging, status);
                  setDragging(null);
                }}
              >
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <LabelBadge set={TASK_STATUS} value={status} />
                  <span className="num text-[11.5px] text-ink-soft">{tasks.length}</span>
                </div>
                <div className="flex min-h-[90px] flex-col gap-2">
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      draggable={can('projects.write')}
                      onDragStart={() => setDragging(t)}
                      onClick={() => setOpen(t)}
                      className="lift rounded-[14px] border border-surface/90 bg-surface/85 p-3 text-left shadow-[0_1px_2px_rgba(23,32,51,0.05)]"
                    >
                      <p className={cx('text-[13px] font-medium leading-snug', t.status === 'done' && 'text-ink-soft line-through decoration-ink-faint')}>{t.title}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <LabelBadge set={PRIORITY} value={t.priority} dot={false} />
                        {t.comments_count > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft"><MessageSquare className="h-3 w-3" />{t.comments_count}</span>}
                        <span className="ml-auto text-[11px]"><DueDate value={t.due_date} done={t.status === 'done'} /></span>
                        {t.assignee_name && <Avatar name={t.assignee_name} size={20} />}
                      </div>
                    </button>
                  ))}
                  {!tasks.length && <p className="px-2 py-5 text-center text-[11.5px] text-ink-faint">Sin tareas</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <TaskModal task={open} projectId={projectId} onClose={() => setOpen(null)} />
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'tareas';
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const lk = useLookups(['clients', 'users']);
  const { data, error, reload } = useApi(`/projects/${id}`);
  const history = useApi(tab === 'historial' ? `/projects/${id}/history` : null);
  const github = useApi(tab === 'desarrollo' ? '/github/activity' : null, { project_id: id });
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-40 rounded-card" /></div>;
  const { project: p, finance, infrastructure: infra } = data;

  const setStatus = async (status) => {
    try {
      await api.patch(`/projects/${projectId}`, { status });
      toast.success(`Estado: ${PROJECT_STATUS.label(status)}`);
      emitRefresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const tabs = [
    { key: 'tareas', label: 'Tareas', icon: ListTodo },
    { key: 'archivos', label: 'Archivos', icon: FileText, count: data.documents_count },
    can('finance.read') && { key: 'finanzas', label: 'Finanzas', icon: Wallet },
    can('infrastructure.read') && { key: 'infraestructura', label: 'Infraestructura', icon: Server },
    p.github_repo && { key: 'desarrollo', label: 'Desarrollo', icon: GitBranch },
    { key: 'historial', label: 'Historial', icon: Activity },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        back={{ to: '/proyectos', label: 'Proyectos' }}
        title={p.name}
        subtitle={
          <span>
            <Link to={`/clientes/${p.client_id}`} className="font-medium text-brand hover:underline">{p.client_company || p.client_name}</Link> · {PROJECT_TYPE.label(p.type)}
          </span>
        }
        meta={
          <>
            <LabelBadge set={PROJECT_STATUS} value={p.status} />
            {isDemoLabel(p.name) && <DemoTag />}
            {data.open_incidents > 0 && <Badge tone="danger" dot>{data.open_incidents} incidencias abiertas</Badge>}
          </>
        }
        actions={
          can('projects.write') && (
            <>
              <Menu
                align="right"
                trigger={({ toggle }) => <Button variant="secondary" onClick={toggle}>Cambiar estado</Button>}
                items={PROJECT_STATUS.options.map((o) => ({ label: o.label, onClick: () => setStatus(o.value), disabled: o.value === p.status }))}
              />
              <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>
              {can('projects.delete') && (
                <Menu trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más" onClick={toggle} className="border border-line bg-surface/70" />} items={[{ label: 'Eliminar proyecto', icon: Trash2, danger: true, onClick: () => setRemove(true) }]} />
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Glass className="p-4">
          <p className="text-[12px] text-ink-soft">Progreso {p.progress_mode === 'tasks' ? '(según tareas)' : '(manual)'}</p>
          <p className="num mt-1 text-[22px] font-medium">{p.progress}%</p>
          <Progress value={p.progress} tone={p.progress === 100 ? 'ok' : 'brand'} className="mt-2" />
        </Glass>
        <Glass className="p-4">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-soft"><CalendarRange className="h-3.5 w-3.5" /> Fechas</p>
          <p className="mt-1 text-[13px]">Inicio: <span className="num">{date(p.start_date)}</span></p>
          <p className="text-[13px]">Entrega: <DueDate value={p.due_date} done={['finished', 'delivered', 'cancelled'].includes(p.status)} /></p>
        </Glass>
        <Glass className="p-4">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-soft"><User className="h-3.5 w-3.5" /> Responsable</p>
          <div className="mt-2 flex items-center gap-2">{p.owner_name ? <><Avatar name={p.owner_name} size={28} /><span className="text-[13.5px] font-medium">{p.owner_name}</span></> : <span className="text-ink-faint">Sin asignar</span>}</div>
        </Glass>
        <Glass className="p-4">
          <p className="text-[12px] text-ink-soft">Presupuesto</p>
          <p className="num mt-1 text-[22px] font-medium">{money(p.budget_cents)}</p>
          {finance && <p className="num text-[12px] text-ink-soft">Facturado {money(finance.billed_cents)} · cobrado {money(finance.collected_cents)}</p>}
        </Glass>
      </div>

      {p.description && (
        <Glass className="mb-6 p-5">
          <p className="whitespace-pre-line text-[13.5px] text-ink">{p.description}</p>
        </Glass>
      )}

      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} className="mb-5" />
      {tab === 'tareas' && <TasksBoard projectId={projectId} />}
      {tab === 'archivos' && (
        <Section title="Archivos del proyecto" icon={FileText} flush>
          <DocumentsPanel clientId={p.client_id} projectId={projectId} showFilters={false} />
        </Section>
      )}
      {tab === 'finanzas' && (
        <div className="space-y-6">
          <Section title="Facturas del proyecto" icon={Receipt} flush actions={can('finance.write') && <Link to={`/finanzas/facturas/nueva?cliente=${p.client_id}&proyecto=${p.id}`} className="btn-primary btn-sm"><Plus className="h-3.5 w-3.5" />Crear factura</Link>}>
            <InvoicesTable params={{ project_id: projectId, client_id: p.client_id }} pageSize={10} />
          </Section>
          <Section title="Cobros" icon={Wallet} flush>
            <PaymentsTable params={{ project_id: projectId, client_id: p.client_id, pageSize: 10 }} />
          </Section>
        </div>
      )}
      {tab === 'infraestructura' && infra && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Servidores', Server, infra.servers, (s) => `/infraestructura/servidores/${s.id}`, (s) => s.ipv4],
            ['Dominios', Globe, infra.domains, (d) => `/infraestructura/dominios/${d.id}`, (d) => (d.expires_at ? `Caduca ${date(d.expires_at.slice(0, 10))}` : null)],
            ['Aplicaciones', AppWindow, infra.applications, () => '/infraestructura?tab=aplicaciones', (a) => a.url],
            ['Bases de datos', Database, infra.databases, () => '/infraestructura?tab=bases', (b) => `${b.engine} · ${b.environment}`],
          ].map(([title, Icon, list, link, sub]) => (
            <Section key={title} title={title} icon={Icon} flush>
              {!list.length ? (
                <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Ninguno vinculado a este proyecto.</p>
              ) : (
                <ul className="divide-y divide-line/60 pb-2">
                  {list.map((r) => (
                    <li key={r.id}>
                      <Link to={link(r)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-ice/40">
                        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{r.name}</p><p className="mono truncate text-[11.5px] text-ink-soft">{sub(r) ?? '—'}</p></div>
                        <HealthPill status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ))}
        </div>
      )}
      {tab === 'desarrollo' && (
        github.data?.items?.[0] ? <RepoCard entry={github.data.items[0]} showProject={false} /> : github.loading ? <Skeleton className="h-64 rounded-card" /> : <Glass><NoReposState canWrite={can('projects.write')} /></Glass>
      )}
      {tab === 'historial' && (
        <Section title="Historial del proyecto" icon={Activity}>
          {history.data?.length === 0 ? <EmptyState compact icon={Activity} title="Sin historial" /> : <Timeline items={history.data} loading={history.loading} />}
        </Section>
      )}

      <FormModal
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar proyecto"
        icon={FolderKanban}
        size="lg"
        fields={projectFields(lk)}
        initial={p}
        onSubmit={async (v) => {
          await api.patch(`/projects/${projectId}`, v);
          toast.success('Proyecto actualizado');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar proyecto"
        message="Solo se pueden eliminar proyectos sin facturas ni cobros. Si los tiene, cámbialo a «Cancelado»."
        requireText={p.name}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/projects/${projectId}`);
          toast.success('Proyecto eliminado');
          emitRefresh();
          navigate('/proyectos');
        }}
      />
    </div>
  );
}
