import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Banknote, Copy, Download, FileText, FolderKanban, KeyRound, MoreHorizontal, Pause, Pencil, Play, Plus, Receipt, Repeat, RotateCcw, Trash2, Upload, Wallet, Zap } from 'lucide-react';
import { DataTable } from './DataTable.jsx';
import { FormModal } from './FormModal.jsx';
import { ConfirmDialog } from './Modal.jsx';
import { Badge, Button, Chips, DemoTag, EmptyState, IconButton, LabelBadge, Menu, Progress, SearchInput, cx } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, download, emitRefresh } from '../lib/api.js';
import { cancelDirectUpload, uploadFileDirect } from '../lib/direct-upload.js';
import { useApi, useDebounced, useLookups } from '../lib/hooks.js';
import { bytes, date, daysUntil, isDemoLabel, money, relative, todayIso } from '../lib/format.js';
import {
  DOC_CATEGORY, EXPENSE_CATEGORY, FREQUENCY, INVOICE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, PROJECT_STATUS, PROJECT_TYPE, RECURRING_CATEGORY, RECURRING_STATUS, SECRET_KIND,
} from '../lib/labels.js';
import { paymentFields } from '../forms.js';

const opt = (list = []) => list.map((x) => ({ value: x.id, label: x.label }));
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
export const periodLabel = (iso) => (iso ? monthFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : '');

function usePaged(path, params, defaultSort) {
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const query = { ...params, ...sort, page, pageSize: params?.pageSize ?? 15 };
  const res = useApi(path, query);
  return { ...res, sort, setSort: (s) => (setSort(s), setPage(1)), page, setPage };
}

// ── Proyectos ────────────────────────────────────────────
export function ProjectsTable({ params, empty }) {
  const navigate = useNavigate();
  const { data, loading, error, reload, sort, setSort, page, setPage } = usePaged('/projects', params, { sort: 'updated_at', dir: 'desc' });
  return (
    <DataTable
      rows={data?.items}
      loading={loading}
      error={error}
      onRetry={reload}
      sort={sort}
      onSort={setSort}
      onRowClick={(r) => navigate(`/proyectos/${r.id}`)}
      pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
      empty={empty ?? <EmptyState compact icon={FolderKanban} title="Sin proyectos" />}
      columns={[
        { key: 'name', header: 'Proyecto', sortKey: 'name', render: (r) => <span className="flex items-center gap-2 font-medium">{r.name}{isDemoLabel(r.name) && <DemoTag />}</span> },
        !params?.client_id && { key: 'client', header: 'Cliente', sortKey: 'client', hideOnMobile: true, render: (r) => r.client_company || r.client_name },
        { key: 'type', header: 'Tipo', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{PROJECT_TYPE.label(r.type)}</span> },
        { key: 'status', header: 'Estado', sortKey: 'status', render: (r) => <LabelBadge set={PROJECT_STATUS} value={r.status} /> },
        { key: 'progress', header: 'Progreso', sortKey: 'progress', hideOnMobile: true, render: (r) => <div className="flex w-28 items-center gap-2"><Progress value={r.progress} tone={r.progress === 100 ? 'ok' : 'brand'} /><span className="num w-8 text-[11.5px] text-ink-soft">{r.progress}%</span></div> },
        { key: 'due', header: 'Entrega', sortKey: 'due_date', render: (r) => <DueDate value={r.due_date} done={['finished', 'delivered', 'cancelled'].includes(r.status)} /> },
      ].filter(Boolean)}
    />
  );
}

export function DueDate({ value, done }) {
  if (!value) return <span className="text-ink-faint">—</span>;
  const d = daysUntil(value);
  const late = !done && d < 0;
  const soon = !done && d >= 0 && d <= 7;
  return <span className={cx('num whitespace-nowrap', late ? 'font-medium text-danger' : soon ? 'text-warn-ink' : 'text-ink-soft')}>{date(value)}{late && ' · vencido'}</span>;
}

