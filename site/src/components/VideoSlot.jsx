import { useState } from 'react';
import { Play, Clapperboard } from 'lucide-react';

/**
 * Vídeo de proyecto. Sin `src` muestra la portada con "Próximamente" (nunca un reproductor vacío).
 * Con `src`, carga el vídeo solo cuando el usuario pulsa reproducir (sin autoplay ni sonido automático).
 */
export default function VideoSlot({ video, className = '' }) {
  const [playing, setPlaying] = useState(false);
  if (!video) return null;

  if (playing && video.src) {
    return (
      <div className={`overflow-hidden rounded-panel bg-black ${className}`}>
        <video className="h-full w-full object-cover" controls autoPlay playsInline poster={video.poster} preload="metadata">
          <source src={video.src} type="video/mp4" />
          {video.captions && <track kind="captions" src={video.captions} srcLang="es" label="Español" default />}
        </video>
      </div>
    );
  }

  return (
    <div className={`group relative overflow-hidden rounded-panel ${className}`}>
      <img src={video.poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px] transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-brand-deep/40 to-brand-deep/10" />
      <div className="relative flex h-full min-h-[260px] flex-col justify-end p-6">
        {video.src ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="glass-strong mb-auto ml-auto inline-flex h-14 w-14 items-center justify-center !rounded-full text-brand transition-transform hover:scale-105"
            aria-label={`Reproducir vídeo: ${video.title}`}
          >
            <Play size={22} className="translate-x-0.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="glass-dark mb-auto inline-flex items-center gap-2 self-start !rounded-full px-3 py-1.5 font-mono text-[11px] text-white">
            <Clapperboard size={13} aria-hidden="true" /> {video.comingSoon}
          </span>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">Vídeo colaborativo</p>
        <p className="mt-1 text-[22px] font-medium text-white">{video.title}</p>
      </div>
    </div>
  );
}
