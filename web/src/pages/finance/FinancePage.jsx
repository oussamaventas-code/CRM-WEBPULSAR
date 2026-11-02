import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banknote, CalendarClock, CreditCard, Hourglass, LayoutDashboard, PiggyBank, Plus, Receipt, Repeat, TrendingUp, TriangleAlert, Upload, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useQuickActions } from '../../layout/QuickActions.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { cancelDirectUpload, uploadFileDirect } from '../../lib/direct-upload.js';
import { useApi, useDebounced, useLookups } from '../../lib/hooks.js';
import { bytes, money, todayIso } from '../../lib/format.js';
import { EXPENSE_CATEGORY, INVOICE_STATUS, PAYMENT_METHOD } from '../../lib/labels.js';
import { FormModal } from '../../components/FormModal.jsx';
import { Badge, Button, Chips, EmptyState, Glass, PageHeader, SearchInput, Section, Skeleton, Tabs } from '../../components/ui.jsx';
import { KpiCard } from '../../components/KpiCard.jsx';
import { FinanceSection } from '../../components/FinanceSection.jsx';
import { DueDate, ExpensesTable, InvoicesTable, PaymentsTable, RecurringTable, recurringFields } from '../../components/lists.jsx';

const opt = (list = []) => list.map((x) => ({ value: x.id, label: x.label }));

