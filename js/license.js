/**
 * license.js — Sistema de Licencias v1.0
 * Control de Pintores PWA
 */

const LICENSE = (() => {
  const SALT        = 'CtrlPintores@2024!';
  const TRIAL_DAYS  = 30;
  const STORE_KEY   = 'cp_lic_v1';
  const WHATSAPP    = '+1234567890';   // 🔧 CAMBIA esto por tu número real
  const PAYMENT_URL = '';              // 🔧 Opcional: link de pago

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }

  function save(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function daysSince(iso) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function checksum(payload) {
    const str = SALT + payload;
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(h, 31) ^ str.charCodeAt(i)) >>> 0;
    }
    const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let r = '', v = h;
    for (let i = 0; i < 4; i++) { r += C[v % C.length]; v = Math.floor(v / C.length); }
    return r;
  }

  function init() {
    const d = load();
    if (d.type === 'full' && validateCode(d.code)) return { status: 'active' };
    if (!d.installDate) { d.installDate = new Date().toISOString(); save(d); }
    const used = daysSince(d.installDate);
    const left = Math.max(0, TRIAL_DAYS - used);
    return left > 0 ? { status: 'trial', daysLeft: left, daysUsed: used } : { status: 'expired' };
  }

  function validateCode(code) {
    if (!code) return false;
    const c = code.toUpperCase().replace(/[\s\-]/g, '');
    if (c.length !== 16 || !c.startsWith('PINT')) return false;
    const payload = c.slice(4, 12);
    const check   = c.slice(12, 16);
    return checksum(payload) === check;
  }

  function activate(code) {
    if (!validateCode(code)) return false;
    const d = load();
    d.type = 'full';
    d.code = code.toUpperCase().replace(/[\s\-]/g, '');
    d.activatedAt = new Date().toISOString();
    save(d);
    return true;
  }

  function getWhatsAppLink() {
    const msg = encodeURIComponent('¡Hola! Necesito activar mi licencia de Control de Pintores.');
    return `https://wa.me/${WHATSAPP.replace(/\D/g, '')}?text=${msg}`;
  }

  function getPaymentUrl() { return PAYMENT_URL; }

  return { init, validateCode, activate, getWhatsAppLink, getPaymentUrl };
})();

/* ── UI helpers ──────────────────────────────────────────────────── */

function initLicense() {
  const state = LICENSE.init();
  if (state.status === 'active') { hideLicenseUI(); return; }
  if (state.status === 'trial')  { showTrialBanner(state.daysLeft); return; }
  showLicenseWall();
}

function hideLicenseUI() {
  ['licenseWall','trialBanner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showTrialBanner(daysLeft) {
  const banner = document.getElementById('trialBanner');
  if (!banner) return;
  const txt = document.getElementById('trialBannerText');
  if (txt) txt.textContent = daysLeft === 1
    ? '⚠️ Último día de prueba gratuita — Activar'
    : `🕐 Prueba: ${daysLeft} días restantes — Activar`;
  banner.classList.remove('hidden');
  banner.onclick = () => {
    showView('settings');
    setTimeout(() => document.getElementById('licenseSection')?.scrollIntoView({ behavior: 'smooth' }), 200);
  };
}

function showLicenseWall() {
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.pointerEvents = 'none';
  const wall = document.getElementById('licenseWall');
  if (!wall) return;
  const waBtn = document.getElementById('licenseWhatsApp');
  if (waBtn) waBtn.href = LICENSE.getWhatsAppLink();
  const payBtn = document.getElementById('licensePayment');
  if (payBtn) {
    const url = LICENSE.getPaymentUrl();
    url ? payBtn.href = url : payBtn.classList.add('hidden');
  }
  wall.classList.remove('hidden');
}

function tryActivateLicense(inputId) {
  const input = document.getElementById(inputId || 'licenseCodeInput');
  if (!input) return;
  const code = input.value.trim();
  if (!code) { showToast('Ingresa el código de activación'); return; }
  if (LICENSE.activate(code)) {
    showToast('✅ ¡Licencia activada exitosamente!');
    hideLicenseUI();
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.pointerEvents = '';
    input.value = '';
    renderLicenseStatus();
  } else {
    showToast('❌ Código inválido. Verifica e intenta de nuevo.');
    input.focus();
  }
}

function renderLicenseStatus() {
  const el = document.getElementById('licenseStatusText');
  if (!el) return;
  const state = LICENSE.init();
  const row = document.getElementById('licenseActivateRow');
  if (state.status === 'active') {
    el.innerHTML = '<span class="lic-badge active">✅ Licencia activa</span>';
    if (row) row.classList.add('hidden');
  } else if (state.status === 'trial') {
    el.innerHTML = `<span class="lic-badge trial">🕐 Prueba: ${state.daysLeft} días restantes</span>`;
    if (row) row.classList.remove('hidden');
  } else {
    el.innerHTML = '<span class="lic-badge expired">⛔ Período de prueba expirado</span>';
    if (row) row.classList.remove('hidden');
  }
}
