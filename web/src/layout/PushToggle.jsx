import { useEffect, useState } from 'react';
import { BellRing, BellOff, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { currentSubscription, disablePush, enablePush, needsInstallOnIos, pushSupported } from '../lib/push.js';

/** Activa o desactiva los avisos push (cobros, vencimientos…) en este dispositivo. */
export function PushToggle() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/push/status').then((s) => alive && setStatus(s)).catch(() => {});
    if (pushSupported()) currentSubscription().then((sub) => alive && setActive(!!sub)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!status?.enabled) return null;

  const hint = !pushSupported()
    ? needsInstallOnIos()
      ? 'En iPhone: Compartir → «Añadir a pantalla de inicio» y abre la app desde ahí para activar los avisos.'
      : 'Este navegador no admite notificaciones push.'
    : null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (active) {
        await disablePush();
        setActive(false);
        toast.success('Avisos desactivados en este dispositivo');
      } else {
        await enablePush(status.public_key);
        setActive(true);
        toast.success('Avisos activados en este dispositivo');
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    try {
      const r = await api.post('/push/test');
      if (!r.sent) toast.error(new Error('No se ha podido enviar: activa los avisos primero.'));
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="border-t border-line/70 px-4 py-3">
      {hint ? (
        <p className="text-[12px] text-ink-soft">{hint}</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={toggle} disabled={busy} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-brand hover:underline disabled:opacity-50">
            {active ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            {active ? 'Desactivar avisos en este dispositivo' : 'Activar avisos en el móvil'}
          </button>
          {active && (
            <button type="button" onClick={sendTest} className="inline-flex items-center gap-1 text-[12px] text-ink-soft hover:text-ink">
              <Send className="h-3.5 w-3.5" /> Probar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
