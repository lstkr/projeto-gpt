// Fiscal totals and provenance are still calculated independently from this UI gate.
export function canStartFiscalFinalReview(draft, rows) {
  return Boolean(draft?.items?.length && Array.isArray(rows) && rows.every((row) => row.done));
}

export function canConfirmFiscalDocument(draft, rows) {
  return canStartFiscalFinalReview(draft, rows) &&
    draft.finalReviewed === true &&
    Boolean(String(draft.checkedBy || '').trim());
}

export function invalidateFiscalFinalReview(draft) {
  return draft ? { ...draft, finalReviewed: false } : draft;
}