// ── Facturas ─────────────────────────────────────────────
export function InvoicesTable({ params, empty, pageSize }) {
  const navigate = useNavigate();
  const { data, loading, error, reload, sort, setSort, page, setPage } = usePaged('/invoices', { ...params, pageSize }, { sort: 'created_at', dir: 'desc' });
  return (
    <DataTable
      rows={data?.items}
      loading={loading}
      error={error}
      onRetry={reload}
      sort={sort}
      onSort={setSort}
      onRowClick={(r) => navigate(`/finanzas/facturas/${r.id}`)}
      pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
      empty={empty ?? <EmptyState compact icon={Receipt} title="Sin facturas" />}
      columns={[
        { key: 'number', header: 'Número', sortKey: 'number', render: (r) => (r.number ? <span className="mono font-medium">{r.number}</span> : <span className="text-ink-soft">Borrador #{r.id}</span>) },
        !params?.client_id && { key: 'client', header: 'Cliente', sortKey: 'client', render: (r) => <span className="flex items-center gap-2">{r.client_company || r.client_name}{r.is_demo ? <DemoTag /> : null}</span> },
        { key: 'issue', header: 'Emisión', sortKey: 'issue_date', hideOnMobile: true, render: (r) => <span className="num text-ink-soft">{date(r.issue_date)}</span> },
        { key: 'due', header: 'Vencimiento', sortKey: 'due_date', hideOnMobile: true, render: (r) => <DueDate value={r.due_date} done={['paid', 'cancelled', 'draft'].includes(r.status)} /> },
        { key: 'total', header: 'Total', sortKey: 'total', align: 'right', render: (r) => <span className="num font-medium">{money(r.total_cents)}</span> },
        { key: 'pending', header: 'Pendiente', align: 'right', hideOnMobile: true, render: (r) => (['issued', 'partially_paid', 'overdue'].includes(r.status) ? <span className="num text-warn-ink">{money(r.total_cents - r.paid_cents)}</span> : <span className="text-ink-faint">—</span>) },
        { key: 'status', header: 'Estado', sortKey: 'status', render: (r) => <LabelBadge set={INVOICE_STATUS} value={r.status} /> },
      ].filter(Boolean)}
    />
  );
}

// ── Cobros ───────────────────────────────────────────────
export function CollectModal({ payment, onClose }) {
  const toast = useToast();
  const remaining = payment ? payment.amount_cents - payment.amount_paid_cents : 0;
  return (
    <FormModal
      open={!!payment}
      onClose={onClose}
      title="Registrar cobro"
      subtitle={payment ? `${payment.concept} · pendiente ${money(remaining)}` : ''}
      icon={Banknote}
      size="sm"
      fields={[
        { name: 'amount_cents', label: 'Importe recibido', type: 'money', required: true, default: remaining },
        { name: 'paid_at', label: 'Fecha de cobro', type: 'date', required: true, default: todayIso() },
        { name: 'method', label: 'Método', type: 'select', options: PAYMENT_METHOD.options, required: true, default: payment?.method ?? 'transfer' },
        { name: 'external_ref', label: 'Referencia externa', mono: true },
      ]}
      onSubmit={async (v) => {
        await api.post(`/payments/${payment.id}/collect`, v);
        toast.success('Pago registrado', money(v.amount_cents));
        emitRefresh();
      }}
      submitLabel="Registrar cobro"
    />
  );
}

export function PaymentsTable({ params, empty }) {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects']);
  const { data, loading, error, reload, sort, setSort, page, setPage } = usePaged('/payments', params, { sort: 'issued_on', dir: 'desc' });
  const [collect, setCollect] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const open = (r) => ['pending', 'partially_paid', 'overdue'].includes(r.status);
  return (
    <>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        sort={sort}
        onSort={setSort}
        pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
        empty={empty ?? <EmptyState compact icon={Wallet} title="Sin cobros registrados" />}
        columns={[
          {
            key: 'concept',
            header: 'Concepto',
            render: (r) => (
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{r.concept}</span>
                  <Badge tone={r.recurring_payment_id ? 'violet' : 'brand'}>{r.recurring_payment_id ? (r.recurring_frequency === 'monthly' ? 'Mensualidad' : 'Cuota') : 'Entrada'}</Badge>
                </p>
                {r.invoice_number && <p className="mono text-[11.5px] text-ink-soft">Factura {r.invoice_number}</p>}
                {r.recurring_payment_id && r.period_date && <p className="text-[11.5px] capitalize text-ink-soft">{periodLabel(r.period_date)}</p>}
              </div>
            ),
          },
          !params?.client_id && { key: 'client', header: 'Cliente', sortKey: 'client', hideOnMobile: true, render: (r) => r.client_company || r.client_name },
          { key: 'date', header: 'Fecha', sortKey: 'issued_on', hideOnMobile: true, render: (r) => <span className="num text-ink-soft">{date(r.issued_on)}</span> },
          { key: 'due', header: 'Vencimiento', sortKey: 'due_date', render: (r) => (open(r) ? <DueDate value={r.due_date} /> : <span className="num text-ink-soft">{r.paid_at ? `Cobrado ${date(r.paid_at)}` : '—'}</span>) },
          { key: 'amount', header: 'Importe', sortKey: 'amount', align: 'right', render: (r) => <span className="num font-medium">{money(r.amount_cents)}</span> },
          { key: 'paid', header: 'Cobrado', align: 'right', hideOnMobile: true, render: (r) => <span className="num text-ink-soft">{money(r.amount_paid_cents)}</span> },
          { key: 'method', header: 'Método', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{r.method ? PAYMENT_METHOD.label(r.method) : '—'}</span> },
          { key: 'status', header: 'Estado', sortKey: 'status', render: (r) => <LabelBadge set={PAYMENT_STATUS} value={r.status} /> },
          can('finance.write') && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {open(r) && !r.invoice_id && (
                  <Button size="sm" variant="secondary" onClick={() => setCollect(r)}>
                    Cobrar
                  </Button>
                )}
                {!r.invoice_id && (
                  <Menu
                    trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más acciones" onClick={toggle} className="h-8 w-8" />}
                    items={[
                      { label: 'Editar', icon: Pencil, onClick: () => setEdit(r) },
                      r.status !== 'cancelled' && r.amount_paid_cents === 0 && { label: 'Cancelar cobro', icon: Ban, onClick: () => setConfirm({ row: r, status: 'cancelled' }) },
                      r.amount_paid_cents > 0 && r.status !== 'refunded' && { label: 'Marcar como reembolsado', icon: RotateCcw, onClick: () => setConfirm({ row: r, status: 'refunded' }) },
                      ['cancelled', 'refunded'].includes(r.status) && { label: 'Reactivar', icon: Play, onClick: () => setConfirm({ row: r, status: null }) },
                    ]}
                  />
                )}
              </div>
            ),
          },
        ].filter(Boolean)}
      />
      <CollectModal payment={collect} onClose={() => setCollect(null)} />
      <FormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar cobro"
        icon={Wallet}
        fields={paymentFields(lk)}
        initial={edit}
        onSubmit={async (v) => {
          await api.patch(`/payments/${edit.id}`, v);
          toast.success('Cobro actualizado');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.status === 'cancelled' ? 'Cancelar cobro' : confirm?.status === 'refunded' ? 'Marcar como reembolsado' : 'Reactivar cobro'}
        message={confirm && `${confirm.row.concept} · ${money(confirm.row.amount_cents)}. Quedará registrado en la auditoría.`}
        tone={confirm?.status ? 'danger' : 'primary'}
        confirmLabel="Confirmar"
        onConfirm={async () => {
          await api.patch(`/payments/${confirm.row.id}`, { status: confirm.status });
          toast.success('Cobro actualizado');
          emitRefresh();
        }}
      />
    </>
  );
}

// ── Pagos recurrentes ────────────────────────────────────
export const recurringFields = (lk, { creating = false } = {}) => [
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, required: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => opt((lk.projects ?? []).filter((p) => !v.client_id || String(p.client_id) === String(v.client_id))) },
  { name: 'concept', label: 'Concepto', required: true, span: 2 },
  { name: 'category', label: 'Tipo', type: 'select', options: RECURRING_CATEGORY.options, required: true, default: 'maintenance' },
  { name: 'amount_cents', label: 'Cuota', type: 'money', required: true, hint: 'Importe que se cobra en cada periodo' },
  { name: 'frequency', label: 'Periodicidad', type: 'select', options: FREQUENCY.options, required: true, default: 'monthly' },
  { name: 'start_date', label: 'Primera cuota', type: 'date', required: true, default: todayIso() },
  !creating && { name: 'next_due_date', label: 'Próximo vencimiento', type: 'date' },
  creating && { name: 'first_paid', label: 'Primera cuota', type: 'switch', switchLabel: 'La primera cuota ya está cobrada', description: 'Se registra como pagada y el siguiente cobro pasa al mes siguiente', span: 2 },
  creating && { name: 'first_paid_at', label: 'Fecha de cobro', type: 'date', default: todayIso(), show: (v) => v.first_paid },
  creating && { name: 'first_method', label: 'Método de pago', type: 'select', options: PAYMENT_METHOD.options, default: 'transfer', show: (v) => v.first_paid },
  { name: 'end_date', label: 'Fin (opcional)', type: 'date' },
  { name: 'reminder_days', label: 'Avisar con antelación (días)', type: 'number', default: 7 },
  { name: 'auto_generate', label: 'Generar cobro', type: 'switch', switchLabel: 'Generar el cobro automáticamente al vencer', default: true, span: 2 },
  { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
].filter(Boolean);

export function RecurringTable({ params, empty }) {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects']);
  const { data, loading, error, reload } = useApi('/recurring', params);
  const [edit, setEdit] = useState(null);
  const act = async (fn, msg) => {
    try {
      await fn();
      toast.success(msg);
      emitRefresh();
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={empty ?? <EmptyState compact icon={Repeat} title="Sin cuotas mensuales" description="Da de alta la cuota de cada cliente (mantenimiento, hosting, suscripción) y los cobros de cada mes se generarán solos." />}
        columns={[
          { key: 'concept', header: 'Concepto', render: (r) => <div><p className="font-medium">{r.concept}</p><p className="text-[11.5px] text-ink-soft">{RECURRING_CATEGORY.label(r.category)}</p></div> },
          !params?.client_id && { key: 'client', header: 'Cliente', hideOnMobile: true, render: (r) => r.client_company || r.client_name },
          { key: 'amount', header: 'Importe', align: 'right', render: (r) => <span className="num font-medium">{money(r.amount_cents)}</span> },
          { key: 'freq', header: 'Periodicidad', hideOnMobile: true, render: (r) => FREQUENCY.label(r.frequency) },
          { key: 'next', header: 'Próximo', render: (r) => (r.status === 'active' ? <DueDate value={r.next_due_date} /> : <span className="text-ink-faint">—</span>) },
          { key: 'state', header: 'Cobros', render: (r) => <div className="text-[12px]">{r.pending_count ? <p className="font-medium text-warn-ink">{r.pending_count} {r.pending_count === 1 ? 'cuota pendiente' : 'cuotas pendientes'} · {money(r.pending_cents)}</p> : <p className="text-[#0E7A4E]">Al día</p>}<p className="text-ink-soft">{r.last_paid_at ? `Último cobro ${date(r.last_paid_at)}` : 'Sin cobros todavía'}</p></div> },
          { key: 'status', header: 'Estado', render: (r) => <LabelBadge set={RECURRING_STATUS} value={r.status} /> },
          can('finance.write') && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <Menu
                trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                items={[
                  r.status === 'active' && { label: 'Generar cobro del próximo periodo', icon: Zap, onClick: () => act(() => api.post(`/recurring/${r.id}/generate`), 'Cobro generado') },
                  { label: 'Editar', icon: Pencil, onClick: () => setEdit(r) },
                  r.status === 'active' && { label: 'Pausar', icon: Pause, onClick: () => act(() => api.patch(`/recurring/${r.id}`, { status: 'paused' }), 'Pago recurrente pausado') },
                  r.status !== 'active' && { label: 'Reactivar', icon: Play, onClick: () => act(() => api.patch(`/recurring/${r.id}`, { status: 'active' }), 'Pago recurrente reactivado') },
                  r.status !== 'cancelled' && { label: 'Cancelar', icon: Ban, danger: true, onClick: () => act(() => api.patch(`/recurring/${r.id}`, { status: 'cancelled' }), 'Pago recurrente cancelado') },
                ]}
              />
            ),
          },
        ].filter(Boolean)}
      />
      <FormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar pago recurrente"
        icon={Repeat}
        fields={recurringFields(lk)}
        initial={edit}
        onSubmit={async (v) => {
          await api.patch(`/recurring/${edit.id}`, v);
          toast.success('Pago recurrente actualizado');
          emitRefresh();
        }}
      />
    </>
  );
}

