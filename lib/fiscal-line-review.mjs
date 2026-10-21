// Fiscal review identity is per *line*, never per array index.
// Reordering, replacing or editing a row must not transfer its approval.
const REVIEW_FIELDS = [
  'name', 'code', 'quantity', 'unit', 'unitPrice', 'lineTotal', 'itemDiscount',
  'productId', 'stockQuantity', 'stockDisposition', 'readingWarning', 'unitInferred'
];

export function fiscalLineFingerprint(item) {
  return JSON.stringify(REVIEW_FIELDS.map((field) => item?.[field] ?? null));
}

export function normalizeFiscalDraftReview(next, previous, allocateId) {
  if (!next || !Array.isArray(next.items)) return next;
  const oldById = new Map((previous?.items || [])
    .filter((item) => typeof item.lineId === 'string' && item.lineId)
    .map((item) => [item.lineId, item]));
  const counts = new Map();
  for (const item of next.items) {
    if (typeof item?.lineId === 'string')
      counts.set(item.lineId, (counts.get(item.lineId) || 0) + 1);
  }
  const ambiguousIds = new Set([...counts].filter(([, amount]) => amount > 1).map(([id]) => id));
  const seen = new Set();
  const issuerChanged = previous && String(next.supplierCnpj || '').replace(/[.\/\s-]/g, '').toUpperCase() !==
    String(previous.supplierCnpj || '').replace(/[.\/\s-]/g, '').toUpperCase();
  let contentChanged = Boolean(issuerChanged);
  const items = next.items.map((source) => {
    const item = source && typeof source === 'object' ? source : {};
    let id = typeof item.lineId === 'string' && item.lineId.length >= 6 && item.lineId.length <= 100
      ? item.lineId : '';
    if (!id || seen.has(id)) {
      do { id = allocateId(); } while (!id || seen.has(id));
      contentChanged = true;
    }
    seen.add(id);
    const older = oldById.get(id);
    if (older && fiscalLineFingerprint(older) !== fiscalLineFingerprint(item))
      contentChanged = true;
    return { ...item, lineId: id };
  });

  if ((previous?.items || []).some((item) => item?.lineId && !seen.has(item.lineId)))
    contentChanged = true;

  const reviewedItems = {};
  for (const item of items) {
    const older = oldById.get(item.lineId);
    const changed = older && fiscalLineFingerprint(older) !== fiscalLineFingerprint(item);
    // Legacy numeric-index approvals are intentionally discarded.
    if (!issuerChanged && !changed && !ambiguousIds.has(item.lineId) && next.reviewedItems?.[item.lineId] === true)
      reviewedItems[item.lineId] = true;
  }

  return {
    ...next,
    items,
    reviewedItems,
    finalReviewed: contentChanged ? false : Boolean(next.finalReviewed),
    totalsReviewed: contentChanged ? false : Boolean(next.totalsReviewed)
  };
}

