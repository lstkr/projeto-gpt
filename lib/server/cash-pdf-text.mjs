// PDF.js may omit hasEOL when a PDF contains separate positioned text runs.
// Preserve their reading order but split distinct text baselines into lines,
// so the cash parser sees labels and monetary amounts on the same row.
export function reconstructCashPdfLines(items) {
  const lines = [];
  let fragments = [];
  let baseline = null;
  const flush = () => {
    if (fragments.length) lines.push(fragments.join(' ').replace(/\s+/g, ' ').trim());
    fragments = [];
    baseline = null;
  };
  for (const item of items || []) {
    if (typeof item?.str !== 'string') continue;
    const y = Array.isArray(item.transform) && Number.isFinite(item.transform[5])
      ? item.transform[5] : null;
    if (fragments.length && baseline !== null && y !== null && Math.abs(y - baseline) > 2.5)
      flush();
    if (item.str.trim()) fragments.push(item.str.trim());
    if (item.hasEOL) flush();
    else if (y !== null) baseline = y;
  }
  flush();
  return lines.filter(Boolean).join('\n');
}
