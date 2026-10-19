import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CASH_CHANNELS,cashTotals,validateCashClosing,aggregateCashMonthly } from '../lib/cash-closing.mjs';
import { parseCashReport } from '../lib/cash-report-parser.mjs';
import { normalizeProductCode, findPotentialDuplicates, findDuplicatesForCandidate, checkDuplicatePair } from '../lib/duplicate-products.mjs';
import { attachPreviousPurchases, findHistoricalMatches, purchasePlan, purchaseHistoryBySupplier } from '../lib/purchasing.mjs';

const initialProducts = [
  { id: '1', name: 'Café em grãos', sku: 'CAF-001', category: 'Cafés', unit: 'kg', stock: 8.5, min: 3, cost: 42.9 },
  { id: '2', name: 'Leite integral', sku: 'LAT-001', category: 'Laticínios', unit: 'L', stock: 12, min: 15, cost: 4.79 },
  { id: '3', name: 'Chocolate 40%', sku: 'CHO-040', category: 'Confeitaria', unit: 'kg', stock: 3.2, min: 2, cost: 31.5 },
  { id: '4', name: 'Açúcar refinado', sku: 'ACO-001', category: 'Mercearia', unit: 'kg', stock: 6, min: 4, cost: 4.2 },
  { id: '5', name: 'Copos 300 ml', sku: 'EMB-300', category: 'Embalagens', unit: 'un', stock: 84, min: 100, cost: 0.18 },
  { id: '6', name: 'Canela em pó', sku: 'TEM-003', category: 'Mercearia', unit: 'g', stock: 450, min: 200, cost: 0.035 },
];
const initialMovements = [
  { id: 'm1', product: 'Café em grãos', type: 'Entrada', quantity: 5, reason: 'Compra registrada', date: 'Hoje, 09:20' },
  { id: 'm2', product: 'Leite integral', type: 'Saída', quantity: 3, reason: 'Consumo interno', date: 'Hoje, 09:18' },
  { id: 'm3', product: 'Chocolate 40%', type: 'Entrada', quantity: 2, reason: 'Compra registrada', date: 'Ontem, 16:42' },
];
const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const qty = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(v || 0));
const norm = (v) => String(v || '').trim().toLocaleLowerCase('pt-BR');
const uid = () => Math.random().toString(36).slice(2, 10);
const isLow = (p) => Number(p.stock) <= Number(p.min);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dpauqdihvhbbaellwjav.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7YF3ypYXkL-7MVcwozMx7w_AnLDFju7';
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function Icon({ type, size = 20 }) {
  const p = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
    box: <><path d="m12 3 9 4.5v9L12 21l-9-4.5v-9L12 3Z"/><path d="m3.5 7.7 8.5 4.5 8.5-4.5M12 12.2V21"/></>,
    file: <><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    arrows: <><path d="M7 7h13l-3-3M17 17H4l3 3M20 7v5M4 12v5"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m6 9 6 6 6-6"/>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 16.5h.01"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    edit: <><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.5 6 3.5 3.5"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[type] || p.box}</svg>;
}

function parseNfeXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('O arquivo não parece ser um XML válido.');
  const all = Array.from(doc.getElementsByTagName('*'));
  const find = (element, name) => Array.from(element.getElementsByTagName('*')).find((n) => n.localName === name)?.textContent?.trim() || '';
  const ide = all.find((n) => n.localName === 'ide') || doc;
  const emit = all.find((n) => n.localName === 'emit') || doc;
  const items = all.filter((n) => n.localName === 'det').map((det) => {
    const prod = Array.from(det.getElementsByTagName('*')).find((n) => n.localName === 'prod');
    if (!prod) return null;
    const read = (name) => Array.from(prod.getElementsByTagName('*')).find((n) => n.localName === name)?.textContent?.trim() || '';
    const quantity = Number(read('qCom')) || 1;
    const unitPrice = Number(read('vUnCom')) || 0;
    const lineGross = Number(read('vProd'));
    const itemDiscount = Number(read('vDesc')) || 0;
    const lineTotal = Number.isFinite(lineGross) && lineGross > 0 ? lineGross : Math.round(quantity * unitPrice * 100) / 100;
    return { name: read('xProd'), code: read('cProd'), quantity, unit: read('uCom') || 'un', unitPrice, lineTotal, itemDiscount };
  }).filter((item) => item && item.name);
  if (!items.length) throw new Error('Não encontrei produtos. Use o XML completo da NF-e, não apenas uma foto do DANFE.');
  const totalsNode = all.find((n) => n.localName === 'ICMSTot') || doc;
  const xmlNumber = (name) => {
    const raw = find(totalsNode, name);
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const subtotal = xmlNumber('vProd');
  const discount = xmlNumber('vDesc');
  const total = xmlNumber('vNF');
  return {
    supplier: find(emit, 'xNome') || '',
    supplierCnpj: find(emit, 'CNPJ') || '',
    invoiceNumber: find(ide, 'nNF') || '',
    date: find(ide, 'dhEmi') || find(ide, 'dEmi') || '',
    source: 'XML de NF-e',
    subtotal: subtotal ?? items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
    discount: discount ?? 0,
    total: total ?? Math.max(0, (subtotal ?? items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)) - (discount ?? 0)),
    totalsSource: 'XML oficial',
    items
  };
}

function localizedValue(raw) {
  let value = String(raw || '').trim();
  if (value.includes(',') && value.includes('.')) value = value.replace(/\./g, '').replace(',', '.');
  else if (value.includes(',')) value = value.replace(',', '.');
  return Number(value);
}

function parseReceiptOcr(text) {
  const source = String(text || '');
  const lines = source.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const amountPattern = /(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,4}|\d+\.\d{2,4}/g;
  const codePattern = /^((?:[A-Z]\d{2,12}|\d{3,12}))(?:\s+(.+))?$/i;
  const unitPattern = /\b(KG|KGS|GR|G|ML|LT|L|UND|UNIDADE|UN|IN|CX|PC|PCT|FD|PT)\b/i;
  const cents = (number) => Math.round(number * 100) / 100;
  const header = lines.findIndex((line) => {
    const n = normalize(line);
    return /C[O0]DIGO/.test(n) && /DESCRI[CCT]/.test(n);
  });
  const start = header >= 0 ? header + 1 : 0;
  const endsTable = (value) =>
    /(?:Q(?:TD|TDE|TID)[., ]*TOTAL|Q(?:TD|TDE)[., ]*DE[., ]*ITENS|SUB[\s-]*TOTAL|VALOR[\s-]*TOTAL|FORMA[\s-]*PAGAMENTO|VALOR[\s-]*PAGO|CONSULTE[\s-]*PELA|CAIXA[\s-]*DELTA|TRIBUTOS|PROTOCOLO[\s-]*DE[\s-]*AUTORIZACAO)/.test(normalize(value));
  const cleanDescription = (value) => String(value || '')
    .split(/(?:Q(?:TD|TDE)[., ]*TOTAL|SUB[\s-]*TOTAL|VALOR[\s-]*TOTAL)/i)[0]
    .replace(/[|:;]+/g, ' ').replace(/\s+/g, ' ')
    .replace(/^[\s\W]+|[\s\W]+$/g, '').trim();
  const rows = [];
  let row = null;
  let seenProductCode = false;
  const flush = () => {
    if (!row) return;
    const name = cleanDescription(row.names.join(' '));
    const letters = (name.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    const values = row.amounts.filter(Number.isFinite);
    if (letters < 3 || values.length < 2) { row = null; return; }
    const quantity = values[0];
    if (!(quantity > 0) || quantity > 100000) { row = null; return; }
    let unitPrice = values[1];
    let lineTotal = values.length >= 3 ? values[values.length - 1] : null;
    // On a two-number OCR row (quantity + amount), the unit price may have
    // disappeared. Do not treat the second printed number as quantity.
    if (lineTotal === null) lineTotal = quantity * unitPrice;
    if (!(lineTotal >= 0) || lineTotal > 1000000 || !(unitPrice >= 0) || unitPrice > 1000000) {
      row = null; return;
    }
    const mismatch = Math.abs(quantity * unitPrice - lineTotal);
    // Never silently overwrite the printed unit price (thermal receipts can round it).
    const readingWarning = values.length >= 3 && mismatch > 0.055
      ? 'Quantidade × preço difere do total impresso. Confira os três campos.' : '';
    rows.push({
      code: row.code, name: name.slice(0, 120),
      quantity, unit: row.unit || 'un',
      unitPrice, lineTotal: cents(lineTotal), itemDiscount: cents(row.itemDiscount || 0),
      unitInferred: !row.unit, readingWarning
    });
    row = null;
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const n = normalize(line);
    if (endsTable(line)) { flush(); break; }
    if (/\bDESCONTO\b/.test(n)) {
      // Item-level discount commonly appears immediately below its product on thermal paper.
      const amounts = [...line.matchAll(amountPattern)].map((m) => localizedValue(m[0]));
      if (row && amounts.length) row.itemDiscount = (row.itemDiscount || 0) + amounts[amounts.length - 1];
      continue;
    }
    if (/\b(VALOR LIQUIDO|TROCO|P\.?I\.?X|CARTAO)\b/.test(n)) continue;
    if (/^(?:C[O0]DIGO|DESCRICAO|QTDE|QTD|UN\b|VL\b|V\.UNIT\b|V\.TOTAL\b)/.test(n) && !/^\d/.test(n)) continue;
    const codeMatch = line.match(codePattern);
    const suffix = codeMatch?.[2]?.trim() || '';
    const isProductCode = Boolean(codeMatch && (!suffix || (suffix.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3));
    if (isProductCode) {
      seenProductCode = true;
      flush();
      row = { code: codeMatch[1].replace(/^B(?=\d{2,})/i, '8'), names: [], amounts: [], unit: '', itemDiscount: 0 };
      if (suffix) {
        const nameOnly = cleanDescription(suffix.replace(amountPattern, ' '));
        if (nameOnly) row.names.push(nameOnly);
      }
      continue;
    }
    if (!row) continue;
    const unitMatch = line.match(unitPattern);
    if (unitMatch) {
      const rawUnit = unitMatch[1].toLowerCase();
      row.unit = ({und:'un',unidade:'un',in:'un',kgs:'kg',gr:'g'}[rawUnit] || rawUnit);
    }
    const values = [...line.matchAll(amountPattern)].map((match) => localizedValue(match[0]));
    if (values.length) {
      row.amounts.push(...values);
      continue;
    }
    if (!row.amounts.length && !unitMatch && (line.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3) {
      row.names.push(cleanDescription(line));
    }
  }
  flush();
  if (!seenProductCode) return parseReceiptOcrLegacy(source);
  // Same product code can appear on multiple legitimate lines of one NFC-e.
  // A second OCR pass is reconciled separately; never deduplicate fiscal lines here.
  return rows;
}

function parseReceiptOcrLegacy(text) {
  const output = [];
  const amountPattern = /\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+(?:[.,]\d{2,4})/g;
  const ignore = /(CNPJ|CPF|CUPOM FISCAL|DOCUMENTO AUXILIAR|CHAVE DE ACESSO|PROTOCOLO|SUBTOTAL|TOTAL A PAGAR|VALOR TOTAL|VALOR APROXIMADO|TRIBUTOS|ICMS|COFINS|PIS\b|TROCO|DESCONTO|DINHEIRO|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|PIX\b|FORMA DE PAGAMENTO|CONSUMIDOR|CONSULTA|ENDERE[CÇ]O|INSCRI[CÇ][AÃ]O ESTADUAL|TELEFONE|CEP\b|S[ÉE]RIE|DATA DE AUTORIZA[CÇ][AÃ]O|VALOR PAGO|QTD\.?\s*TOTAL)/i;
  const header = /^(?:C[ÓO]DIGO|DESCRI[CÇ][AÃ]O|QTDE|QTD|QUANTIDADE|UNID(?:ADE)?|VALOR|FORMA DE PAGAMENTO)\b/i;
  const onlyUnit = /^(?:UN|UND|UNIDADE|KG|KGS|G|GR|LT|L|ML|CX|PC|PCT|FD)$/i;
  const cleanDescription = (raw) => String(raw || '')
    .replace(amountPattern, ' ')
    .replace(/^\s*\d{3,14}\s+/, '')
    .replace(/\b(?:UNIDADE|UND|UN|KG|KGS|G|GR|LT|L|ML|CX|PC|PCT|FD)\b/gi, ' ')
    .replace(/[|:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-.]+|[-.]+$/g, '')
    .trim();
  let pendingName = '';

  String(text || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach((line) => {
    if (ignore.test(line) || header.test(line)) {
      pendingName = '';
      return;
    }

    const amountTokens = [...line.matchAll(amountPattern)].map((match) => ({
      raw: match[0],
      value: localizedValue(match[0]),
      index: match.index || 0
    })).filter((token) => Number.isFinite(token.value) && token.value >= 0);
    const values = amountTokens.map((token) => token.value);
    const rawName = cleanDescription(line);
    const letters = (rawName.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    const hasItemName = letters >= 3 && !onlyUnit.test(rawName);
    const lineLooksLikeProduct = hasItemName && /^\s*\d{3,14}\s+[A-Za-zÀ-ÿ]/.test(line);
    const unitMatch = line.match(/\b(KGS?|GR?|G|ML|LT|L|UNIDADE|UND|UN|CX|PC|PCT|FD)\b/i);

    if (values.length >= 2) {
      const inlineName = hasItemName && !lineLooksLikeProduct ? rawName : '';
      // A product's description often occupies the line above its quantity and prices.
      // Prefer that pending description over OCR garbage picked up from the numeric row.
      const name = lineLooksLikeProduct ? rawName : (pendingName || inlineName || '');
      if (!name || name.length < 3) {
        if (lineLooksLikeProduct) pendingName = rawName;
        return;
      }

      // Use the printed unit label as an anchor: quantity is normally to its left,
      // while unit price and extended total are to its right. This is safer when OCR
      // misses one of the numbers and avoids mistaking "unit price, total" for quantity.
      let quantity, unitPrice, lineTotal;
      if (unitMatch) {
        const beforeUnit = amountTokens.filter((token) => token.index < (unitMatch.index || 0));
        const afterUnit = amountTokens.filter((token) => token.index > (unitMatch.index || 0));
        if (beforeUnit.length && afterUnit.length) {
          quantity = beforeUnit[beforeUnit.length - 1].value;
          unitPrice = afterUnit[0].value;
          lineTotal = afterUnit.length >= 2 ? afterUnit[afterUnit.length - 1].value : quantity * unitPrice;
        } else if (!beforeUnit.length && afterUnit.length >= 2) {
          unitPrice = afterUnit[0].value;
          lineTotal = afterUnit[afterUnit.length - 1].value;
          const inferred = unitPrice > 0 ? lineTotal / unitPrice : 1;
          quantity = inferred > 0 && inferred <= 100000 ? inferred : 1;
        } else {
          quantity = values[0];
          unitPrice = values[1];
          lineTotal = values.length >= 3 ? values[values.length - 1] : quantity * unitPrice;
        }
      } else {
        quantity = values[0];
        unitPrice = values[1];
        lineTotal = values.length >= 3 ? values[values.length - 1] : quantity * unitPrice;
      }
      let unit = unitMatch ? unitMatch[1].toLocaleLowerCase('pt-BR') : 'un';
      if (unit === 'unidade' || unit === 'und') unit = 'un';
      if (unit === 'kgs') unit = 'kg';
      if (unit === 'gr') unit = 'g';
      if (!(quantity > 0) || !Number.isFinite(quantity) || quantity > 100000 ||
          !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) {
        pendingName = lineLooksLikeProduct ? rawName : '';
        return;
      }
      output.push({
        name: name.slice(0, 120),
        code: '',
        quantity: Math.round(quantity * 1000) / 1000,
        unit,
        unitPrice: Math.round(unitPrice * 10000) / 10000,
        lineTotal: Math.round(Math.max(0, lineTotal) * 100) / 100
      });
      pendingName = '';
      return;
    }

    if (values.length === 1 && pendingName && !hasItemName) {
      const value = values[0];
      if (value > 0) output.push({
        name: pendingName.slice(0, 120), code: '', quantity: 1, unit: 'un',
        unitPrice: value, lineTotal: value
      });
      pendingName = '';
      return;
    }

    if (!hasItemName) return;

    if (lineLooksLikeProduct || !pendingName) {
      pendingName = rawName;
    } else if (!onlyUnit.test(rawName)) {
      pendingName = (pendingName + ' ' + rawName).replace(/\s+/g, ' ').trim();
    }
  });

  // Two identical purchases in one document are two distinct fiscal lines.
  return output;
}


function normalizeReceiptUnit(value) {
  const unit = norm(value || 'un');
  return ({ pt:'pt', pote:'pt', unidade:'un', und:'un', in:'un', pc:'un', pca:'un',
    kgs:'kg', gr:'g', lt:'l', litro:'l', litros:'l',
    cx:'cx', caixa:'cx', pct:'pct', pacote:'pct', fd:'fd', fardo:'fd' })[unit] || unit;
}

function isNonStockExpense(item) {
  const name = normalizeReceiptName(item?.name);
  return /(?:^| )(?:taxa de entrega|taxa entrega|frete|servico entrega|gorjeta|servico de entrega)(?: |$)/.test(name);
}
function shouldPostReceiptItem(item) {
  return item.stockDisposition === 'stock' ||
    (item.stockDisposition !== 'expense' && !isNonStockExpense(item));
}

function normalizeReceiptName(value) {
  return norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Fiscal item codes belong to their issuer. Within one issuer, padding such as
// 00123/123 is equivalent, but a second signal (description) is still checked.
function findSupplierAliasProduct(item, catalog, supplierCnpj) {
  const issuer = String(supplierCnpj || '').replace(/\D/g, '');
  const code = normalizeProductCode(item?.code);
  if (!issuer || !code) return null;
  return catalog.find((product) => (product.supplierCodes || []).some((alias) =>
    String(alias.cnpj || '').replace(/\D/g, '') === issuer &&
    normalizeProductCode(alias.code) === code)) || null;
}
function findReceiptCodeConflicts(item, catalog, supplierCnpj) {
  const fiscalCode = normalizeProductCode(item?.code);
  if (!fiscalCode) return [];
  const issuer = String(supplierCnpj || '').replace(/\D/g,'');
  return catalog.filter((p) => {
    if ([p.sku, ...(p.alternateSkus || [])].some((code) =>
      normalizeProductCode(code) === fiscalCode)) return true;
    return Boolean(issuer && (p.supplierCodes || []).some((alias) =>
      String(alias.cnpj || '').replace(/\D/g,'') === issuer &&
      normalizeProductCode(alias.code) === fiscalCode));
  });
}
function findReceiptCatalogProduct(item, catalog, supplierCnpj) {
  const bySupplier = findSupplierAliasProduct(item, catalog, supplierCnpj);
  if (bySupplier && normalizeReceiptUnit(bySupplier.unit) === normalizeReceiptUnit(item.unit))
    return bySupplier;
  const issuer = String(supplierCnpj || '').replace(/\D/g, '');
  const candidate = { id: '__novo_item_fiscal__', name: item.name, sku: item.code,
    supplierCodes: issuer && item.code ? [{ cnpj: issuer, code: item.code }] : [],
    unit: item.unit };
  return catalog.find((product) => checkDuplicatePair(product, candidate)?.confidence === 'alta') ||
    catalog.find((product) => normalizeReceiptName(product.name) === normalizeReceiptName(item.name) &&
      normalizeReceiptUnit(product.unit) === normalizeReceiptUnit(item.unit)) || null;
}

function mergeReceiptCandidates(primary, alternate) {
  // Align the two passes one-to-one. Never merge *all* occurrences of a
  // product code: a fiscal receipt can legitimately contain repeated lines.
  const merged = (primary || []).map((item) => ({ ...item }));
  const matched = new Set();
  for (let alternateIndex = 0; alternateIndex < (alternate || []).length; alternateIndex++) {
    const other = alternate[alternateIndex];
    const otherName = normalizeReceiptName(other.name);
    if (!otherName) continue;
    const candidates = merged.map((item, index) => {
      if (matched.has(index)) return null;
      const sameCode = item.code && other.code && normalizeProductCode(item.code) === normalizeProductCode(other.code);
      if (item.code && other.code && !sameCode) return null;
      const name = normalizeReceiptName(item.name);
      const sameName = name === otherName || (Math.min(name.length, otherName.length) >= 7 &&
        (name.startsWith(otherName) || otherName.startsWith(name)));
      const difference = Math.abs(receiptItemTotal(item) - receiptItemTotal(other));
      const nearRow = Math.abs(index - alternateIndex) <= 1;
      if (!(sameCode && (sameName || nearRow)) && !(sameName && difference <= 0.10)) return null;
      return { index, rank: (sameCode ? 100 : 0) + (sameName ? 35 : 0) +
        (normalizeReceiptUnit(item.unit) === normalizeReceiptUnit(other.unit) ? 10 : 0) -
        Math.abs(index - alternateIndex) * 8 - Math.min(40, difference) };
    }).filter(Boolean).sort((a, b) => b.rank - a.rank);
    const choice = candidates[0];
    if (!choice) {
      merged.push({ ...other, readingWarning: other.readingWarning ||
        'Esta linha apareceu somente em uma leitura do OCR. Confira no cupom.' });
      matched.add(merged.length - 1);
      continue;
    }
    const i = choice.index;
    matched.add(i);
    const current = merged[i];
    const differences = [];
    if (normalizeReceiptUnit(current.unit) !== normalizeReceiptUnit(other.unit)) differences.push('unidade');
    if (Math.abs(Number(current.quantity) - Number(other.quantity)) > 0.001) differences.push('quantidade');
    if (Math.abs(Number(current.unitPrice) - Number(other.unitPrice)) > 0.02) differences.push('preço');
    if (Math.abs(receiptItemTotal(current) - receiptItemTotal(other)) > 0.02) differences.push('total');
    const warning = [current.readingWarning, other.readingWarning,
      differences.length ? 'Leituras OCR discordam em: ' + differences.join(', ') + '.' : ''].filter(Boolean).join(' ');
    const valid = (it) => Number(it.quantity) > 0 &&
      Math.abs(Number(it.quantity) * Number(it.unitPrice) - receiptItemTotal(it)) <= 0.055;
    // Keep the first reading if both are plausible; differences require human review.
    const chosen = !valid(current) && valid(other) ? other : current;
    merged[i] = { ...chosen, code: chosen.code || current.code || other.code,
      name: normalizeReceiptName(current.name).length >= otherName.length ? current.name : other.name,
      readingWarning: warning,
      itemDiscount: Math.max(Number(current.itemDiscount || 0), Number(other.itemDiscount || 0)),
      unitInferred: Boolean(current.unitInferred && other.unitInferred) };
  }
  return merged;
}

// Each NFC-e key is exactly 44 digits. Validate the document model (65) and
// the final modulo-11 check digit before ever opening an official consultation.
function validateNfceAccessKey(raw) {
  const key = String(raw || '').replace(/\D/g, '');
  if (!/^\d{44}$/.test(key)) return false;
  if (key.slice(20, 22) !== '65') return false;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return digit === Number(key[43]);
}

function extractAccessKeyFromText(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const digits = line.replace(/\D/g, '');
    // A normal NFC-e key is printed in eleven groups of four. OCR may add one
    // spurious digit; look for validated 44-digit windows instead of trusting
    // the first 44 characters of a damaged line.
    if (digits.length < 44 || digits.length > 65) continue;
    for (let i = 0; i <= digits.length - 44; i++) {
      const candidate = digits.slice(i, i + 44);
      if (validateNfceAccessKey(candidate)) return candidate;
    }
  }
  return '';
}

function hasUncertainReceiptKey(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.some((line) => {
    const digits = line.replace(/\D/g, '');
    return digits.length >= 44 && digits.length <= 65 && !extractAccessKeyFromText(line);
  });
}

const PUBLIC_NFCE_CONSULTA_URL = 'https://dfe-portal.svrs.rs.gov.br/Dfe/ConsultaPublicaDfe';

function parseNfceQrPayload(raw) {
  const value = String(raw || '').trim();
  if (!value) return { accessKey: '', consultaUrl: '', qrRaw: '' };
  let parsed = null;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value.replace(/^\/+/, ''));
  } catch (_) {}

  let accessKey = '';
  if (parsed) {
    for (const key of ['chNFe', 'chave', 'key', 'accessKey']) {
      const digits = String(parsed.searchParams.get(key) || '').replace(/\D/g, '');
      if (validateNfceAccessKey(digits)) { accessKey = digits; break; }
    }
    if (!accessKey) {
      const p = parsed.searchParams.get('p') || '';
      const first = p.split('|')[0].replace(/\D/g, '');
      if (validateNfceAccessKey(first)) accessKey = first;
    }
  }
  if (!accessKey && !parsed) {
    accessKey = extractAccessKeyFromText(value);
  }

  const host = parsed?.hostname?.toLowerCase() || '';
  const officialHost = host === 'dfe-portal.svrs.rs.gov.br' ||
    /(^|\.)sefaz\.rs\.gov\.br$/i.test(host) ||
    /(^|\.)sefazrs\.rs\.gov\.br$/i.test(host);
  const path = (parsed?.pathname || '').toLowerCase();
  const hasParams = Boolean(parsed && [...parsed.searchParams.keys()].length);
  const hasQrPayload = Boolean(parsed?.searchParams.has('p'));
  const isIncompleteSyntheticQrLink = host === 'dfe-portal.svrs.rs.gov.br' &&
    /\/dfe\/qrcodenfce\/?$/.test(path) &&
    parsed?.searchParams.has('chNFe') &&
    [...parsed.searchParams.keys()].length === 1;
  const isPublicQueryPage = host === 'dfe-portal.svrs.rs.gov.br' &&
    /\/dfe\/consultapublicadfe\/?$/.test(path);

  // Keep a decoded QR URL intact, including version/environment/hash parameters.
  // A 44-digit key alone is NOT a complete QR payload; fabricating ?chNFe=... on
  // the QR endpoint causes the SVRS "900 - parâmetro incorreto" response.
  const qrUrlPreserved = Boolean(accessKey && officialHost && !isIncompleteSyntheticQrLink &&
    (hasQrPayload || (hasParams && !/\/dfe\/qrcodenfce\/?$/.test(path))));
  let consultaUrl = '';
  if (qrUrlPreserved) {
    consultaUrl = parsed.toString();
  } else if (isPublicQueryPage) {
    consultaUrl = parsed.toString();
  } else if (accessKey) {
    consultaUrl = PUBLIC_NFCE_CONSULTA_URL;
  }

  return { accessKey, consultaUrl, qrRaw: value.slice(0, 700), qrUrlPreserved };
}

async function decodeNfceQrWithZXing(canvas) {
  const z = await import('@zxing/library');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(image.width * image.height);
  for (let p = 0, q = 0; p < image.data.length; p += 4, q++) {
    gray[q] = Math.round(image.data[p] * 0.299 + image.data[p + 1] * 0.587 + image.data[p + 2] * 0.114);
  }

  const hints = new Map();
  hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.QR_CODE]);
  hints.set(z.DecodeHintType.TRY_HARDER, true);
  for (const invert of [false, true]) {
    const luminance = invert ? Uint8ClampedArray.from(gray, (v) => 255 - v) : gray;
    for (const Binarizer of [z.HybridBinarizer, z.GlobalHistogramBinarizer]) {
      try {
        const source = new z.RGBLuminanceSource(luminance, image.width, image.height);
        const bitmap = new z.BinaryBitmap(new Binarizer(source));
        const reader = new z.MultiFormatReader();
        reader.setHints(hints);
        const result = reader.decode(bitmap);
        reader.reset();
        if (result?.getText) return result.getText();
      } catch (_) {}
    }
  }
  return '';
}

// Inspired by pcelias-ctrl/nfc-e: isolate the code from the footer and retry
// with rotated, resized variants before requesting any external decoding service.
function createQrFooterCrop(canvas, rotation = 0) {
  const fromY = Math.floor(canvas.height * 0.44);
  const cropWidth = canvas.width;
  const cropHeight = Math.max(1, canvas.height - fromY);
  const maxSide = 1400;
  const scale = Math.min(1.4, maxSide / Math.max(cropWidth, cropHeight));
  const w = Math.max(1, Math.round(cropWidth * scale));
  const h = Math.max(1, Math.round(cropHeight * scale));
  const quarterTurn = rotation === 90 || rotation === 270;
  const out = document.createElement('canvas');
  out.width = quarterTurn ? h : w;
  out.height = quarterTurn ? w : h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(canvas, 0, fromY, cropWidth, cropHeight, -w / 2, -h / 2, w, h);
  return out;
}

async function decodeQrViaExternalApi(canvas) {
  const crop = createQrFooterCrop(canvas);
  const image = crop.toDataURL('image/jpeg', 0.82);
  const response = await fetch('/api/qr-externo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: image })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Serviço externo indisponível.');
  const parsed = parseNfceQrPayload(data.url);
  if (!parsed.qrUrlPreserved || !validateNfceAccessKey(parsed.accessKey)) {
    throw new Error('O leitor externo respondeu, mas não encontrou um QR Code fiscal válido do RS.');
  }
  return { ...parsed, qrReader: 'API externa pcelias-ctrl/nfc-e' };
}

async function detectNfceQrCodes(canvases, rawCanvases = [], useExternal = false) {
  const empty = () => ({ accessKey: '', consultaUrl: '', qrRaw: '', qrUrlPreserved: false });
  if (typeof window === 'undefined') return canvases.map(empty);
  let decodeQR = null;
  try {
    const decoderModule = await import('jsqr');
    decodeQR = decoderModule.default || decoderModule;
  } catch (_) {}

  let detector = null;
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (_) {}

  const results = [];
  for (let index = 0; index < canvases.length; index++) {
    let found = empty();
    const candidates = [canvases[index], rawCanvases[index]].filter(Boolean);
    for (const canvas of candidates) {
      if (decodeQR) {
        try {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = decodeQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
          if (decoded?.data) found = parseNfceQrPayload(decoded.data);
        } catch (_) {}
      }
      if (!found.accessKey && !found.consultaUrl) {
        try {
          const decoded = await decodeNfceQrWithZXing(canvas);
          if (decoded) found = parseNfceQrPayload(decoded);
        } catch (_) {}
      }
      if (!found.accessKey && !found.consultaUrl && detector) {
        try {
          const detections = await detector.detect(canvas);
          for (const detection of detections || []) {
            const candidate = parseNfceQrPayload(detection.rawValue);
            if (candidate.accessKey || candidate.consultaUrl) { found = candidate; break; }
          }
        } catch (_) {}
      }
      if (found.accessKey || found.consultaUrl) break;
    }
    // A small QR in a large receipt benefits from footer cropping and rotation.
    if (!found.qrUrlPreserved) {
      const reference = rawCanvases[index] || canvases[index];
      for (const angle of [0, 90, 270, 180]) {
        try {
          const cropped = createQrFooterCrop(reference, angle);
          if (decodeQR) {
            const img = cropped.getContext('2d', { willReadFrequently: true })
              .getImageData(0, 0, cropped.width, cropped.height);
            const decoded = decodeQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (decoded?.data) {
              const candidate = parseNfceQrPayload(decoded.data);
              if (candidate.qrUrlPreserved) { found = candidate; break; }
            }
          }
          if (angle === 0 && !found.qrUrlPreserved) {
            const decoded = await decodeNfceQrWithZXing(cropped);
            if (decoded) {
              const candidate = parseNfceQrPayload(decoded);
              if (candidate.qrUrlPreserved) { found = candidate; break; }
            }
          }
        } catch (_) {}
      }
    }
    // The repository's PHP API handles generic QR codes, including URLs from RS.
    // Its structured NFC-e parser explicitly rejects non-SP receipts; only use QR.
    if (!found.qrUrlPreserved && useExternal) {
      try {
        found = await decodeQrViaExternalApi(rawCanvases[index] || canvases[index]);
      } catch (error) {
        found = {
          ...found,
          qrReaderWarning: error?.message || 'Leitor de QR externo indisponível.'
        };
      }
    }
    results.push(found);
  }
  return results;
}

function detectReceiptSupplier(text) {
  const normalize = (line) => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 24);
  const skip = /(CNPJ|CPF|RUA\b|AVENIDA|AV\.|FONE|TELEFONE|CEP\b|DOCUMENTO AUXILIAR|NOTA FISCAL|CONSUMIDOR|CHAVE DE ACESSO|PROTOCOLO|CUPOM FISCAL|NFC-?E|N[ÚU]MERO|S[ÉE]RIE|TERMINAL|CAIXA|CONSULTE|TRIBUTOS|INSCRI[CÇ][AÃ]O ESTADUAL|EMISS[AÃ]O|DATA DE AUTORIZA[CÇ][AÃ]O)/i;
  const clean = (line) => String(line || '')
    .replace(/^[A-Za-zÀ-ÿ]{1,2}\s+[A-Za-zÀ-ÿ]{1,2}\s+/, '')
    .replace(/\bRUDTI\b/gi, 'RUDI')
    .replace(/\s*-?\s*CNPJ\s*:?.*$/i, '')
    .replace(/\s*-?\s*CPF\s*:?.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-zÀ-ÿ]+/, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
  const preferredIndex = lines.findIndex((line) => {
    const n = normalize(line);
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return letters >= 8 && /(COMERCIAL|COMERCIO|MATERIAIS|HORTIFRUT|INFORMATICA|DISTRIBUIDORA|ALIMENTOS|SUPERMERCADO|ATACADO)/.test(n)
      && !/(DOCUMENTO AUXILIAR|NOTA FISCAL|CHAVE DE ACESSO)/.test(n);
  });
  if (preferredIndex >= 0) {
    const parts = [clean(lines[preferredIndex])].filter(Boolean);
    for (let j = preferredIndex + 1; j < Math.min(lines.length, preferredIndex + 3); j++) {
      const line = lines[j];
      if (/(RUA\b|AVENIDA|FONE|TELEFONE|CEP\b|DOCUMENTO AUXILIAR|NOTA FISCAL|CHAVE DE ACESSO|PROTOCOLO|CONSUMIDOR|IE:)/i.test(line)) break;
      const cleaned = clean(line);
      const letters = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letters >= 5 && !skip.test(line)) parts.push(cleaned);
      else if (letters >= 5 && /HORTIFRUT|LTDA|EIRELI|MATERIAIS|INFORMATICA/i.test(cleaned)) parts.push(cleaned);
      if (parts.join(' ').length > 115) break;
    }
    const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) return joined.slice(0, 110);
  }
  const candidate = lines.find((line) => {
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return letters >= 8 && !skip.test(line) && !/^[\d\s.,:/-]+$/.test(line);
  });
  return candidate ? clean(candidate).slice(0, 110) : '';
}

