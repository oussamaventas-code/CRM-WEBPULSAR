import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Send } from 'lucide-react';
import Turnstile from './Turnstile.jsx';
import { sendLead } from '../services/leads.js';
import { config } from '../config.js';
import { SERVICE_OPTIONS } from '../data/content.js';

const EMPTY = { name: '', email: '', phone: '', company: '', service: '', message: '', consent: false, website: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d\s.-]{6,25}$/;

/** Evento para preseleccionar un servicio desde otras secciones (p. ej. contratación). */
export const SELECT_SERVICE_EVENT = 'wp:select-service';

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Dinos cómo te llamas';
  else if (v.name.trim().length > 150) e.name = 'Máximo 150 caracteres';
  if (!v.email.trim()) e.email = 'Necesitamos un email para responderte';
  else if (!EMAIL.test(v.email.trim())) e.email = 'Revisa el email: parece incompleto';
  if (v.phone.trim() && !PHONE.test(v.phone.trim())) e.phone = 'Revisa el teléfono';
  if (!v.message.trim()) e.message = 'Cuéntanos brevemente qué necesitas';
  else if (v.message.length > 5000) e.message = 'Máximo 5000 caracteres';
  if (!v.consent) e.consent = 'Debes aceptar la política de privacidad';
  return e;
}

export default function ContactForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | validating | sending | success | error
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const sending = useRef(false);
  const formRef = useRef(null);
  const statusRef = useRef(null);
  const id = useId();
  const needsCaptcha = Boolean(config.turnstileSiteKey);

  useEffect(() => {
    const onSelect = (e) => setValues((v) => ({ ...v, service: e.detail }));
    window.addEventListener(SELECT_SERVICE_EVENT, onSelect);
    return () => window.removeEventListener(SELECT_SERVICE_EVENT, onSelect);
  }, []);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (sending.current) return; // evita envíos duplicados
    setStatus('validating');
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setStatus('idle');
      formRef.current?.querySelector(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    if (needsCaptcha && !token) {
      setStatus('error');
      setMessage(captchaFailed ? 'No hemos podido cargar la verificación anti-spam. Recarga la página e inténtalo de nuevo.' : 'Completa la verificación anti-spam antes de enviar.');
      statusRef.current?.focus();
      return;
    }

    sending.current = true;
    setStatus('sending');
    try {
      await sendLead({ ...values, name: values.name.trim(), email: values.email.trim(), turnstileToken: token || undefined });
      setStatus('success');
      setValues(EMPTY);
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
      if (err.fields) setErrors(err.fields);
      setResetKey((k) => k + 1); // el token de Turnstile ya se ha consumido
    } finally {
      sending.current = false;
      statusRef.current?.focus();
    }
  }

  if (status === 'success') {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="glass-strong sheen flex flex-col items-start gap-3 rounded-panel p-8 outline-none">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-ok-soft text-ok"><CheckCircle2 size={24} aria-hidden="true" /></span>
        <h3 className="text-[22px]">Gracias, hemos recibido tu mensaje</h3>
        <p className="text-[15px] text-ink-soft">Lo leeremos con calma y te responderemos personalmente lo antes posible.</p>
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setStatus('idle')}>Enviar otro mensaje</button>
      </div>
    );
  }

  const field = (name) => ({
    id: `${id}-${name}`,
    name,
    value: values[name],
    onChange: set(name),
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
    className: 'input',
  });
  const Err = ({ name }) => (errors[name] ? <p id={`${id}-${name}-err`} className="mt-1.5 text-[12.5px] text-danger">{errors[name]}</p> : null);
  const busy = status === 'sending' || status === 'validating';

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="glass-strong sheen rounded-panel p-5 sm:p-8" aria-busy={busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`${id}-name`}>Nombre <span className="text-danger" aria-hidden="true">*</span></label>
          <input {...field('name')} autoComplete="name" required maxLength={150} />
          <Err name="name" />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-email`}>Email <span className="text-danger" aria-hidden="true">*</span></label>
          <input {...field('email')} type="email" autoComplete="email" inputMode="email" required maxLength={200} />
          <Err name="email" />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-phone`}>Teléfono <span className="font-normal text-ink-faint">(opcional)</span></label>
          <input {...field('phone')} type="tel" autoComplete="tel" maxLength={25} />
          <Err name="phone" />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-company`}>Empresa <span className="font-normal text-ink-faint">(opcional)</span></label>
          <input {...field('company')} autoComplete="organization" maxLength={150} />
          <Err name="company" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor={`${id}-service`}>¿Qué te interesa?</label>
          <select {...field('service')}>
            <option value="">Selecciona una opción</option>
            {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor={`${id}-message`}>Cuéntanos tu proyecto <span className="text-danger" aria-hidden="true">*</span></label>
          <textarea {...field('message')} rows={5} required maxLength={5000} placeholder="Cómo funciona hoy tu negocio y qué te gustaría mejorar" />
          <Err name="message" />
        </div>
      </div>

      {/* Honeypot: invisible para personas y lectores de pantalla; los bots lo rellenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>No rellenes este campo</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
      </div>

      <div className="mt-5">
        <label className="flex cursor-pointer items-start gap-3 text-[13.5px] text-ink-soft">
          <input
            type="checkbox"
            name="consent"
            checked={values.consent}
            onChange={set('consent')}
            aria-invalid={errors.consent ? 'true' : undefined}
            aria-describedby={errors.consent ? `${id}-consent-err` : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-brand"
          />
          <span>
            He leído y acepto la <Link to="/privacidad" className="text-brand underline-offset-4 hover:underline">política de privacidad</Link>. Usaremos tus datos solo para responder a tu solicitud.
          </span>
        </label>
        <Err name="consent" />
      </div>

      <div className="mt-5">
        <Turnstile onToken={setToken} onError={() => setCaptchaFailed(true)} resetKey={resetKey} />
      </div>

      <div ref={statusRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {status === 'error' && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-[14px] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
            <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> {message}
          </p>
        )}
        {status === 'sending' && <p className="sr-only">Enviando tu mensaje…</p>}
      </div>

      <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-ink-faint">Los campos con <span className="text-danger">*</span> son obligatorios.</p>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </div>
    </form>
  );
}
