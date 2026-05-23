/**
 * shifts.js — Gestión de turnos
 * Control de Pintores PWA
 */

/* ── Clock IO view ───────────────────────────────────────────────── */
async function initClockIO(painterId) {
  if (painterId) currentPainterId = Number(painterId);
  const painter = await DB.get('painters', currentPainterId);
  if (!painter) { goBack(); return; }

  // Header card
  const card = document.getElementById('clockioPainterCard');
  if (card) card.innerHTML = `
    <div class="pcard-avatar" style="background:${painter.color||'#e85d04'}">${(painter.name||'?').charAt(0).toUpperCase()}</div>
    <div><div class="pcard-name">${painter.name}</div><div class="pcard-meta">${fmtCurrency(painter.hourlyRate)}/h</div></div>`;

  startClock();
  await refreshTodayShifts();
  await updateClockButtons();
}

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  const tick = () => {
    const now = new Date();
    const el  = document.getElementById('clockTime');
    if (el) el.textContent = now.toLocaleTimeString('es-ES');
    const de = document.getElementById('clockDate');
    if (de) de.textContent = now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  };
  tick();
  clockInterval = setInterval(tick, 1000);
}

async function updateClockButtons() {
  const active = await getActiveShift(currentPainterId);
  const btnIn  = document.getElementById('btnCheckIn');
  const btnOut = document.getElementById('btnCheckOut');
  const banner = document.getElementById('activeShiftInfo');

  if (active) {
    btnIn?.classList.add('disabled');
    btnOut?.classList.remove('disabled');
    if (banner) {
      banner.classList.remove('hidden');
      const label = document.getElementById('shiftStartLabel');
      if (label) label.textContent = `Turno iniciado a las ${fmtTime(active.startTime)}`;
    }
  } else {
    btnIn?.classList.remove('disabled');
    btnOut?.classList.add('disabled');
    banner?.classList.add('hidden');
  }
}

async function checkIn() {
  const today  = todayStr();
  const active = await getActiveShift(currentPainterId);
  if (active) { showToast('Ya hay un turno activo'); return; }

  await DB.put('shifts', {
    painterId: currentPainterId,
    date:      today,
    startTime: new Date().toISOString(),
    endTime:   null,
    hours:     0,
  });

  showToast('▶ Entrada registrada');
  if (currentView === 'clockio') {
    await refreshTodayShifts();
    await updateClockButtons();
  } else {
    loadDashboard();
  }
}

async function checkOut(deductMins = 0) {
  const shift = await getActiveShift(currentPainterId);
  if (!shift) { showToast('No hay turno activo'); return; }

  shift.endTime = new Date().toISOString();

  const startMs  = new Date(shift.startTime).getTime();
  const endMs    = new Date(shift.endTime).getTime();
  const grossMs  = endMs - startMs;
  const deductMs = deductMins * 60000;
  shift.hours    = Math.max(0, grossMs - deductMs) / 3600000;

  if (deductMins > 0) {
    shift.breakMins = deductMins;
    shift.breakNote = `Pausa: ${deductMins} min descontados`;
  }

  await DB.put('shifts', shift);
  showToast(`⏹ Salida registrada · ${fmtHours(shift.hours)}`);

  if (currentView === 'clockio') {
    await refreshTodayShifts();
    await updateClockButtons();
  } else {
    loadDashboard();
  }
}

async function getActiveShift(painterId) {
  const today  = todayStr();
  const shifts = await DB.byIndex('shifts', 'painterId', Number(painterId));
  return shifts.find(s => s.date === today && !s.endTime) || null;
}

/* ── Today shifts list (in clockio view) ─────────────────────────── */
async function refreshTodayShifts() {
  const today  = todayStr();
  const shifts = (await DB.byIndex('shifts', 'painterId', currentPainterId))
    .filter(s => s.date === today)
    .sort((a,b) => a.startTime.localeCompare(b.startTime));
  const painter = await DB.get('painters', currentPainterId);

  const list = document.getElementById('todayShifts');
  if (!list) return;

  if (shifts.length === 0) {
    list.innerHTML = '<p class="empty-msg">Sin turnos hoy.</p>';
    return;
  }

  list.innerHTML = shifts.map(s => `
    <div class="shift-item" onclick="openEditShift(${s.id})">
      <div class="shift-info">
        <div class="shift-times">${fmtTime(s.startTime)} → ${s.endTime ? fmtTime(s.endTime) : '<span class="active-badge">Activo</span>'}${s.breakMins ? ` · −${s.breakMins}m` : ''}</div>
        ${s.note ? `<div class="shift-note">${s.note}</div>` : ''}
      </div>
      <div class="shift-right">
        <div class="shift-hours">${fmtHours(s.hours || 0)}</div>
        <div class="shift-pay">${fmtCurrency((s.hours||0) * (painter?.hourlyRate||0))}</div>
      </div>
    </div>`).join('');
}