function detectSupplierCnpj(text) {
  const match = String(text || '').match(/CNPJ\s*[:.-]?\s*([\d.\/-]{14,20})/i);
  const digits = String(match?.[1] || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

function detectReceiptMetadata(text) {
  const raw = String(text || '');
  const invoice = raw.match(/NFC-?e\s*(?:n[ºo°.]?\s*)?([\d.]{5,})/i) ||
    raw.match(/N[úu]mero\s*:\s*([\d.]{4,})/i);
  const date = raw.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  return { invoiceNumber: invoice ? invoice[1].replace(/\./g, '') : '', date: date ? date[0] : '' };
}

function receiptItemTotal(item) {
  if (item && item.lineTotal !== undefined && item.lineTotal !== null && item.lineTotal !== '' && Number.isFinite(Number(item.lineTotal))) {
    return Math.round(Number(item.lineTotal) * 100) / 100;
  }
  return Math.round(Number(item?.quantity || 0) * Number(item?.unitPrice || 0) * 100) / 100;
}


function parseReceiptTotals(text) {
  const totals = { subtotal: null, discount: null, total: null };
  const moneyPattern = /(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2})/g;
  const normalize = (line) => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const amountValues = (line) => [...String(line || '').matchAll(moneyPattern)]
    .map((match) => localizedValue(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  let summary = false;
  for (const line of String(text || '').split(/\r?\n/)) {
    const n = normalize(line);
    if (/QTD(?:E)?\s*TOTAL|TOTAL DE ITENS|SUB[ -]?TOTAL/.test(n)) summary = true;
    const values = amountValues(line);
    if (!values.length) continue;
    if (/\bSUB[\s-]*TOTAL\b/.test(n)) totals.subtotal = values[0];
    if (/\bDESCONTO\b/.test(n) && (summary || totals.discount === null)) totals.discount = values[0];
    if ((/\bVALOR\s*TOTAL\b|\bTOTAL\s*A\s*PAGAR\b|\bTOTAL\s*DA\s*NOTA\b/.test(n)) &&
        !/\bQTD(?:E)?\s*TOTAL\b|\bTOTAL\s*DE\s*ITENS\b/.test(n))
      totals.total = values[0];
  }
  return totals;
}

function reconcileReceiptTotals(primaryText, alternateText, items) {
  const primary = parseReceiptTotals(primaryText);
  const alternate = parseReceiptTotals(alternateText);
  const itemSubtotal = Math.round((items || []).reduce((sum, item) => sum + receiptItemTotal(item), 0) * 100) / 100;
  const itemDiscount = Math.round((items || []).reduce((sum, item) => sum + Number(item.itemDiscount || 0), 0) * 100) / 100;
  const subtotal = primary.subtotal ?? alternate.subtotal ?? itemSubtotal;
  const discount = primary.discount ?? alternate.discount ?? itemDiscount;
  const expected = Math.round((Number(subtotal) - Number(discount)) * 100) / 100;
  // Preserve the printed total as independent evidence. Never choose the OCR
  // total that merely happens to be closer to another OCR-derived number.
  const total = primary.total ?? alternate.total ?? expected;
  const warnings = [];
  if (primary.total != null && alternate.total != null && Math.abs(primary.total - alternate.total) > 0.02)
    warnings.push('As duas leituras discordam sobre o total final.');
  if (Math.abs(itemSubtotal - subtotal) > 0.05) warnings.push('Soma das linhas diferente do subtotal fiscal.');
  if (Math.abs(expected - total) > 0.05) warnings.push('Subtotal menos desconto difere do total impresso.');
  if (itemDiscount > discount + 0.02) warnings.push('Descontos nas linhas maiores que o desconto total.');
  return {
    subtotal: Math.round(Number(subtotal) * 100) / 100,
    discount: Math.round(Number(discount) * 100) / 100,
    total: Math.round(Number(total) * 100) / 100,
    totalsWarning: warnings.join(' '),
    totalsSource: primary.total !== null || primary.subtotal !== null || primary.discount !== null
      ? 'OCR (leitura principal)' :
      alternate.total !== null || alternate.subtotal !== null || alternate.discount !== null
        ? 'OCR (leitura alternativa)' : 'Calculado pelos itens'
  };
}

function parseOfficialConsultaItems(text) {
  const source = String(text || '');
  const structured = parseReceiptOcr(source);
  const amountPattern = /\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+(?:[.,]\d{2,4})/g;
  const unitPattern = /\b(KGS?|GR?|G|ML|LT|L|UNIDADE|UND|UN|CX|PC|PCT|FD)\b/i;
  const normalizeLine = (line) => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const junk = /\b(CNPJ|CPF|PROTOCOLO|CHAVE DE ACESSO|CONSULTA PUBLICA|CONSUMIDOR|VALOR TOTAL|SUBTOTAL|DESCONTO|FORMA DE PAGAMENTO|CARTAO|PIX|TROCO|TRIBUTOS|NFC-E|NOTA FISCAL|SERIE|DATA DE EMISSAO)\b/;
  const inline = [];
  for (const line of source.split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    const n = normalizeLine(line);
    if (junk.test(n)) continue;
    const tokens = [...line.matchAll(amountPattern)].map((m) => ({ value: localizedValue(m[0]), index: m.index || 0 }));
    if (tokens.length < 2) continue;
    const unitMatch = line.match(unitPattern);
    const codeMatch = line.match(/^\s*([A-Z]?\d{3,14})\b/i);
    let quantity, unitPrice, lineTotal;
    if (unitMatch) {
      const before = tokens.filter((t) => t.index < (unitMatch.index || 0));
      const after = tokens.filter((t) => t.index > (unitMatch.index || 0));
      if (before.length && after.length) {
        quantity = before[before.length - 1].value;
        unitPrice = after[0].value;
        lineTotal = after.length >= 2 ? after[after.length - 1].value : quantity * unitPrice;
      } else {
        quantity = tokens[0].value;
        unitPrice = tokens[1].value;
        lineTotal = tokens.length >= 3 ? tokens[tokens.length - 1].value : quantity * unitPrice;
      }
    } else {
      quantity = tokens[0].value;
      unitPrice = tokens[1].value;
      lineTotal = tokens.length >= 3 ? tokens[tokens.length - 1].value : quantity * unitPrice;
    }
    const name = line
      .replace(/^\s*[A-Z]?\d{3,14}\s*/i, '')
      .replace(amountPattern, ' ')
      .replace(unitPattern, ' ')
      .replace(/[|:;]+/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ0-9 '&()./-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const letters = (name.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letters < 3 || !(quantity > 0) || !Number.isFinite(unitPrice) || unitPrice < 0) continue;
    let unit = unitMatch ? unitMatch[1].toLowerCase() : 'un';
    if (['und','unidade'].includes(unit)) unit = 'un';
    if (unit === 'kgs') unit = 'kg';
    inline.push({
      name: name.slice(0,120),
      code: codeMatch?.[1] || '',
      quantity: Math.round(quantity * 1000) / 1000,
      unit,
      unitPrice: Math.round(unitPrice * 10000) / 10000,
      lineTotal: Math.round(Number(lineTotal || quantity * unitPrice) * 100) / 100
    });
  }
  return mergeReceiptCandidates(structured, inline);
}


function compareInvoiceItems(ocrItems, officialItems) {
  const used = new Set();
  const rows = (ocrItems || []).map((ocr, ocrIndex) => {
    const code = normalizeProductCode(ocr.code);
    const name = normalizeReceiptName(ocr.name);
    const matches = (officialItems || []).map((official, index) => {
      if (used.has(index)) return null;
      const officialCode = normalizeProductCode(official.code);
      const officialName = normalizeReceiptName(official.name);
      if (code && officialCode && code !== officialCode) return null;
      const sameCode = Boolean(code && code === officialCode);
      const sameName = name === officialName || (Math.min(name.length, officialName.length) >= 7 &&
        (name.startsWith(officialName) || officialName.startsWith(name)));
      if (!sameCode && !sameName) return null;
      const totalDelta = Math.abs(receiptItemTotal(ocr) - receiptItemTotal(official));
      const qtyDelta = Math.abs(Number(ocr.quantity) - Number(official.quantity));
      return { index, rank: (sameCode ? 100 : 0) + (sameName ? 30 : 0) -
        Math.min(70, totalDelta * 4) - Math.min(70, qtyDelta * 10) - Math.abs(ocrIndex - index) };
    }).filter(Boolean).sort((a, b) => b.rank - a.rank);
    const index = matches.length ? matches[0].index : -1;
    const official = index >= 0 ? officialItems[index] : null;
    if (index >= 0) used.add(index);
    if (!official) return { ocr, official: null, ocrIndex,
      issues: ['Produto não encontrado na consulta.'], status: 'Item ausente na consulta' };
    const issues = [];
    if (normalizeReceiptUnit(ocr.unit) !== normalizeReceiptUnit(official.unit)) issues.push('Unidade diferente');
    if (Math.abs(Number(ocr.quantity) - Number(official.quantity)) > 0.001) issues.push('Quantidade diferente');
    if (Math.abs(Number(ocr.unitPrice) - Number(official.unitPrice)) > 0.02) issues.push('Preço diferente');
    if (Math.abs(receiptItemTotal(ocr) - receiptItemTotal(official)) > 0.02) issues.push('Total diferente');
    return { ocr, official, ocrIndex, issues,
      status: issues.length ? 'Conferir: ' + issues.join(', ') : 'Confere' };
  });
  return rows.concat((officialItems || []).filter((_, index) => !used.has(index)).map((official) => ({
    ocr: null, official, ocrIndex: -1, issues: ['Item ausente no OCR.'], status: 'Item ausente no OCR'
  })));
}

async function prepareReceiptCanvases(file) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const baseCtx = base.getContext('2d', { willReadFrequently: true });
  baseCtx.drawImage(image, 0, 0, width, height);
  const pixels = baseCtx.getImageData(0, 0, width, height).data;
  const isPaper = (r, g, b) => Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 60;

  const xScores = new Float32Array(width);
  // Detect side-by-side paper using the upper text area only; a centered QR at the bottom
  // must not look like a gap that splits one receipt into two.
  const yTop = Math.floor(height * 0.12);
  const yBottom = Math.floor(height * 0.68);
  for (let x = 0; x < width; x++) {
    let count = 0, samples = 0;
    for (let y = yTop; y < yBottom; y += 3) {
      const i = (y * width + x) * 4;
      if (isPaper(pixels[i], pixels[i + 1], pixels[i + 2])) count++;
      samples++;
    }
    xScores[x] = samples ? count / samples : 0;
  }
  const smooth = (scores, index, radius) => {
    let sum = 0, count = 0;
    for (let i = Math.max(0, index - radius); i <= Math.min(scores.length - 1, index + radius); i++) {
      sum += scores[i]; count++;
    }
    return count ? sum / count : 0;
  };
  const radius = Math.max(1, Math.round(width * 0.002));
  const leftFrom = Math.floor(width * 0.20), leftTo = Math.floor(width * 0.43);
  const valleyFrom = Math.floor(width * 0.43), valleyTo = Math.floor(width * 0.57);
  const rightFrom = Math.floor(width * 0.57), rightTo = Math.floor(width * 0.80);
  const peakLeft = Math.max(...Array.from({ length: leftTo - leftFrom }, (_, k) => smooth(xScores, leftFrom + k, radius)));
  const peakRight = Math.max(...Array.from({ length: rightTo - rightFrom }, (_, k) => smooth(xScores, rightFrom + k, radius)));
  let valley = 1, seam = Math.floor(width / 2);
  for (let x = valleyFrom; x < valleyTo; x++) {
    const score = smooth(xScores, x, radius);
    if (score < valley) { valley = score; seam = x; }
  }
  const twoReceipts = width > 500 && peakLeft > 0.48 && peakRight > 0.48 &&
    valley < Math.min(peakLeft, peakRight) * 0.80 && valley < 0.62;
  const segments = [];
  if (twoReceipts) segments.push([0, seam], [seam, width]);
  else segments.push([0, width]);

  const trimX = (start, end) => {
    const peak = Math.max(...Array.from({ length: end - start }, (_, k) => xScores[start + k]));
    const threshold = Math.max(0.13, peak * 0.32);
    let lo = start, hi = end - 1;
    while (lo < end && xScores[lo] < threshold) lo++;
    while (hi >= lo && xScores[hi] < threshold) hi--;
    if (hi <= lo) return [start, end];
    const pad = Math.max(5, Math.round(width * 0.012));
    return [Math.max(start, lo - pad), Math.min(end, hi + pad + 1)];
  };

  const crops = [];
  const qrCrops = [];
  for (const segment of segments) {
    const [sx, ex] = trimX(segment[0], segment[1]);
    const sw = Math.max(1, ex - sx);
    const rowScores = new Float32Array(height);
    // Retain the whole footer and QR Code; 92% clipped the lower QR modules on tall photos.
    const scanFrom = Math.floor(height * 0.04), scanTo = Math.floor(height * 0.995);
    for (let y = scanFrom; y < scanTo; y += 1) {
      let count = 0, samples = 0;
      for (let x = sx; x < ex; x += 2) {
        const i = (y * width + x) * 4;
        if (isPaper(pixels[i], pixels[i + 1], pixels[i + 2])) count++;
        samples++;
      }
      rowScores[y] = samples ? count / samples : 0;
    }
    const rowThreshold = 0.20;
    let y0 = scanFrom, y1 = scanTo - 1;
    while (y0 < scanTo && rowScores[y0] < rowThreshold) y0++;
    while (y1 > y0 && rowScores[y1] < rowThreshold) y1--;
    if (y1 - y0 < height * 0.20) { y0 = scanFrom; y1 = scanTo - 1; }
    const yPad = Math.max(8, Math.round(height * 0.012));
    y0 = Math.max(0, y0 - yPad);
    y1 = Math.min(height, y1 + yPad + 1);
    const ocrHeight = Math.max(1, y1 - y0);
    // QR scanning gets a footer-preserving crop of its own. Keep the OCR crop tight so
    // background below the receipt doesn't introduce phantom text or product candidates.
    const qrY1 = Math.max(y1, Math.floor(height * 0.985));
    const qrHeight = Math.max(1, qrY1 - y0);

    const scaledWidth = Math.max(1200, Math.min(1800, Math.round(sw * 2.8)));
    const scaledHeight = Math.round(ocrHeight * scaledWidth / sw);
    const qrScaledHeight = Math.round(qrHeight * scaledWidth / sw);
    // Keep an unmodified version for QR decoding; thresholding can erase small modules.
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = scaledWidth;
    qrCanvas.height = qrScaledHeight;
    qrCanvas.getContext('2d').drawImage(image, sx, y0, sw, qrHeight, 0, 0, scaledWidth, qrScaledHeight);
    qrCrops.push(qrCanvas);

    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, sx, y0, sw, ocrHeight, 0, 0, scaledWidth, scaledHeight);
    const data = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    for (let i = 0; i < data.data.length; i += 4) {
      const gray = data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, (gray - 72) * 1.7));
      data.data[i] = enhanced;
      data.data[i + 1] = enhanced;
      data.data[i + 2] = enhanced;
    }
    ctx.putImageData(data, 0, 0);
    crops.push(canvas);
  }
  return { canvases: crops, qrCanvases: qrCrops, split: twoReceipts };
}


