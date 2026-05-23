/**
 * painters.js — Gestión de pintores
 * Control de Pintores PWA
 */

/* ── Dashboard card builder ──────────────────────────────────────── */
function buildPainterCardHTML(painter, isWorking, todayHours) {
  const initial   = (painter.name || '?').charAt(0).toUpperCase();
  const rate      = painter.hourlyRate ? `${fmtCurrency(painter.hourlyRate)}/h` : '';
  const hoursText = todayHours > 0 ? `${todayHours.toFixed(1)}h hoy` : '';

  return `
    <div class="painter-card-v2 ${isWorking ? 'working' : ''}"
         onclick="showView('painter-detail', ${painter.id})">
      <div class="pcard-left">
        <div class="pcard-avatar" style="background:${painter.color || '#e85d04'}">${initial}</div>
        <div class="pcard-info">
          <div class="pcard-name">${painter.name}</div>
          <div class="pcard-meta">${rate}${hoursText ? ' · ' + hoursText : ''}</div>
          <div class="pcard-status ${isWorking ? 'working' : ''}">
            <span class="dot"></span>
            ${isWorking ? 'Trabajando' : 'Libre'}
          </div>
        </div>
      </div>
      <div class="pcard-right">
        <button class="btn-entrada ${isWorking ? 'btn-salida' : ''}"
          onclick="event.stopPropagation(); dashboardClockAction(${painter.id}, ${isWorking})">
          ${isWorking
            ? '<span>⏹</span><span>SALIDA</span>'
            : '<span>▶</span><span>ENTRADA</span>'}
        </button>
      </div>
    </div>`;
}

function dashboardClockAction(painterId, isWorking) {
  currentPainterId = painterId;
  if (isWorking) showBreakModal();
  else           checkIn();
}

/* ── Add / Edit painter form ─────────────────────────────────────── */
function initAddPainterForm(painterId) {
  const title = document.getElementById('formPainterTitle');
  const editId = document.getElementById('editPainterId');

  // Reset
  setVal('painterName',  '');
  setVal('painterPhone', '');
  setVal('painterRate',  '');
  setVal('painterColor', '#e85d04');
  setVal('painterTaxType', 'employee');
  setVal('painterWhtRate', '0.20');
  if (editId) editId.value = '';
  updateColorPreview();
  toggleWhtRow();

  if (painterId) {
    DB.get('painters', Number(painterId)).then(p => {
      if (!p) return;
      if (title)  title.textContent = 'Editar Pintor';
      if (editId) editId.value = p.id;
      setVal('painterName',    p.name    || '');
      setVal('painterPhone',   p.phone   || '');
      setVal('painterRate',    p.hourlyRate || '');
      setVal('painterColor',   p.color   || '#e85d04');
      setVal('painterTaxType', p.taxType || 'employee');
      setVal('painterWhtRate', p.whtRate || '0.20');
      updateColorPreview();
      toggleWhtRow();
    });
  } else {
    if (title) title.textContent = 'Nuevo Pintor';
  }
}

function updateColorPreview() {
  const color = getVal('painterColor');
  const prev  = document.getElementById('painterColorPreview');
  if (prev) prev.style.color = color;
}

function toggleWhtRow() {
  const type = getVal('painterTaxType');
  const row  = document.getElementById('whtRateRow');
  if (row) row.classList.toggle('hidden', type !== 'contractor');
}

async function savePainter() {
  const name = getVal('painterName').trim();
  const rate = parseFloat(getVal('painterRate'));

  if (!name)      { showToast('El nombre es obligatorio'); return; }
  if (isNaN(rate) || rate < 0) { showToast('Ingresa un valor por hora válido'); return; }

  const editId = getVal('editPainterId');
  const painter = {
    name,
    phone:       getVal('painterPhone').trim(),
    hourlyRate:  rate,
    color:       getVal('painterColor') || '#e85d04',
    taxType:     getVal('painterTaxType') || 'employee',
    whtRate:     parseFloat(getVal('painterWhtRate')) || 0.20,
  };

  if (editId) {
    painter.id = Number(editId);
  } else {
    painter.createdAt = new Date().toISOString();
  }

  await DB.put('painters', painter);
  showToast(editId ? '✅ Pintor actualizado' : '✅ Pintor agregado');
  goBack();
}

/* ── Painters management list ────────────────────────────────────── */
async function loadPaintersManage() {
  const painters = await DB.all('painters');
  const list     = document.getElementById('paintersManageList');
  if (!list) return;

  if (painters.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">👷</div><p>No hay pintores aún.</p></div>';
    return;
  }

  list.innerHTML = painters.map(p => `
    <div class="manage-card">
      <div class="manage-card-left">
        <div class="pcard-avatar small" style="background:${p.color||'#e85d04'}">${(p.name||'?').charAt(0).toUpperCase()}</div>
        <div>
          <div class="manage-name">${p.name}</div>
          <div class="manage-meta">${fmtCurrency(p.hourlyRate)}/h · ${p.taxType === 'contractor' ? `Contratista ${Math.round((p.whtRate||0.2)*100)}% WHT` : 'Empleado PAYE'}</div>
        </div>
      </div>
      <div class="manage-actions">
        <button class="btn-ghost small" onclick="showView('add-painter', ${p.id})">✏️</button>
        <button class="btn-ghost small danger" onclick="confirmDeletePainter(${p.id})">🗑️</button>
      </div>
    </div>`).join('');
}

