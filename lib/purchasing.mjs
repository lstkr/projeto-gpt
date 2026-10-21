import { normalizeProductCode, normalizeProductDescription, productNameSimilarity } from './duplicate-products.mjs';
import { cnpjDigits, validSupplierCnpj, fiscalCodeIdentity } from './fiscal-identity.mjs';

const clean = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function supplierKey(document) {
  const taxId = cnpjDigits(document?.supplierCnpj);
  const name = clean(document?.supplier);
  return taxId.length === 14 ? 'cnpj:' + taxId : name ? 'name:' + name : '';
}
export function sameSupplier(a, b) {
  const aId = cnpjDigits(a?.supplierCnpj);
  const bId = cnpjDigits(b?.supplierCnpj);
  if (aId.length === 14 && bId.length === 14) return aId === bId;
  const aName = clean(a?.supplier);
  const bName = clean(b?.supplier);
  return Boolean(aName && bName && aName === bName);
}
const unit = (value) => {
  const key = clean(value || 'un');
  return ({ und: 'un', unidade: 'un', in: 'un', pc: 'un', gr: 'g',
    kgs: 'kg', lt: 'l', litro: 'l', litros: 'l', caixa: 'cx',
    pote: 'pt', pacote: 'pct', fardo: 'fd' })[key] || key;
};
const stockItem = (item) => item.stockDisposition === 'stock' ||
  (item.stockDisposition !== 'expense' &&
    !/(?:^| )(?:gorjeta|taxa de entrega|frete|servico entrega)(?: |$)/.test(clean(item.name)));

function resolveHistoricalId(item, doc, products) {
  const ids = new Set(products.map((p) => String(p.id)));
  if (item.productId && ids.has(String(item.productId))) return String(item.productId);
  // Old invoices may lack item.productId. A single inventory entry linked to a
  // single physical line is unambiguous; more lines must remain manual.
  const physicalItems = (doc.items || []).filter(stockItem);
  const entries = Array.isArray(doc.stockEntries) ? doc.stockEntries : [];
  if (physicalItems.length === 1 && entries.length === 1 &&
      ids.has(String(entries[0].productId))) return String(entries[0].productId);
  // A legacy description or internal SKU cannot reconstruct a fiscal link.
  return '';
}

export function findHistoricalMatches(receipt, documents, products) {
  if (!receipt || !Array.isArray(receipt.items)) return [];
  return receipt.items.map((item) => {
    if (!stockItem(item)) return null;
    const matches = [];
    for (const doc of documents || []) {
      if (!sameSupplier(receipt, doc)) continue;
      for (const old of doc.items || []) {
        if (!stockItem(old)) continue;
        const similarity = productNameSimilarity(item.name, old.name);
        const a = normalizeProductCode(item.code);
        const b = normalizeProductCode(old.code);
        const exactCode = Boolean(a && b && a === b);
        const sameUnit = unit(item.unit) === unit(old.unit);
        if (!exactCode && similarity < 0.78) continue;
        const productId = resolveHistoricalId(old, doc, products || []);
        const confident = sameUnit && (similarity >= 0.97 ||
          (exactCode && similarity >= 0.75));
        matches.push({
          supplier: doc.supplier || receipt.supplier || 'Fornecedor não informado',
          supplierCnpj: doc.supplierCnpj || '',
          invoiceNumber: doc.invoiceNumber || '',
          productId, historicalName: old.name, historicalCode: old.code || '',
          sameUnit, similarity: Math.round(similarity * 100),
          confident, exactCode,
          // Never silently reinterpret a scanned description solely by code.
          reason: exactCode ? 'Mesmo código fiscal do fornecedor' : 'Descrição semelhante em compra anterior'
        });
      }
    }
    matches.sort((a,b) => Number(b.confident) - Number(a.confident) ||
      Number(b.exactCode) - Number(a.exactCode) || b.similarity - a.similarity);
    const targets = new Set(matches.filter((hit) => hit.productId && hit.sameUnit &&
      fiscalCodeIdentity(hit.historicalCode) === fiscalCodeIdentity(item.code)).map((hit) => hit.productId));
    return matches[0] ? {...matches[0], confident: targets.size > 1 ? false : matches[0].confident} : null;
  });
}

export function attachPreviousPurchases(receipt, documents, products) {
  const matches = findHistoricalMatches(receipt, documents, products);
  return { ...receipt, items: (receipt.items || []).map((item, index) => {
    const hit = matches[index];
    // Similarity and zero-padding only suggest a review. Automatic assignment
    // needs a valid issuer and an exact code already linked by that issuer.
    if (!validSupplierCnpj(receipt.supplierCnpj) || !fiscalCodeIdentity(item.code) ||
        !validSupplierCnpj(hit?.supplierCnpj) || cnpjDigits(hit.supplierCnpj) !== cnpjDigits(receipt.supplierCnpj) ||
        fiscalCodeIdentity(item.code) !== fiscalCodeIdentity(hit?.historicalCode)) return item;
    if (!hit?.confident || !hit.productId || item.productId || item.stockDisposition === 'expense')
      return item;
    const target = (products || []).find((p) => String(p.id) === hit.productId);
    if (!target || unit(target.unit) !== unit(item.unit)) return item;
    // An explicit historical link saves the operator from creating a duplicate.
    return { ...item, productId: hit.productId };
  }) };
}

