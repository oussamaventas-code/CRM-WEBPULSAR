import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Notice, Section } from '../../components/ui.jsx';

/** Logo que aparece en la cabecera de las facturas en PDF. */
export function LogoCard() {
  const toast = useToast();
  const input = useRef(null);
  const [version, setVersion] = useState(Date.now());
  const [exists, setExists] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/branding/logo', { method: 'HEAD', credentials: 'same-origin' }).then((r) => alive && setExists(r.ok)).catch(() => alive && setExists(false));
    return () => {
      alive = false;
    };
  }, [version]);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error(new Error('El logo no puede superar 2 MB'));
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      await api.upload('/branding/logo', body);
      toast.success('Logo actualizado');
      setVersion(Date.now());
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del('/branding/logo');
      toast.success('Logo eliminado');
      setVersion(Date.now());
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Logo de las facturas" subtitle="Se muestra en la cabecera del PDF junto al nombre comercial" icon={ImagePlus}>
      <div className="flex flex-col gap-4 px-5 pb-5 pt-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-56 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-line bg-white p-2">
          {exists ? <img src={`/api/branding/logo?v=${version}`} alt="Logo actual" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-slate-500">Sin logo</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Notice tone="brand">PNG o JPG, máximo 2 MB. Mejor con fondo transparente (PNG) y formato apaisado. Se aplica a todas las facturas nuevas y a las que descargues de nuevo.</Notice>
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <Button icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>{exists ? 'Cambiar logo' : 'Subir logo'}</Button>
            {exists && <Button variant="ghost" icon={Trash2} className="text-danger" disabled={busy} onClick={remove}>Quitar</Button>}
          </div>
        </div>
      </div>
    </Section>
  );
}