// ── Gastos ───────────────────────────────────────────────
export function ExpensesTable({ params, onEdit }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload, sort, setSort, page, setPage } = usePaged('/expenses', params, { sort: 'date', dir: 'desc' });
  const [remove, setRemove] = useState(null);
  return (
    <>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        sort={sort}
        onSort={setSort}
        pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
        empty={<EmptyState compact icon={Wallet} title="Sin gastos registrados" description="Registra proveedores, licencias, hosting y colaboradores para calcular el beneficio real." />}
        columns={[
          { key: 'concept', header: 'Concepto', render: (r) => <div><p className="font-medium">{r.concept}</p><p className="text-[11.5px] text-ink-soft">{r.supplier}</p></div> },
          { key: 'category', header: 'Categoría', sortKey: 'category', hideOnMobile: true, render: (r) => <Badge tone="mute">{EXPENSE_CATEGORY.label(r.category)}</Badge> },
          { key: 'date', header: 'Fecha', sortKey: 'date', render: (r) => <span className="num text-ink-soft">{date(r.date)}</span> },
          { key: 'link', header: 'Relacionado', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{[r.client_name, r.project_name, r.server_name].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'amount', header: 'Importe', sortKey: 'amount', align: 'right', render: (r) => <span className="num font-medium">{money(r.amount_cents)}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                {r.document_id && r.document_name && <IconButton icon={FileText} label="Descargar justificante" className="h-8 w-8" onClick={() => download(`/documents/${r.document_id}/download`).catch((e) => toast.error(e))} />}
                {can('finance.write') && (
                  <Menu
                    trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                    items={[
                      { label: 'Editar', icon: Pencil, onClick: () => onEdit(r) },
                      { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setRemove(r) },
                    ]}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Eliminar gasto"
        message={remove && `${remove.concept} · ${money(remove.amount_cents)}`}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/expenses/${remove.id}`);
          toast.success('Gasto eliminado');
          emitRefresh();
        }}
      />
    </>
  );
}

// ── Documentos y credenciales ────────────────────────────
function UploadModal({ open, onClose, clientId, projectId }) {
  const toast = useToast();
  const lk = useLookups(['clients', 'projects']);
  const [file, setFile] = useState(null);
  return (
    <FormModal
      open={open}
      onClose={() => {
        setFile(null);
        onClose();
      }}
      title="Subir documento"
      subtitle="Máximo 25 MB. El archivo se sube directamente al almacenamiento privado y solo se descarga con sesión iniciada."
      icon={Upload}
      fields={[
        { name: 'title', label: 'Título', placeholder: 'Por defecto, el nombre del archivo', span: 2 },
        { name: 'category', label: 'Categoría', type: 'select', options: DOC_CATEGORY.options, required: true, default: 'other' },
        { name: 'tags', label: 'Etiquetas', type: 'tags', placeholder: 'firmado, 2026…' },
        { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients), default: clientId },
        { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: (v) => opt((lk.projects ?? []).filter((p) => !v.client_id || String(p.client_id) === String(v.client_id))), default: projectId },
        { name: 'description', label: 'Descripción', type: 'textarea', span: 2 },
      ]}
      onSubmit={async (v) => {
        if (!file) throw Object.assign(new Error('Selecciona un archivo'), { fields: { file: 'Obligatorio' } });
        const direct = await uploadFileDirect(file);
        if (direct) {
          try {
            await api.post('/documents/complete', { ...direct, ...v });
          } catch (error) {
            await cancelDirectUpload(direct.storage_key);
            throw error;
          }
          toast.success('Documento subido');
          setFile(null);
          emitRefresh();
          return;
        }
        const form = new FormData();
        form.append('file', file);
        Object.entries(v).forEach(([k, val]) => val != null && form.append(k, Array.isArray(val) ? val.join(',') : val));
        await api.upload('/documents', form);
        toast.success('Documento subido');
        setFile(null);
        emitRefresh();
      }}
      submitLabel="Subir"
    >
      {() => (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[16px] border border-dashed border-brand/30 bg-brand-ice/40 px-4 py-6 text-center transition-colors hover:bg-brand-ice/70">
          <Upload className="mb-2 h-5 w-5 text-brand" />
          <span className="text-[13px] font-medium">{file ? file.name : 'Selecciona un archivo'}</span>
          <span className="text-[11.5px] text-ink-soft">{file ? bytes(file.size) : 'PDF, imágenes, documentos de Office, ZIP…'}</span>
          <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
    </FormModal>
  );
}

export function DocumentsPanel({ clientId, projectId, showFilters = true }) {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const debounced = useDebounced(q);
  const { data, loading, error, reload, sort, setSort, page, setPage } = usePaged('/documents', { client_id: clientId, project_id: projectId, q: debounced, category }, { sort: 'created_at', dir: 'desc' });
  const [upload, setUpload] = useState(false);
  const [edit, setEdit] = useState(null);
  const [remove, setRemove] = useState(null);
  const lk = useLookups(['clients', 'projects']);

  return (
    <div>
      <div className="flex flex-col gap-3 px-5 pb-3 sm:flex-row sm:items-center">
        {showFilters && <SearchInput value={q} onChange={setQ} placeholder="Buscar por título, archivo o etiqueta…" className="sm:max-w-xs sm:flex-1" />}
        <div className="flex-1 overflow-x-auto">{showFilters && <Chips options={[{ value: '', label: 'Todas' }, ...DOC_CATEGORY.options]} value={category} onChange={setCategory} />}</div>
        {can('documents.write') && (
          <Button icon={Upload} onClick={() => setUpload(true)} className="shrink-0">
            Subir documento
          </Button>
        )}
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        sort={sort}
        onSort={setSort}
        pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
        empty={<EmptyState compact icon={FileText} title="Sin documentos" description="Contratos, presupuestos, manuales y entregables quedarán organizados aquí." />}
        columns={[
          {
            key: 'title',
            header: 'Documento',
            sortKey: 'title',
            render: (r) => (
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-ice text-brand">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-[11.5px] text-ink-soft">
                    {r.file_name} · {bytes(r.size_bytes)}
                  </p>
                </div>
              </div>
            ),
          },
          { key: 'category', header: 'Categoría', sortKey: 'category', render: (r) => <Badge tone="brand">{DOC_CATEGORY.label(r.category)}</Badge> },
          !clientId && { key: 'client', header: 'Cliente', sortKey: 'client', hideOnMobile: true, render: (r) => r.client_name ?? <span className="text-ink-faint">—</span> },
          { key: 'tags', header: 'Etiquetas', hideOnMobile: true, render: (r) => <div className="flex flex-wrap gap-1">{r.tags?.map((t) => <Badge key={t}>{t}</Badge>)}</div> },
          { key: 'created', header: 'Subido', sortKey: 'created_at', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{relative(r.created_at)} · {r.uploaded_by_name ?? '—'}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <IconButton icon={Download} label="Descargar" className="h-8 w-8" onClick={() => download(`/documents/${r.id}/download`, r.file_name).catch((e) => toast.error(e))} />
                {(can('documents.write') || can('documents.delete')) && (
                  <Menu
                    trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                    items={[can('documents.write') && { label: 'Editar datos', icon: Pencil, onClick: () => setEdit(r) }, can('documents.delete') && { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setRemove(r) }]}
                  />
                )}
              </div>
            ),
          },
        ].filter(Boolean)}
      />
      <UploadModal open={upload} onClose={() => setUpload(false)} clientId={clientId} projectId={projectId} />
      <FormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar documento"
        icon={FileText}
        fields={[
          { name: 'title', label: 'Título', required: true, span: 2 },
          { name: 'category', label: 'Categoría', type: 'select', options: DOC_CATEGORY.options, required: true },
          { name: 'tags', label: 'Etiquetas', type: 'tags' },
          { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
          { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: opt(lk.projects) },
          { name: 'description', label: 'Descripción', type: 'textarea', span: 2 },
        ]}
        initial={edit}
        onSubmit={async (v) => {
          await api.patch(`/documents/${edit.id}`, v);
          toast.success('Documento actualizado');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Eliminar documento"
        message={remove && `«${remove.title}» dejará de estar disponible. La eliminación queda registrada en la auditoría.`}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/documents/${remove.id}`);
          toast.success('Documento eliminado');
          emitRefresh();
        }}
      />
    </div>
  );
}

const secretFields = (lk) => [
  { name: 'label', label: 'Nombre', required: true, placeholder: 'FTP producción, panel WordPress…' },
  { name: 'kind', label: 'Tipo', type: 'select', options: SECRET_KIND.options, required: true, default: 'password' },
  { name: 'username', label: 'Usuario', mono: true },
  { name: 'url', label: 'URL de acceso', type: 'url', mono: true },
  { name: 'client_id', label: 'Cliente', type: 'select', numeric: true, options: opt(lk.clients) },
  { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: opt(lk.projects) },
  { name: 'server_id', label: 'Servidor', type: 'select', numeric: true, options: opt(lk.servers) },
  { name: 'database_id', label: 'Base de datos', type: 'select', numeric: true, options: opt(lk.databases) },
  { name: 'notes', label: 'Notas', type: 'textarea', span: 2 },
];

/** Almacén de credenciales: el valor nunca se muestra; se copia al portapapeles tras confirmar la contraseña. */
export function SecretsPanel({ params }) {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects', 'servers', 'databases']);
  const { data, loading, error, reload } = useApi('/secrets', params);
  const [form, setForm] = useState(null);
  const [use, setUse] = useState(null);
  const [remove, setRemove] = useState(null);
  return (
    <div>
      {can('secrets.write') && (
        <div className="flex justify-end px-5 pb-3">
          <Button variant="secondary" icon={Plus} onClick={() => setForm({ ...params })}>
            Guardar credencial
          </Button>
        </div>
      )}
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<EmptyState compact icon={KeyRound} title="Sin credenciales guardadas" description="Los valores se cifran con AES-256-GCM y nunca se muestran en pantalla." />}
        columns={[
          { key: 'label', header: 'Credencial', render: (r) => <div><p className="font-medium">{r.label}</p><p className="text-[11.5px] text-ink-soft">{SECRET_KIND.label(r.kind)}</p></div> },
          { key: 'user', header: 'Usuario', render: (r) => (r.username ? <span className="mono">{r.username}</span> : <span className="text-ink-faint">—</span>) },
          { key: 'value', header: 'Valor', render: () => <span className="mono tracking-widest text-ink-faint">••••••••</span> },
          { key: 'rel', header: 'Relacionado', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{[r.client_name, r.project_name, r.server_name, r.database_name].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'used', header: 'Último uso', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{r.last_used_at ? relative(r.last_used_at) : 'Nunca'}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" icon={Copy} onClick={() => setUse(r)}>
                  Copiar
                </Button>
                {can('secrets.write') && (
                  <Menu
                    trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                    items={[{ label: 'Editar / rotar valor', icon: Pencil, onClick: () => setForm(r) }, { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setRemove(r) }]}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar credencial' : 'Guardar credencial'}
        icon={KeyRound}
        fields={[...secretFields(lk), { name: 'value', label: form?.id ? 'Nuevo valor (opcional)' : 'Valor secreto', type: 'password', required: !form?.id, autoComplete: 'new-password', span: 2, hint: 'Se cifra en el servidor. No se podrá ver, solo copiar.' }]}
        initial={form}
        onSubmit={async (v) => {
          if (!v.value) delete v.value;
          if (form.id) await api.patch(`/secrets/${form.id}`, v);
          else await api.post('/secrets', v);
          toast.success('Credencial guardada');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!use}
        onClose={() => setUse(null)}
        title="Copiar credencial"
        message={use && `Confirma tu contraseña para copiar «${use.label}» al portapapeles. El valor no se mostrará y el uso queda auditado.`}
        requirePassword
        confirmLabel="Copiar al portapapeles"
        onConfirm={async ({ password }) => {
          const { value } = await api.post(`/secrets/${use.id}/use`, { password });
          await navigator.clipboard.writeText(value);
          toast.success('Copiado al portapapeles', 'Pégalo donde lo necesites; no se ha mostrado en pantalla.');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Eliminar credencial"
        message={remove && `«${remove.label}» se eliminará definitivamente.`}
        tone="danger"
        requirePassword
        confirmLabel="Eliminar"
        onConfirm={async ({ password }) => {
          await api.del(`/secrets/${remove.id}`, { password });
          toast.success('Credencial eliminada');
          emitRefresh();
        }}
      />
    </div>
  );
}