export function purchaseHistoryByProduct(products, documents) {
  const known = new Set((products || []).map((p) => String(p.id)));
  const totals = new Map();
  for (const document of documents || []) {
    const supplier = document.supplier || 'Fornecedor não informado';
    const entries = document.stockEntries || [];
    for (const entry of entries) {
      const id = String(entry.productId || '');
      const n = Number(entry.quantity);
      const price = Number(entry.netUnitCost);
      if (!known.has(id) || !(n > 0) || !Number.isFinite(price) || price < 0) continue;
      if (!totals.has(id)) totals.set(id, { quantity: 0, cost: 0, entries: 0, suppliers: new Map() });
      const result = totals.get(id);
      result.quantity += n;
      result.cost += n * price;
      result.entries += 1;
      const key = supplierKey(document) || 'name:' + clean(supplier);
      if (!result.suppliers.has(key)) result.suppliers.set(key, { name: supplier, count: 0, quantity: 0 });
      const info = result.suppliers.get(key);
      info.count += 1;
      info.quantity += n;
    }
  }
  return new Map([...totals].map(([id, data]) => {
    const suppliers = [...data.suppliers.values()].sort((a,b) =>
      b.count - a.count || b.quantity - a.quantity);
    return [id, {
      average: data.quantity ? Math.round(data.cost / data.quantity * 10000)/10000 : null,
      totalPurchased: data.quantity, entries: data.entries, suppliers,
      usualSupplier: suppliers[0]?.name || ''
    }];
  }));
}

export function purchasePlan(products, documents) {
  const history = purchaseHistoryByProduct(products, documents);
  const items = (products || []).filter((p) => Number(p.min) > Number(p.stock)).map((p) => {
    const buy = Math.round((Number(p.min) - Number(p.stock)) * 1000)/1000;
    const stats = history.get(String(p.id));
    const fallback = Number(p.cost);
    const historic = stats?.average;
    const unitCost = Number.isFinite(historic) ? historic :
      Number.isFinite(fallback) && fallback > 0 ? fallback : null;
    return { ...p, buy, averagePaid: historic ?? null, unitEstimate: unitCost,
      estimate: unitCost == null ? null : Math.round(unitCost * buy * 100)/100,
      usualSupplier: p.preferredSupplier || stats?.usualSupplier || '',
      supplierSource: p.preferredSupplier ? 'manual' : stats?.usualSupplier ? 'histórico' : 'não informado',
      priceSource: historic != null ? 'histórico' : unitCost != null ? 'cadastro' : 'indisponível' };
  });
  items.sort((a,b) => clean(a.category || 'Outros').localeCompare(clean(b.category || 'Outros'),'pt-BR') ||
    clean(a.name).localeCompare(clean(b.name),'pt-BR'));
  const categoryMap = new Map();
  for (const item of items) {
    const name = item.category || 'Outros';
    if (!categoryMap.has(name)) categoryMap.set(name, { name, items: [], subtotal: 0, missingPrices: 0 });
    const group = categoryMap.get(name);
    group.items.push(item);
    if (item.estimate === null) group.missingPrices++; else group.subtotal += item.estimate;
  }
  return {
    items, categories: [...categoryMap.values()],
    total: Math.round(items.reduce((sum, p) => sum + (p.estimate || 0), 0)*100)/100,
    missingPrices: items.filter((p) => p.estimate === null).length
  };
}

export function purchaseHistoryBySupplier(documents) {
  const suppliers = new Map();
  for (const doc of documents || []) {
    const key = supplierKey(doc) || 'unknown';
    const name = doc.supplier || 'Fornecedor não identificado';
    if (!suppliers.has(key)) suppliers.set(key, { key, name, cnpj: doc.supplierCnpj || '',
      documents: [], total: 0, items: 0 });
    const group = suppliers.get(key);
    const amount = Number(doc.total);
    const fallback = (doc.items || []).reduce((sum, item) =>
      sum + (Number(item.lineTotal) || Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    group.total += Number.isFinite(amount) && amount >= 0 ? amount : fallback;
    group.items += (doc.items || []).length;
    group.documents.push(doc);
  }
  return [...suppliers.values()].sort((a,b) => b.documents.length - a.documents.length ||
    clean(a.name).localeCompare(clean(b.name),'pt-BR')).map((p)=>({
      ...p, total: Math.round(p.total*100)/100
    }));
}

