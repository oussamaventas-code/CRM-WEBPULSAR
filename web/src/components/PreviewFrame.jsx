import { useState } from 'react';
import { ExternalLink, Laptop, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { Segmented } from './ui.jsx';

const DEVICES = [
  { value: 'mobile', width: 390, label: <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />Móvil</span> },
  { value: 'tablet', width: 768, label: <span className="inline-flex items-center gap-1.5"><Tablet className="h-3.5 w-3.5" />Tablet</span> },
  { value: 'desktop', width: null, label: <span className="inline-flex items-center gap-1.5"><Laptop className="h-3.5 w-3.5" />Escritorio</span> },
];

/** Preview en vivo del sitio del cliente dentro del CRM, con tamaños de dispositivo. */
export function PreviewFrame({ url }) {
  const [device, setDevice] = useState('desktop');
  const [nonce, setNonce] = useState(0);
  if (!url) return <p className="py-8 text-center text-[12.5px] text-ink-soft">Este proyecto no tiene URL de preview. Edita el proyecto y rellena «URL de preview».</p>;
  const width = DEVICES.find((d) => d.value === device).width;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Dispositivo" value={device} onChange={setDevice} options={DEVICES.map(({ value, label }) => ({ value, label }))} />
        <button type="button" className="btn-secondary btn-sm" onClick={() => setNonce((n) => n + 1)}><RefreshCw className="h-3.5 w-3.5" /> Recargar</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm ml-auto"><ExternalLink className="h-3.5 w-3.5" /> Abrir en pestaña</a>
      </div>
      <div className="flex justify-center overflow-auto rounded-[16px] border border-line bg-white p-0">
        <iframe
          key={nonce}
          title="Preview del proyecto"
          src={url}
          style={{ width: width ?? '100%', maxWidth: '100%' }}
          className="h-[520px] border-0 bg-white"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>
      <p className="mt-2 text-[11.5px] text-ink-faint">Si ves la página en blanco, ese sitio no permite mostrarse dentro de otras webs: usa «Abrir en pestaña».</p>
    </div>
  );
}
