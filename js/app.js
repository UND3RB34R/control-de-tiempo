/**
 * app.js — Lógica principal y navegación
 * Control de Pintores PWA
 */

/* ── Estado global ───────────────────────────────────────────────── */
let currentView        = 'dashboard';
let viewHistory        = [];
let currentPainterId   = null;
let clockInterval      = null;
let settings           = {};

/* ── Boot ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await DB.open();
  await loadSettings();
  applyTheme();
  applyAccentColor();
  updateCompanyInfo();
  updateDateDisplay();

  // Registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Splash → app
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      initLicense();
      renderLicenseStatus();
      showView('dashboard');
    }, 400);
  }, 1200);
});

/* ── Navegación ──────────────────────────────────────────────────── */
function showView(view, data = null) {
  // Ocultar todas
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Guardar historial (no pushear si es la misma vista)
  if (currentView !== view) viewHistory.push(currentView);
  currentView = view;

  // Mostrar la vista objetivo
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');

  // Botón back
  const btnBack = document.getElementById('btnBack');
  const noBack  = ['dashboard','history','summary','painters'];
  btnBack.classList.toggle('hidden', noBack.includes(view));

  // Título topbar
  const titles = {
    dashboard: 'Panel Principal', history: 'Historial', summary: 'Resumen',
    painters: 'Pintores', 'add-painter': 'Nuevo Pintor', 'painter-detail': 'Detalle',
    settings: 'Configuración', clockio: 'Fichar', 'tax-calculator': 'Impuestos NZ',
  };
  document.getElementById('topbarTitle').textContent = titles[view] || '';

  // Nav activo
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navMap = { dashboard:'dashboard', history:'history', summary:'summary', painters:'painters' };
  const navId  = navMap[view];
  if (navId) document.getElementById(`nav-${navId}`)?.classList.add('active');

  // Cargar datos de la vista
  switch (view) {
    case 'dashboard':       loadDashboard();      break;
    case 'history':         loadHistory();        break;
    case 'summary':         loadSummary();        break;
    case 'painters':        loadPaintersManage(); break;
    case 'add-painter':     initAddPainterForm(data); break;
    case 'painter-detail':  loadPainterDetail(data); break;
    case 'settings':        loadSettings().then(renderSettingsForm); renderLicenseStatus(); break;
    case 'clockio':         initClockIO(data);    break;
    case 'tax-calculator':  renderTaxCalculator(); break;
  }
}

function goBack() {
  const prev = viewHistory.pop();
  if (prev) showView(prev);
  else      showView('dashboard');
}

/* ── Dashboard ───────────────────────────────────────────────────── */
async function loadDashboard() {
  const painters = await DB.all('painters');
  const shifts   = await DB.all('shifts');
  const today    = todayStr();

  // Stats
  document.getElementById('statPintores').textContent = painters.length;

  const todayShifts = shifts.filter(s => s.date === today);
  const hoursHoy    = todayShifts.reduce((a, s) => a + (s.hours || 0), 0);
  document.getElementById('statHorasHoy').textContent = hoursHoy.toFixed(1) + 'h';

  const payments = await DB.all('payments');
  const totalEarned = shifts.reduce((a, s) => {
    const p = painters.find(x => x.id === s.painterId);
    return a + (s.hours || 0) * (p?.hourlyRate || 0);
  }, 0);
  const totalPaid = payments.reduce((a, p) => a + (p.amount || 0), 0);
  document.getElementById('statPendiente').textContent = fmtCurrency(Math.max(0, totalEarned - totalPaid));

  // Lista pintores
  const list = document.getElementById('paintersList');
  const empty = document.getElementById('emptyState');

  if (painters.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Para cada pintor, calcular estado
  const cards = await Promise.all(painters.map(async painter => {
    const active = shifts.find(s => s.painterId === painter.id && s.date === today && !s.endTime);
    const todayH = todayShifts.filter(s => s.painterId === painter.id).reduce((a,s) => a+(s.hours||0), 0);
    return buildPainterCardHTML(painter, !!active, todayH);
  }));

  list.innerHTML = cards.join('');
}

function updateDateDisplay() {
  const el = document.getElementById('currentDateDisplay');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}

function updateCompanyInfo() {
  const name = settings.company || 'Mi Empresa';
  const logo = settings.logo   || '🎨';
  const nameEl = document.getElementById('companyNameDisplay');
  const logoEl = document.getElementById('companyLogoDisplay');
  if (nameEl) nameEl.textContent = name;
  if (logoEl) logoEl.textContent = logo;
}

/* ── Settings ────────────────────────────────────────────────────── */
async function loadSettings() {
  const raw = await DB.getSetting('app_settings');
  settings  = raw || {};
  return settings;
}

function renderSettingsForm() {
  const s = settings;
  setVal('settingsCompany', s.company || '');
  setVal('settingsLogo',    s.logo    || '🎨');
  setVal('settingsAccentColor', s.accentColor || '#e85d04');
  const dm = document.getElementById('settingsDarkMode');
  if (dm) dm.checked = s.darkMode || false;
  setVal('settingsBreakMins', s.breakMins || 30);
  const bp = document.getElementById('settingsBreakPaid');
  if (bp) bp.checked = s.breakPaid || false;
}

async function saveSettings() {
  settings.company      = getVal('settingsCompany');
  settings.logo         = getVal('settingsLogo') || '🎨';
  settings.darkMode     = document.getElementById('settingsDarkMode')?.checked || false;
  settings.accentColor  = getVal('settingsAccentColor') || '#e85d04';
  settings.breakMins    = parseInt(getVal('settingsBreakMins')) || 30;
  settings.breakPaid    = document.getElementById('settingsBreakPaid')?.checked || false;

  await DB.setSetting('app_settings', settings);
  applyTheme();
  applyAccentColor();
  updateCompanyInfo();
  showToast('✅ Configuración guardada');
  goBack();
}

function applyTheme() {
  const dark = settings.darkMode || false;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
  const sd = document.getElementById('settingsDarkMode');
  if (sd) sd.checked = dark;
}

function applyThemeFromSettings() {
  settings.darkMode = document.getElementById('settingsDarkMode')?.checked || false;
  applyTheme();
}

function applyAccentColor() {
  const color = settings.accentColor || '#e85d04';
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-rgb', hexToRgb(color));
}

function toggleTheme() {
  settings.darkMode = !settings.darkMode;
  DB.setSetting('app_settings', settings);
  applyTheme();
}

function confirmClearData() {
  showConfirm(
    '¿Borrar todos los datos?',
    'Se eliminarán todos los pintores, turnos y pagos. Esta acción no se puede deshacer.',
    async () => {
      await DB.clearAll();
      localStorage.removeItem('cp_lic_v1');
      showToast('Datos eliminados');
      location.reload();
    }
  );
}

/* ── Toast ───────────────────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ── Modal genérico ──────────────────────────────────────────────── */
function showModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showConfirm(title, msg, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  const btn = document.getElementById('confirmBtn');
  btn.onclick = () => { closeModal('modal-confirm'); onConfirm(); };
  showModal('modal-confirm');
}

/* ── Tab switcher ────────────────────────────────────────────────── */
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  btn?.classList.add('active');

  if (tabId === 'tab-payments') loadPainterPayments(currentPainterId);
  if (tabId === 'tab-history')  loadPainterHistory(currentPainterId);
}

