// Run an expensive second OCR pass only when the first pass is not clearly consistent.
export function needsSecondOcrPass(items, totals, confidence) {
  if (!Array.isArray(items) || items.length === 0) return true;
  // A complete first pass needs traceable fiscal product codes and consistent line totals.
  if (items.some((item) => {
    const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice);
    const lineTotal = Number(item.lineTotal);
    return !String(item.code || '').trim() || item.readingWarning || item.unitInferred ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 ||
      !Number.isFinite(lineTotal) || lineTotal < 0 ||
      Math.abs(quantity * unitPrice - lineTotal) > 0.055;
  })) return true;
  if (!Number.isFinite(confidence) || confidence < 70) return true;
  // The printed total must be present; a total guessed from recognized lines is not evidence.
  if (!totals || totals.totalsSource !== 'OCR (leitura principal)' ||
      totals.totalsWarning || !totals.hasPrintedTotal) return true;
  return false;
}
