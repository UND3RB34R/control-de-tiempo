/**
 * reports.js — Resúmenes, reportes e impuestos NZ
 * Control de Pintores PWA
 */

/* ── Summary view ────────────────────────────────────────────────── */
async function loadSummary() {
  const period = getVal('summaryPeriod');
  const custom = document.getElementById('customDateRange');
  if (custom) custom.classList.toggle('hidden', period !== 'custom');

  const { from, to } = getPeriodRange(period);
  const painters = await DB.all('painters');
  const shifts   = await DB.all('shifts');
  const payments = await DB.all('payments');

  const filtered = shifts.filter(s => s.date >= from && s.date <= to && s.endTime);

  const content = document.getElementById('summaryContent');
  if (!content) return;

  if (filtered.length === 0) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No hay datos para el período seleccionado.</p></div>';
    return;
  }

  const rows = painters.map(p => {
    const pShifts   = filtered.filter(s => s.painterId === p.id);
    if (pShifts.length === 0) return null;
    const hours    = pShifts.reduce((a,s) => a + (s.hours||0), 0);
    const earned   = hours * (p.hourlyRate || 0);
    const paid     = payments.filter(x => x.painterId === p.id && x.date >= from && x.date <= to)
                             .reduce((a,x) => a + (x.amount||0), 0);
    const pending  = Math.max(0, earned - paid);

    // Tax calculation
    const taxInfo = calcTaxForSummary(p, hours, earned, period);

    return { painter: p, hours, earned, paid, pending, taxInfo, shifts: pShifts.length };
  }).filter(Boolean);

  const totalHours   = rows.reduce((a,r) => a + r.hours, 0);
  const totalEarned  = rows.reduce((a,r) => a + r.earned, 0);
  const totalPending = rows.reduce((a,r) => a + r.pending, 0);

  content.innerHTML = `
    <div class="summary-totals">
      <div class="summary-total-item">
        <div class="summary-total-val">${fmtHours(totalHours)}</div>
        <div class="summary-total-label">Total horas</div>
      </div>
      <div class="summary-total-item accent">
        <div class="summary-total-val">${fmtCurrency(totalEarned)}</div>
        <div class="summary-total-label">Total ganado</div>
      </div>
      <div class="summary-total-item warning">
        <div class="summary-total-val">${fmtCurrency(totalPending)}</div>
        <div class="summary-total-label">Pendiente</div>
      </div>
    </div>
    <h3 class="summary-section-title">Por pintor</h3>
    ${rows.map(r => summaryPainterRow(r)).join('')}`;
}

function summaryPainterRow(r) {
  const { painter, hours, earned, paid, pending, taxInfo, shifts } = r;
  const taxHtml = taxInfo ? `
    <div class="tax-mini-card ${taxInfo.type}">
      <span class="tax-mini-label">${taxInfo.type === 'employee' ? '🏦 PAYE retenido' : '📋 WHT retenido'}</span>
      <span class="tax-mini-val">${fmtCurrency(taxInfo.withheld || taxInfo.totalWithheld)}</span>
      <span class="tax-mini-net">Neto: ${fmtCurrency(taxInfo.net)}</span>
    </div>` : '';

  return `
    <div class="summary-painter-card">
      <div class="summary-painter-header">
        <div class="pcard-avatar small" style="background:${painter.color||'#e85d04'}">${(painter.name||'?').charAt(0).toUpperCase()}</div>
        <div class="summary-painter-name">${painter.name}</div>
        <div class="summary-painter-type ${painter.taxType === 'contractor' ? 'contractor' : 'employee'}">
          ${painter.taxType === 'contractor' ? 'Contratista' : 'Empleado'}
        </div>
      </div>
      <div class="summary-painter-stats">
        <div class="sp-stat"><span>${fmtHours(hours)}</span><span>Horas (${shifts} turnos)</span></div>
        <div class="sp-stat"><span>${fmtCurrency(earned)}</span><span>Bruto</span></div>
        <div class="sp-stat"><span>${fmtCurrency(paid)}</span><span>Pagado</span></div>
        <div class="sp-stat ${pending > 0 ? 'pending' : ''}"><span>${fmtCurrency(pending)}</span><span>Pendiente</span></div>
      </div>
      ${taxHtml}
    </div>`;
}

function calcTaxForSummary(painter, hours, earned, period) {
  if (!earned || earned <= 0) return null;
  const periodMap = { week: 'weekly', month: 'monthly', custom: 'weekly' };
  const p = periodMap[period] || 'weekly';
  return TAX_NZ.calcForPainter(painter, hours, p);
}