/* ── Utilities ───────────────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtCurrency(n) {
  return '$' + Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function fmtTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(str) {
  if (!str) return '';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function getVal(id)      { return document.getElementById(id)?.value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

/* ── License input formatter ────────────────────────────────────── */
function formatLicenseInput(el) {
  let v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = '';
  for (let i = 0; i < v.length && i < 16; i++) {
    if (i === 4 || i === 8 || i === 12) out += '-';
    out += v[i];
  }
  el.value = out;
}

/* ── Break modal state ───────────────────────────────────────────── */
let _breakHasBreak = false;
let _breakCount    = 1;
let _breakMins     = 30;

function showBreakModal() {
  const defMins = parseInt(document.getElementById('settingsBreakMins')?.value || '30');
  const defPaid = document.getElementById('settingsBreakPaid')?.checked || false;
  _breakHasBreak = false;
  _breakCount    = 1;
  _breakMins     = defMins;
  setVal('breakCount', _breakCount);
  setVal('breakMins',  _breakMins);
  const bpt = document.getElementById('breakPaidType');
  if (bpt) bpt.value = defPaid ? 'paid' : 'unpaid';
  document.getElementById('breakDetail')?.classList.add('hidden');
  document.getElementById('breakBtnNo')?.classList.add('active');
  document.getElementById('breakBtnYes')?.classList.remove('active');
  updateBreakSummary();
  showModal('modal-break');
}

function closeBreakModal() { closeModal('modal-break'); }

function setBreakAnswer(hasBreak) {
  _breakHasBreak = hasBreak;
  document.getElementById('breakBtnYes')?.classList.toggle('active',  hasBreak);
  document.getElementById('breakBtnNo')?.classList.toggle('active',  !hasBreak);
  document.getElementById('breakDetail')?.classList.toggle('hidden', !hasBreak);
  updateBreakSummary();
}

function changeBreakCount(delta) {
  _breakCount = Math.max(1, Math.min(10, _breakCount + delta));
  const el = document.getElementById('breakCount');
  if (el) el.textContent = _breakCount;
  updateBreakSummary();
}

function changeBreakMins(delta) {
  _breakMins = Math.max(5, Math.min(120, _breakMins + delta));
  const el = document.getElementById('breakMins');
  if (el) el.textContent = _breakMins;
  updateBreakSummary();
}

function updateBreakSummary() {
  const el = document.getElementById('breakSummary');
  if (!el) return;
  if (!_breakHasBreak) { el.textContent = 'Sin pausas registradas'; return; }
  const total = _breakCount * _breakMins;
  const paid  = document.getElementById('breakPaidType')?.value === 'paid';
  el.textContent = paid
    ? `${_breakCount} pausa(s) × ${_breakMins} min — Pagadas (no se descuenta)`
    : `Se descontarán ${total} min del turno`;
}

function confirmBreakAndCheckOut() {
  const paid       = document.getElementById('breakPaidType')?.value === 'paid';
  const deductMins = (_breakHasBreak && !paid) ? (_breakCount * _breakMins) : 0;
  closeBreakModal();
  checkOut(deductMins);
}
