import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, FolderKanban, RefreshCw, TrendingUp, TriangleAlert, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { Button, Chips, ErrorState, Glass, Notice, PageHeader, Skeleton } from '../../components/ui.jsx';
import { NoReposState, RepoCard } from '../../components/GithubActivity.jsx';
import { CommitModal } from '../../components/CommitModal.jsx';

const SHORTCUTS = [
  { to: '/ventas', label: 'Ventas', hint: 'Leads y propuestas', icon: TrendingUp, perm: 'sales.read' },
  { to: '/proyectos', label: 'Proyectos', hint: 'Tareas y entregas', icon: FolderKanban, perm: 'projects.read' },
  { to: '/clientes', label: 'Clientes', hint: 'Fichas y contactos', icon: Users, perm: 'clients.read' },
  { to: '/finanzas', label: 'Finanzas', hint: 'Cobros y facturas', icon: Wallet, perm: 'finance.read' },
  { to: '/incidencias', label: 'Incidencias', hint: 'Soporte y avisos', icon: TriangleAlert, perm: 'incidents.read' },
];

const REVIEW_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Por revisar' },
  { value: 'accepted', label: 'Aceptados' },
];

export default function WorkPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useApi('/github/activity');
  const [author, setAuthor] = useState('');
  const [review, setReview] = useState('');
  const [target, setTarget] = useState(null);
  const items = data?.items ?? [];

  const authors = useMemo(() => {
    const names = new Map();
    for (const entry of items) for (const c of entry.commits) names.set(c.login ?? c.author, c.author);
    return [...names.entries()].map(([value, label]) => ({ value: String(value), label: String(label) }));
  }, [items]);

  const pending = useMemo(() => items.reduce((n, e) => n + e.commits.filter((c) => c.review.status !== 'accepted').length, 0), [items]);

  // Enlaces de avisos: /trabajo?proyecto=3&cambio=abc1234
  const linked = params.get('proyecto') && params.get('cambio') ? { projectId: Number(params.get('proyecto')), sha: params.get('cambio'), tab: params.get('tab') ?? 'cambios' } : null;
  const active = target ?? linked;
  const close = () => {
    setTarget(null);
    if (linked) setParams({}, { replace: true });
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Trabajo"
        subtitle="¿Qué hacemos hoy? Revisa los cambios de código, pruébalos en vivo y salta a cualquier parte del CRM"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>Actualizar</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {SHORTCUTS.filter((s) => can(s.perm)).map(({ to, label, hint, icon: Icon }) => (
          <Link key={to} to={to} className="lift glass flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-ice text-brand"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{label}</span>
              <span className="block truncate text-[11.5px] text-ink-soft">{hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-brand" />
        <h2 className="text-[15px] font-medium">Cambios de código</h2>
        {data && items.length > 0 && <span className="num rounded-full bg-brand-ice px-2 py-0.5 text-[11px] font-medium text-brand-deep">{pending} sin aceptar</span>}
      </div>

      {data && !data.authenticated && items.length > 0 && (
        <Notice tone="warn" title="Sin token de GitHub" className="mb-4">
          Solo se leen repos públicos y con un máximo de 60 consultas por hora. Añade <span className="mono">GITHUB_TOKEN</span> al archivo <span className="mono">.env</span> del servidor para repos privados.
        </Notice>
      )}
      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <Chips options={REVIEW_FILTERS} value={review} onChange={setReview} />
          {authors.length > 1 && (
            <div className="overflow-x-auto lg:ml-auto">
              <Chips options={[{ value: '', label: 'Todos' }, ...authors]} value={author} onChange={setAuthor} />
            </div>
          )}
        </div>
      )}
      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-card" />)}</div>
      ) : items.length === 0 ? (
        <Glass><NoReposState canWrite={can('projects.write')} /></Glass>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((entry) => (
            <RepoCard key={entry.project.id} entry={entry} author={author} review={review} onOpen={(e, c, tab) => setTarget({ projectId: e.project.id, sha: c.sha, tab })} />
          ))}
        </div>
      )}

      <CommitModal target={active} onClose={close} onChanged={reload} />
    </div>
  );
}
