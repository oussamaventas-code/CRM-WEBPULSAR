import { LayoutDashboard, Users, FolderKanban, Receipt, Mic, Phone } from 'lucide-react';
import BrowserFrame from './BrowserFrame.jsx';

// Interfaces ilustrativas (no pertenecen a ningún cliente). Para usar una captura real del CRM,
// pasa `screenshot={{ src, alt, width, height }}` a CrmMockup.

const bars = [38, 52, 44, 66, 58, 74, 62, 80, 70, 86, 78, 92];

export function CrmMockup({ screenshot, className = '', compact = false }) {
  return (
    <BrowserFrame url="crm.tunegocio.es" strong className={className}>
      {screenshot ? (
        <img src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} loading="lazy" decoding="async" className="block h-auto w-full" />
      ) : (
        <div className="flex">
          <div className="hidden w-[22%] shrink-0 flex-col gap-1 border-r border-white/60 p-3 sm:flex" aria-hidden="true">
            {[LayoutDashboard, Users, FolderKanban, Receipt].map((Icon, i) => (
              <span key={i} className={`flex items-center gap-2 rounded-[10px] px-2 py-1.5 ${i === 0 ? 'bg-white/80 text-brand shadow-glass' : 'text-ink-soft'}`}>
                <Icon size={13} />
                <span className={`h-1.5 rounded-full ${i === 0 ? 'w-12 bg-brand/40' : 'w-10 bg-ink/10'}`} />
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-3 sm:p-4" aria-hidden="true">
            <div className="flex items-center justify-between">
              <span className="h-2 w-24 rounded-full bg-ink/15" />
              <span className="h-5 w-16 rounded-[8px] bg-brand/90" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['bg-brand', 'bg-ok', 'bg-violet'].map((c) => (
                <div key={c} className="rounded-[12px] bg-white/70 p-2.5 shadow-glass">
                  <span className={`block h-1.5 w-8 rounded-full ${c} opacity-60`} />
                  <span className="mt-2 block h-3 w-12 rounded bg-ink/80" />
                </div>
              ))}
            </div>
            {!compact && (
              <div className="mt-3 rounded-[12px] bg-white/70 p-3 shadow-glass">
                <div className="flex h-20 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[4px] bg-gradient-to-t from-brand/70 to-brand-light/70" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-2 rounded-[10px] bg-white/60 px-2.5 py-2">
                  <span className="h-5 w-5 rounded-full bg-gradient-to-br from-brand-light to-brand" />
                  <span className="h-1.5 w-20 rounded-full bg-ink/20" />
                  <span className="ml-auto h-4 w-12 rounded-full bg-ok-soft" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </BrowserFrame>
  );
}

const wave = [6, 14, 22, 12, 28, 18, 34, 20, 26, 10, 30, 16, 24, 8, 20, 12, 26, 14, 8];

export function VoiceMockup({ className = '' }) {
  return (
    <div className={`glass-strong sheen rounded-panel p-4 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-violet text-white">
          <span className="absolute inset-0 animate-pulsering rounded-full bg-brand/40" />
          <Mic size={17} />
        </span>
        <div>
          <p className="text-[12.5px] font-medium text-ink">Asistente de voz</p>
          <p className="flex items-center gap-1 font-mono text-[10.5px] text-ok"><Phone size={10} /> Llamada en curso</p>
        </div>
      </div>
      <div className="mt-4 flex h-10 items-center gap-[3px]">
        {wave.map((h, i) => (
          <span key={i} className="w-[4px] flex-1 rounded-full bg-gradient-to-t from-brand to-brand-light" style={{ height: `${h + 6}px`, opacity: 0.55 + (i % 4) * 0.12 }} />
        ))}
      </div>
    </div>
  );
}

export function WebMockup({ className = '' }) {
  return (
    <BrowserFrame url="tunegocio.es" className={className}>
      <div className="p-3" aria-hidden="true">
        <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-brand-deep via-brand to-brand-light p-4">
          <span className="block h-2 w-16 rounded-full bg-white/50" />
          <span className="mt-2 block h-3 w-32 rounded bg-white/90" />
          <span className="mt-1.5 block h-3 w-24 rounded bg-white/90" />
          <span className="mt-3 inline-block h-5 w-16 rounded-[8px] bg-white" />
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-10 rounded-[10px] bg-white/70" />
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}
