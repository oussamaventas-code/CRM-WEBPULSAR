import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../lib/hooks.js';
import { Button, Chips, ErrorState, Glass, Notice, PageHeader, Skeleton } from '../../components/ui.jsx';
import { NoReposState, RepoCard } from '../../components/GithubActivity.jsx';

export default function DevelopmentPage() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi('/github/activity');
  const [author, setAuthor] = useState('');
  const items = data?.items ?? [];

  const authors = useMemo(() => {
    const names = new Map();
    for (const entry of items) for (const c of entry.commits) names.set(c.login ?? c.author, c.author);
    return [...names.entries()].map(([value, label]) => ({ value: String(value), label: String(label) }));
  }, [items]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Desarrollo"
        subtitle="Qué se ha cambiado en el código de cada cliente, quién lo ha hecho y su preview en vivo"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>Actualizar</Button>}
      />
      {data && !data.authenticated && items.length > 0 && (
        <Notice tone="warn" title="Sin token de GitHub" className="mb-4">
          Solo se leen repos públicos y con un máximo de 60 consultas por hora. Añade <span className="mono">GITHUB_TOKEN</span> al archivo <span className="mono">.env</span> del servidor para repos privados.
        </Notice>
      )}
      {authors.length > 1 && (
        <div className="mb-4 overflow-x-auto">
          <Chips options={[{ value: '', label: 'Todos' }, ...authors]} value={author} onChange={setAuthor} />
        </div>
      )}
      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-card" />)}</div>
      ) : items.length === 0 ? (
        <Glass><NoReposState canWrite={can('projects.write')} /></Glass>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((entry) => (
            <RepoCard key={entry.project.id} entry={entry} author={author} />
          ))}
        </div>
      )}
    </div>
  );
}
