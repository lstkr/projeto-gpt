// Totals reconciliation stays independent; this gate controls only final review.
export function canStartFiscalFinalReview(draft, rows) {
  return Boolean(draft?.items?.length && Array.isArray(rows) && rows.every((row) => row.done));
}

export function canConfirmFiscalDocument(draft, rows) {
  return canStartFiscalFinalReview(draft, rows) &&
    draft.finalReviewed === true &&
    Boolean(String(draft.checkedBy || '').trim());
}
