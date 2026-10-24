const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateFiscalLineTotal(item = {}) {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return 0;
  return cents(quantity * unitPrice);
}

export function updateFiscalLine(item, key, value) {
  const isNumeric = ['quantity', 'unitPrice', 'lineTotal', 'stockQuantity'].includes(key);
  const next = { ...item, [key]: isNumeric ? (value === '' ? 0 : Number(value)) : value };
  if (key === 'name') next.manualName = true;

  if (['quantity', 'unitPrice', 'unit'].includes(key)) {
    if (next.reportedLineTotal === undefined && Number.isFinite(Number(item.lineTotal))) {
      next.reportedLineTotal = cents(item.lineTotal);
    }
    next.lineTotal = calculateFiscalLineTotal(next);
    next.manualLineCalculation = true;
    next.readingWarning = Math.abs(next.lineTotal - Number(next.reportedLineTotal || 0)) > 0.005
      ? `Total recalculado: ${next.lineTotal.toFixed(2)}. Total lido na nota: ${cents(next.reportedLineTotal).toFixed(2)}; confira a diferença.`
      : '';
  }
  return next;
}

export function resolveFiscalSubtotal(draft, calculatedSubtotal) {
  if (!draft) return 0;
  if (draft.manualInvoice || (draft.lineTotalsEdited && !draft.subtotalManuallyEdited)) {
    return cents(calculatedSubtotal);
  }
  return Number.isFinite(Number(draft.subtotal)) ? Number(draft.subtotal) : cents(calculatedSubtotal);
}
