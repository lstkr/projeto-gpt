import { CASH_CHANNELS, isClosingWithdrawal } from './cash-closing.mjs';
import { exactCashDecimal } from './cash-correction.mjs';
import { validInsightDay } from './insight-period.mjs';

/** Reutiliza o limite e a precisão do contrato B1, retornando centavos exatos. */
export function insightCents(value) {
  try { return BigInt(exactCashDecimal(value).replace('.','')); }
  catch { return null; } // Ausência/invalidez é contada na qualidade, nunca convertida em zero.
}

/** Exibe centavos inteiros sem converter totais para ponto flutuante. */
export function insightMoney(cents) {
  if (cents === null) return 'Sem dados';
  const sign = cents < 0n ? '− ' : '';
  const amount = cents < 0n ? -cents : cents;
  return `${sign}R$ ${new Intl.NumberFormat('pt-BR').format(amount/100n)},${String(amount%100n).padStart(2,'0')}`;
}

function cashDifference(entry,revenues) {
  const counted = insightCents(entry.cashCounted);
  if (counted === null || !Array.isArray(entry.movements)) return null;
  let expected = revenues.dinheiroVendas;
  for (const movement of entry.movements) {
    if (!movement || typeof movement !== 'object') return null;
    if (isClosingWithdrawal(movement.reason)) continue;
    const amount = insightCents(movement.amount);
    if (amount === null || !['suprimento','sangria'].includes(movement.type)) return null;
    expected += movement.type === 'suprimento' ? amount : -amount;
  }
  return expected < 0n ? null : counted-expected;
}

function readClosing(entry) {
  // B1 define rubrica omitida como zero; null/vazio explícitos continuam inválidos.
  const revenues = Object.fromEntries(CASH_CHANNELS.map(([key]) => [key,
    Object.prototype.hasOwnProperty.call(entry,key) ? insightCents(entry[key]) : 0n]));
  if (Object.values(revenues).some(value => value === null)) return null;
  return {revenues,revenue:Object.values(revenues).reduce((sum,value) => sum+value,0n),
    difference:cashDifference(entry,revenues)};
}

function aggregate(entries,start,end) {
  const result = {revenue:0n,days:new Set(),count:0,invalid:0,withoutCount:0,shortage:0n,surplus:0n,
    channels:Object.fromEntries(CASH_CHANNELS.map(([key]) => [key,0n]))};
  for (const entry of entries) {
    if (!validInsightDay(entry?.day) || entry.day < start || entry.day > end) continue;
    const parsed = readClosing(entry);
    if (!parsed) { result.invalid++; continue; }
    result.revenue += parsed.revenue; result.count++; result.days.add(entry.day);
    for (const [key,amount] of Object.entries(parsed.revenues)) result.channels[key] += amount;
    if (parsed.difference === null) result.withoutCount++;
    else if (parsed.difference < 0n) result.shortage -= parsed.difference;
    else result.surplus += parsed.difference;
  }
  return result;
}

/** Agrega fechamentos já autorizados; não consulta, altera, deduplica ou projeta vendas. */
export function cashInsights(entries,period) {
  const current = aggregate(entries,period.start,period.end);
  const previous = aggregate(entries,period.previousStart,period.previousEnd);
  const days = BigInt(current.days.size);
  const average = days ? (current.revenue+days/2n)/days : null;
  const invalidDates = entries.filter(entry => !validInsightDay(entry?.day)).length;
  const variation = previous.revenue > 0n && current.count && !current.invalid && !previous.invalid && !invalidDates ?
    (current.revenue-previous.revenue)*10000n/previous.revenue : null;
  return {...current,days:current.days.size,average,variation,previousRevenue:previous.count ? previous.revenue : null,
    previousInvalid:previous.invalid,invalidDates};
}
