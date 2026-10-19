/**
 * Inventory count scheduling domain rules.
 * All dates use YYYY-MM-DD in America/Sao_Paulo.
 * A due date becomes mandatory at the beginning of that local day.
 */
export const COUNT_DEFAULTS = Object.freeze({
  enabled: false, mode: 'interval', intervalDays: 7,
  weekday: 1, monthDay: 1, configuredAt: ''
});

const TIMEZONE = 'America/Sao_Paulo';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function countDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid count timestamp');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

export function countDateLabel(isoDate) {
  if (!isoDate || !ISO_DATE.test(isoDate)) return 'Não definida';
  return isoDate.slice(8, 10) + '/' + isoDate.slice(5, 7) + '/' + isoDate.slice(0, 4);
}

function validDayKey(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

function localDayFromLatestCount(history = []) {
  let latest = null;
  for (const count of Array.isArray(history) ? history : []) {
    if (!count?.completedAt) continue;
    const date = new Date(count.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest ? countDay(latest) : null;
}

function validSetting(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function calendarMonthDay(year, monthZeroBased, requestedDay) {
  const lastDay = new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthZeroBased, Math.min(requestedDay, lastDay)));
}

/**
 * Next mandatory count date, or null if disabled by the Gestor.
 * A completed count restarts the schedule from its completion date.
 * Inject today for deterministic tests.
 */
export function countDueDate(settings, history = [], today = countDay()) {
  if (!settings?.enabled) return null;
  const startDay = localDayFromLatestCount(history) ||
    (validDayKey(settings.configuredAt) ? settings.configuredAt : today);
  if (!validDayKey(startDay)) throw new RangeError('Invalid inventory count start date');
  const [year, month, day] = startDay.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));

  if (settings.mode === 'weekly') {
    const requested = validSetting(settings.weekday, 1, 7, COUNT_DEFAULTS.weekday);
    const current = start.getUTCDay() || 7;
    const daysAhead = ((requested - current + 6) % 7) + 1;
    start.setUTCDate(start.getUTCDate() + daysAhead);
  } else if (settings.mode === 'monthly') {
    const requested = validSetting(settings.monthDay, 1, 31, COUNT_DEFAULTS.monthDay);
    let next = calendarMonthDay(year, month - 1, requested);
    if (next <= start) next = calendarMonthDay(year, month, requested);
    return next.toISOString().slice(0, 10);
  } else {
    const days = validSetting(settings.intervalDays, 1, 365, COUNT_DEFAULTS.intervalDays);
    start.setUTCDate(start.getUTCDate() + days);
  }
  return start.toISOString().slice(0, 10);
}
