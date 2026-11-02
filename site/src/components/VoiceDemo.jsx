import { useEffect, useRef, useState } from 'react';
import { Play, Pause, AudioLines } from 'lucide-react';

const BARS = 56;
// Forma de onda decorativa estable (no representa el audio real).
const shape = Array.from({ length: BARS }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)));
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

/** Reproductor de la demo del asistente. Sin grabación, muestra "Estamos preparando una demostración". */
export default function VoiceDemo({ demo }) {
  const media = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const ready = Boolean(demo?.src);

  useEffect(() => () => media.current?.pause(), []);

  const toggle = () => {
    const el = media.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  };
  const seek = (value) => {
    if (media.current && duration) media.current.currentTime = (value / 100) * duration;
  };
  const progress = duration ? (time / duration) * 100 : 0;
  const mediaProps = {
    ref: media,
    src: demo?.src ?? undefined,
    preload: 'metadata',
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e) => setTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e) => setDuration(e.currentTarget.duration),
  };

  return (
    <div className="glass-strong sheen rounded-panel p-5 sm:p-7">
      {ready && demo.type === 'video' ? (
        <video {...mediaProps} poster={demo.poster ?? undefined} playsInline className="mb-5 aspect-video w-full rounded-[18px] bg-ink object-cover" />
      ) : (
        ready && <audio {...mediaProps} />
      )}

      <div className="flex h-24 items-center gap-[3px]" aria-hidden="true">
        {shape.map((h, i) => {
          const done = ready && (i / BARS) * 100 < progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors duration-300 ${done ? 'bg-brand' : ready ? 'bg-brand/25' : 'bg-ink/10'} ${playing ? 'motion-safe:animate-pulse' : ''}`}
              style={{ height: `${h * 100}%`, animationDelay: `${(i % 7) * 90}ms` }}
            />
          );
        })}
      </div>

      {ready ? (
        <>
          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              onClick={toggle}
              className="btn btn-primary h-12 w-12 shrink-0 !rounded-full !p-0"
              aria-label={playing ? 'Pausar demostración' : 'Reproducir demostración'}
            >
              {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} className="translate-x-0.5" aria-hidden="true" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Progreso de la demostración"
              aria-valuetext={`${fmt(time)} de ${fmt(duration)}`}
              className="h-1.5 flex-1 cursor-pointer accent-brand"
            />
            <span className="w-[84px] text-right font-mono text-[12px] tabular-nums text-ink-soft">{fmt(time)} / {fmt(duration)}</span>
          </div>
          <p className="mt-4 text-[14px] font-medium">{demo.title}</p>
          <p className="text-[13.5px] text-ink-soft">{demo.description}</p>
          {demo.transcript?.length > 0 && (
            <details className="mt-4 rounded-[14px] bg-white/60 p-4">
              <summary className="cursor-pointer text-[13.5px] font-medium">Leer la transcripción</summary>
              <dl className="mt-3 space-y-2 text-[13.5px]">
                {demo.transcript.map((t, i) => (
                  <div key={i}>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-brand">{t.speaker}</dt>
                    <dd>{t.text}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-[16px] bg-white/60 p-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-ice text-brand"><AudioLines size={18} aria-hidden="true" /></span>
          <div>
            <p className="text-[14px] font-medium">Estamos preparando una demostración para ti.</p>
            <p className="text-[13px] text-ink-soft">Mientras tanto, cuéntanos tu caso y te enseñamos cómo funcionaría en tu negocio.</p>
          </div>
        </div>
      )}
    </div>
  );
}