function SummaryTab() {
  const { data, loading } = useApi('/finance/summary');
  const t = data?.totals;
  const maxCat = Math.max(1, ...(data?.expenses_by_category ?? []).map((c) => c.amount_cents));
  const short = (v) => money(v, { short: Math.abs(v) >= 100000 });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Receipt} label="Facturación total" loading={loading && !data} value={t?.billed_cents} format={short} description={t ? `${t.draft_invoices} borradores sin emitir` : ''} />
        <KpiCard icon={Banknote} tone="ok" label="Ingresos cobrados" loading={loading && !data} value={t?.collected_cents} format={short} description={t ? `${short(t.collected_year_cents)} este año` : ''} />
        <KpiCard icon={Hourglass} tone="warn" label="Pagos pendientes" loading={loading && !data} value={t?.outstanding_cents} format={short} description="Facturas emitidas y cobros sin cobrar" />
        <KpiCard icon={TriangleAlert} tone="danger" label="Facturas y cobros vencidos" loading={loading && !data} value={t?.overdue_cents} format={short} description={t ? `${t.overdue_count} documentos vencidos` : ''} alert={t?.overdue_cents > 0} />
        <KpiCard icon={Wallet} tone="violet" label="Gastos del año" loading={loading && !data} value={t?.expenses_year_cents} format={short} description="Registrados en Gastos" />
        <KpiCard icon={PiggyBank} tone="deep" label="Beneficio estimado (año)" loading={loading && !data} value={t?.profit_year_cents} format={short} description="Cobrado − gastos del año" />
        <KpiCard icon={Repeat} tone="ok" label="Ingresos recurrentes" loading={loading && !data} value={t?.mrr_cents} format={short} description={t ? `Mensual equivalente · ${t.recurring_active} activos` : ''} />
        <KpiCard icon={TrendingUp} label="Anual recurrente estimado" loading={loading && !data} value={t ? t.mrr_cents * 12 : null} format={short} description="Ingresos recurrentes × 12" />
      </div>
      <FinanceSection defaultRange="12m" title="Evolución" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Próximos vencimientos" icon={CalendarClock} flush>
          {loading && !data ? (
            <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
          ) : !data.upcoming.length ? (
            <EmptyState compact icon={CalendarClock} title="Nada pendiente de cobro" />
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.upcoming.map((u) => (
                <li key={`${u.kind}${u.id}`}>
                  <Link to={u.kind === 'invoice' ? `/finanzas/facturas/${u.id}` : u.kind === 'payment' ? '/finanzas?tab=cobros' : '/finanzas?tab=recurrentes'} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-ice/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{u.kind === 'invoice' ? `Factura ${u.label}` : u.label}</p>
                      <p className="truncate text-[11.5px] text-ink-soft">{u.client_name} · {u.kind === 'recurring' ? 'Recurrente programado' : u.kind === 'invoice' ? INVOICE_STATUS.label(u.status) : 'Cobro'}</p>
                    </div>
                    <span className="num text-[13px] font-medium">{money(u.amount_cents)}</span>
                    <span className="w-28 text-right text-[12px]"><DueDate value={u.due_date} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Gastos por categoría (año)" icon={Wallet}>
          {!data?.expenses_by_category?.length ? (
            <EmptyState compact icon={Wallet} title="Sin gastos este año" />
          ) : (
            <ul className="space-y-3">
              {data.expenses_by_category.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-[12.5px]"><span>{EXPENSE_CATEGORY.label(c.category)}</span><span className="num font-medium">{money(c.amount_cents)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EEF2F7]"><div className="h-full rounded-full bg-[#8067E8]" style={{ width: `${(c.amount_cents / maxCat) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

const INVOICE_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'issued,partially_paid,overdue', label: 'Pendientes de cobro' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Cobradas' },
  { value: 'cancelled', label: 'Anuladas' },
];
const PAYMENT_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending,partially_paid,overdue', label: 'Pendientes' },
  { value: 'overdue', label: 'Vencidos' },
  { value: 'paid', label: 'Pagados' },
  { value: 'cancelled,refunded', label: 'Cancelados y reembolsados' },
];

function ListTab({ kind, empty }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const isInvoice = kind === 'invoices';
  return (
    <Glass className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line/60 px-5 py-4 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder={isInvoice ? 'Buscar por número o cliente…' : 'Buscar por concepto, cliente o referencia…'} className="lg:w-80" />
        <div className="overflow-x-auto"><Chips options={isInvoice ? INVOICE_FILTERS : PAYMENT_FILTERS} value={status} onChange={setStatus} /></div>
      </div>
      {isInvoice ? <InvoicesTable params={{ status, q: search }} pageSize={20} /> : <PaymentsTable params={{ status, q: search, kind, pageSize: 20 }} empty={empty} />}
    </Glass>
  );
}

function ExpensesTab({ formOpen, setFormOpen }) {
  const toast = useToast();
  const lk = useLookups(['clients', 'projects', 'servers']);
  const [edit, setEdit] = useState(null);
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const fields = [
    { name: 'supplier', label: 'Proveedor', required: true },
    { name: 'concept', label: 'Concepto', required: true },
    { name: 'amount_cents', label: 'Importe total', type: 'money', required: true },
    { name: 'tax_cents', label: 'IVA incluido (opcional)', type: 'money' },
    { name: 'date', label: 'Fecha', type: 'date', required: true, default: todayIso() },
    { name: 'category', label: 'Categoría', type: 'select', options: EXPENSE_CATEGORY.options, required: true, default: 'hosting' },
    { name: 'payment_method', label: 'Método de pago', type: 'select', options: PAYMENT_METHOD.options },
    { name: 'client_id', label: 'Cliente relacionado', type: 'select', numeric: true, options: opt(lk.clients) },
    { name: 'project_id', label: 'Proyecto relacionado', type: 'select', numeric: true, options: (v) => opt((lk.projects ?? []).filter((p) => !v.client_id || String(p.client_id) === String(v.client_id))) },
    { name: 'server_id', label: 'Servidor relacionado', type: 'select', numeric: true, options: opt(lk.servers) },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];
  return (
    <>
      <Glass className="overflow-hidden">
        <div className="border-b border-line/60 px-5 py-4">
          <Chips options={[{ value: '', label: 'Todas' }, ...EXPENSE_CATEGORY.options]} value={category} onChange={setCategory} />
        </div>
        <ExpensesTable params={{ category, pageSize: 20 }} onEdit={setEdit} />
      </Glass>
      <FormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setFile(null);
        }}
        title="Registrar gasto"
        icon={Wallet}
        size="lg"
        fields={fields}
        onSubmit={async (v) => {
          const direct = file ? await uploadFileDirect(file) : null;
          if (direct) {
            try {
              await api.post('/expenses', { ...v, upload: direct });
            } catch (error) {
              await cancelDirectUpload(direct.storage_key);
              throw error;
            }
            toast.success('Gasto registrado');
            setFile(null);
            emitRefresh();
            return;
          }
          const form = new FormData();
          Object.entries(v).forEach(([k, val]) => val != null && form.append(k, val));
          if (file) form.append('file', file);
          await api.upload('/expenses', form);
          toast.success('Gasto registrado');
          setFile(null);
          emitRefresh();
        }}
      >
        {() => (
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-line bg-white/60 px-4 py-3 hover:bg-brand-ice/40">
            <Upload className="h-4 w-4 text-brand" />
            <span className="flex-1 text-[12.5px]">{file ? `${file.name} · ${bytes(file.size)}` : 'Adjuntar documento justificante (opcional)'}</span>
            <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </FormModal>
      <FormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar gasto"
        icon={Wallet}
        size="lg"
        fields={fields}
        initial={edit}
        onSubmit={async (v) => {
          await api.patch(`/expenses/${edit.id}`, v);
          toast.success('Gasto actualizado');
          emitRefresh();
        }}
      />
    </>
  );
}

function MonthlyTab({ onNew }) {
  const { can } = useAuth();
  return (
    <div className="space-y-6">
      <Section
        title="Cuotas de clientes"
        subtitle="Lo que cobras cada mes (o con otra periodicidad) a cada cliente. Cada vencimiento genera su cobro automáticamente."
        icon={Repeat}
        flush
        actions={can('finance.write') && <Button size="sm" icon={Plus} onClick={onNew}>Nueva cuota mensual</Button>}
      >
        <RecurringTable />
      </Section>
      <div>
        <p className="mb-3 px-1 text-[14.5px] font-medium">Cobros de cada mes</p>
        <ListTab kind="monthly" empty={<EmptyState compact icon={Repeat} title="Aún no hay mensualidades" description="Aparecerán aquí al vencer cada cuota; pulsa «Cobrar» cuando el cliente pague." />} />
      </div>
    </div>
  );
}

// Claves antiguas de pestaña (enlaces de notificaciones previas)
const LEGACY_TABS = { cobros: 'entrada', recurrentes: 'mensualidades' };

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'facturas', label: 'Facturas', icon: Receipt },
  { key: 'entrada', label: 'Pagos de entrada', icon: CreditCard },
  { key: 'mensualidades', label: 'Mensualidades', icon: Repeat },
  { key: 'gastos', label: 'Gastos', icon: Wallet },
];

export default function FinancePage() {
  const { can } = useAuth();
  const toast = useToast();
  const quick = useQuickActions();
  const lk = useLookups(['clients', 'projects']);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? 'resumen';
  const tab = LEGACY_TABS[requested] ?? requested;
  const [recurring, setRecurring] = useState(false);
  const [expense, setExpense] = useState(false);
  const write = can('finance.write');

  return (
    <div>
      <PageHeader
        title="Finanzas"
        subtitle="Facturación, pagos de entrada, mensualidades y gastos de Web Pulsar"
        meta={<Badge tone="mute">Importes en EUR · fechas en horario de Madrid</Badge>}
        actions={
          write && (
            <>
              {tab === 'mensualidades' && <Button variant="secondary" icon={Repeat} onClick={() => setRecurring(true)}>Nueva cuota mensual</Button>}
              {tab === 'gastos' && <Button variant="secondary" icon={Plus} onClick={() => setExpense(true)}>Registrar gasto</Button>}
              <Button variant="secondary" icon={CreditCard} onClick={() => quick.open('payment')}>Registrar pago</Button>
              <Button icon={Receipt} onClick={() => quick.open('invoice')}>Crear factura</Button>
            </>
          )
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} className="mb-6" />
      {tab === 'resumen' && <SummaryTab />}
      {tab === 'facturas' && <ListTab kind="invoices" />}
      {tab === 'entrada' && (
        <ListTab
          kind="entry"
          empty={<EmptyState compact icon={CreditCard} title="Sin pagos de entrada" description="Anticipos, pagos de proyecto y cobros de facturas. Usa «Registrar pago» para añadir uno." />}
        />
      )}
      {tab === 'mensualidades' && <MonthlyTab onNew={() => setRecurring(true)} />}
      {tab === 'gastos' && <ExpensesTab formOpen={expense} setFormOpen={setExpense} />}
      <FormModal
        open={recurring}
        onClose={() => setRecurring(false)}
        title="Nueva cuota mensual"
        subtitle="Lo que el cliente paga cada mes: mantenimiento, hosting, suscripción…"
        icon={Repeat}
        fields={recurringFields(lk, { creating: true })}
        onSubmit={async (v) => {
          await api.post('/recurring', v);
          toast.success('Cuota mensual creada', v.first_paid_at ? 'Primera cuota registrada como cobrada' : undefined);
          emitRefresh();
        }}
      />
    </div>
  );
}
