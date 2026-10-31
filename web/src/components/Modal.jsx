import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { X } from 'lucide-react';
import { Button, Field, Input, cx } from './ui.jsx';
import { finish, settle, skipMotion } from '../lib/motion.js';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', icon: Icon }) {
  const panel = useRef(null);
  const backdrop = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panel.current?.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, onClose]);

  useGSAP(
    () => {
      if (!open || skipMotion()) return undefined;
      gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
      gsap.fromTo(panel.current, { opacity: 0, y: 14, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'opacity,transform' });
      return settle(() => finish([backdrop.current, panel.current]), 450);
    },
    { dependencies: [open] },
  );

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div ref={backdrop} className="absolute inset-0 bg-[#172033]/25 backdrop-blur-[3px]" onClick={onClose} />
      <div ref={panel} className={cx('glass-strong relative flex max-h-[92vh] w-full flex-col rounded-b-none shadow-float sm:rounded-panel', SIZES[size])}>
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-ice text-brand">
              <Icon className="h-[18px] w-[18px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-medium">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-soft">{subtitle}</p>}
          </div>
          <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Cerrar">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-5 pt-1">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmación para operaciones sensibles. Puede exigir escribir un texto exacto
 * y/o la contraseña del usuario (verificada en el servidor).
 */
export function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Confirmar', tone = 'primary', requireText, requirePassword = false, onConfirm, children }) {
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setText('');
      setPassword('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const ready = (!requireText || text.trim() === requireText.trim()) && (!requirePassword || password.length > 0);
  const submit = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ password, text });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={tone} onClick={submit} loading={busy} disabled={!ready}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {message && <div className="text-[13.5px] text-ink-soft">{message}</div>}
        {children}
        {requireText && (
          <Field label={`Escribe «${requireText}» para confirmar`} error={error?.fields?.confirm_name}>
            <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
        )}
        {requirePassword && (
          <Field label="Tu contraseña" error={error?.fields?.password}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        {error && !error.fields?.password && !error.fields?.confirm_name && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">{error.message}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
