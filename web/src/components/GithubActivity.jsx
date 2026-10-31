import { ExternalLink, GitBranch, GitCommitHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { relative } from '../lib/format.js';
import { REVIEW_STATUS } from '../lib/labels.js';
import { Avatar, Badge, EmptyState, LabelBadge, Section } from './ui.jsx';

const STATUS_NOTE = { not_found: 'warn', rate_limited: 'warn', error: 'danger' };

/** Tarjeta con los últimos commits de un repositorio. Al pulsar un cambio se llama a onOpen(entry, commit, tab). */
export function RepoCard({ entry, author = '', review = '', showProject = true, onOpen }) {
  const matchesAuthor = (c) => !author || [c.author, c.login].some((v) => v?.toLowerCase().includes(author.toLowerCase()));
  const matchesReview = (c) => !review || (review === 'pending' ? ['new', 'in_review', 'changes_requested'].includes(c.review.status) : c.review.status === review);
  const commits = entry.commits.filter((c) => matchesAuthor(c) && matchesReview(c));
  const { project } = entry;
  return (
    <Section
      title={showProject ? project.name : entry.repo}
      subtitle={showProject ? `${project.client_label} · ${entry.repo}` : undefined}
      icon={GitBranch}
      actions={
        <>
          {project.preview_url && entry.commits[0] && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => onOpen(entry, entry.commits[0], 'preview')}>
              Probar preview
            </button>
          )}
          <a href={`https://github.com/${entry.repo}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
            GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      }
    >
      {entry.status !== 'ok' ? (
        <div className="px-5 pb-5 pt-3">
          <Badge tone={STATUS_NOTE[entry.status] ?? 'mute'} dot>{entry.message}</Badge>
        </div>
      ) : commits.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-[12.5px] text-ink-soft">{author || review ? 'Ningún cambio coincide con el filtro.' : 'Este repositorio aún no tiene commits.'}</p>
      ) : (
        <ul className="divide-y divide-line/70 px-2 pb-2 pt-1">
          {commits.map((c) => (
            <li key={c.sha}>
              <button type="button" onClick={() => onOpen(entry, c, 'cambios')} className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-brand-ice/60">
                <Avatar name={c.author} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.message || '(sin mensaje)'}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                    {c.author} · {c.date ? relative(c.date) : '—'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {c.review.status !== 'new' && <LabelBadge set={REVIEW_STATUS} value={c.review.status} />}
                  <span className="mono inline-flex items-center gap-1 text-ink-faint">
                    <GitCommitHorizontal className="h-3.5 w-3.5" />
                    {c.sha}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showProject && (
        <div className="flex gap-4 border-t border-line/70 px-5 py-2.5 text-[12px]">
          <Link to={`/proyectos/${project.id}`} className="font-medium text-brand hover:underline">Ver proyecto</Link>
          <Link to={`/clientes/${project.client_id}`} className="text-ink-soft hover:text-brand">Ver cliente</Link>
        </div>
      )}
    </Section>
  );
}

export function NoReposState({ canWrite }) {
  return (
    <EmptyState
      icon={GitBranch}
      title="Ningún proyecto tiene un repositorio vinculado"
      description={canWrite ? 'Edita un proyecto y rellena «Repositorio de GitHub» (owner/repositorio) para ver aquí quién ha cambiado qué, probar su preview y revisar cada cambio.' : 'Pide a un administrador que vincule los repositorios en cada proyecto.'}
    />
  );
}
