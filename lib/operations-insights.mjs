import { insightCents } from './cash-insights.mjs';
import { validInsightDay } from './insight-period.mjs';

function scaledValue(value,precision) {
  const text = String(value ?? '').trim().replace(',','.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(text) || text.length > 24) return null;
  const [whole,fraction=''] = text.split('.');
  return BigInt(whole)*10n**BigInt(precision)+BigInt(fraction.padEnd(precision,'0'));
}

function stockValue(product) {
  const quantity = scaledValue(product.stock,3);
  const unitCost = scaledValue(product.cost,6);
  if (quantity === null || unitCost === null) return null;
  // Quantidade em milésimos × custo em milionésimos de real; arredondamento metade para cima.
  const CENTS_DIVISOR = 10_000_000n;
  return (quantity*unitCost+CENTS_DIVISOR/2n)/CENTS_DIVISOR;
}

function invoiceDay(value) {
  if (validInsightDay(value)) return value;
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  const normalized = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : '';
  return validInsightDay(normalized) ? normalized : null;
}

/** Retrato atual do estoque e compras por emissão; sem CMV, margem ou associação presumida. */
export function operationsInsights({products,documents,period}) {
  let stock=0n, stockUnknown=0, low=0, purchases=0n, purchaseCount=0, unknownInvoices=0;
  for (const product of products) {
    const value = stockValue(product);
    if (value === null) stockUnknown++; else stock += value;
    const quantity = scaledValue(product.stock,3), minimum = scaledValue(product.min,3);
    if (quantity !== null && minimum !== null && quantity <= minimum) low++;
  }
  for (const invoice of documents) {
    const day = invoiceDay(invoice.date), amount = insightCents(invoice.total);
    if (!day || amount === null) { unknownInvoices++; continue; }
    if (day >= period.start && day <= period.end) { purchases += amount; purchaseCount++; }
  }
  return {stock,stockUnknown,products:products.length,low,purchases,purchaseCount,unknownInvoices};
}
