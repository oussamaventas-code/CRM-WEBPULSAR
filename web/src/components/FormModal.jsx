import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, Input, Select, Switch, Textarea, cx } from './ui.jsx';
import { centsToInput, toCents } from '../lib/format.js';

// Formularios declarativos: cada campo { name, label, type, options, required, span, hint, show, placeholder }.
// Tipos: text, email, tel, url, password, textarea, select, date, money (céntimos), number, percent, tags, switch.

function toFormValue(field, value) {
  if (field.type === 'money') return centsToInput(value);
  if (field.type === 'tags') return Array.isArray(value) ? value.join(', ') : value ?? '';
  if (field.type === 'switch') return !!value;
  return value ?? '';
}

function fromFormValue(field, value) {
  if (field.type === 'money') return value === '' ? null : toCents(value);
  if (field.type === 'tags') return String(value).split(',').map((t) => t.trim()).filter(Boolean);
  if (field.type === 'number' || field.type === 'percent') return value === '' ? null : Number(String(value).replace(',', '.'));
  if (field.type === 'switch') return !!value;
  if (field.type === 'select' && field.numeric) return value === '' ? null : Number(value);
  return typeof value === 'string' ? value.trim() : value;
}

export function useFormState(fields, initial, open) {
  const build = () => Object.fromEntries(fields.map((f) => [f.name, toFormValue(f, initial?.[f.name] ?? f.default)]));
  const [values, setValues] = useState(build);
  useEffect(() => {
    if (open) setValues(build());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [values, setValues];
}

export function FormFields({ fields, values, setValues, errors = {} }) {
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
      {fields.map((f) => {
        if (f.show && !f.show(values)) return null;
        const id = `f-${f.name}`;
        const error = errors[f.name];
        const options = typeof f.options === 'function' ? f.options(values) : f.options;
        const common = { id, name: f.name, invalid: !!error, required: f.required, placeholder: f.placeholder, disabled: f.disabled };
        let control;
        switch (f.type) {
          case 'textarea':
            control = <Textarea {...common} rows={f.rows ?? 3} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
            break;
          case 'select':
            control = (
              <Select
                {...common}
                value={values[f.name] ?? ''}
                onChange={(e) => {
                  set(f.name, e.target.value);
                  f.onChange?.(e.target.value, setValues);
                }}
                options={options ?? []}
                placeholder={f.required && !f.allowEmpty ? (values[f.name] === '' ? 'Selecciona…' : undefined) : f.emptyLabel ?? 'Ninguno'}
              />
            );
            break;
          case 'switch':
            control = <Switch checked={!!values[f.name]} onChange={(v) => set(f.name, v)} label={f.switchLabel ?? f.label} description={f.description} />;
            break;
          case 'money':
            control = (
              <div className="relative">
                <Input {...common} inputMode="decimal" className="pr-8 num" value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">€</span>
              </div>
            );
            break;
          case 'percent':
            control = (
              <div className="relative">
                <Input {...common} inputMode="decimal" className="pr-8 num" value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">%</span>
              </div>
            );
            break;
          default:
            control = (
              <Input
                {...common}
                type={f.type === 'tags' || f.type === 'number' ? 'text' : f.type ?? 'text'}
                inputMode={f.type === 'number' ? 'numeric' : undefined}
                autoComplete={f.autoComplete ?? 'off'}
                className={f.mono ? 'mono' : undefined}
                value={values[f.name]}
                onChange={(e) => set(f.name, e.target.value)}
              />
            );
        }
        return (
          <Field key={f.name} label={f.type === 'switch' ? null : `${f.label}${f.required ? ' *' : ''}`} htmlFor={id} error={error} hint={f.hint} className={cx(f.span === 2 && 'sm:col-span-2')}>
            {control}
          </Field>
        );
      })}
    </div>
  );
}

export function collectValues(fields, values) {
  const out = {};
  for (const f of fields) {
    if (f.show && !f.show(values)) continue;
    if (f.readOnly) continue;
    out[f.name] = fromFormValue(f, values[f.name]);
  }
  return out;
}

function localErrors(fields, values) {
  const errors = {};
  for (const f of fields) {
    if (f.show && !f.show(values)) continue;
    const v = values[f.name];
    if (f.required && (v === '' || v == null)) errors[f.name] = 'Obligatorio';
    if (f.type === 'money' && v !== '' && Number.isNaN(toCents(v))) errors[f.name] = 'Importe no válido';
    if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.name] = 'Email no válido';
  }
  return errors;
}

export function FormModal({ open, onClose, title, subtitle, icon, fields, initial, onSubmit, submitLabel = 'Guardar', size = 'md', children, notice }) {
  const [values, setValues] = useFormState(fields, initial, open);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (open) {
      setErrors({});
      setFormError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    const local = localErrors(fields, values);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await onSubmit(collectValues(fields, values), values);
      onClose();
    } catch (err) {
      setErrors(err.fields ?? {});
      setFormError(err.fields && Object.keys(err.fields).length ? null : err.message);
      setBusy(false);
    }
  };

  const unknownFieldErrors = useMemo(() => Object.entries(errors).filter(([k]) => !fields.some((f) => f.name === k)), [errors, fields]);

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        {notice && <div className="mb-4">{notice}</div>}
        <FormFields fields={fields} values={values} setValues={setValues} errors={errors} />
        {children?.(values, setValues)}
        {(formError || unknownFieldErrors.length > 0) && (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">{formError ?? unknownFieldErrors.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