/* ── Manual entry ────────────────────────────────────────────────── */
function showManualEntry() {
  setVal('manualDate', todayStr());
  setVal('manualIn',   '');
  setVal('manualOut',  '');
  setVal('manualNote', '');
  showModal('modal-manual');
}

async function saveManualEntry() {
  const date  = getVal('manualDate');
  const inT   = getVal('manualIn');
  const outT  = getVal('manualOut');
  const note  = getVal('manualNote').trim();

  if (!date || !inT || !outT) { showToast('Completa fecha, entrada y salida'); return; }

  const startTime = new Date(`${date}T${inT}`).toISOString();
  const endTime   = new Date(`${date}T${outT}`).toISOString();

  if (endTime <= startTime) { showToast('La salida debe ser después de la entrada'); return; }

  const hours = (new Date(endTime) - new Date(startTime)) / 3600000;

  await DB.put('shifts', { painterId: currentPainterId, date, startTime, endTime, hours, note, manual: true });
  closeModal('modal-manual');
  showToast('✅ Turno manual guardado');
  await refreshTodayShifts();
}

/* ── Edit / Delete shift ─────────────────────────────────────────── */
async function openEditShift(shiftId) {
  const s = await DB.get('shifts', shiftId);
  if (!s) return;
  setVal('editShiftDate', s.date);
  setVal('editShiftIn',   s.startTime ? new Date(s.startTime).toTimeString().slice(0,5) : '');
  setVal('editShiftOut',  s.endTime   ? new Date(s.endTime).toTimeString().slice(0,5)   : '');
  setVal('editShiftNote', s.note || '');
  setVal('editShiftId',   s.id);
  showModal('modal-edit-shift');
}

async function saveShiftEdit() {
  const id   = Number(getVal('editShiftId'));
  const date = getVal('editShiftDate');
  const inT  = getVal('editShiftIn');
  const outT = getVal('editShiftOut');
  const note = getVal('editShiftNote').trim();

  const s = await DB.get('shifts', id);
  if (!s) return;

  s.date      = date;
  s.startTime = new Date(`${date}T${inT}`).toISOString();
  s.note      = note;

  if (outT) {
    s.endTime = new Date(`${date}T${outT}`).toISOString();
    s.hours   = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
    if (s.breakMins) s.hours = Math.max(0, s.hours - s.breakMins / 60);
  }

  await DB.put('shifts', s);
  closeModal('modal-edit-shift');
  showToast('✅ Turno actualizado');
  if (currentView === 'clockio') refreshTodayShifts();
  else if (currentView === 'painter-detail') loadPainterHistory(currentPainterId);
  else loadHistory();
}

async function deleteShift() {
  const id = Number(getVal('editShiftId'));
  showConfirm('Eliminar turno', '¿Seguro que quieres eliminar este turno?', async () => {
    await DB.remove('shifts', id);
    closeModal('modal-edit-shift');
    showToast('Turno eliminado');
    if (currentView === 'clockio') refreshTodayShifts();
    else if (currentView === 'painter-detail') loadPainterHistory(currentPainterId);
    else loadHistory();
  });
}

/* ── History view ────────────────────────────────────────────────── */
async function loadHistory() {
  const painters = await DB.all('painters');
  const painterId = getVal('filterPainter');
  const week      = getVal('filterWeek');

  // Populate painter filter
  const sel = document.getElementById('filterPainter');
  if (sel && sel.options.length <= 1) {
    painters.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
  }

  let shifts = await DB.all('shifts');

  if (painterId) shifts = shifts.filter(s => s.painterId === Number(painterId));

  if (week) {
    const [y, w] = week.split('-W');
    shifts = shifts.filter(s => {
      const d = new Date(s.date);
      return getISOWeek(d) === Number(w) && d.getFullYear() === Number(y);
    });
  }

  shifts.sort((a,b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  const list  = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');

  if (shifts.length === 0) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  list.innerHTML = shifts.map(s => {
    const p = painters.find(x => x.id === s.painterId);
    return `
      <div class="shift-item" onclick="openEditShift(${s.id})">
        <div class="pcard-avatar tiny" style="background:${p?.color||'#e85d04'}">${(p?.name||'?').charAt(0).toUpperCase()}</div>
        <div class="shift-info">
          <div class="shift-painter-name">${p?.name || 'Desconocido'}</div>
          <div class="shift-date">${fmtDate(s.date)}</div>
          <div class="shift-times">${fmtTime(s.startTime)} → ${fmtTime(s.endTime)||'(activo)'}${s.breakMins ? ` · −${s.breakMins}m` : ''}</div>
        </div>
        <div class="shift-right">
          <div class="shift-hours">${fmtHours(s.hours||0)}</div>
          <div class="shift-pay">${fmtCurrency((s.hours||0)*(p?.hourlyRate||0))}</div>
        </div>
      </div>`;
  }).join('');
}

function clearHistoryFilters() {
  setVal('filterPainter', '');
  setVal('filterWeek',    '');
  loadHistory();
}

function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
