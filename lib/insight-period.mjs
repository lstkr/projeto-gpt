/** Valida uma data civil sem depender do fuso da máquina. */
export function validInsightDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}

function monthEnd(year,month) {
  return new Date(Date.UTC(year,month,0,12)).toISOString().slice(0,10);
}

function previousBoundary(day,scope) {
  const [year,month,date] = day.split('-').map(Number);
  const previous = scope === 'year' ? [year-1,month] : month === 1 ? [year-1,12] : [year,month-1];
  const last = monthEnd(...previous);
  return `${last.slice(0,8)}${String(Math.min(date,Number(last.slice(8)))).padStart(2,'0')}`;
}

/** Compara calendários completos ou o mesmo recorte civil quando o período está em andamento. */
export function insightPeriod({month,scope='month',today}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || !validInsightDay(today)) return null;
  const [year,monthNumber] = month.split('-').map(Number);
  const start = scope === 'year' ? `${year}-01-01` : `${month}-01`;
  const fullEnd = scope === 'year' ? `${year}-12-31` : monthEnd(year,monthNumber);
  const partial = today >= start && today < fullEnd;
  const end = partial ? today : fullEnd;
  const previousStart = previousBoundary(start,scope);
  const previousEnd = partial ? previousBoundary(end,scope) :
    scope === 'year' ? `${year-1}-12-31` : monthEnd(Number(previousStart.slice(0,4)),Number(previousStart.slice(5,7)));
  return {start,end,previousStart,previousEnd,partial};
}

/** Data local do negócio; relógio só na borda da interface, nunca no cálculo puro. */
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = type => parts.find(entry => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
