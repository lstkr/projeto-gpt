export function summarizeCashMonthly(entries) {
  const valid = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.revenue != null && entry.revenue !== '' &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(entry.day || '')) &&
      Number.isFinite(Number(entry.revenue)) && Number(entry.revenue) >= 0)
    .map((entry) => ({ day: String(entry.day), revenue: Math.round(Number(entry.revenue) * 100) / 100 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!valid.length) return null;

  let minimum = valid[0];
  let maximum = valid[0];
  for (const entry of valid.slice(1)) {
    if (entry.revenue < minimum.revenue) minimum = entry;
    if (entry.revenue > maximum.revenue) maximum = entry;
  }
  return { minimum, maximum };
}
