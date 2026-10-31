import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, GitCommitHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, emitRefresh } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { relative } from '../lib/format.js';
import { REVIEW_STATUS } from '../lib/labels.js';
import { Modal } from './Modal.jsx';
import { DiffView } from './DiffView.jsx';
import { PreviewFrame } from './PreviewFrame.jsx';
import { Avatar, Button, Chips, LabelBadge, Notice, Skeleton, Tabs, Textarea } from './ui.jsx';

/** Cambio de GitHub abierto dentro del CRM: qué se tocó, cómo se ve en vivo y su estado de revisión. */
export function CommitModal({ target, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const open = !!target;
  const { data, loading } = useApi(open ? '/github/commit' : null, { project_id: target?.projectId, sha: target?.sha });
  const [tab, setTab] = useState('cambios');
  const [status, setStatus] = useState('new');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(target.tab ?? 'cambios');
  }, [open, target?.sha, target?.tab]);
  useEffect(() => {
    if (data?.review) {
      setStatus(data.review.status);
      setNote(data.review.note ?? '');
    }
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/github/reviews', { project_id: target.projectId, sha: target.sha, status, note, message: data?.commit?.message });
      toast.success(`Marcado como «${REVIEW_STATUS.label(status)}»`);
      emitRefresh();
      onChanged?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const commit = data?.commit;
  const project = data?.project;
  const tabs = [
    { key: 'cambios', label: 'Cambios', count: data?.files_total },
    { key: 'preview', label: 'Preview en vivo' },
    { key: 'revision', label: 'Revisión' },
  ];

  return (
    <Modal open={open} onClose={onClose} size="xl" icon={GitCommitHorizontal} title={commit?.message ?? 'Cambio'} subtitle={commit ? `${commit.author} · ${commit.date ? relative(commit.date) : ''} · ${commit.sha}` : target?.sha}>
      {loading && !data ? (
        <Skeleton className="h-64 rounded-card" />
      ) : data?.status && data.status !== 'ok' ? (
        <Notice tone="warn">{data.message}</Notice>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
            {commit && <Avatar name={commit.author} size={24} />}
            <LabelBadge set={REVIEW_STATUS} value={data?.review?.status ?? 'new'} />
            {commit?.stats && <span className="num text-ink-soft"><span className="text-ok-ink">+{commit.stats.additions}</span> / <span className="text-danger-ink">−{commit.stats.deletions}</span></span>}
            {project && <Link to={`/proyectos/${project.id}`} className="font-medium text-brand hover:underline">{project.name}</Link>}
            {project && <Link to={`/clientes/${project.client_id}`} className="text-ink-soft hover:text-brand">{project.client_label}</Link>}
            {commit?.url && <a href={commit.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-ink-soft hover:text-brand">GitHub <ExternalLink className="h-3.5 w-3.5" /></a>}
          </div>
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />
          {tab === 'cambios' && (
            <>
              {commit?.full_message?.includes('\n') && <pre className="mb-3 whitespace-pre-wrap rounded-[14px] bg-surface/50 p-3 text-[12.5px] text-ink-soft">{commit.full_message}</pre>}
              <DiffView files={data?.files ?? []} total={data?.files_total ?? 0} />
            </>
          )}
          {tab === 'preview' && <PreviewFrame url={project?.preview_url} />}
          {tab === 'revision' && (
            <div className="space-y-4">
              <Notice tone="brand">Prueba el cambio en la pestaña «Preview en vivo», deja tu veredicto y una nota para el otro socio. Al aceptarlo o pedir cambios, le llega un aviso (CRM, móvil y email).</Notice>
              <Chips options={REVIEW_STATUS.options} value={status} onChange={(v) => v && setStatus(v)} />
              <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué has probado, qué falla, qué falta…" disabled={!can('projects.write')} />
              {can('projects.write') && <div className="flex justify-end"><Button onClick={save} loading={busy}>Guardar revisión</Button></div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