const COUNT_DEFAULTS={enabled:false,mode:'interval',intervalDays:7,weekday:1,monthDay:1,configuredAt:''};
const countDay=(d)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d?new Date(d):new Date());
const countDateLabel=(s)=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'Não definida';

function countDueDate(cfg,history){
 if(!cfg?.enabled)return null;
 const base=history[0]?.completedAt?countDay(history[0].completedAt):(cfg.configuredAt||countDay());
 const [y,m,d]=base.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d));
 if(cfg.mode==='weekly'){date.setUTCDate(date.getUTCDate()+(((Number(cfg.weekday)-(date.getUTCDay()||7)+6)%7)+1));}
 else if(cfg.mode==='monthly'){
  const at=(year,month)=>new Date(Date.UTC(year,month,Math.min(Number(cfg.monthDay),new Date(Date.UTC(year,month+1,0)).getUTCDate())));
  let next=at(y,m-1);if(next<=date)next=at(y,m);return next.toISOString().slice(0,10);
 }else date.setUTCDate(date.getUTCDate()+Number(cfg.intervalDays));
 return date.toISOString().slice(0,10);
}
export default function Home() {
  const [supabase] = useState(() => HAS_SUPABASE_CONFIG ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);
  const [accessCode, setAccessCode] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(!HAS_SUPABASE_CONFIG);
  const [accessGranted, setAccessGranted] = useState(!HAS_SUPABASE_CONFIG);
  const [accessMessage, setAccessMessage] = useState('');
  const [dataReady, setDataReady] = useState(!HAS_SUPABASE_CONFIG);
  const [saveStatus, setSaveStatus] = useState('');
  const [products, setProducts] = useState(HAS_SUPABASE_CONFIG ? [] : initialProducts);
  const [movements, setMovements] = useState(HAS_SUPABASE_CONFIG ? [] : initialMovements);
  const [documents, setDocuments] = useState([]);
  const [pendingReceipts,setPendingReceipts]=useState([]);
  const [pendingBusy,setPendingBusy]=useState(false);
  const [pendingSaveError,setPendingSaveError]=useState('');
  const pendingSaveSerial=useRef(Promise.resolve());
  const pendingMarking=useRef(new Set());
  const pendingFingerprints=useRef(new Map());
  const pendingRevisions=useRef(new Map());

  const [closings,setClosings]=useState([]);
  const [cashEditId,setCashEditId]=useState('');
  const [cashSaving,setCashSaving]=useState(false);
  const [cashEntryMode,setCashEntryMode]=useState(''); // '', choose, upload, manual, edit
  const [cashImporting,setCashImporting]=useState(false);
  const [cashImportText,setCashImportText]=useState('');
  const [cashImportWarnings,setCashImportWarnings]=useState([]);
  const cashFileRef=useRef(null);
  const [cashError,setCashError]=useState('');
  const [cashMonth,setCashMonth]=useState(new Date().toISOString().slice(0,7));
  const [cashForm,setCashForm]=useState({
    day:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),register:'003',operator:'',
    cartaoCredito:'0',cartaoDebito:'0',credito:'0',debito:'0',outras:'0',
    dinheiroVendas:'0',cashCounted:'',movements:[]
  });
  const [stockCounts,setStockCounts]=useState([]);
  const [countSettings,setCountSettings]=useState(COUNT_DEFAULTS);
  const [settingsForm,setSettingsForm]=useState(COUNT_DEFAULTS);
  const [countDraft,setCountDraft]=useState(null);
  const [countBasis,setCountBasis]=useState(null);
  const [countBusy,setCountBusy]=useState(false);
  const [countError,setCountError]=useState('');
  const [view, setView] = useState('stock');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [filter, setFilter] = useState('Todos');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState('');
  const [editing, setEditing] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0', preferredSupplier: '' });
  const [adjust, setAdjust] = useState({ type: 'Entrada', quantity: '1', reason: 'Compra/recebimento' });
  const [draft, setDraft] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualChosenId, setManualChosenId] = useState('');
  const [manualNew, setManualNew] = useState(false);
  const [manualForm, setManualForm] = useState({
    name:'', sku:'', category:'Mercearia', unit:'un', min:'0',
    quantity:'1', cost:'0', supplier:'', preferredSupplier:'', reason:'Entrada manual'
  });
  const [draftQueue, setDraftQueue] = useState([]);
  const [draftBatch, setDraftBatch] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processingType, setProcessingType] = useState('xml');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [uploadBatchProgress, setUploadBatchProgress] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState('');
  const [mergePair, setMergePair] = useState(null);
  const [mergeKeepId, setMergeKeepId] = useState('');
  const [mergeAcknowledged, setMergeAcknowledged] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const revisionRef = useRef(0);
  const saveQueueRef = useRef(Promise.resolve());
  const skipNextSyncRef = useRef(false);
  // Off by default: an external fallback uploads a QR-only crop to a third party.
  const [enableExternalQr, setEnableExternalQr] = useState(false);
  const uploadRef = useRef(null);

  async function loadSharedInventory(token) {
    if (!supabase || !token) return false;
    const { data, error: loadError } = await supabase.rpc('inventory_get', { p_session_token: token });
    if (loadError || !data) {
      setAccessMessage('Sua sessão expirou ou não é válida. Entre novamente com seu login e senha.');
      setAccessGranted(false);
      setDataReady(false);
      setAccessCode('');
      setCurrentUser(null);
      try { sessionStorage.removeItem('projeto-gpt-session'); } catch (_) {}
      return false;
    }
    const state = data || { products: [], movements: [], documents: [] };
    revisionRef.current = Number(state.revision || 0);
    // Hydration is not a user edit: do not rewrite the database just by signing in
    // or after the server has atomically deleted an invoice.
    skipNextSyncRef.current = true;
    setProducts(Array.isArray(state.products) ? state.products : []);
    setMovements(Array.isArray(state.movements) ? state.movements : []);
    setDocuments(Array.isArray(state.documents) ? state.documents : []);
    const {data:pending,error:pendingError}=await supabase.rpc('pending_receipts_list',{p_token:token});
    if(!pendingError&&Array.isArray(pending))setPendingReceipts(pending);

    const {data:cashList,error:cashLoadError}=await supabase.rpc('cash_closings_list',{p_token:token});
    if(!cashLoadError && Array.isArray(cashList)) setClosings(cashList);
    setStockCounts(Array.isArray(state.stockCounts)?state.stockCounts:[]);
    const schedule={...COUNT_DEFAULTS,...(state.countSettings||{})};
    setCountSettings(schedule);setSettingsForm(schedule);
    setCurrentUser(state.user || null);
    setAccessCode(token);
    setAccessGranted(true);
    setDataReady(true);
    setLoaded(true);
    setSaveStatus('Sincronizado');
    try {
      sessionStorage.setItem('projeto-gpt-session', token);
      sessionStorage.removeItem('projeto-gpt-access');
    } catch (_) {}
    return true;
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!supabase) return;
    setLoginBusy(true);
    setAccessMessage('');
    try {
      const { data, error: loginError } = await supabase.rpc('inventory_login', {
        p_username: loginUsername.trim().toLowerCase(),
        p_password: loginPassword
      });
      if (loginError || !data?.ok || !data?.session_token) {
        setAccessMessage(data?.message || 'Não foi possível entrar. Confira o login e a senha.');
        setAccessGranted(false);
        setDataReady(false);
        return;
      }
      const ok = await loadSharedInventory(data.session_token);
      if (ok) {
        setLoginPassword('');
        setLoginUsername('');
        setAccessMessage('');
      }
    } catch (_) {
      setAccessMessage('Não consegui conectar ao banco agora. Confira a conexão e tente novamente.');
    } finally {
      setLoginBusy(false);
    }
  }

  useEffect(() => {
    if (supabase) {
      let token = '';
      try { token = sessionStorage.getItem('projeto-gpt-session') || ''; } catch (_) {}
      setAccessLoaded(true);
      if (token) loadSharedInventory(token);
      else {
        setAccessMessage('');
        setAccessGranted(false);
        setDataReady(false);
      }
      return;
    }
    try {
      const saved = localStorage.getItem('projeto-gpt-stock-v1');
      if (saved) {
        const state = JSON.parse(saved);
        if (Array.isArray(state.products)) setProducts(state.products);
        if (Array.isArray(state.movements)) setMovements(state.movements);
        if (Array.isArray(state.documents)) setDocuments(state.documents);
        if (Array.isArray(state.stockCounts)) setStockCounts(state.stockCounts);
        if (state.countSettings){setCountSettings(state.countSettings);setSettingsForm(state.countSettings);}
      }
    } catch (_) {}
    setLoaded(true);
    setDataReady(true);
  }, [supabase]);

  useEffect(() => {
    if (!loaded || supabase) return;
    try { localStorage.setItem('projeto-gpt-stock-v1', JSON.stringify({ products, movements, documents, stockCounts, countSettings })); } catch (_) {}
  }, [loaded, products, movements, documents, stockCounts, countSettings, supabase]);

  useEffect(() => {
    if (!supabase || !accessGranted || !dataReady || !accessCode) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    setSaveStatus('Salvando…');
    const timer = setTimeout(() => {
      // Serialize snapshots: each save uses the revision acknowledged by Supabase.
      // A stale browser cannot silently resurrect an invoice deleted by the Gestor.
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
        const { data: saved, error: saveError } = await supabase.rpc('inventory_save', {
          p_session_token: accessCode,
          p_state: { products, movements, documents, revision: revisionRef.current }
        });
        if (saveError || !saved?.ok) {
          setSaveStatus('Falha ao salvar');
          setToast(saveError?.message?.includes('outra sessão')
            ? 'O estoque mudou em outra sessão. Atualize a página para evitar sobrescrever dados.'
            : 'Não foi possível salvar no estoque compartilhado. Confira sua sessão e a conexão.');
        } else {
          revisionRef.current = Number(saved.revision ?? revisionRef.current + 1);
          setSaveStatus('Sincronizado');
          // Mark processed only after the shared stock snapshot was committed.
          for(const completed of documents.filter(d=>d.pendingReceiptId)){
            if(pendingMarking.current.has(completed.pendingReceiptId))continue;
            pendingMarking.current.add(completed.pendingReceiptId);
            const {data:marked,error:markError}=await supabase.rpc('pending_receipt_mark_posted',{
              p_token:accessCode,p_id:completed.pendingReceiptId
            });
            if(markError||!marked?.ok)setPendingSaveError(markError?.message||'Falha ao arquivar a conferência concluída.');
            else setPendingReceipts(rows=>rows.filter(r=>r.id!==completed.pendingReceiptId));
            pendingMarking.current.delete(completed.pendingReceiptId);
          }
        }
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [supabase, accessGranted, accessCode, dataReady, products, movements, documents]);

  function handleLock() {
    const token = accessCode;
    if (supabase && token) {
      void supabase.rpc('inventory_logout', { p_session_token: token });
    }
    try {
      sessionStorage.removeItem('projeto-gpt-session');
      sessionStorage.removeItem('projeto-gpt-access');
    } catch (_) {}
    setAccessCode('');
    setCurrentUser(null);
    setLoginPassword('');
    setAccessGranted(false);
    setDataReady(false);
    setAccessMessage('Você saiu da sua conta. Entre novamente para acessar o estoque.');
    setSaveStatus('');
    setDraft(null);
    setDraftQueue([]);
    setDraftBatch(null);
    setError('');
    // Reload clears in-flight state and prevents a stale save effect from
    // persisting old inventory data after logout.
    window.location.replace(window.location.pathname + window.location.search);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3300);
    return () => clearTimeout(timer);
  }, [toast]);

  const low = products.filter(isLow);
  const value = products.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.cost || 0), 0);
  const units = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const categories = ['Todas', ...new Set(products.map((p) => p.category).filter(Boolean))];
  // Re-run automatically whenever the shared catalog changes, without mutating it.
  const duplicatePairs = useMemo(() => findPotentialDuplicates(products), [products]);
  const registrationDuplicateHints = useMemo(() => editing || !productForm.name?.trim() ? [] :
    findDuplicatesForCandidate({ ...productForm, id: '__novo_produto__' }, products).slice(0, 3),
    [editing, productForm, products]);
  const shownProducts = useMemo(() => products.filter((p) => {
    const matches = [p.name, p.sku, p.category].some((v) => norm(v).includes(norm(query)));
    const matchesCategory = category === 'Todas' || p.category === category;
    const matchesFilter = filter === 'Todos' || (filter === 'Estoque baixo' ? isLow(p) : !isLow(p));
    return matches && matchesCategory && matchesFilter;
  }), [products, query, category, filter]);

  const nextCount=countDueDate(countSettings,stockCounts);
  const countDue=Boolean(nextCount && nextCount<=countDay());
  const uncounted=countDraft?products.filter((p)=>countDraft[p.id]===undefined||countDraft[p.id]==='').length:0;
  const countDifferences=countDraft?products.filter((p)=>countDraft[p.id]!==undefined&&countDraft[p.id]!==''&&Number(String(countDraft[p.id]).replace(',','.'))!==Number(p.stock)).length:0;
  const dateNow = () => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const page = view === 'cash' ? ['CONTROLE FINANCEIRO','Fechamento de caixa','Faturamento, sangrias, suprimentos e evolução mensal.'] : view === 'suppliers' ? ['HISTÓRICO DE COMPRAS','Fornecedores','Consulte notas e compras anteriores agrupadas pelo estabelecimento.'] : view === 'duplicates' ? ['AUDITORIA DO CADASTRO', 'Possíveis duplicatas', 'Compare códigos e descrições antes de corrigir produtos do estoque.'] : view === 'count' ? ['CONFERÊNCIA FÍSICA','Contagem de estoque','Confira o saldo real de cada produto e identifique divergências.'] : view === 'stock' ? ['VISÃO GERAL', 'Controle de estoque', 'Acompanhe produtos, quantidades e níveis mínimos.'] : view === 'documents' ? ['COMPRAS & ENTRADAS', 'Documentos fiscais', 'Importe documentos, leia o QR Code e confira os itens antes de atualizar o estoque.'] : view === 'purchases' ? ['PLANEJAMENTO', 'Lista de compras', 'Sugestão de reposição com base no estoque mínimo de cada produto.'] : ['RASTREABILIDADE', 'Movimentações', 'Consulte entradas, saídas e ajustes registrados.'];

  const draftItemsSubtotal = draft ? Math.round(draft.items.reduce((sum, item) => sum + receiptItemTotal(item), 0) * 100) / 100 : 0;
  const draftSubtotal = draft?.manualInvoice ? draftItemsSubtotal : draft && Number.isFinite(Number(draft.subtotal)) ? Number(draft.subtotal) : draftItemsSubtotal;
  const draftDiscount = draft ? Number(draft.discount || 0) : 0;
  // The net payable amount is derived from the gross subtotal and discounts, never typed manually.
  const draftTotal = Math.round((draftSubtotal - draftDiscount + Number(draft?.additionalCharges || 0)) * 100) / 100;
  const reportedFiscalTotal = draft?.total != null && draft?.total !== '' && Number.isFinite(Number(draft.total)) ? Number(draft.total) : null;
  const reportedTotalMismatch = Boolean(draft && reportedFiscalTotal != null && Math.abs(reportedFiscalTotal - draftTotal) > 0.05);
  const totalsItemsMismatch = Boolean(draft && Math.abs(draftItemsSubtotal - draftSubtotal) > 0.05);
  const draftExtras = draft ? Number(draft.additionalCharges || 0) : 0;
  const draftIdentifiedItemDiscounts = (draft?.items || []).reduce((sum,it) => sum + Number(it.itemDiscount || 0), 0);
  const discountUnattributed = Boolean(draft && draft.items.length > 1 &&
    draftDiscount - draftIdentifiedItemDiscounts > 0.02);
  const totalsFinalMismatch = Boolean(draft && (draftTotal < -0.01 || reportedTotalMismatch));
  const officialComparison = draft?.officialItems?.length ? compareInvoiceItems(draft.items, draft.officialItems) : [];
  const officialMissing = officialComparison.filter((r) => !r.ocr).length;
  const officialTotalsMismatch = Boolean(draft && draft.officialOrigin === 'sefaz' && (
    (draft.officialTotal != null && Math.abs(draftTotal - Number(draft.officialTotal)) > 0.02) ||
    (draft.officialSubtotal != null && Math.abs(draftSubtotal - Number(draft.officialSubtotal)) > 0.05) ||
    (draft.officialDiscount != null && Math.abs(draftDiscount - Number(draft.officialDiscount)) > 0.02)
  ));
  const currentHistoryMatches = useMemo(() =>
    draft ? findHistoricalMatches(draft, documents, products) : [],
    [draft, documents, products]);
  const receiptReviewRows = (draft?.items || []).map((it, index) => {
    const issues = [];
    if (!shouldPostReceiptItem(it)) issues.push('Despesa/serviço fiscal: não será lançado como mercadoria. Confira a classificação.');
    const targetProduct = products.find((p) => p.id === it.productId);
    const mappedProduct = targetProduct || findReceiptCatalogProduct(it, products, draft.supplierCnpj);
    const previousPurchase = currentHistoryMatches[index];
    if (previousPurchase && (!previousPurchase.confident || !previousPurchase.productId ||
        (it.productId && it.productId !== '__new__' && it.productId !== previousPurchase.productId))) {
      issues.push('Compra anterior deste fornecedor: "' + previousPurchase.historicalName +
        '" (NF ' + (previousPurchase.invoiceNumber || 'sem número') +
        '). Revise o vínculo para evitar duplicatas.');
    }
    if (!mappedProduct && shouldPostReceiptItem(it) && it.productId !== '__new__')
      issues.push('Produto ainda não vinculado ao estoque: confirme se é novo ou associe ao cadastro existente.');
    if (it.productId === '__new__') issues.push('Novo cadastro solicitado: confirme se não existe um item equivalente antes de lançar.');
    const aliasProduct = findSupplierAliasProduct(it, products, draft.supplierCnpj);
    const candidateDuplicates = !targetProduct && shouldPostReceiptItem(it) ?
      findDuplicatesForCandidate({
        id: '__item_fiscal_' + index, name: it.name, sku: it.code, unit: it.unit,
        supplierCodes: draft.supplierCnpj && it.code ? [{ cnpj: draft.supplierCnpj, code: it.code }] : []
      }, products) : [];
    if (!mappedProduct && candidateDuplicates.length && it.productId !== '__new__') issues.push(
      'Possível duplicidade com "' + candidateDuplicates[0].left.name +
      '". Confira e selecione o produto existente antes de criar outro.');
    if (aliasProduct && !targetProduct &&
        normalizeReceiptName(aliasProduct.name) !== normalizeReceiptName(it.name))
      issues.push('Código de fornecedor equivalente ao produto "' + aliasProduct.name +
        '", mas a descrição mudou. Confirme se realmente é o mesmo item.');
    if (aliasProduct && !it.productId && normalizeReceiptUnit(aliasProduct.unit) !== normalizeReceiptUnit(it.unit))
      issues.push('Código fiscal cadastrado em outra unidade. Selecione o produto interno e informe a quantidade convertida.');
    if (targetProduct && normalizeReceiptName(targetProduct.name) !== normalizeReceiptName(it.name))
      issues.push('Produto da nota associado a cadastro de outro nome: confira o vínculo.');
    const stockMismatch = targetProduct && normalizeReceiptUnit(targetProduct.unit) !== normalizeReceiptUnit(it.unit);
    if (stockMismatch && !(Number(it.stockQuantity) > 0)) issues.push('Informe a quantidade na unidade cadastrada no estoque.');
    if (stockMismatch && Number(it.stockQuantity) > 0) issues.push('Conversão de unidade para estoque: confira a quantidade informada.');

    const row = officialComparison.find((r) => r.ocrIndex === index);
    if (row && row.issues.length) issues.push(...row.issues);
    if (it.readingWarning) issues.push(it.readingWarning);
    if (it.unitInferred) issues.push('Unidade não reconhecida no OCR.');
    if (/manjeric|hortel|alface|rucula|salsa|cebolinha/i.test(norm(it.name)) &&
      normalizeReceiptUnit(it.unit) === 'ml') issues.push('Unidade ML incomum para este produto: confirme com o cupom e o estoque.');
    if (Math.abs(Number(it.quantity || 0) * Number(it.unitPrice || 0) - receiptItemTotal(it)) > 0.055)
      issues.push('Preço × quantidade não corresponde ao total da linha.');
    if (String(draft.source || '').startsWith('Foto') && draft.officialOrigin !== 'sefaz')
      issues.push('Sem confirmação oficial automática: conferir com a foto.');
    if (String(draft.source || '').startsWith('PDF'))
      issues.push('PDF preenchido manualmente: conferir com o documento.');
    const existingByName = !targetProduct && products.find((p) => normalizeReceiptName(p.name) === normalizeReceiptName(it.name));
    if (existingByName && normalizeReceiptUnit(existingByName.unit) !== normalizeReceiptUnit(it.unit))
      issues.push('Unidade do produto já cadastrado: ' + existingByName.unit + '. Confira a conversão.');
    return { issues: [...new Set(issues)], requiresReview: issues.length > 0,
      done: issues.length === 0 || draft.reviewedItems?.[index] === true };
  });
  const totalsRequireReview = Boolean(draft && (
    Boolean(draft.manualInvoice) || totalsItemsMismatch || totalsFinalMismatch || officialTotalsMismatch || discountUnattributed || Boolean(draft.totalsWarning) ||
    (String(draft.source || '').startsWith('Foto') && draft.officialOrigin !== 'sefaz') ||
    String(draft.source || '').startsWith('PDF')
  ));
  const readyForFinalReview = Boolean(draft?.items?.length && !officialMissing &&
    receiptReviewRows.every((row) => row.done) &&
    (!totalsRequireReview || draft.totalsReviewed));
  const cashMonthly=useMemo(()=>{
    const [year,month]=cashMonth.split('-').map(Number);
    return aggregateCashMonthly(closings,year,month);
  },[closings,cashMonth]);
  const cashPreview=useMemo(()=>cashTotals(cashForm),[cashForm]);
  const purchaseData = useMemo(() => purchasePlan(products, documents), [products, documents]);
  const purchaseList = purchaseData.items;
  const supplierGroups = useMemo(() => purchaseHistoryBySupplier(documents), [documents]);
  const knownSuppliers = [...new Set(supplierGroups.map((s) => s.name).filter(Boolean))];
  const manualMatches = useMemo(() => products.filter((p) =>
    [p.name, p.sku, ...(p.alternateSkus || [])].some((value) => norm(value).includes(norm(manualSearch)))
  ).slice(0, 30), [products, manualSearch]);
  const manualChosen = products.find((p) => p.id === manualChosenId);
  const manualDuplicateSuggestions = useMemo(() => manualNew && manualForm.name.trim()
    ? findDuplicatesForCandidate({id:'__manual_new__', name:manualForm.name, sku:manualForm.sku, unit:manualForm.unit}, products)
    : [], [manualNew,manualForm.name,manualForm.sku,manualForm.unit,products]);

  function downloadPurchaseList() {
    if (!purchaseList.length) { setToast('Nenhum item abaixo do estoque mínimo.'); return; }
    const rows = [['Categoria','Produto','Fornecedor habitual','Estoque atual','Estoque mínimo','Quantidade a comprar','Unidade','Preço médio pago (R$)','Preço de referência (R$)','Origem do preço','Total estimado (R$)']];
    for (const group of purchaseData.categories) {
      rows.push([group.name,'','','','','','','','','','']);
      for (const p of group.items) rows.push([group.name,p.name,p.usualSupplier || 'A definir',p.stock,p.min,p.buy,p.unit,
        p.averagePaid ?? '',p.unitEstimate ?? '',p.priceSource,p.estimate ?? '']);
      rows.push([group.name,'SUBTOTAL','','','','','','','','',group.subtotal]);
    }
    rows.push(['TOTAL GERAL','','','','','','','','','',purchaseData.total]);
    if (purchaseData.missingPrices) rows.push(['AVISO',purchaseData.missingPrices + ' produto(s) sem preço de referência; orçamento parcial','','','','','','','','','']);
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lista-de-compras-cafeteria-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setToast('Lista de compras exportada.');
  }

  function startManualInvoice() {
    if (manualMode || draft || draftQueue.length) {
      setError('Conclua a entrada ou conferência atual antes de iniciar outra nota.');
      return;
    }
    setDraft({
      source:'Nota cadastrada manualmente (sem validação SEFAZ)',
      fileName:'Nota digitada manualmente',
      supplier:'', supplierCnpj:'', invoiceNumber:'',
      date:new Date().toLocaleDateString('pt-BR'),
      checkedBy:'', finalReviewed:false, totalsReviewed:false, reviewedItems:{},
      items:[{name:'',code:'',productId:'',search:'',quantity:1,unit:'un',unitPrice:0,lineTotal:0}], subtotal:0, discount:0, total:0, additionalCharges:0,
      status:'Aguardando conferência', manualInvoice:true
    });
    setError('');setView('documents');
  }
  function selectManualInvoiceProduct(index, id) {
    const product=products.find((p)=>p.id===id);
    setDraft((d)=>({...d, reviewedItems:{...d.reviewedItems,[index]:false},
      finalReviewed:false,totalsReviewed:false,
      items:d.items.map((it,i)=>i===index && product
        ? {...it,productId:product.id,name:product.name,code:product.sku,
           unit:product.unit,unitPrice:Number(product.cost)||0,
           lineTotal:Math.round(Number(it.quantity||1)*Number(product.cost||0)*100)/100,
           readingWarning:''} : it)}));
  }
  async function importCashReport(event){
    const file=event.target.files?.[0];
    if(!file)return;
    event.target.value='';
    if(file.size>4000000){setCashError('Arquivo acima de 4 MB.');return;}
    if(!supabase||!accessCode){setCashError('Entre no sistema para importar o fechamento.');return;}
    newCashClosing('upload');
    setCashImporting(true);setCashError('');setCashImportWarnings([]);
    try{
      let text='';
      if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
        const bytes=new Uint8Array(await file.arrayBuffer());
        let binary='';
        for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        const response=await fetch('/api/cash-extract',{method:'POST',
          headers:{'content-type':'application/json','x-estoque-session':accessCode},
          body:JSON.stringify({base64:btoa(binary)})});
        const parsed=await response.json();
        if(!response.ok)throw new Error(parsed.error||'Não foi possível extrair texto do PDF.');
        text=parsed.text;
      }else if(file.type.startsWith('image/')||/\.(jpe?g|png|webp)$/i.test(file.name)){
        const {createWorker}=await import('tesseract.js');
        const worker=await createWorker('por');
        try{
          await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
          const result=await worker.recognize(file);
          text=result.data.text||'';
        }finally{await worker.terminate();}
      }else throw new Error('Use PDF, JPG, PNG ou WEBP.');
      const result=parseCashReport(text);
      if(!result.day||!result.register||!result.operator)
        throw new Error('Não foi possível identificar data, caixa e operador. Confira a qualidade do arquivo.');
      const duplicated=closings.some(d=>d.day===result.day&&d.register===result.register);
      setCashEditId('');
      setCashForm(prev=>({...prev,...result,
        sourceFileName:file.name,sourceText:text.slice(0,30000),
        reviewedImport:false,
        // Never assume the PDF has a trustworthy physical closing count.
        cashCounted:''
      }));
      setCashImportText(text);
      setCashImportWarnings([...result.importWarnings,
        ...(duplicated?['Já existe fechamento deste caixa e data. Somente o Gestor pode corrigi-lo.']:[])]);
      setCashMonth(result.day.slice(0,7));
      setCashEntryMode('upload');
      setToast('Relatório lido. Confira os dados antes de salvar.');
    }catch(error){setCashError(error?.message||'Falha ao importar o fechamento.');}
    finally{setCashImporting(false);}
  }
  function changeCashField(key,value){setCashForm(prev=>({...prev,[key]:value}));setCashError('');}
  function newCashClosing(mode='manual'){
    setCashEntryMode(mode);
    setCashImportText('');setCashImportWarnings([]);
    setCashEditId('');
    setCashForm({day:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),register:'003',
      operator:currentUser?.display_name||'',cartaoCredito:'0',cartaoDebito:'0',
      credito:'0',debito:'0',outras:'0',dinheiroVendas:'0',cashCounted:'',movements:[]});
    setCashError('');
  }
  function editCashClosing(entry){
    setCashImportText(entry.sourceText||'');setCashImportWarnings([]);
    setCashEntryMode('edit');
    setCashEditId(entry.id);
    setCashForm({...entry,day:String(entry.day).slice(0,10),
      movements:entry.movements||[]});
    setCashError('');setView('cash');
  }
  async function saveCashClosing(event){
    event.preventDefault();
    const invalid=validateCashClosing(cashForm);
    if(cashForm.sourceFileName&&!cashForm.reviewedImport) invalid.push('Confirme a revisão dos dados importados antes de salvar.');
    if(invalid.length){setCashError(invalid.join(' · '));return;}
    if(!supabase || !accessCode){setCashError('Necessário entrar na conta para salvar os fechamentos compartilhados.');return;}
    setCashSaving(true);setCashError('');
    try{
      const clean={...cashForm,day:cashForm.day,register:cashForm.register.trim(),
        operator:cashForm.operator.trim(),
        ...Object.fromEntries(CASH_CHANNELS.map(([key])=>[key,Number(cashForm[key]||0).toFixed(2)])),
        cashCounted:cashForm.cashCounted===''?'':Number(cashForm.cashCounted).toFixed(2),
        movements:cashForm.movements.map(m=>({
          type:m.type,reason:m.reason.trim(),amount:Number(m.amount).toFixed(2)
        }))};
      const {data,error:saveError}=await supabase.rpc('cash_closing_save',{p_token:accessCode,p_entry:clean});
      if(saveError || !data?.ok)throw new Error(saveError?.message||'Não foi possível salvar');
      const {data:updated,error:listError}=await supabase.rpc('cash_closings_list',{p_token:accessCode});
      if(listError||!Array.isArray(updated))throw new Error('Fechamento salvo, mas a atualização da lista falhou');
      setClosings(updated);setCashEditId('');setCashEntryMode('');
      setToast('Fechamento de caixa registrado com sucesso.');
    }catch(e){setCashError(e?.message||'Falha ao salvar fechamento');}
    finally{setCashSaving(false);}
  }
  function openManualEntry() {
    if (draft || draftQueue.length) {
      setError('Conclua ou descarte a conferência das notas antes de iniciar uma entrada manual.');
      setView('documents');
      return;
    }
    setManualMode(true); setManualNew(false); setManualChosenId(''); setManualSearch('');
    setManualForm({name:'',sku:'',category:'Mercearia',unit:'un',min:'0',
      quantity:'1',cost:'0',supplier:'',preferredSupplier:'',reason:'Entrada manual'});
    setError('');setView('documents');
  }
  function saveManualEntry(event) {
    event.preventDefault();
    if (supabase && saveStatus !== 'Sincronizado') {
      setError('Aguarde a sincronização do estoque para lançar esta entrada.');
      return;
    }
    const quantity = Number(manualForm.quantity);
    const cost = Number(manualForm.cost);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99999999 ||
      Math.round(quantity*1000) !== quantity*1000 || !Number.isFinite(cost) || cost < 0) {
      setError('Informe quantidade positiva (até três casas decimais) e custo não negativo.');
      return;
    }
    const reason = manualForm.reason.trim() || 'Entrada manual';
    let product;
    const timestamp = dateNow();
    if (manualNew) {
      if (currentUser?.role !== 'admin') {
        setError('Somente o Gestor pode criar cadastros. Selecione um produto existente.');
        return;
      }
      const name = manualForm.name.trim();
      if (!name) {setError('Informe a descrição do novo produto.');return;}
      const candidates = findDuplicatesForCandidate({id:'__manual_new__',name,
        sku:manualForm.sku,unit:manualForm.unit},products);
      if (candidates.length) {
        setError('Produto possivelmente já cadastrado: '+candidates[0].left.name+
          '. Selecione o item na busca; corrija o cadastro existente em vez de criar uma duplicata.');
        return;
      }
      product = {id:uid(),name,sku:manualForm.sku.trim() || 'PRD-'+Date.now(),
        category:manualForm.category,unit:manualForm.unit,stock:quantity,
        min:Number(manualForm.min)||0,cost,preferredSupplier:manualForm.preferredSupplier.trim(),
        updated:timestamp};
      setProducts((old) => [product,...old]);
    } else {
      product = products.find((p) => p.id === manualChosenId);
      if (!product) {setError('Selecione um produto cadastrado na lista de busca.');return;}
      const updatedStock = Math.round((Number(product.stock)+quantity)*1000)/1000;
      if (updatedStock>99999999) {setError('Quantidade final acima do máximo permitido.');return;}
      setProducts((old)=>old.map((p)=>p.id===product.id ?
        {...p,stock:updatedStock,cost,updated:timestamp} : p));
    }
    const movementId=uid();
    const documentId=uid();
    const checkedBy=currentUser?.display_name || 'Usuário autenticado';
    const amount=Math.round(quantity*cost*100)/100;
    const entry={id:documentId,source:'Entrada manual (sem documento fiscal)',
      fileName:'Entrada manual',supplier:manualForm.supplier.trim(),
      invoiceNumber:'',date:new Date().toLocaleDateString('pt-BR'),
      checkedBy,status:'Lançamento manual',importedAt:timestamp,subtotal:amount,
      discount:0,total:amount,items:[{name:product.name,code:product.sku,
      productId:product.id,quantity,unit:product.unit,unitPrice:cost,lineTotal:amount}],
      stockEntries:[{productId:product.id,movementId,quantity,netUnitCost:cost}]};
    setDocuments((old)=>[entry,...old]);
    setMovements((old)=>[{id:movementId,documentId,productId:product.id,
      product:product.name,type:'Entrada',quantity,reason,date:timestamp,by:checkedBy},...old]);
    setManualMode(false);setManualNew(false);setManualChosenId('');setManualSearch('');
    setError('');setToast(manualNew?'Produto criado e entrada registrada.':'Entrada adicionada ao produto existente.');
  }
  function openProduct(product) {
    setEditing(product || null);
    setProductForm(product ? { name: product.name, sku: product.sku || '', category: product.category || 'Outros', unit: product.unit || 'un', stock: String(product.stock), min: String(product.min), cost: String(product.cost), preferredSupplier: product.preferredSupplier || '' } : { name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0', preferredSupplier: '' });
    setModal('product');
  }
  function saveProduct(event) {
    event.preventDefault();
    const name = productForm.name.trim();
    if (!name) return;
    if (editing) {
      setProducts((old) => old.map((p) => p.id === editing.id ? { ...p, ...productForm, stock: Number(productForm.stock), min: Number(productForm.min), cost: Number(productForm.cost) } : p));
      setToast('Produto atualizado.');
    } else {
      const hints = findDuplicatesForCandidate({ ...productForm, id: '__novo_produto__', name }, products);
      if (hints.length && !window.confirm(
        'Possível cadastro duplicado: "' + hints[0].left.name + '" (' + hints[0].left.sku +
        '). Confira antes de prosseguir. Deseja cadastrar mesmo assim?')) return;
      const item = { ...productForm, id: uid(), name, sku: productForm.sku || ('PRD-' + Date.now().toString().slice(-5)), stock: Number(productForm.stock) || 0, min: Number(productForm.min) || 0, cost: Number(productForm.cost) || 0, updated: dateNow() };
      setProducts((old) => [item, ...old]);
      setMovements((old) => [{ id: uid(), product: name, type: 'Cadastro', quantity: item.stock, reason: 'Cadastro inicial', date: dateNow() }, ...old]);
      setToast('Produto cadastrado.');
    }
    setModal('');
  }
  function openAdjustment(product, type = 'Entrada') {
    setEditing(product);
    setAdjust({ type, quantity: '1', reason: type === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' });
    setModal('adjust');
  }
  function beginCount() {
    if(!products.length){setCountError('Cadastre produtos antes de fazer a contagem.');return;}
    if(supabase&&saveStatus!=='Sincronizado'){setCountError('Aguarde o estoque sincronizar antes de iniciar.');return;}
    setCountDraft(Object.fromEntries(products.map((p)=>[p.id,''])));
    setCountBasis(revisionRef.current);
    setCountError('');
  }
  async function saveCountSettings() {
    if(currentUser?.role!=='admin'){setCountError('Apenas o Gestor pode alterar a periodicidade.');return;}
    if(supabase&&saveStatus!=='Sincronizado'){setCountError('Aguarde a sincronização antes de salvar.');return;}
    setCountBusy(true);setCountError('');
    try{
      await saveQueueRef.current;
      if(supabase){
        const {data,error:rpcError}=await supabase.rpc('inventory_count_settings',{p_token:accessCode,p_config:settingsForm,p_rev:revisionRef.current});
        if(rpcError||!data?.ok)throw new Error(rpcError?.message||'Erro ao salvar configuração.');
        if(!(await loadSharedInventory(accessCode)))throw new Error('Configuração salva, mas não foi possível recarregar.');
      }else setCountSettings({...settingsForm,configuredAt:countDay()});
      setToast('Periodicidade da contagem atualizada.');
    }catch(e){setCountError(e?.message||'Não foi possível configurar a contagem.');}
    finally{setCountBusy(false);}
  }
  async function completePhysicalCount() {
    if(!countDraft||countBusy||!supabase)return;
    if(products.some((p)=>countDraft[p.id]===undefined||countDraft[p.id]==='')){setCountError('Preencha todos os produtos, inclusive os zerados.');return;}
    const lines=products.map((p)=>({productId:p.id,counted:Number(String(countDraft[p.id]).replace(',','.'))}));
    if(lines.some((v)=>!Number.isFinite(v.counted)||v.counted<0||Math.round(v.counted*1000)/1000!==v.counted)){setCountError('Informe quantidades não negativas, com até 3 casas decimais.');return;}
    const diffs=lines.filter((x)=>x.counted!==Number(products.find((p)=>p.id===x.productId)?.stock||0)).length;
    if(!window.confirm('Concluir a contagem? '+diffs+' diferenças serão ajustadas no estoque.'))return;
    setCountBusy(true);setCountError('');
    try{
      await saveQueueRef.current;
      const {data,error:rpcError}=await supabase.rpc('inventory_count_complete',{p_token:accessCode,p_lines:lines,p_rev:countBasis});
      if(rpcError||!data?.ok)throw new Error(rpcError?.message||'Falha ao registrar.');
      if(!(await loadSharedInventory(accessCode)))throw new Error('Registro concluído, mas falhou a atualização da tela.');
      setCountDraft(null);setCountBasis(null);
      setToast('Contagem concluída com sucesso. Ajustes registrados no histórico.');
    }catch(e){setCountError(e?.message||'Não foi possível concluir a contagem.');}
    finally{setCountBusy(false);}

  }
  function saveAdjustment(event) {
    event.preventDefault();
    const amount = Number(adjust.quantity);
    if (!editing || !(amount > 0)) return;
    const delta = adjust.type === 'Saída' ? -amount : amount;
    if (Number(editing.stock) + delta < 0) { setToast('A saída não pode ser maior que o saldo disponível.'); return; }
    setProducts((old) => old.map((p) => p.id === editing.id ? { ...p, stock: Math.round((Number(p.stock) + delta) * 1000) / 1000, updated: dateNow() } : p));
    setMovements((old) => [{ id: uid(), product: editing.name, type: adjust.type, quantity: amount, reason: adjust.reason || 'Ajuste manual', date: dateNow() }, ...old]);
    setModal('');
    setToast('Estoque atualizado.');
  }
  async function parseUploadedFile(file) {
    const xml = /\.xml$/i.test(file.name) || file.type === 'text/xml' || file.type === 'application/xml';
    if (xml) {
      const content = await file.text();
      const parsed = parseNfeXml(content);
      return [{ ...parsed, checkedBy: '', fileName: file.name, status: 'Aguardando conferência' }];
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      {
        let worker;
        try {
          const prepared = await prepareReceiptCanvases(file);
          const canvases = prepared.canvases.length ? prepared.canvases : [file];
          const qrResults = await detectNfceQrCodes(canvases, prepared.qrCanvases, enableExternalQr);
          const { createWorker } = await import('tesseract.js');
          worker = await createWorker('por', 1, {
            logger: (message) => {
              if (message.status === 'recognizing text') {
                const progress = ((message.progress || 0) + (window.__ocrReceiptIndex || 0)) / canvases.length;
                setOcrProgress(Math.round(progress * 100));
              }
            }
          });
          const receipts = [];
          for (let index = 0; index < canvases.length; index++) {
            window.__ocrReceiptIndex = index;
            await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            const primaryResult = await worker.recognize(canvases[index]);
            const primaryText = primaryResult.data.text || '';
            const primaryItems = parseReceiptOcr(primaryText);

            await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            const alternateResult = await worker.recognize(canvases[index]);
            const alternateText = alternateResult.data.text || '';
            const alternateItems = parseReceiptOcr(alternateText);
            // If either pass recognized real coded lines inside the receipt table,
            // discard unstructured guesses from the legacy OCR fallback. Those guesses
            // were adding Sub-Total, tax, payment and misread fragments as products.
            const primaryCoded = primaryItems.filter((item) => item.code);
            const alternateCoded = alternateItems.filter((item) => item.code);
            const items = primaryCoded.length || alternateCoded.length
              ? mergeReceiptCandidates(primaryCoded, alternateCoded)
              : mergeReceiptCandidates(primaryItems, alternateItems);
            const invoiceTotals = reconcileReceiptTotals(primaryText, alternateText, items);
            const combinedText = primaryText + '\n\n--- LEITURA ALTERNATIVA ---\n' + alternateText;
            const primaryMeta = detectReceiptMetadata(primaryText);
            const alternateMeta = detectReceiptMetadata(alternateText);
            const meta = { invoiceNumber: primaryMeta.invoiceNumber || alternateMeta.invoiceNumber, date: primaryMeta.date || alternateMeta.date };
            const qr = qrResults[index] || { accessKey: '', consultaUrl: '' };
            const accessKey = [qr.accessKey, extractAccessKeyFromText(primaryText), extractAccessKeyFromText(alternateText)].find(validateNfceAccessKey) || '';
            const consultaUrl = accessKey ? (qr.qrUrlPreserved ? qr.consultaUrl : PUBLIC_NFCE_CONSULTA_URL) : '';
            const keyWarning = !accessKey && (hasUncertainReceiptKey(primaryText) || hasUncertainReceiptKey(alternateText))
              ? 'A chave lida pelo OCR foi rejeitada: modelo diferente de 65, tamanho incorreto ou dígito verificador inválido. Confira a chave impressa e tente uma foto mais nítida do QR Code.'
              : '';
            const multiple = prepared.split && canvases.length > 1;
            receipts.push({
              supplier: detectReceiptSupplier(primaryText) || detectReceiptSupplier(alternateText) || (multiple ? 'Cupom ' + (index + 1) : ''),
              supplierCnpj: detectSupplierCnpj(primaryText) || detectSupplierCnpj(alternateText),
              invoiceNumber: meta.invoiceNumber,
              date: meta.date,
              accessKey,
              consultaUrl,
              keyWarning,
              qrDetected: Boolean(qr.qrRaw) && Boolean(accessKey),
              qrUrlPreserved: Boolean(qr.qrUrlPreserved),
              qrReader: qr.qrReader || (qr.qrRaw ? 'Leitura QR local' : ''),
              qrReaderWarning: qr.qrReaderWarning || '',
              source: multiple ? 'Foto (cupom ' + (index + 1) + ' de ' + canvases.length + ' — 2 leituras OCR)' : 'Foto (OCR local, 2 leituras)',
              checkedBy: '',
              fileName: multiple ? file.name + ' — cupom ' + (index + 1) : file.name,
              status: 'Aguardando conferência',
              ocrText: combinedText,
              subtotal: invoiceTotals.subtotal,
              discount: invoiceTotals.discount,
              total: invoiceTotals.total,
              totalsSource: invoiceTotals.totalsSource,
              totalsWarning: invoiceTotals.totalsWarning,
              items: items.length ? items : [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }]
            });
          }
          const uniqueReceipts = [];
          let duplicateReadsRemoved = 0;
          const normalizeSupplier = (value) => norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
          const sameSupplier = (a, b) => {
            const left = normalizeSupplier(a), right = normalizeSupplier(b);
            if (!left || !right) return true;
            const shorter = Math.min(left.length, right.length);
            return shorter >= 8 && (left === right || left.startsWith(right) || right.startsWith(left));
          };
          for (const candidate of receipts) {
            const duplicate = uniqueReceipts.find((existing) => {
              if (validateNfceAccessKey(candidate.accessKey) && validateNfceAccessKey(existing.accessKey))
                return candidate.accessKey === existing.accessKey;
              if (candidate.invoiceNumber && existing.invoiceNumber && candidate.invoiceNumber === existing.invoiceNumber) {
                return sameSupplier(candidate.supplier, existing.supplier);
              }
              return false;
            });
            if (!duplicate) {
              uniqueReceipts.push(candidate);
              continue;
            }
            duplicateReadsRemoved++;
            const existingItems = (duplicate.items || []).filter((item) => item.name && item.name.trim());
            const candidateItems = (candidate.items || []).filter((item) => item.name && item.name.trim());
            const joinedItems = mergeReceiptCandidates(existingItems, candidateItems);
            duplicate.items = joinedItems.length ? joinedItems : [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }];
            duplicate.ocrText = [duplicate.ocrText, candidate.ocrText].filter(Boolean).join('\n\n--- OUTRO RECORTE DA MESMA NOTA ---\n');
            duplicate.supplier = duplicate.supplier || candidate.supplier;
            duplicate.supplierCnpj = duplicate.supplierCnpj || candidate.supplierCnpj;
            duplicate.invoiceNumber = duplicate.invoiceNumber || candidate.invoiceNumber;
            duplicate.date = duplicate.date || candidate.date;
            duplicate.accessKey = duplicate.accessKey || candidate.accessKey;
            duplicate.consultaUrl = duplicate.consultaUrl || candidate.consultaUrl;
            duplicate.keyWarning = duplicate.accessKey ? '' : (duplicate.keyWarning || candidate.keyWarning);
            duplicate.qrDetected = duplicate.qrDetected || candidate.qrDetected;
            duplicate.qrUrlPreserved = duplicate.qrUrlPreserved || candidate.qrUrlPreserved;
            duplicate.qrReader = duplicate.qrReader || candidate.qrReader;
            duplicate.qrReaderWarning = duplicate.qrReaderWarning || candidate.qrReaderWarning;
            duplicate.subtotal = duplicate.subtotal ?? candidate.subtotal;
            duplicate.discount = duplicate.discount ?? candidate.discount;
            duplicate.total = duplicate.total ?? candidate.total;
            duplicate.totalsSource = duplicate.totalsSource || candidate.totalsSource;
            duplicate.source = 'Foto (leitura combinada de recortes repetidos)';
          }

          window.__ocrReceiptIndex = 0;
          const parsedReceipts = uniqueReceipts.length ? uniqueReceipts : receipts;
          return parsedReceipts;
        } catch (e) {
          throw new Error('Leitura OCR de ' + file.name + ': ' + (e?.message || 'erro desconhecido'));
        } finally {
          if (worker) await worker.terminate().catch(() => {});
          delete window.__ocrReceiptIndex;

        }
      }
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      return [{ supplier: '', invoiceNumber: '', date: '', source: 'PDF (preenchimento manual)', checkedBy: '', fileName: file.name, status: 'Aguardando preenchimento', items: [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] }];
    }
    throw new Error('Formato não reconhecido: ' + file.name + '. Use XML, PDF ou JPG/PNG/WEBP.');
  }

  const cleanPendingDraft=(value)=>{
    if(!value) return {};
    const {pendingId,pendingRevision, ...clean}=value;
    return {...clean,ocrText:String(clean.ocrText||'').slice(0,100000),
      officialText:String(clean.officialText||'').slice(0,30000)};
  };
  async function refreshPending(){
    if(!supabase||!accessCode)return;
    const {data,error:pendingError}=await supabase.rpc('pending_receipts_list',{p_token:accessCode});
    if(pendingError)throw new Error(pendingError.message);
    setPendingReceipts(Array.isArray(data)?data:[]);
  }
  async function storePendingReceipt(file,receipt){
    if(!supabase||!accessCode)throw new Error('Faça login para salvar notas pendentes no servidor.');
    if(file.size>4000000)throw new Error('Limite de 4 MB por arquivo para arquivamento.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    let encoded='';
    for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const base64=btoa(encoded);
    const {data,error:uploadError}=await supabase.rpc('pending_receipt_create',{
      p_token:accessCode,p_file_name:file.name,p_mime:file.type||'',
      p_base64:base64,p_draft:cleanPendingDraft(receipt)
    });
    if(uploadError||!data?.ok)throw new Error(uploadError?.message||'Não foi possível arquivar a nota.');
    pendingFingerprints.current.set(data.id,JSON.stringify(cleanPendingDraft(receipt)));
    pendingRevisions.current.set(data.id,data.revision);
    return {...receipt,pendingId:data.id,pendingRevision:data.revision};
  }
  async function openPendingReceipt(row){
    if(draft && draft.pendingId!==row.id &&
       !window.confirm('Trocar a conferência atual? As alterações são salvas automaticamente.'))return;
    pendingFingerprints.current.set(row.id,JSON.stringify(row.draft));
    pendingRevisions.current.set(row.id,row.revision);
    setDraft({...row.draft,pendingId:row.id,pendingRevision:row.revision});
    setDraftQueue([]);setDraftBatch(null);setView('documents');setError('');
  }
  async function viewPendingOriginal(row){
    if(!supabase||!accessCode)return;
    try{
      const {data,error:fileError}=await supabase.rpc('pending_receipt_file',{p_token:accessCode,p_id:row.id});
      if(fileError||!data?.base64)throw new Error(fileError?.message||'Arquivo original não disponível.');
      const binary=atob(data.base64);
      const dataBytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)dataBytes[i]=binary.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([dataBytes],{type:data.mime||'application/octet-stream'}));
      const anchor=document.createElement('a');anchor.href=url;anchor.download=data.fileName||'original';
      anchor.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
    }catch(e){setError(e.message);}
  }
  async function uploadFiles(selectedFiles) {
    const files = Array.from(selectedFiles || []);
    if (!files.length || busy) return;
    if (files.length > 20) {
      setError('Envie até 20 arquivos de cada vez para manter o processamento estável.');
      return;
    }
    if (manualMode) {setError('Feche a entrada manual antes de importar notas fiscais.');return;}
    if ((draft || draftQueue.length > 0) &&
        !window.confirm('Já existem notas aguardando revisão. Deseja descartar essa conferência e começar um novo lote de arquivos?')) {
      if (uploadRef.current) uploadRef.current.value = '';
      return;
    }
    setView('documents');
    setBusy(true);
    setError('');
    setOcrProgress(0);
    setUploadBatchProgress({current: 0, total: files.length, fileName: ''});
    if (uploadRef.current) uploadRef.current.value = '';
    const parsed = [];
    const issues = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadBatchProgress({current: i + 1, total: files.length, fileName: file.name});
        setProcessingType(/\.xml$/i.test(file.name) ? 'xml' : 'ocr');
        setOcrProgress(0);
        try {
          const receipts = await parseUploadedFile(file);
          for(const receipt of receipts){
            const mapped=attachPreviousPurchases(receipt,[...parsed,...documents],products);
            parsed.push(await storePendingReceipt(file,mapped));
          }
        } catch (e) {
          issues.push(file.name + ': ' + (e?.message || 'não foi possível interpretar'));
          const fallback={supplier:'',invoiceNumber:'',date:'',
            source:'Arquivo (conferência manual)',checkedBy:'',fileName:file.name,
            status:'Aguardando preenchimento',
            importWarning:e?.message||'Não foi possível interpretar automaticamente.',
            items:[{name:'',code:'',quantity:1,unit:'un',unitPrice:0}]};
          try{parsed.push(await storePendingReceipt(file,fallback));}
          catch(saveError){issues.push(file.name+': não foi possível salvar o arquivo no servidor — '+saveError.message);}

        }
      }
      if (parsed.length) {
        await refreshPending();
        setDraft(parsed[0]);
        setDraftQueue(parsed.slice(1));
        setDraftBatch(parsed.length > 1 ? {current: 1, total: parsed.length} : null);
        setToast(parsed.length + (parsed.length === 1 ? ' cupom pronto' : ' cupons prontos') + ' para conferência. Nada foi lançado automaticamente.');
      }
      if (issues.length) setError('Alguns arquivos precisam de preenchimento manual: ' + issues.slice(0, 3).join(' | '));
    } finally {
      setBusy(false);
      setOcrProgress(0);
      setUploadBatchProgress(null);
    }
  }
  useEffect(()=>{
    if(!draft?.pendingId||!supabase||!accessCode||!dataReady)return;
    const snapshot=cleanPendingDraft(draft),id=draft.pendingId;
    const fingerprint=JSON.stringify(snapshot);
    if(pendingFingerprints.current.get(id)===fingerprint)return;
    const timer=setTimeout(()=>{
      pendingSaveSerial.current=pendingSaveSerial.current.catch(()=>{}).then(async()=>{
        setPendingBusy(true);setPendingSaveError('');
        const {data,error:pendingError}=await supabase.rpc('pending_receipt_save',{
          p_token:accessCode,p_id:id,p_draft:snapshot,p_rev:pendingRevisions.current.get(id)
        });
        if(pendingError||!data?.ok)throw new Error(pendingError?.message||'Falha ao salvar conferência.');
        pendingFingerprints.current.set(id,fingerprint);
        pendingRevisions.current.set(id,data.revision);
        // Trigger another autosave if the reviewer edited while the previous RPC was running.
        setDraft(current=>current?.pendingId===id?{...current,pendingRevision:data.revision}:current);
        setPendingReceipts(old=>old.map(row=>row.id===id
          ? {...row,draft:snapshot,revision:data.revision}:row));
      }).catch(e=>setPendingSaveError(e.message)).finally(()=>setPendingBusy(false));
    },1200);
    return ()=>clearTimeout(timer);
  },[draft,supabase,accessCode,dataReady]);

  function changeDraft(key, value) {
    const numericFields = ['subtotal', 'discount', 'total', 'additionalCharges', 'officialSubtotal', 'officialDiscount', 'officialTotal'];
    setDraft((d) => d ? ({ ...d, finalReviewed: key === 'checkedBy' ? d.finalReviewed : false,
      [key]: numericFields.includes(key) ? (value === '' ? 0 : Number(value)) : value }) : d);
  }
  function changeNfceAccessKey(value) {
    const key = String(value || '').replace(/[^0-9]/g, '').slice(0, 44);
    setDraft((previous) => {
      if (!previous) return previous;
      const valid = validateNfceAccessKey(key);
      return {
        ...previous,
        accessKey: valid ? key : '',
        accessKeyInput: key,
        consultaUrl: valid ? PUBLIC_NFCE_CONSULTA_URL : '',
        qrUrlPreserved: false,
        officialCompared: false, officialItems: [], officialVerified: false,
        officialOrigin: '', officialStatus: '', officialApplied: false,
        keyWarning: valid ? '' : 'A chave exige 44 dígitos, modelo 65 e dígito verificador correto.'
      };
    });
  }

  function changeInvoiceAmount(key, value) {
    const number = value === '' ? 0 : Math.round(Number(value) * 100) / 100;
    setDraft((d) => d ? ({ ...d, [key]: number, totalsReviewed: false,
      finalReviewed: false, officialVerified: false }) : d);
  }
  function changeItem(index, key, value) {
    setDraft((d) => ({
      ...d,
      reviewedItems: { ...(d.reviewedItems || {}), [index]: false },
      finalReviewed: false, totalsReviewed: false,
      officialVerified: false,
      items: d.items.map((it, i) => {
        if (i !== index) return it;
        const isNumeric = ['quantity', 'unitPrice', 'lineTotal', 'stockQuantity'].includes(key);
        const next = { ...it, [key]: isNumeric ? (value === '' ? 0 : Number(value)) : value };
        // Printed fiscal line totals are independent facts: do not overwrite them
        // when a reviewer fixes the quantity or unit price.
        if (key === 'quantity' || key === 'unitPrice') {
          if (d.manualInvoice) {
            next.lineTotal = Math.round(Number(next.quantity||0)*Number(next.unitPrice||0)*100)/100;
            next.readingWarning = '';
          } else {
            next.readingWarning = 'Quantidade ou preço alterado; confira também o total da linha.';
          }
        }
        return next;
      })
    }));
  }

  useEffect(() => {
    if (!draft?.consultaUrl || !draft?.qrUrlPreserved || draft.officialCompared) return;
    const url = draft.consultaUrl;
    const expectedKey = draft.accessKey;
    let validQr = false;
    try {
      const parsed = new URL(url);
      const hosts = ['dfe-portal.svrs.rs.gov.br', 'www.sefaz.rs.gov.br'];
      const pathOk = /^\/Dfe\/QrCodeNFce\/?$/i.test(parsed.pathname) || /^\/NFCE\/NFCE-COM\.aspx$/i.test(parsed.pathname);
      const payload = parsed.searchParams.get('p') || '';
      validQr = parsed.protocol === 'https:' && hosts.includes(parsed.hostname) && pathOk &&
        /^\d{44}\|/.test(payload) && validateNfceAccessKey(payload.split('|')[0]) &&
        payload.split('|')[0] === expectedKey;
    } catch (_) {}
    if (!validQr) {
      setDraft((d) => d && d.consultaUrl === url
        ? { ...d, officialStatus: 'QR Code incompleto. Confira a nota manualmente.', officialOrigin: '' } : d);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setDraft((d) => d && d.consultaUrl === url ? { ...d, officialStatus: 'Consultando a SEFAZ (até 10 segundos)…' } : d);
    (async () => {
      try {
        const response = await fetch('/api/consulta-nfce', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }), signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || 'Consulta oficial indisponível.');
        if (data.source !== 'SVRS' || data.accessKey !== expectedKey)
          throw new Error('A resposta fiscal não corresponde à chave deste cupom.');
        const officialItems = Array.isArray(data.items) ? data.items : [];
        if (!officialItems.length) throw new Error('A SEFAZ não disponibilizou os itens num formato legível.');
        const totals = data.totals || {};
        setDraft((d) => d && d.consultaUrl === url && d.accessKey === expectedKey
          ? { ...d, officialItems, officialCompared: true, officialOrigin: 'sefaz',
              officialSubtotal: totals.subtotal, officialDiscount: totals.discount,
              officialTotal: totals.total, reviewedItems: {}, totalsReviewed: false,
              officialStatus: 'Consulta automática concluída. Compare as linhas antes de lançar.' } : d);
      } catch (err) {
        if (controller.signal.aborted) return;
        setDraft((d) => d && d.consultaUrl === url
          ? { ...d, officialStatus: err.message || 'SEFAZ indisponível. Confira a nota manualmente.' } : d);
      } finally {
        clearTimeout(timeout);
        if (controller.signal.aborted) {
          setDraft((d) => d && d.consultaUrl === url && !d.officialCompared
            ? { ...d, officialStatus: 'A SEFAZ não respondeu em até 10 segundos. Confira os campos destacados.' } : d);
        }
      }
    })();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [draft?.consultaUrl, draft?.qrUrlPreserved, draft?.accessKey]);

  function checkOfficialText() {
    const raw = String(draft?.officialText || '').trim();
    if (!raw) { setError('Cole o texto dos itens exibidos na consulta pública antes de comparar.'); return; }
    const officialItems = parseOfficialConsultaItems(raw);
    if (!officialItems.length) {
      setError('Não consegui extrair os itens do texto colado. Copie a tabela de produtos com descrição, quantidade, unidade e valores; a consulta continua aberta no outro separador.');
      return;
    }
    const totals = parseReceiptTotals(raw);
    setDraft((d) => ({
      ...d,
      officialItems,
      officialCompared: true,
      officialVerified: false, officialApplied: false,
      officialOrigin: 'texto-manual',
      reviewedItems: {}, totalsReviewed: false,
      officialSubtotal: totals.subtotal,
      officialDiscount: totals.discount,
      officialTotal: totals.total
    }));
    setError('');
    setToast('Consulta pública interpretada: ' + officialItems.length + ' itens para comparar com o OCR.');
  }
  function applyOfficialItems() {
    if (!draft?.officialItems?.length) return;
    setDraft((d) => ({
      ...d,
      items: d.officialItems.map((item, index) => {
        const match = compareInvoiceItems(d.items, d.officialItems).find((r) =>
          r.official === item && r.ocr && normalizeProductCode(r.ocr.code) === normalizeProductCode(item.code) &&
          Math.abs(receiptItemTotal(r.ocr) - receiptItemTotal(item)) <= 0.05);
        return { ...item, itemDiscount: Number(match?.ocr?.itemDiscount || 0) };
      }),
      reviewedItems: {}, totalsReviewed: false, finalReviewed:false,
      officialApplied: true,
      subtotal: d.officialSubtotal ?? d.subtotal,
      discount: d.officialDiscount ?? d.discount,
      total: d.officialTotal ?? d.total,
      officialVerified: d.officialOrigin === 'sefaz',
      totalsWarning: d.officialOrigin === 'sefaz' && d.officialTotal != null && d.officialSubtotal != null ? '' : d.totalsWarning,
      source: String(d.source || '').includes('consulta pública') ? d.source : (String(d.source || '') + ' + consulta pública'),
      totalsSource: d.officialOrigin === 'sefaz' ? 'SEFAZ (consulta automática)' : 'Texto de consulta (não autenticado)'
    }));
    setError('');
    setToast('Itens substituídos pelos dados extraídos da consulta pública. Confira antes de lançar.');
  }
  function confirmDocument() {
    if(draft?.pendingId && (pendingBusy||pendingSaveError||
      pendingFingerprints.current.get(draft.pendingId)!==JSON.stringify(cleanPendingDraft(draft)))){
      setError(pendingSaveError||'Aguarde a conferência ser salva no servidor antes de lançar.');
      return;
    }
    if (officialMissing) {
      setError('Há ' + officialMissing + ' item(ns) da consulta ainda ausentes. Inclua-os ou use os itens oficiais antes de lançar.');
      return;
    }
    if (receiptReviewRows.some((row) => !row.done)) {
      setError('Existem linhas destacadas sem conferência. Revise-as e marque "Conferido pelo encarregado".');
      return;
    }
    if (totalsRequireReview && !draft?.totalsReviewed) {
      setError('Confira e marque os totais destacados antes de registrar a nota.');
      return;
    }
    if (draftTotal < -0.01 || totalsFinalMismatch) {setError('O total líquido não confere com o documento. Corrija os valores antes de lançar.');return;}
    if (!readyForFinalReview || !draft?.finalReviewed || !draft?.checkedBy?.trim()) {
      setError('Conclua a conferência e informe o responsável no quadro de confirmação final.'); return;
    }
    if (draft.manualInvoice) {
      if (!draft.supplier?.trim() || !draft.invoiceNumber?.trim() || !draft.date?.trim()) {
        setError('Informe fornecedor, número e data da nota manual.');
        return;
      }
      if (draft.items.some((item)=>!products.some((p)=>p.id===item.productId))) {
        setError('Associe cada linha a um produto já cadastrado. Para um produto novo, use o botão Novo produto na tela de Estoque.');
        return;
      }
      if (Math.abs(Number(draftSubtotal) - Number(draftItemsSubtotal)) > 0.02) {
        setError('Confira o subtotal: ele deve corresponder à soma das linhas digitadas.');
        return;
      }
    }
    const missingHistoricalLinks = draft.items.some((item, index) => {
      if (!shouldPostReceiptItem(item) || item.productId) return false;
      const matched = findHistoricalMatches(draft, documents, products)[index];
      return Boolean(matched && matched.productId &&
        !findReceiptCatalogProduct(item, products, draft.supplierCnpj));
    });
    if (missingHistoricalLinks) {
      setError('Já existe uma compra deste item com o mesmo fornecedor. Selecione o produto do estoque indicado no histórico ou confirme expressamente que é um cadastro distinto.');
      return;
    }
    const unresolvedCodes = draft.items.filter(shouldPostReceiptItem).filter((it) =>
      !it.productId && !findReceiptCatalogProduct(it, products, draft.supplierCnpj) &&
      findReceiptCodeConflicts(it, products, draft.supplierCnpj).length > 0);
    if (unresolvedCodes.length) {
      setError('Código fiscal equivalente a produto já cadastrado: "' + unresolvedCodes[0].name +
        '". Escolha o produto existente ou selecione explicitamente "Criar cadastro distinto", após conferir a nota.');
      return;
    }
    if (draft?.items?.filter(shouldPostReceiptItem).some((it) => {
      const mapped = findSupplierAliasProduct(it, products, draft.supplierCnpj);
      if (!it.productId && mapped && normalizeReceiptUnit(mapped.unit) !== normalizeReceiptUnit(it.unit)) return true;
      const target = products.find((p) => p.id === it.productId);
      return Boolean(target && normalizeReceiptUnit(target.unit) !== normalizeReceiptUnit(it.unit) &&
        !(Number(it.stockQuantity) > 0));
    })) { setError('Selecione o produto interno e informe sua quantidade quando a unidade fiscal for diferente.'); return; }
    if (!draft || !draft.items.length || draft.items.some((it) =>
      !it.name?.trim() || !Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0 ||
      !Number.isFinite(Number(it.unitPrice)) || Number(it.unitPrice) < 0 ||
      !it.unit?.trim())) {
      setError('Todas as linhas devem conter produto, quantidade, unidade e preço válidos.');
      return;
    }
    // The unique fiscal access key is the primary deduplication key.
    const duplicate = documents.some((d) =>
      (validateNfceAccessKey(d.accessKey) && d.accessKey === draft.accessKey) ||
      (!(validateNfceAccessKey(d.accessKey) && validateNfceAccessKey(draft.accessKey)) &&
        d.invoiceNumber && draft.invoiceNumber && d.invoiceNumber === draft.invoiceNumber &&
        normalizeReceiptName(d.supplier) === normalizeReceiptName(draft.supplier) &&
        (!d.date || !draft.date || d.date === draft.date)));
    if (duplicate) { setError('Esta nota já foi lançada no estoque. Para corrigir, peça ao Gestor o estorno da entrada anterior.'); return; }
    // Keep an immutable copy: each fiscal row stores the definitive catalog ID.
    const items = draft.items.map((item) => ({ ...item }));
    const nextProducts = [...products];
    const nextMovements = [...movements];
    const documentId = uid();
    const stockEntries = [];
    // Apply line-specific discounts first; prorate only the remaining discount
    // and charges, so a targeted discount is not spread over unrelated products.
    const gross = items.reduce((sum, item) => sum + receiptItemTotal(item), 0);
    const expenseTotal = items.filter((it) => !shouldPostReceiptItem(it))
      .reduce((sum, it) => sum + receiptItemTotal(it) - Number(it.itemDiscount || 0), 0);
    const postedBase = items.filter(shouldPostReceiptItem)
      .reduce((sum, it) => sum + receiptItemTotal(it) - Number(it.itemDiscount || 0), 0);
    const lineDiscounts = items.reduce((sum, item) => sum + Math.max(0, Number(item.itemDiscount || 0)), 0);
    const remainingDiscount = Math.max(0, Number(draftDiscount) - lineDiscounts);
    const discountBase = Math.max(0, gross - lineDiscounts);
    items.forEach((it, itemIndex) => {
      if (!shouldPostReceiptItem(it)) return; // Retain in fiscal history; do not mutate stock.
      const itemGross = receiptItemTotal(it);
      const base = Math.max(0, itemGross - Math.max(0, Number(it.itemDiscount || 0)));
      const ratio = discountBase > 0 ? base / discountBase : 0;
      // Fees already listed as fiscal rows are not extra to the invoice total.
      // Allocate their net cost to physical items instead of creating fake products.
      const serviceRatio = postedBase > 0 ? base / postedBase : 0;
      const netLine = Math.max(0, base - remainingDiscount * ratio +
        draftExtras * serviceRatio + expenseTotal * serviceRatio -
        (discountBase > 0 ? expenseTotal * remainingDiscount / discountBase * serviceRatio : 0));
      const fiscalCode = normalizeProductCode(it.code);
      const issuer = String(draft.supplierCnpj || '').replace(/\D/g, '');
      const automaticProduct = findReceiptCatalogProduct(it, nextProducts, issuer);
      const index = nextProducts.findIndex((p) => it.productId
        ? p.id === it.productId : p.id === automaticProduct?.id);
      const stockQuantity = index >= 0 && normalizeReceiptUnit(nextProducts[index].unit) !== normalizeReceiptUnit(it.unit)
        ? Number(it.stockQuantity) : Number(it.quantity);
      const netUnitCost = Math.round(netLine / stockQuantity * 10000) / 10000;
      let productId;
      if (index >= 0) {
        const old = nextProducts[index];
        productId = old.id;
        const supplierCodes = [...(old.supplierCodes || [])];
        if (issuer && fiscalCode && !supplierCodes.some((alias) => alias.cnpj === issuer && normalizeProductCode(alias.code) === fiscalCode))
          supplierCodes.push({ cnpj: issuer, code: it.code });
        nextProducts[index] = { ...old, supplierCodes,
          stock: Math.round((Number(old.stock) + stockQuantity) * 1000) / 1000,
          cost: Number.isFinite(netUnitCost) ? netUnitCost : old.cost,
          unit: old.unit, updated: dateNow() };
      } else {
        productId = uid();
        nextProducts.unshift({ id: productId, name: it.name.trim(), sku: it.code || ('PRD-' + Date.now().toString().slice(-5) + '-' + nextProducts.length), supplierCodes: issuer && fiscalCode ? [{ cnpj: issuer, code: it.code }] : [], category: 'Outros', unit: it.unit || 'un', stock: Number(it.quantity), min: 0, cost: Number.isFinite(netUnitCost) ? netUnitCost : 0, updated: dateNow() });
      }
      // Even when the reviewer explicitly selected "novo cadastro", never
      // persist the sentinel; an invoice must reference the real product ID.
      items[itemIndex] = { ...it, productId };
      const movementId = uid();
      stockEntries.push({ productId, movementId, quantity: stockQuantity, netUnitCost });
      nextMovements.unshift({ id: movementId, documentId, productId, product: nextProducts.find((p) => p.id === productId)?.name || it.name.trim(), type: 'Entrada', quantity: stockQuantity, reason: 'Documento ' + (draft.invoiceNumber ? '#' + draft.invoiceNumber : 'importado'), date: dateNow(), by: draft.checkedBy.trim() });
    });
    setProducts(nextProducts);
    setMovements(nextMovements);
    const { ocrText, officialText, officialItems, officialSubtotal, officialDiscount, officialTotal, officialCompared, reviewedItems, totalsReviewed, finalReviewed, ...documentToSave } = draft;
    setDocuments((old) => [{ ...documentToSave,
      subtotal:draftSubtotal,discount:draftDiscount,total:draftTotal,additionalCharges:draftExtras,
      checkedBy: draft.checkedBy.trim(), id: documentId, stockEntries,
      pendingReceiptId:draft.pendingId||null,
      status: 'Conferido e lançado', importedAt: dateNow(), items }, ...old]);
    const nextDraft = draftQueue[0] || null;
    setDraft(nextDraft);
    setDraftQueue((old) => old.slice(1));
    setDraftBatch(nextDraft && draftBatch ? { ...draftBatch, current: draftBatch.current + 1 } : null);
    setError('');
    if (uploadRef.current) uploadRef.current.value = '';
    setToast(nextDraft ? 'Entrada registrada. Confira o próximo cupom antes de lançar.' : 'Entrada de ' + items.length + (items.length === 1 ? ' item registrada.' : ' itens registrada.'));
    setView('documents');
  }

  function openMergePair(pair) {
    if (currentUser?.role !== 'admin' || !supabase) {
      setToast('A consolidação exige uma sessão do Gestor no banco compartilhado.');
      return;
    }
    setMergePair(pair);
    // Prefer keeping a named item with positive stock; never guess whether
    // physical quantities describe the same contents.
    setMergeKeepId(Number(pair.left.stock) >= Number(pair.right.stock) ?
      pair.left.id : pair.right.id);
    setMergeAcknowledged(false);
    setMergeError('');
  }

  async function confirmProductMerge() {
    if (!mergePair || currentUser?.role !== 'admin' || !supabase || !accessCode)
      return;
    if (!mergePair.sameUnit) {
      setMergeError('As unidades são diferentes. Corrija o cadastro e converta as quantidades antes de consolidar.');
      return;
    }
    if (!mergeAcknowledged || ![mergePair.left.id, mergePair.right.id].includes(mergeKeepId)) return;
    if (countDraft) {
      setMergeError('Há uma contagem de estoque em andamento. Conclua ou cancele antes de consolidar.');
      return;
    }
    if (saveStatus !== 'Sincronizado') {
      setMergeError('Aguarde a sincronização do estoque antes de continuar.');
      return;
    }
    setMergeBusy(true);
    setMergeError('');
    try {
      await saveQueueRef.current;
      const removeId = mergePair.left.id === mergeKeepId ? mergePair.right.id : mergePair.left.id;
      const { data, error: rpcError } = await supabase.rpc('inventory_merge_products', {
        p_token: accessCode, p_keep_id: mergeKeepId, p_remove_id: removeId, p_rev: revisionRef.current
      });
      if (rpcError || !data?.ok) throw new Error(rpcError?.message || 'Não foi possível consolidar os produtos.');
      if (!(await loadSharedInventory(accessCode)))
        throw new Error('Consolidação concluída, mas não foi possível recarregar o estoque.');
      setMergePair(null);
      setMergeAcknowledged(false);
      setToast('Cadastros consolidados. Saldos e vínculos das notas foram preservados.');
    } catch (e) {
      setMergeError(e?.message || 'Falha ao consolidar. Atualize o estoque e tente novamente.');
    } finally { setMergeBusy(false); }
  }

  async function deleteDocument(document) {
    if (!document?.id || currentUser?.role !== 'admin') {
      setDeleteError('Somente o Gestor pode excluir uma nota fiscal lançada.');
      return;
    }
    if (!supabase || !accessCode) {
      setDeleteError('Entre com a conta do Gestor para remover documentos do banco compartilhado.');
      return;
    }
    if (saveStatus !== 'Sincronizado') {
      setDeleteError('Aguarde a sincronização terminar antes de excluir a nota.');
      return;
    }
    const label = document.invoiceNumber ? 'nº ' + document.invoiceNumber : (document.fileName || 'selecionada');
    if (!window.confirm(
      'Excluir definitivamente a nota ' + label + '?\n\n' +
      'As quantidades lançadas por esta nota serão estornadas do estoque e ' +
      'suas movimentações de entrada serão removidas.\n\n' +
      'Esta ação não pode ser desfeita.'
    )) return;
    setDeletingDocId(document.id);
    setDeleteError('');
    try {
      await saveQueueRef.current;
      const { data, error: removalError } = await supabase.rpc('inventory_delete_document', {
        p_session_token: accessCode,
        p_document_id: document.id
      });
      if (removalError || !data?.ok) {
        throw new Error(removalError?.message || 'A nota não pôde ser excluída.');
      }
      revisionRef.current = Number(data.revision ?? revisionRef.current + 1);
      const refreshed = await loadSharedInventory(accessCode);
      if (!refreshed) throw new Error('A nota foi excluída, mas não foi possível atualizar a tela. Entre novamente.');
      setDetailDoc(null);
      setError('');
      setToast('Nota excluída pelo Gestor e entrada estornada do estoque.');
    } catch (err) {
      const message = err?.message || 'Não foi possível excluir a nota.';
      setDeleteError(message);
      setError('Exclusão da nota: ' + message);
      setToast('Exclusão não concluída. Verifique o aviso na tela.');
    } finally {
      setDeletingDocId('');
    }
  }

  if (supabase && !accessLoaded) {
    return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>CAFETERIA</small></div></div><div className="auth-loading"><span className="spinner"/><b>Preparando o estoque compartilhado…</b></div></div></div>;
  }
  if (supabase && !accessGranted) {
    return <div className="auth-screen"><section className="auth-card">
      <div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>CAFETERIA</small></div></div>
      <div className="auth-eyebrow">ACESSO INDIVIDUAL</div>
      <h1>Entrar no estoque</h1>
      <p className="auth-intro">Use sua conta da cafeteria para consultar e atualizar o estoque compartilhado.</p>
      <form className="auth-form" onSubmit={handleLogin}>
        <label className="field"><span>Login</span><input type="text" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Seu login"/></label>
        <label className="field"><span>Senha</span><input type="password" name="password" autoComplete="current-password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Sua senha"/></label>
        <button className="btn primary auth-submit" type="submit" disabled={loginBusy}>{loginBusy ? 'Verificando acesso…' : 'Entrar no estoque'}</button>
      </form>
      {accessMessage && <div className="auth-message" role="status" style={{marginTop: 14}}>{accessMessage}</div>}
      <div className="auth-security"><Icon type="check" size={16}/> Sessão individual protegida, com validade de até 12 horas.</div>
    </section></div>;
  }
  if (supabase && accessGranted && !dataReady) {
    return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>CAFETERIA</small></div></div><div className="auth-loading"><span className="spinner"/><b>Carregando o estoque…</b><p>Buscando os dados compartilhados.</p></div></div></div>;
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('stock')}><span className="brand-icon"><Icon type="box" size={24}/></span><span><b>estoque<span>+</span></b><small>PROJETO GPT</small></span></button>
      <div className="side-caption">ESPAÇO DE TRABALHO</div><div className="workspace"><span className="workspace-avatar">E</span><span><b>Meu estoque</b><small>Ambiente de demonstração</small></span><Icon type="down" size={15}/></div>
      <div className="side-caption menu-caption">MENU PRINCIPAL</div><nav className="navigation">
        <button className={view === 'stock' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('stock')}><Icon type="grid"/><span>Estoque</span></button>
        <button className={view === 'count' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('count')}><Icon type="check"/><span>Contagem de estoque</span>{countDue&&<i>!</i>}</button>
        {currentUser?.role === 'admin' && <button className={view === 'duplicates' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('duplicates')}><Icon type="search"/><span>Possíveis duplicatas</span>{duplicatePairs.length > 0 && <i>{duplicatePairs.length}</i>}</button>}
        <button className={view === 'documents' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('documents')}><Icon type="file"/><span>Notas fiscais</span><i>{documents.length + (draft ? 1 : 0) + draftQueue.length}</i></button>
        <button className={view === 'movements' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('movements')}><Icon type="arrows"/><span>Movimentações</span></button>
        <button className={view === 'cash' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('cash')}><Icon type="chart"/><span>Fechamento de caixa</span></button>
        {currentUser?.role === 'admin' && <button className={view === 'purchases' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('purchases')}><Icon type="file"/><span>Lista de compras</span><i>{purchaseList.length}</i></button>}
        {currentUser?.role === 'admin' && <button className={view === 'suppliers' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('suppliers')}><Icon type="box"/><span>Fornecedores</span><i>{supplierGroups.length}</i></button>}
      </nav>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-icon"><Icon type="spark" size={18}/></span><b>Menos planilhas.<br/>Mais controle.</b><p>Importe o XML de uma NF-e e confira os produtos antes de lançar as entradas.</p></div><div className="user-row"><span className="user-avatar">{currentUser?.role === 'admin' ? 'GE' : currentUser ? 'EQ' : 'LG'}</span><span><b>{currentUser?.role === 'admin' && /^(administrador|admin|dono)$/i.test(currentUser?.display_name || '') ? 'Gestor' : (currentUser?.display_name || 'Equipe da cafeteria')}</b><small>{supabase ? (currentUser?.role === 'admin' ? 'Gestor' : 'Funcionário') + ' · ' + (saveStatus || 'Sessão ativa') : 'Protótipo local'}</small></span><button title="Sobre os dados" onClick={() => setToast(supabase ? 'Os dados são sincronizados no banco compartilhado da equipe.' : 'Os dados ficam no armazenamento local deste navegador; não há sincronização entre dispositivos.')}><Icon type="sliders" size={17}/></button></div></div>
    </aside>
    <main className="main"><input ref={uploadRef} className="hidden-input" type="file" multiple accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,application/pdf,application/xml,text/xml,image/*" onChange={(e) => void uploadFiles(e.target.files)}/>
      <header className="topbar"><div className="crumb">Workspace <Icon type="chevron" size={14}/><b>{page[1]}</b></div><div className="top-right"><span className="local-pill"><i/>{supabase ? "Estoque compartilhado" : "Protótipo local"}</span><button className="bell" title="Ver itens com estoque baixo" onClick={() => {setView('stock');setFilter('Estoque baixo');}}><Icon type="alert" size={18}/>{low.length > 0 && <em/>}</button><button className="user-avatar user-avatar-button" title={supabase ? "Encerrar sessão" : "Gestor"} onClick={supabase ? handleLock : () => setToast("Modo de demonstração local.")}>{supabase ? "Sair" : "LG"}</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{page[0]}</div><h1>{page[1]}</h1><p>{page[2]}</p></div><div className="heading-buttons">{view === 'stock' && <button className="btn secondary" onClick={() => setView('movements')}><Icon type="clock" size={17}/>Histórico</button>}{view === 'purchases' && currentUser?.role === 'admin' && <button className="btn primary" onClick={downloadPurchaseList}><Icon type="upload" size={18}/>Baixar CSV</button>}{view === 'stock' && currentUser?.role === 'admin' && <button className="btn primary" onClick={() => openProduct(null)}><Icon type="plus" size={18}/>Novo produto</button>}</div></div>

        {countDue && <div className="alert-strip" role="alert" style={{marginBottom:14}}><span className="alert-icon"><Icon type="alert" size={18}/></span><div><b>Contagem obrigatória pendente</b><p>Prazo: {countDateLabel(nextCount)}</p></div><button type="button" onClick={()=>setView('count')}>Conferir agora</button></div>}
        {view === 'count' && <section className="panel" style={{padding:20}}>
          <h2>Contagem física do estoque</h2>
          <p>Registre as quantidades reais para identificar diferenças no estoque.</p>
          <p>Próxima contagem: {countSettings.enabled ? countDateLabel(nextCount) : 'A configurar'}</p>
          {countSettings.enabled && <p style={{color:countDue?'#a33':'#356b54'}}>{countDue ? 'Prazo vencido: conferência obrigatória pendente.' : 'A contagem está em dia.'}</p>}
          {stockCounts[0]&&<p>Última conferência: {new Date(stockCounts[0].completedAt).toLocaleString('pt-BR')} · {stockCounts[0].by}</p>}
          {countError&&<div className="error" role="alert">{countError}</div>}
          {currentUser?.role==='admin'&&<div className="panel" style={{padding:15,marginTop:16}}>
            <h3>Periodicidade obrigatória · Gestor</h3>
            <label style={{display:'flex',gap:9,alignItems:'center',margin:'12px 0'}}><input type="checkbox" checked={Boolean(settingsForm.enabled)} onChange={(e)=>setSettingsForm({...settingsForm,enabled:e.target.checked})}/> Exigir contagem periódica</label>
            <div className="meta-fields">
              <label><span>Periodicidade</span><select value={settingsForm.mode} onChange={(e)=>setSettingsForm({...settingsForm,mode:e.target.value})}><option value="interval">A cada X dias</option><option value="weekly">Dia fixo da semana</option><option value="monthly">Dia fixo do mês</option></select></label>
              {settingsForm.mode==='interval'&&<label><span>Intervalo em dias (1 a 365)</span><input type="number" min="1" max="365" value={settingsForm.intervalDays} onChange={(e)=>setSettingsForm({...settingsForm,intervalDays:Number(e.target.value)})}/></label>}
              {settingsForm.mode==='weekly'&&<label><span>Dia da semana</span><select value={settingsForm.weekday} onChange={(e)=>setSettingsForm({...settingsForm,weekday:Number(e.target.value)})}>{['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map((d,i)=><option value={i+1} key={d}>{d}</option>)}</select></label>}
              {settingsForm.mode==='monthly'&&<label><span>Dia do mês (1 a 31)</span><input type="number" min="1" max="31" value={settingsForm.monthDay} onChange={(e)=>setSettingsForm({...settingsForm,monthDay:Number(e.target.value)})}/></label>}
            </div>
            <button className="btn primary" disabled={countBusy} onClick={()=>void saveCountSettings()}>Salvar periodicidade</button>
          </div>}{!countDraft && <button className="btn primary" onClick={beginCount}>Iniciar contagem</button>}
          {countDraft && <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Sistema</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>{products.map((p)=><tr key={p.id}><td>{p.name}</td><td>{qty(p.stock)} {p.unit}</td><td><input type="number" min="0" step="0.001" value={countDraft[p.id]??''} onChange={(e)=>setCountDraft({...countDraft,[p.id]:e.target.value})}/></td><td>{countDraft[p.id]==='' ? 'Pendente' : qty(Number(countDraft[p.id])-Number(p.stock))+' '+p.unit}</td></tr>)}</tbody></table></div>}
          {countDraft && <div className="modal-actions" style={{marginTop:12}}><span>{products.length-uncounted}/{products.length} contados · {countDifferences} divergências</span><button className="btn secondary" disabled={countBusy} onClick={()=>{setCountDraft(null);setCountBasis(null);setCountError('');}}>Cancelar</button><button className="btn primary" disabled={countBusy||uncounted>0} onClick={()=>void completePhysicalCount()}>{countBusy?'Registrando…':'Concluir e ajustar estoque'}</button></div>}<h3 style={{marginTop:22}}>Histórico de contagens</h3>
          {stockCounts.length?stockCounts.slice(0,12).map((entry)=><details key={entry.id} style={{padding:'10px 0',borderBottom:'1px solid #e5e9e4'}}><summary>{new Date(entry.completedAt).toLocaleString('pt-BR')} · {entry.by} · {(entry.items||[]).filter((x)=>Number(x.difference)!==0).length} divergências</summary><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Sistema</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>{(entry.items||[]).map((x)=><tr key={x.productId}><td>{x.name}</td><td>{qty(x.expected)}</td><td>{qty(x.counted)}</td><td>{qty(x.difference)}</td></tr>)}</tbody></table></div></details>):<p>Nenhuma contagem registrada.</p>}
          {/* COUNT HISTORY */}
        </section>}
        {view === 'duplicates' && currentUser?.role === 'admin' && <section className="panel duplicates-panel">
          <div className="panel-head"><div><h2>Auditoria automática do catálogo</h2><p>Executada sempre que o estoque é atualizado. O código é comparado sem zeros iniciais e a descrição é verificada separadamente.</p></div><span className="history-count">{duplicatePairs.length} par(es)</span></div>
          <p className="duplicate-guidance">⚠ Revise estes pares com o documento original. Quando forem o mesmo produto, escolha qual cadastro manter e clique em Consolidar. A operação soma os saldos, preserva os códigos e atualiza os vínculos das notas para manter possíveis estornos. Unidades diferentes exigem correção prévia.</p>
          {duplicatePairs.length ? <div className="duplicate-results">{duplicatePairs.map((match) => <div key={String(match.left.id) + ':' + String(match.right.id)} className="duplicate-pair">
            <div className="duplicate-pair-heading"><b className={match.confidence === 'alta' ? 'duplicate-high' : 'duplicate-review'}>{match.confidence === 'alta' ? 'Alta probabilidade' : 'Conferir manualmente'}</b><small>Descrição: {match.similarity}% semelhante</small></div>
            <div className="duplicate-comparison">
              {[match.left, match.right].map((p, i) => <div className="duplicate-product" key={p.id}><strong>{p.name}</strong><small>Código: {p.sku || 'Sem código'} · {qty(p.stock)} {p.unit}</small><small>Fornecedor(es): {(p.supplierCodes || []).map((alias) => alias.code + ' (' + alias.cnpj + ')').join(', ') || 'Não informado'}</small><button type="button" className="text-btn" onClick={() => openProduct(p)}>Editar {i === 0 ? 'primeiro' : 'segundo'} cadastro <Icon type="edit" size={14}/></button></div>)}
            </div>
            <p className="duplicate-reasons">{match.reasons.join(' · ')}</p>
            <div className="duplicate-merge-actions">
              <small>Se for o mesmo produto: saldo combinado {qty(Number(match.left.stock) + Number(match.right.stock))} {match.left.unit}.</small>
              <button className="btn primary" type="button" disabled={!match.sameUnit || !supabase || saveStatus !== 'Sincronizado'} onClick={() => openMergePair(match)}><Icon type="check" size={15}/>Consolidar cadastros</button>
            </div>
            {!match.sameUnit && <small className="duplicate-unit-warning">⚠ As unidades são diferentes. Edite e converta antes de consolidar.</small>}
          </div>)}</div>
          : <div className="empty-docs"><span className="empty-file"><Icon type="check" size={28}/></span><b>Nenhuma possível duplicata encontrada</b><p>A rotina seguirá conferindo o catálogo ao entrar ou lançar notas fiscais.</p></div>}
        </section>}
        {view === 'stock' && currentUser?.role === 'admin' && duplicatePairs.length > 0 && <section className="alert-strip" role="status"><span className="alert-icon"><Icon type="alert" size={18}/></span><div><b>{duplicatePairs.length} possível(is) duplicata(s) no catálogo</b><p>Compare códigos e descrições; confira antes de corrigir os cadastros.</p></div><button onClick={() => setView('duplicates')}>Revisar <Icon type="chevron" size={15}/></button></section>}
        {view === 'stock' && <>
          <section className="stats" style={{gridTemplateColumns: currentUser?.role === 'admin' ? undefined : 'repeat(3,minmax(0,1fr))'}}>
            <article className="stat"><div className="stat-top"><span>Produtos cadastrados</span><i className="stat-symbol green"><Icon type="box" size={19}/></i></div><strong className="stat-value">{products.length}</strong><div className="stat-foot"><span className="green-dot"/>Itens no catálogo</div></article>
            {currentUser?.role === 'admin' && <article className="stat"><div className="stat-top"><span>Valor em estoque</span><i className="stat-symbol beige"><Icon type="chart" size={19}/></i></div><strong className="stat-value money-value">{money(value)}</strong><div className="stat-foot subtle">Custo estimado dos itens disponíveis</div></article>}
            <article className="stat"><div className="stat-top"><span>Estoque baixo</span><i className="stat-symbol yellow"><Icon type="alert" size={19}/></i></div><strong className="stat-value">{low.length}</strong><div className="stat-foot">{low.length ? <span className="warn-text">Precisam de reposição</span> : <span className="green-text">Tudo em dia</span>}</div></article>
            <article className="stat"><div className="stat-top"><span>Quantidade total</span><i className="stat-symbol blue"><Icon type="arrows" size={19}/></i></div><strong className="stat-value">{qty(units)}</strong><div className="stat-foot subtle">Soma das quantidades cadastradas</div></article>
          </section>
          {low.length > 0 && <section className="alert-strip"><span className="alert-icon"><Icon type="alert" size={19}/></span><div><b>{low.length} {low.length === 1 ? 'produto precisa' : 'produtos precisam'} de reposição</b><p>{low.slice(0, 3).map((p) => p.name).join(', ')}{low.length > 3 ? ' e mais ' + (low.length - 3) : ''} estão no mínimo ou abaixo dele.</p></div><button onClick={() => setFilter('Estoque baixo')}>Ver produtos <Icon type="chevron" size={15}/></button></section>}
          <section className="panel"><div className="panel-head"><div><h2>Produtos</h2><p>Gerencie quantidades, custos e níveis mínimos.</p></div><button className="quiet-btn" onClick={() => {setQuery('');setCategory('Todas');setFilter('Todos');}}><Icon type="sliders" size={16}/>Limpar filtros</button></div>
            <div className="filters"><label className="search"><Icon type="search" size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto, código..."/></label><label className="select-filter"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select><Icon type="down" size={13}/></label><label className="select-filter"><span>Status</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>Todos</option><option>Estoque baixo</option><option>Estoque normal</option></select><Icon type="down" size={13}/></label></div>
            <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th>{currentUser?.role === 'admin' && <><th>CUSTO UNITÁRIO</th><th>VALOR EM ESTOQUE</th></>}<th>STATUS</th><th></th></tr></thead><tbody>{shownProducts.map((p) => <tr key={p.id}><td><div className="product-cell"><span className="product-box"><Icon type="box" size={18}/></span><span><b>{p.name}</b><small>{p.sku || 'Sem código'}</small></span></div></td><td><span className="category-chip">{p.category}</span></td><td><b className={isLow(p) ? 'quantity-low' : 'quantity-ok'}>{qty(p.stock)} <small>{p.unit}</small></b><div className="minimum">Mínimo: {qty(p.min)} {p.unit}</div></td>{currentUser?.role === 'admin' && <><td>{money(p.cost)}</td><td><b>{money(Number(p.stock) * Number(p.cost))}</b></td></>}<td><span className={isLow(p) ? 'status low-status' : 'status ok-status'}><i/>{isLow(p) ? 'Estoque baixo' : 'Normal'}</span></td><td><div className="row-actions"><button title="Ajustar estoque" onClick={() => openAdjustment(p)}><Icon type="arrows" size={16}/></button><button title="Editar produto" onClick={() => openProduct(p)} title={currentUser?.role === 'admin' ? 'Editar cadastro' : 'Alterar quantidade'}><Icon type="edit" size={16}/></button></div></td></tr>)}{!shownProducts.length && <tr><td colSpan={currentUser?.role === 'admin' ? 7 : 5}><div className="empty"><Icon type="search" size={25}/><b>Nenhum produto encontrado</b><span>Altere os filtros ou cadastre um novo item.</span></div></td></tr>}</tbody></table></div>
            <div className="table-foot"><span>Exibindo <b>{shownProducts.length}</b> de <b>{products.length}</b> produtos</span><span>{supabase ? "Banco de dados compartilhado" : "Dados salvos neste navegador"}</span></div>
          </section>
          <section className="lower-grid"><div className="panel lower-panel"><div className="panel-head"><div><h2>Estoque para revisar</h2><p>Itens no nível mínimo ou abaixo dele.</p></div><button className="text-btn" onClick={() => setFilter('Estoque baixo')}>Ver todos <Icon type="chevron" size={14}/></button></div>{low.length ? low.slice(0, 4).map((p) => <div className="low-row" key={p.id}><span className="low-symbol"><Icon type="alert" size={16}/></span><span className="low-name"><b>{p.name}</b><small>{qty(p.stock)} {p.unit} disponíveis</small></span><span className="low-min"><small>Mínimo</small><b>{qty(p.min)} {p.unit}</b></span><button className="add-small" title="Registrar entrada" onClick={() => openAdjustment(p)}><Icon type="plus" size={16}/></button></div>) : <div className="all-good"><Icon type="check" size={22}/><b>Nenhuma reposição pendente</b></div>}</div>
          <div className="panel lower-panel"><div className="panel-head"><div><h2>Últimas movimentações</h2><p>Entradas e saídas recentes.</p></div><button className="text-btn" onClick={() => setView('movements')}>Ver histórico <Icon type="chevron" size={14}/></button></div>{movements.slice(0, 4).map((m) => <div className="recent-row" key={m.id}><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span className="recent-name"><b>{m.product}</b><small>{m.reason}</small></span><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type === 'Saída' ? '−' : '+'}{qty(m.quantity)}</span></div>)}</div></section>
        </>}

        {view === 'purchases' && currentUser?.role === 'admin' && <section className="panel purchases-panel">
          <div className="panel-head"><div><h2>Lista de compras por categoria</h2><p>Compras sugeridas = mínimo − saldo. O preço médio é ponderado pelas quantidades de entradas fiscais anteriores.</p></div><span className="history-count">{purchaseList.length} itens</span></div>
          {purchaseList.length ? <>
            <div className="purchase-overview">
              <div><small>Estimativa total</small><strong>{money(purchaseData.total)}</strong><small>{purchaseData.missingPrices ? 'Parcial: ' + purchaseData.missingPrices + ' item(ns) sem referência de preço' : 'Todos os itens têm preço de referência'}</small></div>
              <div><small>Categorias com reposição</small><strong>{purchaseData.categories.length}</strong><small>Organizadas para facilitar a compra</small></div>
            </div>
            {purchaseData.categories.map((group) => <section className="purchase-category" key={group.name}>
              <div className="purchase-category-head"><h3>{group.name}</h3><span>{group.items.length} produto(s) · subtotal {money(group.subtotal)}{group.missingPrices ? ' (parcial)' : ''}</span></div>
              <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>FORNECEDOR HABITUAL</th><th>ATUAL / MÍNIMO</th><th>COMPRAR</th><th>MÉDIA PAGA</th><th>PREÇO BASE</th><th>TOTAL PREVISTO</th></tr></thead>
                <tbody>{group.items.map((p) => <tr key={p.id}>
                  <td><b>{p.name}</b><small className="purchase-detail">{p.sku || 'Sem código'}</small></td>
                  <td><span>{p.usualSupplier || 'A definir'}</span><small className="purchase-detail">{p.supplierSource === 'manual' ? 'Definido pelo Gestor' : p.supplierSource === 'histórico' ? 'Mais frequente no histórico' : 'Sem compras anteriores'}</small><button className="text-btn purchase-inline-edit" type="button" onClick={() => openProduct(p)}>Alterar fornecedor</button></td>
                  <td>{qty(p.stock)} / {qty(p.min)} {p.unit}</td>
                  <td><b className="quantity-low">{qty(p.buy)} {p.unit}</b></td>
                  <td>{p.averagePaid == null ? 'Sem histórico' : money(p.averagePaid)}</td>
                  <td>{p.unitEstimate == null ? 'Sem referência' : money(p.unitEstimate)}<small className="purchase-detail">{p.priceSource === 'histórico' ? 'Média das NFs' : p.priceSource === 'cadastro' ? 'Custo cadastrado' : 'Preço pendente'}</small></td>
                  <td><b>{p.estimate == null ? 'A cotar' : money(p.estimate)}</b></td>
                </tr>)}</tbody>
              </table></div>
            </section>)}
            <div className="purchase-grand-total"><span>Valor estimado da compra {purchaseData.missingPrices ? '(parcial)' : ''}</span><strong>{money(purchaseData.total)}</strong></div>
            {purchaseData.missingPrices > 0 && <p className="duplicate-guidance">⚠ {purchaseData.missingPrices} produto(s) sem preço de referência não entram na soma. Informe o custo no cadastro ou importe uma compra anterior para completar a previsão.</p>}
          </> : <div className="empty-docs"><span className="empty-file"><Icon type="check" size={28}/></span><b>Nenhuma reposição necessária</b><p>Todos os produtos estão no mínimo ou acima dele. Ajuste os mínimos no cadastro quando necessário.</p></div>}
        </section>}

        {view === 'suppliers' && currentUser?.role === 'admin' && <section className="panel suppliers-panel">
          <div className="panel-head"><div><h2>Compras realizadas por fornecedor</h2><p>Histórico das notas lançadas, organizado por fornecedor e CNPJ quando disponível.</p></div><span className="history-count">{supplierGroups.length} fornecedor(es)</span></div>
          <div className="filters supplier-filters"><label className="search"><Icon type="search" size={17}/><input value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} placeholder="Filtrar fornecedor ou CNPJ"/></label></div>
          {supplierGroups.filter((s) => norm(s.name + ' ' + s.cnpj).includes(norm(supplierFilter))).map((s) => <details className="supplier-summary" key={s.key}>
            <summary><span><b>{s.name}</b><small>{s.cnpj ? 'CNPJ ' + s.cnpj : 'Sem CNPJ identificado'} · {s.documents.length} nota(s) · {s.items} linha(s) de produtos</small></span><strong>{money(s.total)}</strong></summary>
            <div className="supplier-documents">{s.documents.map((d, i) => <div className="supplier-document" key={d.id || i}>
              <div className="supplier-document-head"><b>{d.invoiceNumber ? 'Nota nº ' + d.invoiceNumber : d.fileName || 'Documento fiscal'}</b><span>{d.date || d.importedAt || 'Sem data'} · {money(d.total ?? (d.items || []).reduce((sum,item)=>sum + Number(item.lineTotal || item.unitPrice*item.quantity || 0),0))}</span></div>
              <ul>{(d.items || []).map((it,j) => <li key={j}><span>{it.name} <small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><b>{money(it.lineTotal ?? Number(it.quantity)*Number(it.unitPrice))}</b></li>)}</ul>
            </div>)}</div>
          </details>)}
          {!supplierGroups.length && <div className="empty-docs">Ainda não há compras registradas. Os fornecedores aparecerão após lançar notas fiscais.</div>}
          {supplierGroups.length > 0 && !supplierGroups.some((s)=>norm(s.name+' '+s.cnpj).includes(norm(supplierFilter))) && <div className="empty-docs">Nenhum fornecedor encontrado para esta busca.</div>}
        </section>}

        {view === 'documents' && <>
          <section className="panel pending-documents-panel">
            <div className="panel-head"><div><h2>Notas aguardando conferência</h2><p>Originais e OCR salvos no servidor. Você pode fechar a página e retomar depois.</p></div><span className="history-count">{pendingReceipts.length} pendente(s)</span></div>
            {pendingSaveError&&<div className="notice" role="alert">⚠ {pendingSaveError}</div>}
            {pendingBusy&&<small>Salvando conferência no servidor…</small>}
            {pendingReceipts.length?pendingReceipts.map(row=><div className="history-row" key={row.id}>
              <span className="history-file"><Icon type="file" size={18}/></span>
              <span className="history-copy"><b>{row.draft?.supplier||row.fileName}</b><small>{row.fileName} · {row.draft?.items?.length||0} itens · {row.draft?.invoiceNumber||'Sem número'} · pendente</small></span>
              <button className="btn secondary" type="button" onClick={()=>void viewPendingOriginal(row)}>Arquivo</button>
              <button className="btn primary" type="button" onClick={()=>void openPendingReceipt(row)}>Conferir</button>
            </div>):<div className="empty-docs">Nenhuma nota aguardando conferência.</div>}
          </section>
          <section className="document-banner"><span className="banner-art"><Icon type="file" size={28}/></span><div className="banner-copy"><h2>Da nota fiscal para o estoque</h2><p>Selecione um ou vários arquivos XML, fotos ou PDFs de uma vez. O sistema processa cada arquivo e organiza as notas em sequência para revisão antes de lançar. PDFs ainda exigem preenchimento manual.</p><div className="feature-tags"><span><Icon type="check" size={14}/>XML de NF-e</span><span><Icon type="image" size={14}/>Foto ou PDF</span><span><Icon type="check" size={14}/>Conferência antes de lançar</span></div></div><div className="manual-top-actions"><button className="btn secondary" type="button" disabled={busy} onClick={openManualEntry}><Icon type="plus" size={17}/>Entrada manual</button><button className="btn secondary" type="button" disabled={busy || manualMode || Boolean(draft)} onClick={startManualInvoice}><Icon type="file" size={17}/>Cadastrar nota manualmente</button><button className="btn primary" disabled={busy || manualMode} onClick={() => uploadRef.current?.click()}><Icon type="upload" size={17}/>Selecionar arquivos</button></div></section>
          <label style={{display:'flex',alignItems:'center',gap:9,margin:'12px 4px',fontSize:13,cursor:'pointer',flexWrap:'wrap'}}>
            <input type="checkbox" checked={enableExternalQr} onChange={(e) => setEnableExternalQr(e.target.checked)} disabled={busy}/>
            <span><b>Usar API externa para tentar ler QR Codes difíceis</b> — somente se a leitura local falhar. Envia um recorte da parte inferior do cupom ao serviço de terceiros baseado em <a href="https://github.com/pcelias-ctrl/nfc-e" target="_blank" rel="noopener noreferrer">pcelias-ctrl/nfc-e</a>; não envia o documento inteiro nem altera produtos sem conferência.</span>
          </label>
          {busy && uploadBatchProgress && <div className="notice" role="status">Processando arquivo {uploadBatchProgress.current} de {uploadBatchProgress.total}: <b>{uploadBatchProgress.fileName}</b>. A conferência começa após terminar todos os arquivos.</div>}
          {busy && <div className="notice">{processingType === "xml" ? "Lendo o XML da NF-e e identificando os itens…" : "Reconhecendo texto da imagem" + (ocrProgress ? " — " + ocrProgress + "%" : " — preparando o mecanismo OCR") + "…"}</div>}
          {error && <div className="error"><Icon type="alert" size={18}/><span>{error}</span><button onClick={() => setError('')}><Icon type="close" size={16}/></button></div>}
          {draft?.importWarning && <div className="notice" role="alert">Não foi possível interpretar automaticamente este arquivo: {draft.importWarning}. Confira os campos e preencha os itens manualmente.</div>}
          {manualMode && <section className="panel manual-entry-panel">
            <div className="panel-head"><div><h2>Entrada manual no estoque</h2><p>Pesquise o catálogo primeiro. Cadastre um produto somente se ele realmente não existir.</p></div><button className="close-btn" type="button" onClick={()=>{setManualMode(false);setError('');}}><Icon type="close"/></button></div>
            <form onSubmit={saveManualEntry}>
              <label className="field full"><span>Buscar produto existente por nome ou código</span><input value={manualSearch} autoFocus onChange={(e)=>{setManualSearch(e.target.value);setManualChosenId('');setManualNew(false);setError('');}} placeholder="Ex.: Café em grãos, leite, 00123..."/></label>
              <div className="manual-catalog-results" role="listbox" aria-label="Produtos do catálogo">
                {manualMatches.map((p)=><button type="button" role="option" aria-selected={manualChosenId===p.id&&!manualNew} className={'manual-catalog-option'+(manualChosenId===p.id&&!manualNew?' chosen':'')} key={p.id} onClick={()=>{setManualChosenId(p.id);setManualNew(false);setManualForm((f)=>({...f,cost:String(p.cost??0)}));setError('');}}>
                  <span><b>{p.name}</b><small>Código: {p.sku || 'sem código'} · {p.category || 'Outros'} · saldo {qty(p.stock)} {p.unit}</small></span><strong>{manualChosenId===p.id&&!manualNew?'✓ Selecionado':'Selecionar'}</strong>
                </button>)}
                {!manualMatches.length&&<p className="manual-empty-results">Nenhum produto encontrado. Confira o nome ou código antes de criar outro.</p>}
                {products.length>30&&!manualSearch&&<small>Exibindo 30 produtos. Digite um nome ou código para pesquisar todos os cadastros.</small>}
              </div>
              {currentUser?.role==='admin'&&<button className="btn secondary manual-new-toggle" type="button" onClick={()=>{setManualNew((v)=>!v);setManualChosenId('');setError('');}}>{manualNew?'← Voltar para o catálogo':'Não encontrei — cadastrar um novo produto'}</button>}
              {manualNew&&currentUser?.role==='admin'&&<div className="manual-new-fields">
                <h3>Dados do novo produto</h3>
                <div className="form-grid">
                  <label className="field"><span>Descrição *</span><input required value={manualForm.name} onChange={(e)=>setManualForm({...manualForm,name:e.target.value})}/></label>
                  <label className="field"><span>Código / SKU</span><input value={manualForm.sku} onChange={(e)=>setManualForm({...manualForm,sku:e.target.value})}/></label>
                  <label className="field"><span>Categoria</span><select value={manualForm.category} onChange={(e)=>setManualForm({...manualForm,category:e.target.value})}>{['Mercearia','Cafés','Laticínios','Confeitaria','Embalagens','Bebidas','Limpeza','Outros'].map((v)=><option key={v}>{v}</option>)}</select></label>
                  <label className="field"><span>Unidade</span><select value={manualForm.unit} onChange={(e)=>setManualForm({...manualForm,unit:e.target.value})}>{['un','kg','g','L','ml','cx','pct','fardo'].map((v)=><option key={v}>{v}</option>)}</select></label>
                  <label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="any" value={manualForm.min} onChange={(e)=>setManualForm({...manualForm,min:e.target.value})}/></label>
                  <label className="field"><span>Fornecedor habitual</span><input value={manualForm.preferredSupplier} onChange={(e)=>setManualForm({...manualForm,preferredSupplier:e.target.value})} placeholder="Opcional"/></label>
                </div>
                {!!manualDuplicateSuggestions.length&&<div className="duplicate-inline" role="alert"><b>⚠ Cadastro possivelmente existente</b><p>{manualDuplicateSuggestions.slice(0,3).map((item)=>item.left.name+' ('+item.left.sku+')').join(' · ')}. Volte à lista e selecione o produto original.</p></div>}
              </div>}
              {(manualChosen||manualNew)&&<div className="manual-stock-fields">
                <h3>{manualNew?'Quantidade e custo inicial':'Adicionar ao produto: '+manualChosen.name}</h3>
                <div className="form-grid">
                  <label className="field"><span>Quantidade a entrar * {manualChosen?'('+manualChosen.unit+')':''}</span><input required type="number" min="0.001" step="0.001" value={manualForm.quantity} onChange={(e)=>setManualForm({...manualForm,quantity:e.target.value})}/></label>
                  <label className="field"><span>Custo unitário (R$) *</span><input required type="number" min="0" step="0.01" value={manualForm.cost} onChange={(e)=>setManualForm({...manualForm,cost:e.target.value})}/></label>
                  <label className="field"><span>Fornecedor da compra</span><input value={manualForm.supplier} onChange={(e)=>setManualForm({...manualForm,supplier:e.target.value})} placeholder="Opcional"/></label>
                  <label className="field"><span>Motivo</span><input value={manualForm.reason} onChange={(e)=>setManualForm({...manualForm,reason:e.target.value})}/></label>
                </div>
                <p className="manual-total">Total estimado: <b>{money((Number(manualForm.quantity)||0)*(Number(manualForm.cost)||0))}</b></p>
              </div>}
              <div className="modal-actions"><button className="btn secondary" type="button" onClick={()=>{setManualMode(false);setError('');}}>Cancelar</button><button className="btn primary" type="submit" disabled={!manualNew&&!manualChosen}><Icon type="check" size={16}/>{manualNew?'Criar produto e lançar entrada':'Registrar entrada no produto selecionado'}</button></div>
            </form>
          </section>}
          {draft?.manualInvoice && <section className="panel manual-invoice-helper">
            <div className="panel-head"><div><h2>Nota de compra digitada manualmente</h2><p>Informe os dados do documento e adicione quantos produtos precisar, vinculando cada linha ao catálogo existente.</p></div></div>
            <p className="duplicate-guidance">Esta nota será identificada como digitada manualmente e não verificada pela SEFAZ. Confira os valores com o documento original antes de registrar a entrada.</p>
            <button type="button" className="btn secondary" onClick={()=>setView('stock')}>Buscar ou cadastrar produto na tela de Estoque</button>
          </section>}
          {draft && <section className="panel review-panel"><div className="panel-head"><div><div className="eyebrow">CONFERÊNCIA DO DOCUMENTO</div><h2>Confira os dados antes de lançar</h2><p>{draft.fileName} · {draft.source === 'XML de NF-e' ? 'Itens extraídos do XML' : 'Preencha os dados identificados no documento'}</p></div><button className="close-btn" onClick={() => {if (draftQueue.length && !window.confirm('Descartar esta nota e os ' + draftQueue.length + ' documentos aguardando revisão?')) return;setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');if (uploadRef.current) uploadRef.current.value = '';}}><Icon type="close"/></button></div>
            <div className="meta-fields"><label><span>Fornecedor</span><input value={draft.supplier} onChange={(e) => changeDraft('supplier', e.target.value)} placeholder="Nome do fornecedor"/></label>{draft.manualInvoice && <label><span>CNPJ do fornecedor (opcional)</span><input value={draft.supplierCnpj||''} onChange={(e)=>changeDraft('supplierCnpj',e.target.value.replace(/\D/g,'').slice(0,14))} placeholder="14 dígitos"/></label>}<label><span>Número do documento</span><input value={draft.invoiceNumber} onChange={(e) => changeDraft('invoiceNumber', e.target.value)} placeholder="Ex.: 000123"/></label><label><span>Data de emissão</span><input value={draft.date} onChange={(e) => changeDraft('date', e.target.value)} placeholder="Data, se disponível"/></label></div>
            {draftBatch && <div className="notice" style={{marginTop:14}}>Cupom {draftBatch.current} de {draftBatch.total}. Confirme esta entrada para revisar o próximo documento da seleção.</div>}
            {draft.ocrText && <label className="field full"><span>Corrigir chave da NFC-e</span><input value={draft.accessKeyInput ?? draft.accessKey ?? ''} onChange={(e) => changeNfceAccessKey(e.target.value)} placeholder="44 dígitos da chave de acesso"/></label>}
            {draft.qrReaderWarning && <div className="notice" role="status" style={{marginTop:12}}>Leitura QR complementar: {draft.qrReaderWarning} O OCR continua disponível para revisão manual.</div>}
            {draft.qrReader && <div style={{marginTop:6,fontSize:12,color:'var(--muted)'}}>QR obtido por: {draft.qrReader}.</div>}
            {draft.keyWarning && !draft.accessKey && <div className="notice" style={{marginTop:12}} role="alert"><b>Chave de NFC-e não validada.</b> {draft.keyWarning}</div>}
            {(draft.accessKey || draft.consultaUrl) && <div className="notice" style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><span><b>{draft.qrDetected ? 'QR Code identificado' : 'Chave de acesso identificada pelo OCR'}</b>{draft.accessKey ? <span style={{display:'block',marginTop:5,overflowWrap:'anywhere',fontFamily:'monospace'}}>{draft.accessKey}</span> : 'O QR Code contém um endereço de consulta.'}</span>{draft.consultaUrl && <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{draft.accessKey && <button type="button" className="btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(draft.accessKey); setToast('Chave de acesso copiada.'); } catch (_) { setToast('Selecione e copie a chave exibida para colá-la na consulta pública.'); } }}>Copiar chave</button>}<a href={draft.consultaUrl} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{textDecoration:'none'}}>{draft.qrUrlPreserved ? 'Abrir consulta do QR Code ↗' : 'Abrir consulta pública ↗'}</a></div>}</div>}
            {draft.consultaUrl && <section className="panel" style={{marginTop:14,background:'#fbfcf9'}}>
              <div className="panel-head"><div><h2>Conferência automática com a SEFAZ/SVRS</h2><p>O sistema tenta abrir a página oficial no servidor e comparar os itens automaticamente com o OCR. Os dados não são substituídos sem sua revisão.</p></div></div>
              <div className="notice" role="status" style={{marginTop:10}}>{draft.officialStatus || 'Aguardando consulta automática…'}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
                <button type="button" className="btn primary" onClick={() => void consultOfficialAutomatically(draft.consultaUrl, draft.accessKey)}>Consultar e comparar novamente</button>
                <a href={draft.consultaUrl} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{textDecoration:'none'}}>Abrir consulta oficial ↗</a>
                {draft.officialItems?.length > 0 && <button type="button" className="btn secondary" onClick={applyOfficialItems}>Usar itens da consulta pública</button>}
              </div>
              {draft.officialItems?.length > 0 && <><div className="notice" style={{marginTop:12}}>Itens encontrados na consulta: {draft.officialItems.length}. Revise as diferenças antes de usar os dados oficiais.{draft.officialTotal !== null && draft.officialTotal !== undefined ? <span style={{display:'block',marginTop:6}}>Total na consulta: <b>{money(draft.officialTotal)}</b>{draft.officialDiscount !== null && draft.officialDiscount !== undefined ? ' · Desconto: ' + money(draft.officialDiscount) : ''}</span> : null}</div><div className="table-wrap review-table" style={{marginTop:10}}><table><thead><tr><th>ITEM NO OCR</th><th>VALOR OCR</th><th>ITEM NA CONSULTA</th><th>VALOR OFICIAL</th><th>RESULTADO</th></tr></thead><tbody>{officialComparison.map((row, index) => <tr key={index}><td>{row.ocr ? <><b>{row.ocr.name}</b><small style={{display:'block'}}>{qty(row.ocr.quantity)} {row.ocr.unit} × {money(row.ocr.unitPrice)}</small></> : '—'}</td><td>{row.ocr ? money(receiptItemTotal(row.ocr)) : '—'}</td><td>{row.official ? <><b>{row.official.name}</b><small style={{display:'block'}}>{qty(row.official.quantity)} {row.official.unit} × {money(row.official.unitPrice)}</small></> : '—'}</td><td>{row.official ? money(receiptItemTotal(row.official)) : '—'}</td><td><span className={row.status === 'Confere' ? 'status ok-status' : 'status low-status'}><i/>{row.status}</span></td></tr>)}</tbody></table></div></>}
            </section>}
            {draft.ocrText && <details className="ocr-text-details"><summary>Texto reconhecido na foto (conferência)</summary><pre>{draft.ocrText}</pre></details>}

            <div className="notice" style={{marginTop:12,background:'#fffbeb',borderLeft:'4px solid #c58a24'}}>
              <b>Conferência do encarregado</b> — campos em amarelo precisam ser confrontados com a nota antes do lançamento.
              {officialMissing > 0 && <span style={{display:'block',marginTop:6,color:'#9a3412'}}>A consulta contém {officialMissing} produto(s) ainda ausente(s) na tabela. Use os itens oficiais ou inclua-os manualmente.</span>}
            </div>
            <div className="table-wrap review-table">
              <table>
                <thead><tr><th>PRODUTO</th><th>QUANTIDADE</th><th>UNIDADE</th><th>CUSTO UNITÁRIO (R$)</th><th>TOTAL DA LINHA (R$)</th><th>PRODUTO NO ESTOQUE</th><th>CONFERÊNCIA</th><th></th></tr></thead>
                <tbody>{draft.items.map((it, i) => {
                  const review = receiptReviewRows[i];
                  const attention = review.requiresReview && !review.done;
                  const fieldStyle = (keyword) => ({
                    borderColor: attention && review.issues.some((issue) => issue.toLowerCase().includes(keyword)) ? '#c58a24' : undefined,
                    background: attention ? '#fffbeb' : undefined
                  });
                  return <tr key={i} style={{background: attention ? '#fffbeb' : undefined, borderLeft: attention ? '3px solid #c58a24' : undefined}}>
                    <td>{draft.manualInvoice ? <div className="manual-invoice-product">
                      <input className="inline-input name-field" aria-label={'Buscar produto da linha '+(i+1)} value={it.search ?? ''} placeholder="Buscar produto por nome ou código"
                        onChange={(e)=>changeItem(i,'search',e.target.value)}/>
                      <select className="inline-input" aria-label={'Selecionar produto da linha '+(i+1)} value={it.productId||''}
                        onChange={(e)=>selectManualInvoiceProduct(i,e.target.value)}>
                        <option value="">Selecione um produto existente</option>
                        {products.filter((p)=>[p.name,p.sku].some((v)=>norm(v).includes(norm(it.search||''))) || p.id===it.productId).slice(0,100).map((p)=><option key={p.id} value={p.id}>{p.name} — {p.sku||'sem código'} ({p.unit})</option>)}
                      </select>
                      {!!it.productId&&<small>Selecionado: {it.name} · código {it.code||'—'}</small>}
                      {!it.productId&&<small>Não encontrou? Cadastre o produto na tela Estoque, sem duplicar o catálogo.</small>}
                    </div> : <><input className="inline-input name-field" style={fieldStyle('produto')} value={it.name} onChange={(e) => changeItem(i, 'name', e.target.value)} placeholder="Nome do produto"/>{it.code && <small className="fiscal-code-note">Código fiscal: {it.code} (normalizado: {normalizeProductCode(it.code)})</small>}</>}</td>
                    <td><input className="inline-input small-field" style={fieldStyle('quantidade')} type="number" min="0.001" step="any" value={it.quantity} onChange={(e) => changeItem(i, 'quantity', e.target.value)}/></td>
                    <td><input className="inline-input unit-field" style={fieldStyle('unidade')} value={it.unit} readOnly={Boolean(draft.manualInvoice)} onChange={(e) => changeItem(i, 'unit', e.target.value)}/></td>
                    <td><input className="inline-input small-field" style={fieldStyle('preço')} type="number" min="0" step="any" value={it.unitPrice} onChange={(e) => changeItem(i, 'unitPrice', e.target.value)}/></td>
                    <td><input className="inline-input small-field" style={fieldStyle('total')} type="number" min="0" step="0.01" aria-label={'Total da linha: ' + it.name} value={receiptItemTotal(it)} onChange={(e) => changeItem(i, 'lineTotal', e.target.value)}/>{Number(it.itemDiscount || 0) > 0 && <small style={{display:'block',fontSize:11}}>Desconto da linha: {money(it.itemDiscount)}</small>}</td>
                    <td style={{minWidth:225}}>
                      <label style={{display:'block',fontSize:11,marginBottom:6}}>
                        Classificação fiscal
                        <select className="inline-input" style={{width:'100%',marginTop:3}}
                          value={it.stockDisposition || (isNonStockExpense(it) ? 'expense' : 'stock')}
                          onChange={(e) => changeItem(i,'stockDisposition',e.target.value)}>
                          <option value="stock">Mercadoria — movimentar estoque</option>
                          <option value="expense">Despesa/serviço — não movimentar</option>
                        </select>
                      </label>
                      {!draft.manualInvoice && <select className="inline-input" style={{width:'100%',background: attention && !products.some((p) => p.id === it.productId) ? '#fffbeb' : undefined}}
                        aria-label={'Associar ' + it.name + ' ao estoque'}
                        value={it.productId || ''}
                        onChange={(e) => changeItem(i,'productId',e.target.value)}>
                        <option value="">Automático por nome/código (ou novo cadastro)</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} — código {p.sku} ({p.unit})</option>)}
                        <option value="__new__">⚠ Criar cadastro distinto — conferi que não é duplicado</option>
                      </select>}
                      {currentHistoryMatches[i] && <div className="receipt-history-match" role="status">
                        <b>Compra anterior do mesmo fornecedor</b>
                        <span>{currentHistoryMatches[i].historicalName} · {currentHistoryMatches[i].invoiceNumber ? 'NF nº ' + currentHistoryMatches[i].invoiceNumber : 'sem nº'} · descrição {currentHistoryMatches[i].similarity}% semelhante.</span>
                        {currentHistoryMatches[i].productId && !it.productId && <button className="text-btn" type="button" onClick={() => changeItem(i,'productId',currentHistoryMatches[i].productId)}>Vincular ao produto anterior</button>}
                        {!currentHistoryMatches[i].confident && <small>⚠ Confira a descrição, o código e a unidade antes de lançar.</small>}
                      </div>}
                      {(() => {
                        const target = products.find((p) => p.id === it.productId);
                        return target && normalizeReceiptUnit(target.unit) !== normalizeReceiptUnit(it.unit)
                          ? <label style={{display:'block',marginTop:6,fontSize:12,color:'#92400e'}}>
                            ⚠ Quantidade real no estoque ({target.unit}) *
                            <input className="inline-input small-field" type="number" min="0.001" step="any"
                              value={it.stockQuantity || ''} onChange={(e) => changeItem(i,'stockQuantity',e.target.value)}
                              placeholder={'Quantidade em ' + target.unit}/>
                            </label>
                          : null;
                      })()}
                    </td>
                    <td style={{minWidth:195}}>
                      {review.requiresReview ? <>
                        <label style={{display:'flex',gap:6,alignItems:'center',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                          <input type="checkbox" checked={Boolean(draft.reviewedItems?.[i])}
                            onChange={(e) => setDraft((d) => ({ ...d, finalReviewed:false, reviewedItems: { ...(d.reviewedItems || {}), [i]: e.target.checked } }))}/>
                          Conferido pelo encarregado
                        </label>
                        {!review.done && <small style={{display:'block',marginTop:6,color:'#92400e'}}>{review.issues.join(' ')}</small>}
                      </> : <span style={{fontSize:12,color:'#386549'}}>✓ Dados consistentes</span>}
                    </td>
                    <td><button className="delete-line" title="Remover item" onClick={() => setDraft((d) => ({
                      ...d, items: d.items.filter((_, j) => j !== i), reviewedItems: {},
                      totalsReviewed: false, finalReviewed: false, officialVerified: false
                    }))}><Icon type="close" size={15}/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="meta-fields" style={{marginTop:16}}>
              <label><span>Subtotal fiscal (R$) {totalsRequireReview ? '⚠ Conferir' : ''}</span><input style={{background: totalsRequireReview && !draft.totalsReviewed ? '#fffbeb' : undefined}} type="number" min="0" step="0.01" value={draftSubtotal} onChange={(e) => changeInvoiceAmount('subtotal', e.target.value)}/></label>
              <label><span>Desconto total (R$) {totalsRequireReview ? '⚠ Conferir' : ''}</span><input style={{background: totalsRequireReview && !draft.totalsReviewed ? '#fffbeb' : undefined}} type="number" min="0" step="0.01" value={draftDiscount} onChange={(e) => changeInvoiceAmount('discount', e.target.value)}/></label>
              <label><span>Acréscimos / frete (R$)</span><input type="number" min="0" step="0.01" value={draftExtras} onChange={(e) => changeInvoiceAmount('additionalCharges', e.target.value)}/></label>
              <label><span>Total final líquido (R$) — automático</span><input aria-label="Total líquido calculado automaticamente" type="number" readOnly value={draftTotal.toFixed(2)} style={{background:'#edf8ec',fontWeight:700}}/><small style={{display:'block',fontSize:11,marginTop:5}}>Subtotal − descontos + acréscimos. Confira com o total impresso na nota.</small></label>
            </div>
            {draft.totalsWarning && <div className="notice" style={{marginTop:10}}>{draft.totalsWarning}</div>}
            {discountUnattributed && <div className="notice" style={{marginTop:10}}>
              Há {money(Math.max(0,draftDiscount - draftIdentifiedItemDiscounts))} de desconto sem identificação de item.
              Esse valor será distribuído proporcionalmente no custo de estoque; confirme o rateio com o encarregado.
            </div>}
            {totalsItemsMismatch && <div className="notice" style={{marginTop:10}}>A soma das linhas ({money(draftItemsSubtotal)}) é diferente do subtotal informado ({money(draftSubtotal)}). Verifique itens ou descontos nas linhas.</div>}
            {totalsFinalMismatch && <div className="notice" style={{marginTop:10}}>{draftTotal < 0 ? 'O desconto não pode ultrapassar o subtotal acrescido dos encargos.' : 'O total líquido calculado ('+money(draftTotal)+') difere do valor extraído do documento ('+money(reportedFiscalTotal)+'). Confira subtotal, desconto e acréscimos antes de confirmar.'}</div>}
            {officialTotalsMismatch && <div className="notice" style={{marginTop:10}}>Totais distintos da consulta à SEFAZ. Total oficial: {money(draft.officialTotal)}. Confira antes do lançamento.</div>}
            {totalsRequireReview && <div className="notice" style={{marginTop:12,background:'#fffbeb',borderLeft:'4px solid #c58a24'}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                <input type="checkbox" checked={Boolean(draft.totalsReviewed)}
                  onChange={(e) => setDraft((d) => ({ ...d, totalsReviewed:e.target.checked, finalReviewed:false }))}/>
                <b>Conferi o subtotal, descontos, acréscimos e total final com a nota.</b>
              </label>
              <small style={{display:'block',marginTop:8}}>Ao marcar a conferência, você confirma os valores exibidos. Não é necessário informar um motivo.</small>
            </div>}
            <div className="review-bottom"><button className="btn secondary" onClick={() => setDraft((d) => ({ ...d, reviewedItems:{}, totalsReviewed:false, finalReviewed:false, officialVerified:false, items: [...d.items, { name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0, lineTotal: 0, search:'' }] }))}><Icon type="plus" size={16}/>Adicionar item</button><div className="review-sum"><span>Total da nota</span><b>{money(draftTotal)}</b></div></div>
            <section className={'review-final-confirmation' + (readyForFinalReview ? ' is-ready' : ' is-pending')}>
              <div className="review-final-heading"><Icon type={readyForFinalReview ? 'check' : 'alert'} size={19}/><div><b>Conferência final</b><p>{readyForFinalReview ? 'Itens e totais conferidos. Identifique quem realizou a verificação.' : 'Conclua a revisão dos itens e valores destacados para habilitar a confirmação final.'}</p></div></div>
              <div className="review-final-fields">
                <label className="review-final-checkbox"><input type="checkbox" disabled={!readyForFinalReview} checked={Boolean(draft.finalReviewed && readyForFinalReview)} onChange={(e) => setDraft((d) => ({ ...d, finalReviewed:e.target.checked }))}/><span>Conferi todo o documento e autorizo a entrada no estoque.</span></label>
                <label className="field review-final-person"><span>Quem conferiu todos os itens *</span><input required value={draft.checkedBy || ''} disabled={!readyForFinalReview} onChange={(e) => changeDraft('checkedBy', e.target.value)} placeholder="Nome do responsável pela conferência"/></label>
              </div>
            </section>
            <div className="caution"><Icon type="alert" size={18}/><p><b>Confira antes de continuar.</b> Ao confirmar, as quantidades serão somadas ao saldo atual. Produtos com nome igual serão associados ao cadastro existente.</p></div>
            <div className="modal-actions"><button className="btn secondary" onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');}}>Cancelar</button><button className="btn primary" onClick={confirmDocument}><Icon type="check" size={17}/>Confirmar entrada no estoque</button></div>
          </section>}
          <section className="panel history-panel"><div className="panel-head"><div><h2>Histórico de documentos</h2><p>Compras conferidas e lançadas no estoque.</p></div><span className="history-count">{documents.length} documentos</span></div>{documents.length ? documents.map((d) => <div className="history-row" key={d.id}><span className="history-file"><Icon type="file" size={19}/></span><span className="history-copy"><b>{d.supplier || d.fileName || 'Documento importado'}</b><small>{d.fileName} · {d.items.length} itens{d.invoiceNumber ? ' · Nº ' + d.invoiceNumber : ''}{d.total !== undefined && d.total !== null ? ' · Total ' + money(d.total) : ''}{Number(d.discount || 0) > 0 ? ' · Desconto ' + money(d.discount) : ''}{d.officialVerified ? ' · Conferido com consulta pública' : ''}{d.checkedBy ? ' · Conferido por ' + d.checkedBy : ''}</small></span><span className="history-date">{d.importedAt || d.date || 'Data não informada'}</span><span className="status ok-status"><i/>{d.status}</span>{currentUser?.role === 'admin' && <button type="button" className="btn secondary" style={{padding:'7px 11px',fontSize:12,color:'#a33'}} title="Excluir nota fiscal e estornar sua entrada de estoque" disabled={Boolean(deletingDocId) || saveStatus !== 'Sincronizado'} onClick={() => void deleteDocument(d)}>{deletingDocId === d.id ? 'Excluindo…' : 'Excluir NF'}</button>}<button className="row-chevron" title="Ver detalhes" onClick={() => {setDeleteError('');setDetailDoc(d);}}><Icon type="chevron" size={17}/></button></div>) : <div className="empty-docs"><span className="empty-file"><Icon type="file" size={28}/></span><b>Nenhum documento importado</b><p>Envie o XML de uma NF-e ou selecione uma foto/PDF e cadastre os itens manualmente.</p></div>}</section>
          <div className="privacy-note"><Icon type="check" size={16}/><span>Privacidade: o OCR é executado no navegador e o documento original não é salvo no histórico. Ao ativar a opção de QR externo, um recorte da imagem é enviado ao servidor do Estoque+ e ao serviço de leitura de terceiros. Sem essa opção, a leitura permanece local.</span></div>
        </>}

        {view === 'cash' && <>
          <section className="panel cash-summary">
            <div className="panel-head"><div><h2>Faturamento do mês</h2><p>O total de vendas exclui sangrias e suprimentos. As modalidades seguem o relatório de caixa enviado.</p></div>
              <label className="field"><span>Mês de referência</span><input type="month" value={cashMonth} onChange={e=>setCashMonth(e.target.value)}/></label>
            </div>
            <div className="cash-stats">
              <div><small>Faturamento mensal</small><strong>{money(cashMonthly.revenue)}</strong></div>
              <div><small>Fechamentos</small><strong>{cashMonthly.count}</strong></div>
              <div><small>Média por fechamento</small><strong>{money(cashMonthly.count?cashMonthly.revenue/cashMonthly.count:0)}</strong></div>
            </div>
            <h3>Faturamento diário — {cashMonth}</h3>
            <div className="cash-chart" aria-label="Gráfico de faturamento por dia">
              {cashMonthly.daily.length ? cashMonthly.daily.map(p=><div className="cash-bar-column" key={p.day}>
                <span>{money(p.revenue)}</span><div className="cash-bar-track"><div className="cash-bar-fill" style={{height:(Math.max(3,p.revenue/Math.max(...cashMonthly.daily.map(d=>d.revenue),1)*100))+'%'}}/></div>
                <small>{p.day.slice(-2)}</small>
              </div>) : <p>Sem fechamento neste mês. Registre um caixa abaixo para começar o gráfico.</p>}
            </div>
          </section>
          {!cashEntryMode && <section className="panel cash-entry cash-entry-collapsed">
            <button className="btn primary" type="button" onClick={()=>setCashEntryMode('choose')}><Icon type="plus" size={17}/> Registrar novo fechamento</button>
            {cashError&&<div className="error" role="alert">{cashError}</div>}
          </section>}
          {cashEntryMode === 'choose' && <section className="panel cash-entry cash-choice-panel">
            <div className="panel-head"><div><h2>Registrar novo fechamento</h2><p>Como deseja preencher os dados?</p></div><button className="btn secondary" type="button" onClick={()=>setCashEntryMode('')}>Cancelar</button></div>
            <div className="cash-choice-options">
              <button className="cash-choice-option" type="button" onClick={()=>cashFileRef.current?.click()}><Icon type="upload" size={23}/><b>Enviar PDF ou foto</b><span>Preencher faturamento e movimentações a partir do comprovante.</span></button>
              <button className="cash-choice-option" type="button" onClick={()=>newCashClosing('manual')}><Icon type="edit" size={23}/><b>Inserir manualmente</b><span>Digitar os valores e as sangrias e suprimentos.</span></button>
            </div>
            <input ref={cashFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" hidden onChange={e=>void importCashReport(e)}/>
          </section>}
          {(cashEntryMode === 'upload' || cashEntryMode === 'manual' || cashEntryMode === 'edit') && <section className="panel cash-entry">
            <div className="panel-head"><div><h2>{cashEntryMode==='edit'?'Corrigir fechamento':'Conferir novo fechamento'}</h2><p>Revise o faturamento e as movimentações antes de salvar.</p></div><button type="button" className="btn secondary" onClick={()=>{setCashEntryMode('');setCashError('');}}>Fechar formulário</button></div>
            {cashError&&<div className="error" role="alert">{cashError}</div>}
            <div className="cash-file-import">
              <div><b>Preencher automaticamente pelo fechamento</b><p>Envie o PDF gerado pelo sistema ou uma foto do cupom térmico. O OCR identifica faturamento, caixa e movimentações; revise tudo antes de registrar.</p></div>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" hidden onChange={e=>void importCashReport(e)} ref={cashEntryMode==='choose'?undefined:cashFileRef}/>
              <button className="btn secondary" type="button" disabled={cashImporting||cashSaving} onClick={()=>cashFileRef.current?.click()}>{cashImporting?'Lendo arquivo…':'Enviar PDF ou foto'}</button>
            </div>
            {!!cashForm.sourceFileName&&<div className="cash-import-review">
              <b>Arquivo importado: {cashForm.sourceFileName}</b>
              {cashImportWarnings.map((w,i)=><p key={i}>⚠ {w}</p>)}
              <p>Valores extraídos automaticamente. Confirme no comprovante, especialmente sangrias e suprimentos.</p>
              <label><input type="checkbox" checked={Boolean(cashForm.reviewedImport)} onChange={e=>changeCashField('reviewedImport',e.target.checked)}/> Conferi faturamento, caixa, data e movimentações com o arquivo.</label>
              {cashImportText&&<details><summary>Visualizar texto extraído</summary><pre>{cashImportText.slice(0,20000)}</pre></details>}
            </div>}
            <form onSubmit={saveCashClosing}>
              <div className="meta-fields">
                <label><span>Data</span><input required type="date" value={cashForm.day} onChange={e=>changeCashField('day',e.target.value)}/></label>
                <label><span>Nº do caixa</span><input required value={cashForm.register} onChange={e=>changeCashField('register',e.target.value)}/></label>
                <label><span>Operador</span><input required value={cashForm.operator} onChange={e=>changeCashField('operator',e.target.value)}/></label>
              </div>
              <h3>Faturamento por modalidade</h3>
              <div className="meta-fields">{CASH_CHANNELS.map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" step="0.01" value={cashForm[key]} onChange={e=>changeCashField(key,e.target.value)}/></label>)}</div>
              <div className="cash-overview"><b>Faturamento: {money(cashPreview.revenue)}</b><span>Cartões POS: {money(cashPreview.pos)}</span></div>
              <div className="cash-movements-head"><h3>Movimentações — sangria e suprimento</h3>
                <button className="btn secondary" type="button" onClick={()=>changeCashField('movements',[...cashForm.movements,{type:'suprimento',amount:'0',reason:''}])}><Icon type="plus" size={15}/>Adicionar</button></div>
              {cashForm.movements.map((m,i)=><div className="cash-movement-row" key={i}>
                <select aria-label="Tipo da movimentação" value={m.type} onChange={e=>changeCashField('movements',cashForm.movements.map((r,j)=>i===j?{...r,type:e.target.value}:r))}><option value="suprimento">Suprimento (+)</option><option value="sangria">Sangria (−)</option></select>
                <input type="number" min="0" step="0.01" aria-label="Valor da movimentação" value={m.amount} onChange={e=>changeCashField('movements',cashForm.movements.map((r,j)=>i===j?{...r,amount:e.target.value}:r))}/>
                <input aria-label="Motivo da movimentação" placeholder="Motivo (ex.: abertura, troco, retirada)" value={m.reason} onChange={e=>changeCashField('movements',cashForm.movements.map((r,j)=>i===j?{...r,reason:e.target.value}:r))}/>
                <button type="button" className="btn secondary" onClick={()=>changeCashField('movements',cashForm.movements.filter((_,j)=>i!==j))}>Remover</button>
              </div>)}
              <div className="cash-overview"><span>Suprimentos: {money(cashPreview.inflow)}</span><span>Sangrias: {money(cashPreview.outflow)}</span><b>Dinheiro previsto após movimentações: {money(cashPreview.cashExpected)}</b></div>
              <label className="field cash-counted"><span>Dinheiro contado no fechamento (opcional)</span><input type="number" min="0" step="0.01" value={cashForm.cashCounted} onChange={e=>changeCashField('cashCounted',e.target.value)}/></label>
              {cashForm.cashCounted!==''&&<p>Diferença do caixa físico: <b>{money(Number(cashForm.cashCounted)-cashPreview.cashExpected)}</b></p>}
              <div className="modal-actions"><button className="btn primary" disabled={cashSaving||!accessCode}>{cashSaving?'Salvando…':'Salvar fechamento'}</button></div>
            </form>
          </section>}
          <section className="panel cash-history"><div className="panel-head"><div><h2>Histórico de fechamentos</h2><p>Registros individuais por data e número do caixa.</p></div><span className="history-count">{closings.length} registros</span></div>
            <div className="table-wrap"><table><thead><tr><th>DATA</th><th>CAIXA</th><th>OPERADOR</th><th>FATURAMENTO</th><th>SUPRIMENTOS</th><th>SANGRIAS</th><th></th></tr></thead><tbody>
            {closings.map(entry=>{const totals=cashTotals(entry);return <tr key={entry.id}><td>{entry.day}</td><td>{entry.register}</td><td>{entry.operator}</td><td><b>{money(totals.revenue)}</b></td><td>{money(totals.inflow)}</td><td>{money(totals.outflow)}</td><td>{currentUser?.role==='admin'&&<button className="text-btn" onClick={()=>editCashClosing(entry)}>Revisar</button>}</td></tr>})}
            {!closings.length&&<tr><td colSpan={7}>Ainda não há fechamentos registrados.</td></tr>}
            </tbody></table></div>
          </section>
        </>}

        {view === 'movements' && <section className="panel movement-panel"><div className="panel-head"><div><h2>Histórico de movimentações</h2><p>Entradas, saídas, cadastros e ajustes deste navegador.</p></div><span className="history-count">{movements.length} registros</span></div>{movements.length ? <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>TIPO</th><th>QUANTIDADE</th><th>MOTIVO</th><th>DATA</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td><div className="product-cell"><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span><b>{m.product}</b><small>Movimentação de estoque</small></span></div></td><td><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type}</span></td><td><b>{qty(m.quantity)}</b></td><td>{m.reason}</td><td>{m.date}</td></tr>)}</tbody></table></div> : <div className="empty-docs">Ainda não há movimentações.</div>}</section>}
        <footer className="footer"><span><b>estoque+</b><i>/</i> Projeto GPT</span><span>Protótipo em desenvolvimento <i>•</i> {supabase ? (saveStatus || 'Banco compartilhado') : (loaded ? 'Dados salvos localmente' : 'Carregando dados')}</span></footer>
      </div>
    </main>

    {modal === 'product' && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">{editing ? 'ATUALIZAÇÃO DE CADASTRO' : 'NOVO CADASTRO'}</div><h2>{editing ? 'Editar produto' : 'Adicionar produto'}</h2><p>Defina os dados básicos para acompanhar o estoque.</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveProduct}><label className="field full"><span>Nome do produto *</span><input required autoFocus value={productForm.name} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Ex.: Farinha de trigo"/></label><div className="form-grid"><label className="field"><span>Código / SKU</span><input value={productForm.sku} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="Opcional"/></label><label className="field"><span>Categoria</span><select value={productForm.category} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>{['Mercearia','Cafés','Laticínios','Confeitaria','Embalagens','Bebidas','Limpeza','Outros'].map((c) => <option key={c}>{c}</option>)}</select></label><label className="field"><span>Unidade</span><select value={productForm.unit} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}>{['un','kg','g','L','ml','cx','pct','fardo'].map((u) => <option key={u}>{u}</option>)}</select></label><label className="field"><span>Quantidade atual</span><input type="number" min="0" step="any" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}/></label>{currentUser?.role === 'admin' && <><label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="any" value={productForm.min} onChange={(e) => setProductForm({ ...productForm, min: e.target.value })}/></label><label className="field"><span>Custo unitário (R$)</span><input type="number" min="0" step="any" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}/></label><label className="field"><span>Fornecedor habitual (opcional)</span><input list="estq-known-suppliers" value={productForm.preferredSupplier || ''} onChange={(e) => setProductForm({ ...productForm, preferredSupplier: e.target.value })} placeholder="Ex.: Atacadista Centro"/><datalist id="estq-known-suppliers">{knownSuppliers.map((name) => <option key={name} value={name}/>)}</datalist><small>Se não escolher, usamos o fornecedor mais frequente das notas fiscais.</small></label></>}</div>{!editing && registrationDuplicateHints.length > 0 && <div className="duplicate-inline" role="alert"><b>⚠ Possível cadastro duplicado — confira com o gestor</b><p>{registrationDuplicateHints.map((match) => match.left.name + ' (' + (match.left.sku || 'sem código') + ')').join(' · ')}. Se for o mesmo produto, edite o cadastro existente.</p></div>}<div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal('')}>Cancelar</button><button type="submit" className="btn primary"><Icon type="check" size={17}/>{editing ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form></section></div>}
    {mergePair && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !mergeBusy) setMergePair(null); }}>
      <section className="modal duplicate-merge-modal" role="dialog" aria-modal="true" aria-label="Consolidar cadastros duplicados">
        <div className="modal-heading"><div><div className="eyebrow">AÇÃO EXCLUSIVA DO GESTOR</div><h2>Consolidar produtos</h2><p>Escolha o cadastro principal e confira as quantidades.</p></div><button className="close-btn" disabled={mergeBusy} onClick={() => setMergePair(null)}><Icon type="close"/></button></div>
        <div className="duplicate-merge-body">
          <div className="duplicate-guidance">⚠ Esta operação remove o cadastro secundário e atualiza os vínculos de movimentações e notas para o produto principal. O histórico das contagens antigas é mantido como registro original.</div>
          {[mergePair.left, mergePair.right].map((p) => <label key={p.id} className="duplicate-keep-choice"><input type="radio" name="mergeKeep" value={p.id} checked={mergeKeepId === p.id} onChange={() => setMergeKeepId(p.id)} disabled={mergeBusy}/><span><b>{p.name}</b><small>Código {p.sku} · {qty(p.stock)} {p.unit} · custo {money(p.cost)}</small><small>{mergeKeepId === p.id ? 'Cadastro que permanecerá visível no estoque' : 'Cadastro que será removido após a consolidação'}</small></span></label>)}
          <div className="duplicate-merge-total"><b>Saldo após a consolidação</b><strong>{qty(Number(mergePair.left.stock) + Number(mergePair.right.stock))} {mergePair.left.unit}</strong><small>Os custos serão ponderados pelas quantidades; o mínimo será o maior dos dois. Confira se as quantidades não representam dupla contagem física.</small></div>
          <label className="duplicate-confirm"><input type="checkbox" checked={mergeAcknowledged} onChange={(e)=>setMergeAcknowledged(e.target.checked)} disabled={mergeBusy}/><span>Conferi os produtos e as quantidades físicas. Confirmo que representam o mesmo item e autorizo a consolidação.</span></label>
          {mergeError && <div className="error" role="alert">{mergeError}</div>}
        </div>
        <div className="modal-actions"><button className="btn secondary" type="button" disabled={mergeBusy} onClick={() => setMergePair(null)}>Cancelar</button><button className="btn primary" type="button" disabled={!mergeAcknowledged || mergeBusy || !mergePair.sameUnit} onClick={() => void confirmProductMerge()}>{mergeBusy ? 'Consolidando…' : 'Confirmar consolidação'}</button></div>
      </section>
    </div>}
    {modal === 'adjust' && editing && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal compact" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">MOVIMENTAÇÃO MANUAL</div><h2>Ajustar estoque</h2><p>{editing.name} · saldo atual: {qty(editing.stock)} {editing.unit}</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveAdjustment}><label className="field"><span>Tipo de movimentação</span><select value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value, reason: e.target.value === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' })}><option>Entrada</option><option>Saída</option></select></label><label className="field"><span>Quantidade ({editing.unit})</span><input type="number" required min="0.001" step="any" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}/></label><label className="field"><span>Motivo</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}/></label><div className="modal-actions"><button className="btn secondary" type="button" onClick={() => setModal('')}>Cancelar</button><button className="btn primary" type="submit"><Icon type="check" size={17}/>Registrar {adjust.type.toLowerCase()}</button></div></form></section></div>}
    {detailDoc && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailDoc(null); }}><section className="modal detail-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">DOCUMENTO JÁ PROCESSADO</div><h2>{detailDoc.supplier || detailDoc.fileName || 'Documento fiscal'}</h2><p>{detailDoc.fileName}{detailDoc.invoiceNumber ? ' · Nº ' + detailDoc.invoiceNumber : ''}{detailDoc.officialVerified ? ' · Conferido com consulta pública' : ''}</p></div><button className="close-btn" onClick={() => setDetailDoc(null)}><Icon type="close"/></button></div><div className="detail-summary"><span><small>Status</small><b>{detailDoc.status}</b></span><span><small>Fornecedor</small><b>{detailDoc.supplier || 'Não informado'}</b></span><span><small>Registrado em</small><b>{detailDoc.importedAt || detailDoc.date || 'Não informado'}</b></span><span><small>Quem conferiu</small><b>{detailDoc.checkedBy || 'Não informado'}</b></span></div><div className="detail-summary" style={{marginTop:12}}><span><small>Subtotal</small><b>{money(detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0))}</b></span><span><small>Desconto</small><b>{money(detailDoc.discount || 0)}</b></span><span><small>Total final</small><b>{money(detailDoc.total ?? ((detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0)) - Number(detailDoc.discount || 0)))}</b></span></div><div className="detail-items"><div className="detail-items-head"><b>Itens do documento</b><span>{detailDoc.items.length} itens</span></div>{detailDoc.items.map((it, i) => <div className="detail-item" key={i}><span><b>{it.name}</b><small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><strong>{money(receiptItemTotal(it))}</strong></div>)}</div>{deleteError && <div className="error" role="alert" style={{marginTop:12}}><Icon type="alert" size={18}/><span>{deleteError}</span></div>}<div className="modal-actions">{currentUser?.role === 'admin' && <button type="button" className="btn secondary" style={{color:'#a33'}} disabled={Boolean(deletingDocId) || saveStatus !== 'Sincronizado'} onClick={() => void deleteDocument(detailDoc)}>{deletingDocId === detailDoc.id ? 'Excluindo…' : 'Excluir NF e estornar estoque'}</button>}<button className="btn primary" onClick={() => {setDetailDoc(null);setDeleteError('');}}>Fechar detalhes</button></div></section></div>}
    {toast && <div className="toast"><span><Icon type="check" size={17}/></span>{toast}<button onClick={() => setToast('')}><Icon type="close" size={15}/></button></div>}
  </div>;
}
