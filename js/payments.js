/**
 * payments.js — Pagos y adelantos
 * Control de Pintores PWA
 */

function showPaymentForm() {
  setVal('paymentAmount', '');
  setVal('paymentDate',   todayStr());
  setVal('paymentType',   'adelanto');
  setVal('paymentNote',   '');
  showModal('modal-payment');
}

async function savePayment() {
  const amount = parseFloat(getVal('paymentAmount'));
  const date   = getVal('paymentDate');
  const type   = getVal('paymentType');
  const note   = getVal('paymentNote').trim();

  if (!amount || amount <= 0) { showToast('Ingresa un monto válido'); return; }
  if (!date)                  { showToast('Selecciona una fecha');     return; }

  await DB.put('payments', {
    painterId: currentPainterId,
    amount, date, type, note,
    createdAt: new Date().toISOString(),
  });

  closeModal('modal-payment');
  showToast('✅ Pago registrado');
  loadPainterBalance(currentPainterId);
}

async function confirmDeletePayment(id) {
  showConfirm('Eliminar pago', '¿Seguro que quieres eliminar este pago?', async () => {
    await DB.remove('payments', id);
    showToast('Pago eliminado');
    loadPainterPayments(currentPainterId);
    loadPainterBalance(currentPainterId);
  });
}
