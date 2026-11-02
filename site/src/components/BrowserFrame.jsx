/** Ventana de navegador de cristal para mostrar interfaces. */
export default function BrowserFrame({ url = 'webpulsar.es', children, className = '', strong = false }) {
  return (
    <div className={`${strong ? 'glass-strong' : 'glass'} sheen overflow-hidden rounded-panel ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/60 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B6B]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFC145]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3DD68C]/80" />
        </span>
        <span className="mx-auto truncate rounded-full bg-white/60 px-3 py-0.5 font-mono text-[10.5px] text-ink-soft">{url}</span>
        <span className="w-10" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
