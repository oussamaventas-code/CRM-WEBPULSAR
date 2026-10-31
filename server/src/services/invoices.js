import PDFDocument from 'pdfkit';
import { logoPath } from '../routes/branding.js';
import { db, nowIso, tx } from '../db/index.js';
import { computeInvoice, formatInvoiceNumber } from '../lib/money.js';
import { getSetting } from '../lib/settings.js';
import { sha256 } from '../lib/crypto.js';
import { addDays, today } from '../lib/dates.js';
import { conflict, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/query.js';
import { record } from '../lib/audit.js';
import { recomputeInvoice } from './finance.js';

export function loadInvoice(id) {
  const inv = db.get(
    `SELECT i.*, s.code AS series_code, s.name AS series_name, c.name AS client_name, c.company AS client_company, c.email AS client_email,
            p.name AS project_name, r.number AS rectifies_number
     FROM invoices i JOIN invoice_series s ON s.id = i.series_id JOIN clients c ON c.id = i.client_id
     LEFT JOIN projects p ON p.id = i.project_id LEFT JOIN invoices r ON r.id = i.rectifies_invoice_id WHERE i.id = ?`,
    [id],
  );
  if (!inv) throw notFound('Factura no encontrada');
  inv.items = db.all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id', [inv.id]);
  inv.client_snapshot = parseJson(inv.client_snapshot, null);
  inv.issuer_snapshot = parseJson(inv.issuer_snapshot, null);
  inv.totals = computeInvoice(inv.items, { globalDiscountPct: inv.global_discount_pct, withholdingPct: inv.withholding_pct }).totals;
  inv.payments = db.all('SELECT id, amount_paid_cents, paid_at, method, external_ref, status FROM payments WHERE invoice_id = ? ORDER BY paid_at', [inv.id]);
  inv.rectifications = db.all('SELECT id, number, status, total_cents, issue_date FROM invoices WHERE rectifies_invoice_id = ? ORDER BY id', [inv.id]);
  return inv;
}

/** Guarda líneas y totales de un borrador (cálculo siempre en servidor). */
export function saveDraftItems(invoiceId, items, { globalDiscountPct, withholdingPct }) {
  const { lines, totals } = computeInvoice(items, { globalDiscountPct, withholdingPct });
  db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
  for (const l of lines) {
    db.run(
      `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, unit_price_cents, discount_pct, tax_rate, base_cents, discount_cents, tax_cents, total_cents, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, l.service_id ?? null, l.description, l.quantity, l.unit_price_cents, l.discount_pct ?? 0, l.tax_rate, l.base_cents, l.discount_cents, l.tax_cents, l.total_cents, l.position],
    );
  }
  db.run(
    `UPDATE invoices SET subtotal_cents = ?, discount_cents = ?, tax_cents = ?, withholding_cents = ?, total_cents = ?, global_discount_pct = ?, withholding_pct = ?, updated_at = ? WHERE id = ?`,
    [totals.subtotal_cents, totals.discount_cents, totals.tax_cents, totals.withholding_cents, totals.total_cents, globalDiscountPct, withholdingPct, nowIso(), invoiceId],
  );
  return totals;
}

const ddmmyyyy = (iso) => iso.split('-').reverse().join('-');

/** Datos que exige una factura completa antes de poder emitirse. */
export function issueBlockers(inv) {
  const company = getSetting('company');
  const client = db.get('SELECT * FROM clients WHERE id = ?', [inv.client_id]);
  const problems = [];
  if (!company.legal_name && !company.name) problems.push('Falta la razón social de la empresa (Configuración → Empresa)');
  if (!company.tax_id) problems.push('Falta el NIF/CIF de la empresa (Configuración → Empresa)');
  if (!company.address || !company.city) problems.push('Falta el domicilio fiscal de la empresa (Configuración → Empresa)');
  if (!client.tax_id) problems.push(`Falta el NIF/CIF del cliente ${client.name}`);
  if (!client.fiscal_address && !client.address) problems.push(`Falta la dirección fiscal del cliente ${client.name}`);
  if (!inv.items?.length) problems.push('La factura no tiene líneas');
  return { problems, company, client };
}

/**
 * Emite un borrador: asigna número correlativo de la serie, congela datos fiscales y
 * genera un registro encadenado (huella SHA-256) con la estructura de VeriFactu.
 * El registro NO se envía a la AEAT: requiere configuración y validación específicas.
 */
export function issueInvoice(req, invoiceId, { issueDate } = {}) {
  return tx(() => {
    const inv = loadInvoice(invoiceId);
    if (inv.status !== 'draft') throw conflict('La factura ya está emitida');
    const { problems, company, client } = issueBlockers(inv);
    if (problems.length && !inv.is_demo) throw conflict('No se puede emitir todavía', { problems });

    const date = issueDate ?? inv.issue_date ?? today();
    const year = Number(date.slice(0, 4));
    const series = db.get('SELECT * FROM invoice_series WHERE id = ?', [inv.series_id]);
    if (!series.active) throw conflict('La serie de facturación está desactivada');
    const counterYear = series.reset_yearly ? year : 0;

    const lastDate = db.value("SELECT MAX(issue_date) FROM invoices WHERE series_id = ? AND status <> 'draft' AND (? = 0 OR year = ?)", [series.id, series.reset_yearly, year]);
    if (lastDate && date < lastDate) throw conflict(`La fecha de emisión no puede ser anterior a la última factura de la serie (${ddmmyyyy(lastDate)})`);

    db.run('INSERT INTO invoice_series_counters (series_id, year, last_number) VALUES (?, ?, 0) ON CONFLICT(series_id, year) DO NOTHING', [series.id, counterYear]);
    db.run('UPDATE invoice_series_counters SET last_number = last_number + 1 WHERE series_id = ? AND year = ?', [series.id, counterYear]);
    const sequence = db.value('SELECT last_number FROM invoice_series_counters WHERE series_id = ? AND year = ?', [series.id, counterYear]);
    const number = formatInvoiceNumber(series, year, sequence);

    const invoicing = getSetting('invoicing');
    const dueDate = inv.due_date && inv.due_date >= date ? inv.due_date : addDays(date, Number(invoicing.payment_terms_days || 0));
    const issuer = {
      name: company.legal_name || company.name,
      trade_name: company.name,
      tax_id: company.tax_id,
      address: company.address,
      postal_code: company.postal_code,
      city: company.city,
      province: company.province,
      country: company.country,
      email: company.email,
      phone: company.phone,
      iban: company.iban,
    };
    const clientSnapshot = {
      name: client.fiscal_name || client.company || client.name,
      contact: client.name,
      tax_id: client.tax_id,
      address: client.fiscal_address || client.address,
      postal_code: client.postal_code,
      city: client.city,
      province: client.province,
      country: client.country,
      email: client.email,
    };

    const prevHash = db.value("SELECT record_hash FROM invoices WHERE record_hash IS NOT NULL AND status <> 'draft' AND is_demo = 0 ORDER BY issued_at DESC, id DESC LIMIT 1") ?? '';
    const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const payload = [
      `IDEmisorFactura=${issuer.tax_id ?? ''}`,
      `NumSerieFactura=${number}`,
      `FechaExpedicionFactura=${ddmmyyyy(date)}`,
      `TipoFactura=${inv.kind === 'rectifying' ? 'R1' : 'F1'}`,
      `CuotaTotal=${(inv.tax_cents / 100).toFixed(2)}`,
      `ImporteTotal=${(inv.total_cents / 100).toFixed(2)}`,
      `Huella=${prevHash}`,
      `FechaHoraHusoGenRegistro=${generatedAt}`,
    ].join('&');

    db.run(
      `UPDATE invoices SET status = 'issued', number = ?, sequence = ?, year = ?, issue_date = ?, due_date = ?, issued_at = ?,
         client_snapshot = ?, issuer_snapshot = ?, record_payload = ?, record_hash = ?, prev_record_hash = ?, verifactu_status = ?, updated_at = ?
       WHERE id = ?`,
      [
        number, sequence, year, date, dueDate, nowIso(), JSON.stringify(clientSnapshot), JSON.stringify(issuer), inv.is_demo ? null : payload,
        inv.is_demo ? null : sha256(payload).toUpperCase(), inv.is_demo ? null : prevHash || null, invoicing.verifactu_mode === 'not_configured' ? 'not_configured' : 'pending_submission', nowIso(), inv.id,
      ],
    );
    recomputeInvoice(inv.id);

    if (inv.kind === 'rectifying' && inv.rectifies_invoice_id) {
      const original = db.get('SELECT * FROM invoices WHERE id = ?', [inv.rectifies_invoice_id]);
      const rectified = db.value("SELECT COALESCE(SUM(total_cents), 0) FROM invoices WHERE rectifies_invoice_id = ? AND status <> 'draft'", [original.id]);
      if (original.total_cents + rectified <= 0) db.run("UPDATE invoices SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), original.id]);
    }

    record(req, {
      action: 'invoice.issued',
      entityType: 'invoice',
      entityId: inv.id,
      clientId: inv.client_id,
      label: number,
      summary: `Factura emitida ${number} · ${client.company || client.name}`,
      data: { number, total_cents: inv.total_cents },
      isDemo: !!inv.is_demo,
    });
    return loadInvoice(inv.id);
  });
}

/** Crea un borrador de factura rectificativa con las líneas en negativo. */
export function createRectification(req, invoiceId, reason) {
  return tx(() => {
    const original = loadInvoice(invoiceId);
    if (original.status === 'draft') throw conflict('Un borrador se edita directamente; no necesita rectificativa');
    if (original.kind === 'rectifying') throw conflict('No se puede rectificar una factura rectificativa');
    const series = db.get("SELECT id FROM invoice_series WHERE kind = 'rectifying' AND active = 1 ORDER BY is_default DESC, id LIMIT 1");
    if (!series) throw conflict('Crea una serie de facturas rectificativas en Configuración → Facturación');
    const res = db.run(
      `INSERT INTO invoices (series_id, kind, rectifies_invoice_id, rectification_reason, client_id, project_id, currency, global_discount_pct, withholding_pct, notes, is_demo, created_by)
       VALUES (?, 'rectifying', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [series.id, original.id, reason, original.client_id, original.project_id, original.currency, original.global_discount_pct, original.withholding_pct, `Rectifica la factura ${original.number}. Motivo: ${reason}`, original.is_demo, req.user.id],
    );
    const id = Number(res.lastInsertRowid);
    saveDraftItems(
      id,
      original.items.map((i) => ({ ...i, quantity: -i.quantity })),
      { globalDiscountPct: original.global_discount_pct, withholdingPct: original.withholding_pct },
    );
    record(req, { action: 'invoice.rectification_created', entityType: 'invoice', entityId: id, clientId: original.client_id, label: original.number, summary: `Borrador de rectificativa de ${original.number}` });
    return loadInvoice(id);
  });
}

// ── PDF ──────────────────────────────────────────────────
const money = (cents, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100).replace(/[  ]/g, ' ');
const dateEs = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '—');
const qty = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n);