function getPeriodRange(period) {
  const now   = new Date();
  const today = todayStr();

  if (period === 'week') {
    const day  = now.getDay() || 7; // Mon=1
    const mon  = new Date(now); mon.setDate(now.getDate() - day + 1);
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: mon.toISOString().slice(0,10), to: sun.toISOString().slice(0,10) };
  }
  if (period === 'month') {
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    return { from, to: today };
  }
  if (period === 'custom') {
    const from = getVal('summaryFrom') || today;
    const to   = getVal('summaryTo')   || today;
    return { from, to };
  }
  return { from: today, to: today };
}

/* ── Tax Calculator View ─────────────────────────────────────────── */
function renderTaxCalculator() {
  const el = document.getElementById('view-tax-calculator');
  if (!el) return;
  el.innerHTML = `
    <div class="tax-calc-wrapper">
      <div class="tax-hero">
        <div class="tax-hero-icon">🇳🇿</div>
        <h2>Calculadora de Impuestos</h2>
        <p>Nueva Zelanda · IRD 2024-25</p>
      </div>

      <div class="tax-type-tabs">
        <button class="tax-tab active" id="taxTabEmployee" onclick="switchTaxTab('employee')">
          👔 Empleado (PAYE)
        </button>
        <button class="tax-tab" id="taxTabContractor" onclick="switchTaxTab('contractor')">
          🔧 Contratista (WHT)
        </button>
      </div>

      <!-- PAYE Panel -->
      <div id="taxPanelEmployee" class="tax-panel">
        <div class="form-card">
          <div class="form-group">
            <label>Monto bruto del período (NZD)</label>
            <input type="number" id="taxGrossEmployee" class="form-input" placeholder="Ej: 1500"
                   min="0" oninput="calcPAYELive()" />
          </div>
          <div class="form-group">
            <label>Frecuencia de pago</label>
            <select id="taxPeriodEmployee" class="form-input" onchange="calcPAYELive()">
              <option value="weekly">Semanal</option>
              <option value="fortnightly">Quincenal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
          <div id="payeResult" class="tax-result hidden"></div>
          <div class="tax-disclaimer">
            ⚠️ Cálculo de referencia basado en tasas IRD 2024-25.
            Incluye ACC Earners' Levy (1.60%). Para declaraciones oficiales usa myIR o consulta un contador.
          </div>
        </div>
      </div>

      <!-- WHT Panel -->
      <div id="taxPanelContractor" class="tax-panel hidden">
        <div class="form-card">
          <div class="form-group">
            <label>Monto bruto del pago (NZD)</label>
            <input type="number" id="taxGrossContractor" class="form-input" placeholder="Ej: 2000"
                   min="0" oninput="calcWHTLive()" />
          </div>
          <div class="form-group">
            <label>Tasa WHT del contratista (IR330C)</label>
            <select id="taxWHTRate" class="form-input" onchange="calcWHTLive()">
              ${TAX_NZ.WHT_RATES.map(r =>
                `<option value="${r.rate}" ${r.rate===0.20?'selected':''}>${r.label}</option>`
              ).join('')}
            </select>
          </div>
          <div id="whtResult" class="tax-result hidden"></div>
          <div class="tax-disclaimer">
            ⚠️ El contratista debe completar el IR330C con su tasa preferida.
            Tú (el pagador) retienes este monto y lo declaras al IRD.
          </div>
        </div>
      </div>

      <!-- Quick reference -->
      <div class="tax-reference">
        <h3>Tasas PAYE 2024-25</h3>
        <div class="tax-brackets-table">
          ${TAX_NZ.PAYE_BRACKETS.map((b, i) => {
            const prev = i === 0 ? 0 : TAX_NZ.PAYE_BRACKETS[i-1].upTo;
            const upTo = b.upTo === Infinity ? '180,001+' : `${Number(b.upTo).toLocaleString()}`;
            const from = Number(prev).toLocaleString();
            return `<div class="tax-bracket-row">
              <span class="tb-range">$${from} – $${upTo}</span>
              <span class="tb-rate">${(b.rate*100).toFixed(1)}%</span>
            </div>`;
          }).join('')}
          <div class="tax-bracket-row acc">
            <span class="tb-range">ACC Earners' Levy (hasta $139,384)</span>
            <span class="tb-rate">1.60%</span>
          </div>
        </div>
      </div>

      <!-- Per-painter quick calc -->
      <div class="tax-per-painter-section">
        <h3>Calcular por pintor</h3>
        <div id="taxPerPainterList"></div>
      </div>
    </div>`;

  loadTaxPerPainter();
  calcPAYELive();
}

let _taxTab = 'employee';
function switchTaxTab(tab) {
  _taxTab = tab;
  document.getElementById('taxTabEmployee')?.classList.toggle('active', tab === 'employee');
  document.getElementById('taxTabContractor')?.classList.toggle('active', tab === 'contractor');
  document.getElementById('taxPanelEmployee')?.classList.toggle('hidden', tab !== 'employee');
  document.getElementById('taxPanelContractor')?.classList.toggle('hidden', tab !== 'contractor');
}

