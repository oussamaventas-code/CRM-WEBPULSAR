import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { cx } from './ui.jsx';

const FILE_STATUS = { added: 'Nuevo', removed: 'Eliminado', modified: 'Modificado', renamed: 'Renombrado' };

const lineClass = (line) => {
  if (line.startsWith('@@')) return 'bg-brand-ice/60 text-brand-deep';
  if (line.startsWith('+')) return 'bg-ok-soft text-ok-ink';
  if (line.startsWith('-')) return 'bg-danger-soft text-danger-ink';
  return 'text-ink-soft';
};

function FileDiff({ file, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-ice/40">
        <Chevron className="h-4 w-4 shrink-0 text-ink-soft" />
        <FileCode2 className="h-4 w-4 shrink-0 text-brand" />
        <span className="mono min-w-0 flex-1 truncate">{file.filename}</span>
        <span className="text-[11px] text-ink-soft">{FILE_STATUS[file.status] ?? file.status}</span>
        <span className="num text-[11.5px] font-medium text-ok-ink">+{file.additions}</span>
        <span className="num text-[11.5px] font-medium text-danger-ink">−{file.deletions}</span>
      </button>
      {open && (
        <div className="max-h-[420px] overflow-auto border-t border-line">
          {file.patch ? (
            <pre className="mono min-w-max text-[11.5px] leading-[1.55]">
              {file.patch.split('\n').map((line, i) => (
                <div key={i} className={cx('whitespace-pre px-3', lineClass(line))}>{line || ' '}</div>
              ))}
              {file.truncated && <div className="px-3 py-2 text-ink-faint">… diff recortado; ábrelo en GitHub para verlo entero</div>}
            </pre>
          ) : (
            <p className="px-3 py-3 text-[12px] text-ink-soft">Sin vista previa del diff (archivo binario o demasiado grande).</p>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffView({ files, total }) {
  if (!files.length) return <p className="py-6 text-center text-[12.5px] text-ink-soft">Este cambio no modifica archivos.</p>;
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <FileDiff key={f.filename} file={f} defaultOpen={files.length <= 3 && i < 3} />
      ))}
      {total > files.length && <p className="text-center text-[12px] text-ink-soft">Se muestran {files.length} de {total} archivos.</p>}
    </div>
  );
}
