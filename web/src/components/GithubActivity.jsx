import { ExternalLink, GitBranch, GitCommitHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { relative } from '../lib/format.js';
import { Avatar, Badge, EmptyState, Section, cx } from './ui.jsx';

const STATUS_NOTE = { not_found: 'warn', rate_limited: 'warn', error: 'danger' };

/** Tarjeta con los últimos commits de un repositorio vinculado a un proyecto. `author` filtra por nombre o usuario. */
export function RepoCard({ entry, author = '', showProject = true }) {
  const commits = author ? entry.commits.filter((c) => [c.author, c.login].some((v) => v?.toLowerCase().includes(author.toLowerCase()))) : entry.commits;
  const { project } = entry;
  return (
    <Section
      title={showProject ? project.name : entry.repo}
      subtitle={showProject ? `${project.client_label} · ${entry.repo}` : undefined}
      icon={GitBranch}
      actions={
        <>
          {project.preview_url && (
            <a href={project.preview_url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
              Preview <ExternalLink className="h-3.5 w-3.5" />
            </a>
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
        <p className="px-5 pb-5 pt-3 text-[12.5px] text-ink-soft">{author ? 'Sin commits de esa persona entre los últimos.' : 'Este repositorio aún no tiene commits.'}</p>
      ) : (
        <ul className="divide-y divide-line/70 px-2 pb-2 pt-1">
          {commits.map((c) => (
            <li key={c.sha}>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-brand-ice/60">
                <Avatar name={c.author} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.message || '(sin mensaje)'}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                    {c.author} · {c.date ? relative(c.date) : '—'}
                  </span>
                </span>
                <span className="mono mt-0.5 inline-flex items-center gap-1 text-ink-faint">
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                  {c.sha}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {showProject && (
        <div className={cx('border-t border-line/70 px-5 py-2.5 text-[12px]')}>
          <Link to={`/proyectos/${project.id}`} className="font-medium text-brand hover:underline">Ver proyecto</Link>
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
      description={canWrite ? 'Edita un proyecto y rellena «Repositorio de GitHub» (owner/repositorio) para ver aquí quién ha cambiado qué y abrir su preview.' : 'Pide a un administrador que vincule los repositorios en cada proyecto.'}
    />
  );
}
