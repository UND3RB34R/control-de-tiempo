/**
 * export.js — Exportar CSV y PDF
 * Control de Pintores PWA
 */

async function exportCSV() {
  const period   = getVal('summaryPeriod');
  const { from, to } = getPeriodRange(period);
  const painters = await DB.all('painters');
  const shifts   = await DB.all('shifts');
  const payments = await DB.all('payments');

  const filtered = shifts.filter(s => s.date >= from && s.date <= to && s.endTime);
  if (filtered.length === 0) { showToast('No hay datos para exportar'); return; }

  const rows = [
    ['Pintor','Tipo','Fecha','Entrada','Salida','Horas','Pausa (min)','Bruto NZD','PAYE/WHT NZD','Neto NZD','Nota'],
  ];

  for (const s of filtered) {
    const p = painters.find(x => x.id === s.painterId);
    if (!p) continue;
    const gross = (s.hours||0) * (p.hourlyRate||0);
    const tax   = TAX_NZ.calcForPainter(p, s.hours||0, 'weekly');
    const withheld = tax ? (tax.totalWithheld || tax.withheld || 0) : 0;
    const net      = tax ? tax.net : gross;

    rows.push([
      p.name,
      p.taxType === 'contractor' ? 'Contratista' : 'Empleado',
      fmtDate(s.date),
      fmtTime(s.startTime),
      fmtTime(s.endTime),
      (s.hours||0).toFixed(2),
      s.breakMins || 0,
      gross.toFixed(2),
      withheld.toFixed(2),
      net.toFixed(2),
      s.note || '',
    ]);
  }

  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pintores_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📄 CSV exportado');
}

async function exportPDF() {
  const period   = getVal('summaryPeriod');
  const { from, to } = getPeriodRange(period);
  const painters = await DB.all('painters');
  const shifts   = await DB.all('shifts');
  const payments = await DB.all('payments');
  const filtered = shifts.filter(s => s.date >= from && s.date <= to && s.endTime);

  const settings_ = await DB.getSetting('app_settings') || {};
  const company   = settings_.company || 'Control de Pintores';
  const logo      = settings_.logo    || '🎨';

  const rows = painters.map(p => {
    const ps      = filtered.filter(s => s.painterId === p.id);
    if (!ps.length) return null;
    const hours   = ps.reduce((a,s) => a+(s.hours||0), 0);
    const earned  = hours * (p.hourlyRate||0);
    const paid    = payments.filter(x => x.painterId===p.id && x.date>=from && x.date<=to)
                            .reduce((a,x) => a+(x.amount||0), 0);
    const pending = Math.max(0, earned - paid);
    const tax     = TAX_NZ.calcForPainter(p, hours, 'weekly');
    const withheld = tax ? (tax.totalWithheld || tax.withheld || 0) : 0;
    return { p, hours, earned, paid, pending, withheld, net: earned - withheld };
  }).filter(Boolean);

  if (!rows.length) { showToast('No hay datos para exportar'); return; }

  const totalEarned  = rows.reduce((a,r) => a+r.earned, 0);
  const totalWithheld= rows.reduce((a,r) => a+r.withheld, 0);
  const totalPending = rows.reduce((a,r) => a+r.pending, 0);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Reporte ${company}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1a1a2e; margin: 24px; font-size: 13px; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .sub { color: #888; margin-bottom: 24px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #e85d04; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .totals { background: #1a1a2e; color: #fff; padding: 14px 18px; border-radius: 8px; display: flex; gap: 32px; }
      .tot-item span { display: block; }
      .tot-label { font-size: 10px; opacity: .7; }
      .tot-val { font-size: 16px; font-weight: bold; }
      .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; }
      .employee { background: #dbeafe; color: #1d4ed8; }
      .contractor { background: #fef3c7; color: #b45309; }
    </style>
  </head><body>
    <h1>${logo} ${company}</h1>
    <div class="sub">Período: ${fmtDate(from)} — ${fmtDate(to)} · Generado: ${new Date().toLocaleDateString('es-ES')}</div>
    <table>
      <thead><tr>
        <th>Pintor</th><th>Tipo</th><th>Horas</th>
        <th>Bruto (NZD)</th><th>PAYE/WHT</th><th>Neto</th><th>Pagado</th><th>Pendiente</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td><strong>${r.p.name}</strong></td>
          <td><span class="badge ${r.p.taxType==='contractor'?'contractor':'employee'}">${r.p.taxType==='contractor'?'Contratista':'Empleado'}</span></td>
          <td>${fmtHours(r.hours)}</td>
          <td>${fmtCurrency(r.earned)}</td>
          <td>${fmtCurrency(r.withheld)}</td>
          <td>${fmtCurrency(r.net)}</td>
          <td>${fmtCurrency(r.paid)}</td>
          <td>${fmtCurrency(r.pending)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="tot-item"><span class="tot-label">Total bruto</span><span class="tot-val">${fmtCurrency(totalEarned)}</span></div>
      <div class="tot-item"><span class="tot-label">Total PAYE/WHT</span><span class="tot-val">${fmtCurrency(totalWithheld)}</span></div>
      <div class="tot-item"><span class="tot-label">Total pendiente</span><span class="tot-val">${fmtCurrency(totalPending)}</span></div>
    </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}