async function confirmDeletePainter(id) {
  const p = await DB.get('painters', id);
  if (!p) return;
  showConfirm(
    'Eliminar pintor',
    `¿Eliminar a ${p.name}? También se eliminarán todos sus turnos y pagos.`,
    async () => {
      const shifts   = await DB.all('shifts');
      const payments = await DB.all('payments');
      await Promise.all([
        ...shifts.filter(s => s.painterId === id).map(s => DB.remove('shifts', s.id)),
        ...payments.filter(p => p.painterId === id).map(p => DB.remove('payments', p.id)),
        DB.remove('painters', id),
      ]);
      showToast('Pintor eliminado');
      loadPaintersManage();
    }
  );
}

/* ── Painter detail ──────────────────────────────────────────────── */
async function loadPainterDetail(painterId) {
  if (!painterId) return;
  currentPainterId = Number(painterId);
  const painter = await DB.get('painters', currentPainterId);
  if (!painter) { goBack(); return; }

  // Header
  const header = document.getElementById('painterDetailHeader');
  if (header) {
    header.innerHTML = `
      <div class="detail-avatar" style="background:${painter.color||'#e85d04'}">
        ${(painter.name||'?').charAt(0).toUpperCase()}
      </div>
      <div class="detail-info">
        <div class="detail-name">${painter.name}</div>
        <div class="detail-meta">${fmtCurrency(painter.hourlyRate)}/h · ${painter.phone || 'Sin teléfono'}</div>
        <div class="detail-badge ${painter.taxType === 'contractor' ? 'contractor' : 'employee'}">
          ${painter.taxType === 'contractor' ? `Contratista · WHT ${Math.round((painter.whtRate||0.2)*100)}%` : 'Empleado · PAYE'}
        </div>
      </div>
      <button class="btn-ghost small" onclick="showView('add-painter', ${painter.id})" style="align-self:flex-start">✏️</button>`;
  }

  // Switch first tab to balance
  switchTab('tab-balance', document.querySelector('.tab-btn'));
  loadPainterBalance(currentPainterId);
}

async function loadPainterBalance(painterId) {
  const painter  = await DB.get('painters', painterId);
  const shifts   = await DB.byIndex('shifts', 'painterId', painterId);
  const payments = await DB.byIndex('payments', 'painterId', painterId);

  const totalHours   = shifts.reduce((a, s) => a + (s.hours || 0), 0);
  const totalEarned  = totalHours * (painter.hourlyRate || 0);
  const totalPaid    = payments.reduce((a, p) => a + (p.amount || 0), 0);
  const pending      = Math.max(0, totalEarned - totalPaid);

  const card = document.getElementById('painterBalanceCard');
  if (!card) return;

  card.innerHTML = `
    <div class="balance-row">
      <div class="balance-item">
        <div class="balance-val">${fmtHours(totalHours)}</div>
        <div class="balance-label">Total horas</div>
      </div>
      <div class="balance-item accent">
        <div class="balance-val">${fmtCurrency(totalEarned)}</div>
        <div class="balance-label">Total ganado</div>
      </div>
      <div class="balance-item">
        <div class="balance-val">${fmtCurrency(totalPaid)}</div>
        <div class="balance-label">Pagado</div>
      </div>
    </div>
    <div class="balance-pending ${pending > 0 ? 'has-pending' : ''}">
      <span>Saldo pendiente</span>
      <span class="balance-pending-val">${fmtCurrency(pending)}</span>
    </div>`;
}

async function loadPainterPayments(painterId) {
  const payments = await DB.byIndex('payments', 'painterId', painterId || currentPainterId);
  const list = document.getElementById('painterPaymentsList');
  if (!list) return;
  payments.sort((a,b) => b.date.localeCompare(a.date));
  if (payments.length === 0) {
    list.innerHTML = '<p class="empty-msg">No hay pagos registrados.</p>';
    return;
  }
  list.innerHTML = payments.map(p => `
    <div class="payment-item">
      <div class="payment-info">
        <div class="payment-type">${typeLabel(p.type)}</div>
        <div class="payment-date">${fmtDate(p.date)}${p.note ? ' · ' + p.note : ''}</div>
      </div>
      <div class="payment-amount">${fmtCurrency(p.amount)}</div>
      <button class="btn-ghost tiny" onclick="confirmDeletePayment(${p.id})">✕</button>
    </div>`).join('');
}

function typeLabel(t) {
  return t === 'adelanto' ? '💰 Adelanto' : t === 'pago_total' ? '✅ Pago total' : '🔄 Pago parcial';
}

async function loadPainterHistory(painterId) {
  const shifts = await DB.byIndex('shifts', 'painterId', painterId || currentPainterId);
  const list   = document.getElementById('painterHistoryList');
  if (!list) return;
  shifts.sort((a,b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  if (shifts.length === 0) {
    list.innerHTML = '<p class="empty-msg">No hay turnos registrados.</p>';
    return;
  }
  const painter = await DB.get('painters', painterId || currentPainterId);
  list.innerHTML = shifts.map(s => `
    <div class="shift-item" onclick="openEditShift(${s.id})">
      <div class="shift-info">
        <div class="shift-date">${fmtDate(s.date)}</div>
        <div class="shift-times">${fmtTime(s.startTime)} → ${fmtTime(s.endTime) || '(activo)'}${s.breakMins ? ` · −${s.breakMins}m pausa` : ''}</div>
        ${s.note ? `<div class="shift-note">${s.note}</div>` : ''}
      </div>
      <div class="shift-right">
        <div class="shift-hours">${fmtHours(s.hours || 0)}</div>
        <div class="shift-pay">${fmtCurrency((s.hours||0) * (painter?.hourlyRate||0))}</div>
      </div>
    </div>`).join('');
}