function calcPAYELive() {
  const gross  = parseFloat(document.getElementById('taxGrossEmployee')?.value || '0');
  const period = getVal('taxPeriodEmployee') || 'weekly';
  const result = document.getElementById('payeResult');
  if (!result) return;
  if (!gross || gross <= 0) { result.classList.add('hidden'); return; }

  const r = TAX_NZ.calcPAYEForPayment(gross, period);
  result.classList.remove('hidden');
  result.innerHTML = `
    <div class="tax-result-grid">
      <div class="tr-item"><span class="tr-label">Bruto</span><span class="tr-val">${TAX_NZ.fmtNZD(r.gross)}</span></div>
      <div class="tr-item deduct"><span class="tr-label">Impuesto IR</span><span class="tr-val">−${TAX_NZD(r.tax)}</span></div>
      <div class="tr-item deduct"><span class="tr-label">ACC Levy</span><span class="tr-val">−${TAX_NZD(r.acc)}</span></div>
      <div class="tr-item total"><span class="tr-label">Total retenido</span><span class="tr-val">−${TAX_NZD(r.totalWithheld)}</span></div>
      <div class="tr-item net"><span class="tr-label">💵 Neto a pagar</span><span class="tr-val">${TAX_NZD(r.net)}</span></div>
    </div>
    <div class="tax-effective">Tasa efectiva: ${r.effectiveRate}% · Equiv. anual: ${TAX_NZD(r.annualEquivalent)}</div>`;
}

function calcWHTLive() {
  const gross = parseFloat(document.getElementById('taxGrossContractor')?.value || '0');
  const rate  = parseFloat(getVal('taxWHTRate') || '0.20');
  const result = document.getElementById('whtResult');
  if (!result) return;
  if (!gross || gross <= 0) { result.classList.add('hidden'); return; }

  const r = TAX_NZ.calcWHT(gross, rate);
  result.classList.remove('hidden');
  result.innerHTML = `
    <div class="tax-result-grid">
      <div class="tr-item"><span class="tr-label">Bruto</span><span class="tr-val">${TAX_NZD(r.gross)}</span></div>
      <div class="tr-item deduct"><span class="tr-label">WHT (${(r.rate*100).toFixed(0)}%)</span><span class="tr-val">−${TAX_NZD(r.withheld)}</span></div>
      <div class="tr-item net"><span class="tr-label">💵 Neto al contratista</span><span class="tr-val">${TAX_NZD(r.net)}</span></div>
    </div>
    <div class="tax-effective">Tú retienes ${TAX_NZD(r.withheld)} y lo declaras al IRD</div>`;
}

function TAX_NZD(n) { return TAX_NZ.fmtNZD(n); }

async function loadTaxPerPainter() {
  const painters = await DB.all('painters');
  const shifts   = await DB.all('shifts');
  const list     = document.getElementById('taxPerPainterList');
  if (!list) return;

  if (painters.length === 0) {
    list.innerHTML = '<p class="empty-msg">Agrega pintores para ver su cálculo de impuestos.</p>';
    return;
  }

  // Current week hours
  const { from, to } = getPeriodRange('week');
  list.innerHTML = painters.map(p => {
    const pShifts = shifts.filter(s => s.painterId === p.id && s.date >= from && s.date <= to && s.endTime);
    const hours   = pShifts.reduce((a,s) => a + (s.hours||0), 0);
    const gross   = hours * (p.hourlyRate || 0);

    if (gross === 0) {
      return `<div class="tax-pp-card">
        <div class="pcard-avatar small" style="background:${p.color||'#e85d04'}">${(p.name||'?').charAt(0).toUpperCase()}</div>
        <div class="tax-pp-info"><div class="tax-pp-name">${p.name}</div><div class="tax-pp-meta">Sin horas esta semana</div></div>
      </div>`;
    }

    const tax = TAX_NZ.calcForPainter(p, hours, 'weekly');
    const withheld = tax ? (tax.totalWithheld || tax.withheld || 0) : 0;
    const net      = tax ? tax.net : gross;

    return `<div class="tax-pp-card">
      <div class="pcard-avatar small" style="background:${p.color||'#e85d04'}">${(p.name||'?').charAt(0).toUpperCase()}</div>
      <div class="tax-pp-info">
        <div class="tax-pp-name">${p.name} <span class="tax-mini-type ${p.taxType === 'contractor' ? 'contractor' : 'employee'}">${p.taxType === 'contractor' ? 'WHT' : 'PAYE'}</span></div>
        <div class="tax-pp-meta">${fmtHours(hours)} · Bruto: ${fmtCurrency(gross)}</div>
      </div>
      <div class="tax-pp-right">
        <div class="tax-pp-withheld">−${fmtCurrency(withheld)}</div>
        <div class="tax-pp-net">Neto: ${fmtCurrency(net)}</div>
      </div>
    </div>`;
  }).join('');
}
