import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Banknote, Download, Eye, FileCheck2, Fingerprint, Mail, MoreHorizontal, Pencil, Receipt, Send, Trash2, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, download, emitRefresh, openPdf } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { date, dateTime, money, todayIso } from '../../lib/format.js';
import { INVOICE_STATUS, PAYMENT_METHOD } from '../../lib/labels.js';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { Badge, Button, DemoTag, ErrorState, Field, Glass, IconButton, Input, LabelBadge, Menu, Notice, PageHeader, Progress, Section, Skeleton } from '../../components/ui.jsx';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: inv, error, reload } = useApi(`/invoices/${id}`);
  const [issue, setIssue] = useState(false);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [pay, setPay] = useState(false);
  const [send, setSend] = useState(false);
  const [rectify, setRectify] = useState(false);
  const [remove, setRemove] = useState(false);

  if (error && !inv) return <ErrorState error={error} onRetry={reload} />;
  if (!inv) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-[480px] rounded-card" /></div>;

  const draft = inv.status === 'draft';
  const pending = inv.total_cents - inv.paid_cents;
  const open = ['issued', 'partially_paid', 'overdue'].includes(inv.status);
  const issuer = inv.issuer_snapshot;
  const client = inv.client_snapshot;
  const t = inv.totals;
  const pdfName = inv.number ? `Factura-${inv.number}.pdf` : `Borrador-${inv.id}.pdf`;

  return (
    <div>
      <PageHeader
        back={{ to: '/finanzas?tab=facturas', label: 'Facturas' }}
        eyebrow={inv.kind === 'rectifying' ? 'Factura rectificativa' : 'Factura'}
        title={<span className={inv.number ? 'mono' : ''}>{inv.number ?? `Borrador #${inv.id}`}</span>}
        subtitle={<span><Link to={`/clientes/${inv.client_id}`} className="font-medium text-brand hover:underline">{inv.client_company || inv.client_name}</Link>{inv.project_name && ` · ${inv.project_name}`}</span>}
        meta={
          <>
            <LabelBadge set={INVOICE_STATUS} value={inv.status} />
            <Badge>Serie {inv.series_code}</Badge>
            {inv.rectifies_number && <Badge tone="violet">Rectifica {inv.rectifies_number}</Badge>}
            {inv.sent_at && <Badge tone="brand"><Mail className="h-3 w-3" />Enviada {date(inv.sent_at)}</Badge>}
            {inv.is_demo ? <DemoTag /> : null}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={Eye} onClick={() => openPdf(`/invoices/${id}/pdf`).catch((e) => toast.error(e))}>Ver PDF</Button>
            <IconButton icon={Download} label="Descargar PDF" className="border border-line bg-surface/70" onClick={() => download(`/invoices/${id}/pdf?download=1`, pdfName).catch((e) => toast.error(e))} />
            {draft && can('finance.write') && <Link to={`/finanzas/facturas/${id}/editar`} className="btn-secondary"><Pencil className="h-4 w-4" />Editar</Link>}
            {draft && can('invoices.issue') && <Button icon={FileCheck2} onClick={() => setIssue(true)}>Emitir factura</Button>}
            {open && can('finance.write') && <Button icon={Banknote} onClick={() => setPay(true)}>Registrar cobro</Button>}
            {(!draft || can('finance.write')) && (
              <Menu
                trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más acciones" onClick={toggle} className="border border-line bg-surface/70" />}
                items={[
                  !draft && can('invoices.issue') && { label: 'Enviar por email', icon: Send, onClick: () => setSend(true) },
                  !draft && inv.kind !== 'rectifying' && inv.status !== 'cancelled' && can('invoices.issue') && { label: 'Crear rectificativa', icon: Undo2, onClick: () => setRectify(true) },
                  draft && can('finance.write') && { label: 'Eliminar borrador', icon: Trash2, danger: true, onClick: () => setRemove(true) },
                ]}
              />
            )}
          </>
        }
      />

      {draft && inv.blockers?.length > 0 && (
        <Notice tone="warn" className="mb-6" title="Antes de emitir, completa estos datos">
          <ul className="mt-1 list-disc pl-4">{inv.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="mt-2">
            <Link to="/configuracion?tab=empresa" className="font-medium underline">Datos de la empresa</Link> · <Link to={`/clientes/${inv.client_id}`} className="font-medium underline">Ficha del cliente</Link>
          </p>
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Glass strong className="p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div>
              <p className="text-[18px] font-semibold text-brand-deep">{issuer?.trade_name || issuer?.name || 'Datos del emisor al emitir'}</p>
              {issuer && <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-soft">{[issuer.name !== issuer.trade_name ? issuer.name : null, issuer.tax_id && `NIF ${issuer.tax_id}`, issuer.address, [issuer.postal_code, issuer.city].filter(Boolean).join(' ')].filter(Boolean).join('\n')}</p>}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[12px] uppercase tracking-[0.1em] text-ink-soft">{draft ? 'Borrador sin validez fiscal' : inv.kind === 'rectifying' ? 'Factura rectificativa' : 'Factura'}</p>
              <p className="mono mt-1 text-[16px] font-medium">{inv.number ?? '—'}</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">Emisión: {date(inv.issue_date)}</p>
              <p className="text-[12.5px] text-ink-soft">Vencimiento: {date(inv.due_date)}</p>
            </div>
          </div>
          <div className="mt-6 rounded-[16px] bg-canvas/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.1em] text-ink-soft">Facturar a</p>
            <p className="mt-1 text-[14px] font-medium">{client?.name ?? inv.client_company ?? inv.client_name}</p>
            {client && <p className="text-[12.5px] text-ink-soft">{[client.tax_id && `NIF ${client.tax_id}`, client.address, [client.postal_code, client.city, client.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>}
            {!client && <p className="text-[12px] text-ink-faint">Los datos fiscales del cliente se fijarán al emitir.</p>}
          </div>
          <div className="table-wrap mt-6">
            <table className="table">
              <thead>
                <tr><th>Concepto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Dto.</th><th className="text-right">IVA</th><th className="text-right">Importe</th></tr>
              </thead>
              <tbody>
                {inv.items.map((i) => (
                  <tr key={i.id}>
                    <td className="whitespace-pre-line">{i.description}</td>
                    <td className="num text-right">{i.quantity.toLocaleString('es-ES')}</td>
                    <td className="num text-right">{money(i.unit_price_cents)}</td>
                    <td className="num text-right">{i.discount_pct ? `${i.discount_pct} %` : '—'}</td>
                    <td className="num text-right">{i.tax_rate} %</td>
                    <td className="num text-right font-medium">{money(i.base_cents - i.discount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="num">{money(t.subtotal_cents)}</dd></div>
              {t.discount_cents !== 0 && <div className="flex justify-between"><dt className="text-ink-soft">Descuentos</dt><dd className="num">−{money(t.discount_cents)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">Base imponible</dt><dd className="num">{money(t.taxable_cents)}</dd></div>
              {t.tax_breakdown.map((b) => <div key={b.rate} className="flex justify-between"><dt className="text-ink-soft">IVA {b.rate} %</dt><dd className="num">{money(b.tax_cents)}</dd></div>)}
              {t.withholding_cents !== 0 && <div className="flex justify-between"><dt className="text-ink-soft">Retención IRPF {inv.withholding_pct} %</dt><dd className="num">−{money(t.withholding_cents)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-[17px] font-medium"><dt>Total</dt><dd className="num text-brand-deep">{money(t.total_cents)}</dd></div>
            </dl>
          </div>
          {(inv.notes || inv.footer) && <p className="mt-6 whitespace-pre-line text-[12.5px] text-ink-soft">{[inv.notes, inv.footer].filter(Boolean).join('\n\n')}</p>}
        </Glass>

        <div className="space-y-6">
          <Section title="Cobro" icon={Banknote}>
            <div className="flex items-end justify-between">
              <div><p className="text-[12px] text-ink-soft">Cobrado</p><p className="num text-[20px] font-medium">{money(inv.paid_cents)}</p></div>
              <div className="text-right"><p className="text-[12px] text-ink-soft">Pendiente</p><p className="num text-[15px] font-medium text-warn-ink">{draft || inv.status === 'cancelled' ? '—' : money(Math.max(0, pending))}</p></div>
            </div>
            <Progress className="mt-3" value={inv.total_cents > 0 ? (inv.paid_cents / inv.total_cents) * 100 : inv.status === 'paid' ? 100 : 0} tone={inv.status === 'paid' ? 'ok' : inv.status === 'overdue' ? 'danger' : 'brand'} />
            {inv.payments.length > 0 && (
              <ul className="mt-4 space-y-2">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-[12px] bg-surface/55 px-3 py-2 text-[12.5px]">
                    <span>{date(p.paid_at)} · {PAYMENT_METHOD.label(p.method)}{p.external_ref && <span className="mono text-ink-soft"> · {p.external_ref}</span>}</span>
                    <span className="num font-medium">{money(p.amount_paid_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {inv.rectifications.length > 0 && (
            <Section title="Rectificativas" icon={Undo2} flush>
              <ul className="divide-y divide-line/60 pb-2">
                {inv.rectifications.map((r) => (
                  <li key={r.id}><Link to={`/finanzas/facturas/${r.id}`} className="flex items-center justify-between px-5 py-2.5 text-[13px] hover:bg-brand-ice/40"><span className="mono">{r.number ?? `Borrador #${r.id}`}</span><span className="num">{money(r.total_cents)}</span></Link></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Registro y cumplimiento" icon={Fingerprint}>
            {draft ? (
              <p className="text-[12.5px] text-ink-soft">Al emitir se asigna el número correlativo de la serie, se congelan los datos fiscales y se genera un registro encadenado con huella SHA-256 (estructura de VeriFactu).</p>
            ) : inv.record_hash ? (
              <div className="space-y-2 text-[12px]">
                <p className="text-ink-soft">Huella del registro</p>
                <p className="mono break-all rounded-[10px] bg-surface/60 p-2 text-[11px]">{inv.record_hash}</p>
                <p className="text-ink-soft">Huella anterior: <span className="mono">{inv.prev_record_hash ? `${inv.prev_record_hash.slice(0, 16)}…` : 'primer registro'}</span></p>
                <p className="text-ink-soft">Emitida {dateTime(inv.issued_at)}</p>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-soft">Factura DEMO: sin registro encadenado.</p>
            )}
            <Notice tone="warn" className="mt-3">
              Registro preparado, <strong>no enviado a la AEAT</strong>. Antes de considerar la facturación conforme a VeriFactu o a la factura electrónica obligatoria, valida la configuración y los requisitos vigentes con tu asesoría.
            </Notice>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={issue}
        onClose={() => setIssue(false)}
        title="Emitir factura"
        message="Se asignará el siguiente número de la serie y la factura dejará de poder editarse. Para corregirla después habrá que emitir una rectificativa."
        confirmLabel="Emitir"
        onConfirm={async () => {
          try {
            await api.post(`/invoices/${id}/issue`, { issue_date: issueDate });
          } catch (err) {
            if (err.data?.problems) err.message = `${err.message}: ${err.data.problems.join(' · ')}`;
            throw err;
          }
          toast.success('Factura emitida');
          emitRefresh();
        }}
      >
        <Field label="Fecha de emisión"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
      </ConfirmDialog>
      <FormModal
        open={pay}
        onClose={() => setPay(false)}
        title="Registrar cobro"
        subtitle={`Pendiente: ${money(pending)}`}
        icon={Banknote}
        size="sm"
        fields={[
          { name: 'amount_cents', label: 'Importe recibido', type: 'money', required: true, default: pending },
          { name: 'paid_at', label: 'Fecha de cobro', type: 'date', required: true, default: todayIso() },
          { name: 'method', label: 'Método', type: 'select', options: PAYMENT_METHOD.options, required: true, default: 'transfer' },
          { name: 'external_ref', label: 'Referencia externa', mono: true },
          { name: 'notes', label: 'Observaciones', type: 'textarea' },
        ]}
        onSubmit={async (v) => {
          await api.post(`/invoices/${id}/payments`, v);
          toast.success('Pago registrado', money(v.amount_cents));
          emitRefresh();
        }}
        submitLabel="Registrar cobro"
      />
      <FormModal
        open={send}
        onClose={() => setSend(false)}
        title="Enviar factura por email"
        subtitle="Se adjunta el PDF. Requiere el correo saliente configurado en Integraciones."
        icon={Send}
        fields={[
          { name: 'to', label: 'Destinatario', type: 'email', required: true, default: inv.client_email ?? '', span: 2 },
          { name: 'subject', label: 'Asunto', required: true, default: `Factura ${inv.number ?? ''}`, span: 2 },
          { name: 'message', label: 'Mensaje', type: 'textarea', rows: 6, required: true, span: 2, default: `Hola,\n\nTe adjuntamos la factura ${inv.number ?? ''} por importe de ${money(inv.total_cents)}, con vencimiento el ${date(inv.due_date)}.\n\nGracias por confiar en nosotros.\n\nUn saludo.` },
        ]}
        onSubmit={async (v) => {
          await api.post(`/invoices/${id}/send`, v);
          toast.success('Factura enviada', v.to);
          emitRefresh();
        }}
        submitLabel="Enviar"
      />
      <FormModal
        open={rectify}
        onClose={() => setRectify(false)}
        title="Crear factura rectificativa"
        subtitle="Se crea un borrador en la serie de rectificativas con las líneas en negativo. Podrás ajustarlo antes de emitirlo."
        icon={Undo2}
        fields={[{ name: 'reason', label: 'Motivo de la rectificación', type: 'textarea', required: true, span: 2 }]}
        onSubmit={async (v) => {
          const r = await api.post(`/invoices/${id}/rectify`, v);
          toast.success('Borrador de rectificativa creado');
          emitRefresh();
          navigate(`/finanzas/facturas/${r.id}`);
        }}
        submitLabel="Crear borrador"
      />
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar borrador"
        message="El borrador no tiene número asignado y puede eliminarse."
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/invoices/${id}`);
          toast.success('Borrador eliminado');
          emitRefresh();
          navigate('/finanzas?tab=facturas');
        }}
      />
    </div>
  );
}