export function renderInvoicePdf(inv) {
  const company = inv.issuer_snapshot ?? (() => {
    const c = getSetting('company');
    return { name: c.legal_name || c.name, trade_name: c.name, ...c };
  })();
  const client = inv.client_snapshot ?? db.get('SELECT name AS contact, COALESCE(fiscal_name, company, name) AS name, tax_id, COALESCE(fiscal_address, address) AS address, postal_code, city, province, country, email FROM clients WHERE id = ?', [inv.client_id]);
  const invoicing = getSetting('invoicing');

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: inv.number ? `Factura ${inv.number}` : 'Borrador de factura', Author: company.trade_name || company.name } });
  const blue = '#173B72';
  const soft = '#718096';
  const line = '#E4EAF2';
  const W = doc.page.width - 100;

  if (inv.status === 'draft') {
    doc.save().rotate(-30, { origin: [300, 420] }).fontSize(70).fillColor('#E5484D').opacity(0.08).text('BORRADOR', 80, 380, { width: 450, align: 'center' }).restore().opacity(1);
  }

  // Logo opcional (Configuración → Empresa). Si falla la lectura, la factura sale igual sin logo.
  const logo = logoPath();
  let headerY = 50;
  if (logo) {
    try {
      doc.image(logo, 50, 42, { fit: [170, 60] });
      headerY = 112;
    } catch {
      headerY = 50;
    }
  }
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(18).text(company.trade_name || company.name || 'Web Pulsar', 50, headerY);
  doc.font('Helvetica').fontSize(9).fillColor(soft);
  [company.name !== company.trade_name ? company.name : null, company.tax_id ? `NIF ${company.tax_id}` : null, company.address, [company.postal_code, company.city, company.province].filter(Boolean).join(' '), company.country, [company.email, company.phone].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .forEach((l) => doc.text(l, { width: 260 }));

  const headerBottom = doc.y;
  const title = inv.status === 'draft' ? 'BORRADOR' : inv.kind === 'rectifying' ? 'FACTURA RECTIFICATIVA' : 'FACTURA';
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#172033').text(title, 330, 50, { width: 215, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(soft);
  doc.text(inv.number ? `Nº ${inv.number}` : 'Sin numerar — sin validez fiscal', 330, doc.y + 2, { width: 215, align: 'right' });
  doc.text(`Fecha de emisión: ${dateEs(inv.issue_date)}`, { width: 215, align: 'right' });
  doc.text(`Vencimiento: ${dateEs(inv.due_date)}`, { width: 215, align: 'right' });
  if (inv.rectifies_number) doc.text(`Rectifica: ${inv.rectifies_number}`, { width: 215, align: 'right' });

  const boxY = Math.max(170, headerBottom + 14);
  doc.roundedRect(50, boxY, W, 86, 10).fillAndStroke('#F5F8FC', line);
  doc.fillColor(soft).fontSize(8).text('FACTURAR A', 64, boxY + 12);
  doc.fillColor('#172033').font('Helvetica-Bold').fontSize(11).text(client?.name ?? '', 64, boxY + 24, { width: W - 28 });
  doc.font('Helvetica').fontSize(9).fillColor('#172033');
  [client?.tax_id ? `NIF ${client.tax_id}` : null, client?.address, [client?.postal_code, client?.city, client?.province, client?.country].filter(Boolean).join(', ')]
    .filter(Boolean)
    .forEach((l) => doc.text(l, 64, doc.y, { width: W - 28 }));

  const cols = [
    { k: 'description', h: 'Concepto', w: 215, align: 'left' },
    { k: 'quantity', h: 'Cant.', w: 45, align: 'right' },
    { k: 'unit', h: 'Precio', w: 70, align: 'right' },
    { k: 'disc', h: 'Dto.', w: 40, align: 'right' },
    { k: 'tax', h: 'IVA', w: 40, align: 'right' },
    { k: 'total', h: 'Importe', w: 85, align: 'right' },
  ];
  let y = boxY + 106;
  const drawHeader = () => {
    let x = 50;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(soft);
    for (const c of cols) {
      doc.text(c.h.toUpperCase(), x, y, { width: c.w, align: c.align });
      x += c.w;
    }
    y += 16;
    doc.moveTo(50, y - 4).lineTo(50 + W, y - 4).strokeColor(line).stroke();
  };
  drawHeader();
  doc.font('Helvetica').fontSize(9).fillColor('#172033');
  for (const item of inv.items) {
    const values = {
      description: item.description,
      quantity: qty(item.quantity),
      unit: money(item.unit_price_cents, inv.currency),
      disc: item.discount_pct ? `${item.discount_pct}%` : '—',
      tax: `${item.tax_rate}%`,
      total: money(item.base_cents - item.discount_cents, inv.currency),
    };
    const h = Math.max(doc.heightOfString(values.description, { width: cols[0].w - 8 }), 12);
    if (y + h > doc.page.height - 200) {
      doc.addPage();
      y = 50;
      drawHeader();
      doc.font('Helvetica').fontSize(9).fillColor('#172033');
    }
    let x = 50;
    for (const c of cols) {
      doc.text(values[c.k], x, y, { width: c.k === 'description' ? c.w - 8 : c.w, align: c.align });
      x += c.w;
    }
    y += h + 8;
    doc.moveTo(50, y - 4).lineTo(50 + W, y - 4).strokeColor(line).stroke();
  }

  const t = inv.totals;
  y += 8;
  const row = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? blue : '#172033');
    doc.text(label, 300, y, { width: 150, align: 'right' });
    doc.text(value, 450, y, { width: 95, align: 'right' });
    y += bold ? 18 : 14;
  };
  row('Subtotal', money(t.subtotal_cents, inv.currency));
  if (t.discount_cents) row('Descuentos', `-${money(t.discount_cents, inv.currency)}`);
  row('Base imponible', money(t.taxable_cents, inv.currency));
  for (const b of t.tax_breakdown) row(`IVA ${b.rate}% s/ ${money(b.base_cents, inv.currency)}`, money(b.tax_cents, inv.currency));
  if (t.withholding_cents) row(`Retención IRPF ${inv.withholding_pct}%`, `-${money(t.withholding_cents, inv.currency)}`);
  y += 4;
  row('TOTAL', money(t.total_cents, inv.currency), true);

  y += 12;
  doc.font('Helvetica').fontSize(9).fillColor('#172033');
  if (company.iban && inv.total_cents > 0) {
    doc.text(`Forma de pago: transferencia bancaria a ${company.iban}`, 50, y, { width: W });
    y = doc.y + 4;
  }
  if (inv.notes) {
    doc.fillColor(soft).text(inv.notes, 50, y, { width: W });
    y = doc.y + 4;
  }
  const footer = inv.footer || invoicing.footer;
  if (footer) doc.fillColor(soft).fontSize(8).text(footer, 50, y, { width: W });

  if (inv.record_hash) {
    doc.fontSize(7).fillColor(soft).text(`Huella del registro: ${inv.record_hash}`, 50, doc.page.height - 70, { width: W, align: 'center' });
  }
  doc.end();
  return doc;
}
