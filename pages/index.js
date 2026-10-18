import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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
  const unitPattern = /\b(KG|KGS|GR|G|ML|LT|L|UND|UNIDADE|UN|IN|CX|PC|PCT|FD)\b/i;
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
    if (values.length >= 3 && mismatch > 0.025) unitPrice = cents(lineTotal / quantity);
    rows.push({
      code: row.code, name: name.slice(0, 120),
      quantity, unit: row.unit || 'un',
      unitPrice, lineTotal: cents(lineTotal)
    });
    row = null;
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const n = normalize(line);
    if (endsTable(line)) { flush(); break; }
    if (/\b(DESCONTO|VALOR LIQUIDO|TROCO|P\.?I\.?X|CARTAO)\b/.test(n)) continue;
    if (/^(?:C[O0]DIGO|DESCRICAO|QTDE|QTD|UN\b|VL\b|V\.UNIT\b|V\.TOTAL\b)/.test(n) && !/^\d/.test(n)) continue;
    const codeMatch = line.match(codePattern);
    const suffix = codeMatch?.[2]?.trim() || '';
    const isProductCode = Boolean(codeMatch && (!suffix || (suffix.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3));
    if (isProductCode) {
      seenProductCode = true;
      flush();
      row = { code: codeMatch[1].replace(/^B(?=\d{2,})/i, '8'), names: [], amounts: [], unit: '' };
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
  const deduped = [];
  for (const item of rows) {
    const existing = deduped.findIndex((other) => other.code === item.code);
    if (existing < 0) deduped.push(item);
    else if (item.name.length > deduped[existing].name.length) deduped[existing] = item;
  }
  return deduped.slice(0, 80);
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

  const deduped = [];
  const seen = new Set();
  for (const item of output) {
    const key = norm(item.name) + '|' + item.quantity + '|' + item.unitPrice;
    if (!seen.has(key)) { seen.add(key); deduped.push(item); }
  }
  return deduped.slice(0, 80);
}

function mergeReceiptCandidates(primary, alternate) {
  const normalizeName = (value) => norm(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const score = (item) => {
    const nameScore = Math.min(1, normalizeName(item.name).length / 16);
    const unit = item.unit ? 0.1 : 0;
    const code = item.code ? 0.08 : 0;
    const total = Number(item.lineTotal || Number(item.quantity || 0) * Number(item.unitPrice || 0));
    const actual = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    const err = Math.abs(actual - total) / Math.max(Math.abs(total), 0.1);
    return nameScore + unit + code + Math.max(0, 0.5 - Math.min(0.5, err));
  };
  const merged = (primary || []).map((item) => ({ ...item }));
  for (const item of (alternate || [])) {
    const key = normalizeName(item.name);
    if (!key) continue;
    const unit = norm(item.unit || 'un');
    const idx = merged.findIndex((existing) => {
      // A stable product code identifies the same item even if one OCR pass misreads its unit.
      if (item.code && existing.code && item.code.toLowerCase() === existing.code.toLowerCase()) return true;
      if (norm(existing.unit || 'un') !== unit) return false;
      const other = normalizeName(existing.name);
      if (key === other) return true;
      const shorter = Math.min(key.length, other.length);
      const longer = Math.max(key.length, other.length);
      return shorter >= 8 && longer > 0 && (key.startsWith(other) || other.startsWith(key) ||
        (() => {
          let previous = Array.from({ length: other.length + 1 }, (_, i) => i);
          for (let i = 1; i <= key.length; i++) {
            const current = [i];
            for (let j = 1; j <= other.length; j++) current[j] = Math.min(current[j-1] + 1, previous[j] + 1, previous[j-1] + (key[i-1] === other[j-1] ? 0 : 1));
            previous = current;
          }
          return previous[other.length] / longer < 0.12;
        })());
    });
    if (idx < 0) {
      merged.push({ ...item });
    } else {
      const current = merged[idx];
      const currentError = Math.abs(Number(current.quantity || 0) * Number(current.unitPrice || 0) - receiptItemTotal(current));
      const candidateError = Math.abs(Number(item.quantity || 0) * Number(item.unitPrice || 0) - receiptItemTotal(item));
      // Never replace a fiscally consistent primary pass with a different quantity
      // from an alternate pass solely because the alternate description is longer.
      const primaryValid = Number(current.quantity) > 0 && currentError < 0.055;
      const candidateValid = Number(item.quantity) > 0 && candidateError < 0.055;
      if (!primaryValid && candidateValid) {
        merged[idx] = { ...item, code: item.code || current.code };
      } else if (!primaryValid && score(item) > score(current)) {
        merged[idx] = { ...item, code: item.code || current.code };
      } else if (primaryValid && candidateValid && Math.abs(Number(current.quantity) - Number(item.quantity)) <= 0.001 &&
        Math.abs(receiptItemTotal(current) - receiptItemTotal(item)) < 0.025 &&
        normalizeName(item.name).length > normalizeName(current.name).length) {
        merged[idx] = { ...current, name: item.name };
      } else {
        merged[idx].code = merged[idx].code || item.code;
      }
    }
  }
  return merged.slice(0, 80);
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
  for (const line of String(text || '').split(/\r?\n/)) {
    const n = normalize(line);
    const values = amountValues(line);
    if (!values.length) continue;
    if (totals.subtotal === null && /\bSUB[\s-]*TOTAL\b|\bSUBTOTAL\b/.test(n)) totals.subtotal = values[0];
    if (totals.discount === null && /\bDESCONTO\b/.test(n)) totals.discount = values[0];
    if (totals.total === null && (/\bVALOR\s*TOTAL\b|\bTOTAL\s*A\s*PAGAR\b|\bTOTAL\s*DA\s*NOTA\b/.test(n)) &&
        !/\bQTD(?:E)?\s*TOTAL\b|\bTOTAL\s*DE\s*ITENS\b/.test(n)) totals.total = values[0];
  }
  return totals;
}

function reconcileReceiptTotals(primaryText, alternateText, items) {
  const primary = parseReceiptTotals(primaryText);
  const alternate = parseReceiptTotals(alternateText);
  const itemSubtotal = Math.round((items || []).reduce((sum, item) => sum + receiptItemTotal(item), 0) * 100) / 100;
  const subtotal = primary.subtotal ?? alternate.subtotal ?? itemSubtotal;
  const discount = primary.discount ?? alternate.discount ?? 0;
  const expected = Math.round((Number(subtotal) - Number(discount)) * 100) / 100;
  const candidates = [primary.total, alternate.total].filter((value) => value !== null);
  let total = candidates.length ? candidates[0] : expected;
  if (candidates.length > 1) {
    total = candidates.sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
  }
  return {
    subtotal: Math.round(Number(subtotal) * 100) / 100,
    discount: Math.round(Number(discount) * 100) / 100,
    total: Math.round(Number(total) * 100) / 100,
    totalsSource: primary.total !== null || primary.subtotal !== null || primary.discount !== null
      ? 'OCR (leitura principal)'
      : alternate.total !== null || alternate.subtotal !== null || alternate.discount !== null
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
  const normalize = (value) => norm(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const used = new Set();
  return (ocrItems || []).map((ocr) => {
    const code = normalize(ocr.code || '');
    const name = normalize(ocr.name);
    let matchIndex = (officialItems || []).findIndex((official, index) => {
      if (used.has(index)) return false;
      const officialCode = normalize(official.code || '');
      const officialName = normalize(official.name);
      if (code && officialCode && code === officialCode) return true;
      if (name && officialName && name === officialName) return true;
      const shorter = Math.min(name.length, officialName.length);
      return shorter >= 6 && (name.startsWith(officialName) || officialName.startsWith(name));
    });
    const official = matchIndex >= 0 ? officialItems[matchIndex] : null;
    if (matchIndex >= 0) used.add(matchIndex);
    if (!official) return { ocr, official: null, status: 'Não localizado na consulta pública' };
    const sameQty = Math.abs(Number(ocr.quantity || 0) - Number(official.quantity || 0)) <= 0.001;
    const samePrice = Math.abs(Number(ocr.unitPrice || 0) - Number(official.unitPrice || 0)) <= 0.02;
    const sameTotal = Math.abs(receiptItemTotal(ocr) - receiptItemTotal(official)) <= 0.02;
    return {
      ocr,
      official,
      status: sameQty && samePrice && sameTotal ? 'Confere' : 'Divergência de valor/quantidade'
    };
  }).concat((officialItems || []).filter((_, index) => !used.has(index)).map((official) => ({
    ocr: null, official, status: 'Item da consulta não encontrado no OCR'
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
  const [view, setView] = useState('stock');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [filter, setFilter] = useState('Todos');
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState('');
  const [editing, setEditing] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0' });
  const [adjust, setAdjust] = useState({ type: 'Entrada', quantity: '1', reason: 'Compra/recebimento' });
  const [draft, setDraft] = useState(null);
  const [draftQueue, setDraftQueue] = useState([]);
  const [draftBatch, setDraftBatch] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processingType, setProcessingType] = useState('xml');
  const [ocrProgress, setOcrProgress] = useState(0);
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
    setProducts(Array.isArray(state.products) ? state.products : []);
    setMovements(Array.isArray(state.movements) ? state.movements : []);
    setDocuments(Array.isArray(state.documents) ? state.documents : []);
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
      }
    } catch (_) {}
    setLoaded(true);
    setDataReady(true);
  }, [supabase]);

  useEffect(() => {
    if (!loaded || supabase) return;
    try { localStorage.setItem('projeto-gpt-stock-v1', JSON.stringify({ products, movements, documents })); } catch (_) {}
  }, [loaded, products, movements, documents, supabase]);

  useEffect(() => {
    if (!supabase || !accessGranted || !dataReady || !accessCode) return;
    setSaveStatus('Salvando…');
    const timer = setTimeout(async () => {
      const { error: saveError } = await supabase.rpc('inventory_save', {
        p_session_token: accessCode,
        p_state: { products, movements, documents }
      });
      if (saveError) {
        setSaveStatus('Falha ao salvar');
        setToast('Não foi possível salvar no estoque compartilhado. Confira a conexão antes de continuar.');
      } else {
        setSaveStatus('Sincronizado');
      }
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
  const shownProducts = useMemo(() => products.filter((p) => {
    const matches = [p.name, p.sku, p.category].some((v) => norm(v).includes(norm(query)));
    const matchesCategory = category === 'Todas' || p.category === category;
    const matchesFilter = filter === 'Todos' || (filter === 'Estoque baixo' ? isLow(p) : !isLow(p));
    return matches && matchesCategory && matchesFilter;
  }), [products, query, category, filter]);

  const dateNow = () => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const page = view === 'stock' ? ['VISÃO GERAL', 'Controle de estoque', 'Acompanhe produtos, quantidades e níveis mínimos.'] : view === 'documents' ? ['COMPRAS & ENTRADAS', 'Documentos fiscais', 'Importe documentos, leia o QR Code e confira os itens antes de atualizar o estoque.'] : view === 'purchases' ? ['PLANEJAMENTO', 'Lista de compras', 'Sugestão de reposição com base no estoque mínimo de cada produto.'] : ['RASTREABILIDADE', 'Movimentações', 'Consulte entradas, saídas e ajustes registrados.'];

  const draftItemsSubtotal = draft ? Math.round(draft.items.reduce((sum, item) => sum + receiptItemTotal(item), 0) * 100) / 100 : 0;
  const draftSubtotal = draft && Number.isFinite(Number(draft.subtotal)) ? Number(draft.subtotal) : draftItemsSubtotal;
  const draftDiscount = draft ? Number(draft.discount || 0) : 0;
  const draftTotal = draft && Number.isFinite(Number(draft.total)) ? Number(draft.total) : Math.round((draftSubtotal - draftDiscount) * 100) / 100;
  const totalsItemsMismatch = Boolean(draft && Math.abs(draftItemsSubtotal - draftSubtotal) > 0.05);
  const totalsFinalMismatch = Boolean(draft && Math.abs(draftTotal - (draftSubtotal - draftDiscount)) > 0.05);
  const officialComparison = draft?.officialItems?.length ? compareInvoiceItems(draft.items, draft.officialItems) : [];
  const purchaseList = products.filter((p) => Number(p.min || 0) > Number(p.stock || 0)).map((p) => ({ ...p, buy: Math.round((Number(p.min || 0) - Number(p.stock || 0)) * 1000) / 1000 })).sort((a, b) => norm(a.name).localeCompare(b.name, 'pt-BR'));

  function downloadPurchaseList() {
    if (!purchaseList.length) { setToast('Nenhum item abaixo do estoque mínimo.'); return; }
    const rows = [['Produto','Categoria','Estoque atual','Estoque mínimo','Comprar','Unidade','Custo unitário estimado','Subtotal estimado'], ...purchaseList.map((p) => [p.name,p.category || '',Number(p.stock || 0),Number(p.min || 0),p.buy,p.unit || 'un',Number(p.cost || 0),Math.round(p.buy * Number(p.cost || 0) * 100) / 100])];
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lista-de-compras-cafeteria-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setToast('Lista de compras exportada.');
  }

  function openProduct(product) {
    setEditing(product || null);
    setProductForm(product ? { name: product.name, sku: product.sku || '', category: product.category || 'Outros', unit: product.unit || 'un', stock: String(product.stock), min: String(product.min), cost: String(product.cost) } : { name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0' });
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
  function uploadFile(file) {
    if (!file) return;
    setDraftQueue([]);
    setDraftBatch(null);
    if (uploadRef.current) uploadRef.current.value = '';
    setError('');
    setView('documents');
    const xml = /\.xml$/i.test(file.name) || file.type === 'text/xml' || file.type === 'application/xml';
    if (xml) {
      setProcessingType('xml');
      setBusy(true);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseNfeXml(String(reader.result || ''));
          setDraft({ ...parsed, checkedBy: '', fileName: file.name, status: 'Aguardando conferência' });
          setView('documents');
          setToast('XML lido. Confira os produtos antes de confirmar.');
        } catch (e) { setError(e.message || 'Não foi possível ler o documento.'); }
        finally { setBusy(false); }
      };
      reader.onerror = () => { setError('Não foi possível abrir o arquivo.'); setBusy(false); };
      reader.readAsText(file);
      return;
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      setProcessingType('ocr');
      setBusy(true);
      setOcrProgress(0);
      setView('documents');
      (async () => {
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
              if (candidate.accessKey && existing.accessKey && candidate.accessKey.length === 44 && candidate.accessKey === existing.accessKey) return true;
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
          setDraft(uniqueReceipts[0] || receipts[0]);
          setDraftQueue(uniqueReceipts.slice(1));
          setDraftBatch(uniqueReceipts.length > 1 ? { total: uniqueReceipts.length, current: 1 } : null);
          const identifiedItems = uniqueReceipts.reduce((sum, receipt) => sum + receipt.items.filter((item) => item.name.trim()).length, 0);
          setError('');
          if (uniqueReceipts.length > 1) {
            setToast('Encontrei ' + uniqueReceipts.length + ' cupons distintos. Confira e confirme cada um separadamente.');
          } else if (duplicateReadsRemoved > 0 && identifiedItems) {
            setToast('Removi ' + duplicateReadsRemoved + ' leitura(s) repetida(s) da mesma nota e combinei os itens. Confira com o cupom original.');
          } else if (identifiedItems) {
            setToast('OCR sugeriu ' + identifiedItems + ' itens. Confira nomes, quantidades e preços com o cupom original.');
          } else {
            setError('A foto foi processada, mas os produtos não puderam ser separados com confiança. O texto reconhecido ficará disponível; preencha ou corrija os itens manualmente.');
          }
        } catch (e) {
          setDraft({ supplier: '', invoiceNumber: '', date: '', source: 'Foto (preenchimento manual)', checkedBy: '', fileName: file.name, status: 'Aguardando preenchimento', items: [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] });
          setDraftQueue([]);
          setDraftBatch(null);
          const detail = e && e.message ? String(e.message).slice(0, 180) : 'erro não identificado';
          setError('A leitura automática falhou nesta imagem (' + detail + '). A imagem foi aberta para preenchimento manual; tente novamente depois de atualizar o sistema.');
        } finally {
          if (worker) await worker.terminate().catch(() => {});
          delete window.__ocrReceiptIndex;
          setBusy(false);
          setOcrProgress(0);
        }
      })();
      return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      setDraft({ supplier: '', invoiceNumber: '', date: '', source: 'PDF (preenchimento manual)', checkedBy: '', fileName: file.name, status: 'Aguardando preenchimento', items: [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] });
      setView('documents');
      setToast('PDF selecionado. Preencha os itens manualmente; a extração automática de PDF ainda não está disponível.');
      return;
    }
    setError('Formato não reconhecido. Envie XML de NF-e, PDF ou imagem JPG/PNG/WEBP.');
  }
  function changeDraft(key, value) {
    const numericFields = ['subtotal', 'discount', 'total', 'officialSubtotal', 'officialDiscount', 'officialTotal'];
    setDraft((d) => ({ ...d, [key]: numericFields.includes(key) ? (value === '' ? 0 : Number(value)) : value }));
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
        keyWarning: valid ? '' : 'A chave exige 44 dígitos, modelo 65 e dígito verificador correto.'
      };
    });
  }

  function changeInvoiceAmount(key, value) {
    const number = value === '' ? 0 : Math.round(Number(value) * 100) / 100;
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [key]: number };
      if (key === 'subtotal' || key === 'discount') {
        const subtotal = key === 'subtotal' ? number : Number(d.subtotal ?? d.items.reduce((sum, item) => sum + receiptItemTotal(item), 0));
        const discount = key === 'discount' ? number : Number(d.discount || 0);
        next.total = Math.round((subtotal - discount) * 100) / 100;
      }
      return next;
    });
  }
  function changeItem(index, key, value) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => {
        if (i !== index) return it;
        const isNumeric = ['quantity', 'unitPrice', 'lineTotal'].includes(key);
        const next = { ...it, [key]: isNumeric ? (value === '' ? 0 : Number(value)) : value };
        if (key === 'quantity' || key === 'unitPrice') {
          next.lineTotal = Math.round(Number(next.quantity || 0) * Number(next.unitPrice || 0) * 100) / 100;
        }
        return next;
      })
    }));
  }
  async function consultOfficialAutomatically(url, expectedKey = '') {
    let validQr = false;
    try {
      const parsed = new URL(url);
      const hosts = ['dfe-portal.svrs.rs.gov.br', 'www.sefaz.rs.gov.br'];
      const pathOk = /^\/Dfe\/QrCodeNFce\/?$/i.test(parsed.pathname) || /^\/NFCE\/NFCE-COM\.aspx$/i.test(parsed.pathname);
      const payload = parsed.searchParams.get('p') || '';
      validQr = parsed.protocol === 'https:' && hosts.includes(parsed.hostname) && pathOk &&
        /^\d{44}\|/.test(payload) && validateNfceAccessKey(payload.split('|')[0]);
    } catch (_) {}
    if (!validQr) {
      setDraft((d) => d ? ({ ...d, officialStatus: 'Não encontrei uma URL de QR Code completa e válida. Confira os dados manualmente.' }) : d);
      return;
    }
    setDraft((d) => d ? ({ ...d, officialStatus: 'Consultando automaticamente a NFC-e na SVRS…' }) : d);
    try {
      const response = await fetch('/api/consulta-nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Consulta oficial indisponível.');
      const officialItems = Array.isArray(data.items) ? data.items : [];
      if (!officialItems.length) throw new Error('A página oficial foi aberta, mas os itens não puderam ser extraídos com segurança.');
      const totals = data.totals || {};
      setDraft((d) => {
        if (!d || d.consultaUrl !== url || (expectedKey && d.accessKey && expectedKey !== d.accessKey)) return d;
        return {
          ...d, officialItems, officialCompared: true,
          officialSubtotal: totals.subtotal,
          officialDiscount: totals.discount,
          officialTotal: totals.total,
          officialStatus: 'Consulta oficial lida automaticamente: ' + officialItems.length + ' itens. Confira as divergências abaixo.'
        };
      });
      setError('');
    } catch (err) {
      setDraft((d) => d && d.consultaUrl === url ? ({ ...d, officialStatus: err.message || 'Não foi possível consultar a NFC-e automaticamente.' }) : d);
    }
  }

  useEffect(() => {
    if (!draft?.consultaUrl || !draft?.qrUrlPreserved || draft.officialCompared || draft.officialStatus) return;
    void consultOfficialAutomatically(draft.consultaUrl, draft.accessKey);
  }, [draft?.consultaUrl, draft?.qrUrlPreserved, draft?.officialCompared, draft?.officialStatus]);

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
      items: d.officialItems.map((item) => ({ ...item })),
      subtotal: d.officialSubtotal ?? d.subtotal,
      discount: d.officialDiscount ?? d.discount,
      total: d.officialTotal ?? d.total,
      officialVerified: true,
      source: String(d.source || '').includes('consulta pública') ? d.source : (String(d.source || '') + ' + consulta pública'),
      totalsSource: 'Consulta pública (conferida manualmente)'
    }));
    setError('');
    setToast('Itens substituídos pelos dados extraídos da consulta pública. Confira antes de lançar.');
  }
  function confirmDocument() {
    if (!draft?.checkedBy?.trim()) { setError('Informe quem conferiu a nota antes de registrar a entrada.'); return; }
    if (!draft || !draft.items.some((it) => it.name.trim() && Number(it.quantity) > 0)) { setError('Informe ao menos um produto com nome e quantidade válida.'); return; }
    const duplicate = documents.some((d) => d.invoiceNumber && draft.invoiceNumber && d.invoiceNumber === draft.invoiceNumber && norm(d.supplier) === norm(draft.supplier));
    if (duplicate && !window.confirm('Já há um documento com este número e fornecedor. Deseja lançar novamente?')) return;
    const items = draft.items.filter((it) => it.name.trim() && Number(it.quantity) > 0);
    const nextProducts = [...products];
    const nextMovements = [...movements];
    items.forEach((it) => {
      const index = nextProducts.findIndex((p) => norm(p.name) === norm(it.name) && norm(p.unit || 'un') === norm(it.unit || 'un'));
      if (index >= 0) {
        const old = nextProducts[index];
        nextProducts[index] = { ...old, stock: Math.round((Number(old.stock) + Number(it.quantity)) * 1000) / 1000, cost: Number(it.unitPrice) > 0 ? Number(it.unitPrice) : old.cost, unit: it.unit || old.unit, updated: dateNow() };
      } else nextProducts.unshift({ id: uid(), name: it.name.trim(), sku: it.code || ('PRD-' + Date.now().toString().slice(-5) + '-' + nextProducts.length), category: 'Outros', unit: it.unit || 'un', stock: Number(it.quantity), min: 0, cost: Number(it.unitPrice) || 0, updated: dateNow() });
      nextMovements.unshift({ id: uid(), product: it.name.trim(), type: 'Entrada', quantity: Number(it.quantity), reason: 'Documento ' + (draft.invoiceNumber ? '#' + draft.invoiceNumber : 'importado'), date: dateNow(), by: draft.checkedBy.trim() });
    });
    setProducts(nextProducts);
    setMovements(nextMovements);
    const { ocrText, officialText, officialItems, officialSubtotal, officialDiscount, officialTotal, officialCompared, ...documentToSave } = draft;
    setDocuments((old) => [{ ...documentToSave, checkedBy: draft.checkedBy.trim(), id: uid(), status: 'Conferido e lançado', importedAt: dateNow(), items }, ...old]);
    const nextDraft = draftQueue[0] || null;
    setDraft(nextDraft);
    setDraftQueue((old) => old.slice(1));
    setDraftBatch(nextDraft && draftBatch ? { ...draftBatch, current: draftBatch.current + 1 } : null);
    setError('');
    if (uploadRef.current) uploadRef.current.value = '';
    setToast(nextDraft ? 'Entrada registrada. Confira o próximo cupom antes de lançar.' : 'Entrada de ' + items.length + (items.length === 1 ? ' item registrada.' : ' itens registrada.'));
    setView('documents');
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
        <button className={view === 'documents' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('documents')}><Icon type="file"/><span>Notas fiscais</span><i>{documents.length + (draft ? 1 : 0) + draftQueue.length}</i></button>
        <button className={view === 'movements' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('movements')}><Icon type="arrows"/><span>Movimentações</span></button>
        {currentUser?.role === 'admin' && <button className={view === 'purchases' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('purchases')}><Icon type="file"/><span>Lista de compras</span><i>{purchaseList.length}</i></button>}
      </nav>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-icon"><Icon type="spark" size={18}/></span><b>Menos planilhas.<br/>Mais controle.</b><p>Importe o XML de uma NF-e e confira os produtos antes de lançar as entradas.</p><button onClick={() => uploadRef.current?.click()}>Importar documento <Icon type="chevron" size={14}/></button></div><div className="user-row"><span className="user-avatar">{currentUser?.role === 'admin' ? 'AD' : currentUser ? 'EQ' : 'LG'}</span><span><b>{currentUser?.display_name || 'Equipe da cafeteria'}</b><small>{supabase ? (currentUser?.role === 'admin' ? 'Administrador' : 'Funcionário') + ' · ' + (saveStatus || 'Sessão ativa') : 'Protótipo local'}</small></span><button title="Sobre os dados" onClick={() => setToast(supabase ? 'Os dados são sincronizados no banco compartilhado da equipe.' : 'Os dados ficam no armazenamento local deste navegador; não há sincronização entre dispositivos.')}><Icon type="sliders" size={17}/></button></div></div>
    </aside>
    <main className="main"><input ref={uploadRef} className="hidden-input" type="file" accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,application/pdf,application/xml,text/xml,image/*" onChange={(e) => uploadFile(e.target.files && e.target.files[0])}/>
      <header className="topbar"><div className="crumb">Workspace <Icon type="chevron" size={14}/><b>{page[1]}</b></div><div className="top-right"><span className="local-pill"><i/>{supabase ? "Estoque compartilhado" : "Protótipo local"}</span><button className="bell" title="Ver itens com estoque baixo" onClick={() => {setView('stock');setFilter('Estoque baixo');}}><Icon type="alert" size={18}/>{low.length > 0 && <em/>}</button><button className="user-avatar user-avatar-button" title={supabase ? "Encerrar sessão" : "Administrador"} onClick={supabase ? handleLock : () => setToast("Modo de demonstração local.")}>{supabase ? "Sair" : "LG"}</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{page[0]}</div><h1>{page[1]}</h1><p>{page[2]}</p></div><div className="heading-buttons">{view === 'stock' && <button className="btn secondary" onClick={() => setView('movements')}><Icon type="clock" size={17}/>Histórico</button>}{view === 'purchases' && currentUser?.role === 'admin' && <button className="btn primary" onClick={downloadPurchaseList}><Icon type="upload" size={18}/>Baixar CSV</button>}{view === 'documents' && <button className="btn primary" onClick={() => uploadRef.current?.click()}><Icon type="upload" size={18}/>Importar documento</button>}{view === 'stock' && currentUser?.role === 'admin' && <button className="btn primary" onClick={() => openProduct(null)}><Icon type="plus" size={18}/>Novo produto</button>}</div></div>

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

        {view === 'purchases' && currentUser?.role === 'admin' && <section className="panel">
          <div className="panel-head"><div><h2>Reposição recomendada</h2><p>Quantidade sugerida = estoque mínimo menos saldo atual. Ajuste o mínimo no cadastro dos produtos.</p></div><span className="history-count">{purchaseList.length} itens</span></div>
          {purchaseList.length ? <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>ESTOQUE ATUAL</th><th>ESTOQUE MÍNIMO</th><th>SUGESTÃO DE COMPRA</th><th>CUSTO UNITÁRIO</th><th>SUBTOTAL ESTIMADO</th></tr></thead><tbody>{purchaseList.map((p) => <tr key={p.id}><td><div className="product-cell"><span className="product-box"><Icon type="box" size={18}/></span><span><b>{p.name}</b><small>{p.category || 'Sem categoria'}</small></span></div></td><td>{qty(p.stock)} {p.unit}</td><td>{qty(p.min)} {p.unit}</td><td><b className="quantity-low">{qty(p.buy)} {p.unit}</b></td><td>{money(p.cost)}</td><td><b>{money(p.buy * Number(p.cost || 0))}</b></td></tr>)}</tbody></table></div>
          : <div className="empty-docs"><span className="empty-file"><Icon type="check" size={28}/></span><b>Nenhuma reposição necessária</b><p>Todos os produtos estão no estoque mínimo ou acima dele. Confira se cada produto tem um mínimo cadastrado.</p></div>}
          {purchaseList.length > 0 && <div className="table-foot"><span>{purchaseList.length} produtos abaixo do mínimo</span><span>Subtotal estimado: <b>{money(purchaseList.reduce((sum,p)=>sum + p.buy * Number(p.cost || 0),0))}</b></span></div>}
        </section>}

        {view === 'documents' && <>
          <section className="document-banner"><span className="banner-art"><Icon type="file" size={28}/></span><div className="banner-copy"><h2>Da nota fiscal para o estoque</h2><p>Envie o XML da NF-e ou uma foto. Nas fotos, o sistema tenta separar cupons, ler o QR Code/chave de acesso e sugerir itens em duas passagens de OCR; revise tudo antes de lançar. PDFs ainda exigem preenchimento manual.</p><div className="feature-tags"><span><Icon type="check" size={14}/>XML de NF-e</span><span><Icon type="image" size={14}/>Foto ou PDF</span><span><Icon type="check" size={14}/>Conferência antes de lançar</span></div></div><button className="btn primary" onClick={() => uploadRef.current?.click()}><Icon type="upload" size={17}/>Escolher arquivo</button></section>
          {busy && <div className="notice">{processingType === "xml" ? "Lendo o XML da NF-e e identificando os itens…" : "Reconhecendo texto da imagem" + (ocrProgress ? " — " + ocrProgress + "%" : " — preparando o mecanismo OCR") + "…"}</div>}
          {error && <div className="error"><Icon type="alert" size={18}/><span>{error}</span><button onClick={() => setError('')}><Icon type="close" size={16}/></button></div>}
          {draft && <section className="panel review-panel"><div className="panel-head"><div><div className="eyebrow">CONFERÊNCIA DO DOCUMENTO</div><h2>Confira os dados antes de lançar</h2><p>{draft.fileName} · {draft.source === 'XML de NF-e' ? 'Itens extraídos do XML' : 'Preencha os dados identificados no documento'}</p></div><button className="close-btn" onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');if (uploadRef.current) uploadRef.current.value = '';}}><Icon type="close"/></button></div>
            <div className="meta-fields"><label><span>Fornecedor</span><input value={draft.supplier} onChange={(e) => changeDraft('supplier', e.target.value)} placeholder="Nome do fornecedor"/></label><label><span>Número do documento</span><input value={draft.invoiceNumber} onChange={(e) => changeDraft('invoiceNumber', e.target.value)} placeholder="Ex.: 000123"/></label><label><span>Data de emissão</span><input value={draft.date} onChange={(e) => changeDraft('date', e.target.value)} placeholder="Data, se disponível"/></label><label><span>Quem conferiu *</span><input required value={draft.checkedBy || ''} onChange={(e) => changeDraft('checkedBy', e.target.value)} placeholder="Nome do funcionário"/></label></div>
            {draftBatch && <div className="notice" style={{marginTop:14}}>Cupom {draftBatch.current} de {draftBatch.total}. Confirme esta entrada para revisar o próximo cupom da mesma imagem.</div>}
            {draft.ocrText && <label className="field full"><span>Corrigir chave da NFC-e</span><input value={draft.accessKeyInput ?? draft.accessKey ?? ''} onChange={(e) => changeNfceAccessKey(e.target.value)} placeholder="44 dígitos da chave de acesso"/></label>}
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
            <div className="table-wrap review-table"><table><thead><tr><th>PRODUTO</th><th>QUANTIDADE</th><th>UNIDADE</th><th>CUSTO UNITÁRIO (R$)</th><th>TOTAL DA LINHA (R$)</th><th></th></tr></thead><tbody>{draft.items.map((it, i) => <tr key={i}><td><input className="inline-input name-field" value={it.name} onChange={(e) => changeItem(i, 'name', e.target.value)} placeholder="Nome do produto"/></td><td><input className="inline-input small-field" type="number" min="0.001" step="any" value={it.quantity} onChange={(e) => changeItem(i, 'quantity', e.target.value)}/></td><td><input className="inline-input unit-field" value={it.unit} onChange={(e) => changeItem(i, 'unit', e.target.value)}/></td><td><input className="inline-input small-field" type="number" min="0" step="any" value={it.unitPrice} onChange={(e) => changeItem(i, 'unitPrice', e.target.value)}/></td><td><input className="inline-input small-field" type="number" min="0" step="0.01" aria-label={'Total da linha: ' + it.name} value={receiptItemTotal(it)} onChange={(e) => changeItem(i, 'lineTotal', e.target.value)}/></td><td><button className="delete-line" title="Remover item" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}><Icon type="close" size={15}/></button></td></tr>)}</tbody></table></div>
            <div className="meta-fields" style={{marginTop:16}}>
              <label><span>Subtotal fiscal (R$)</span><input type="number" min="0" step="0.01" value={draftSubtotal} onChange={(e) => changeInvoiceAmount('subtotal', e.target.value)}/></label>
              <label><span>Desconto total da nota (R$)</span><input type="number" min="0" step="0.01" value={draftDiscount} onChange={(e) => changeInvoiceAmount('discount', e.target.value)}/></label>
              <label><span>Total final da nota (R$)</span><input type="number" min="0" step="0.01" value={draftTotal} onChange={(e) => changeInvoiceAmount('total', e.target.value)}/></label>
            </div>
            {totalsItemsMismatch && <div className="notice" style={{marginTop:10}}>A soma dos totais das linhas ({money(draftItemsSubtotal)}) difere do subtotal fiscal ({money(draftSubtotal)}). Confira se algum item ou desconto por linha foi lido incorretamente.</div>}
            {totalsFinalMismatch && <div className="notice" style={{marginTop:10}}>O total final ({money(draftTotal)}) não coincide com subtotal menos desconto ({money(draftSubtotal - draftDiscount)}). Confira frete, acréscimos ou a leitura dos totais.</div>}
            <div className="review-bottom"><button className="btn secondary" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0, lineTotal: 0 }] }))}><Icon type="plus" size={16}/>Adicionar item</button><div className="review-sum"><span>Total da nota</span><b>{money(draftTotal)}</b></div></div>
            <div className="caution"><Icon type="alert" size={18}/><p><b>Confira antes de continuar.</b> Ao confirmar, as quantidades serão somadas ao saldo atual. Produtos com nome igual serão associados ao cadastro existente.</p></div>
            <div className="modal-actions"><button className="btn secondary" onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');}}>Cancelar</button><button className="btn primary" onClick={confirmDocument}><Icon type="check" size={17}/>Confirmar entrada no estoque</button></div>
          </section>}
          <section className="panel history-panel"><div className="panel-head"><div><h2>Histórico de documentos</h2><p>Compras conferidas e lançadas no estoque.</p></div><span className="history-count">{documents.length} documentos</span></div>{documents.length ? documents.map((d) => <div className="history-row" key={d.id}><span className="history-file"><Icon type="file" size={19}/></span><span className="history-copy"><b>{d.supplier || d.fileName || 'Documento importado'}</b><small>{d.fileName} · {d.items.length} itens{d.invoiceNumber ? ' · Nº ' + d.invoiceNumber : ''}{d.total !== undefined && d.total !== null ? ' · Total ' + money(d.total) : ''}{Number(d.discount || 0) > 0 ? ' · Desconto ' + money(d.discount) : ''}{d.officialVerified ? ' · Conferido com consulta pública' : ''}{d.checkedBy ? ' · Conferido por ' + d.checkedBy : ''}</small></span><span className="history-date">{d.importedAt || d.date || 'Data não informada'}</span><span className="status ok-status"><i/>{d.status}</span><button className="row-chevron" title="Ver detalhes" onClick={() => setDetailDoc(d)}><Icon type="chevron" size={17}/></button></div>) : <div className="empty-docs"><span className="empty-file"><Icon type="file" size={28}/></span><b>Nenhum documento importado</b><p>Envie o XML de uma NF-e ou selecione uma foto/PDF e cadastre os itens manualmente.</p><button className="btn secondary" onClick={() => uploadRef.current?.click()}><Icon type="upload" size={16}/>Importar primeiro documento</button></div>}</section>
          <div className="privacy-note"><Icon type="check" size={16}/><span>Privacidade: os arquivos são lidos no navegador e não enviados a um servidor. O histórico salva os campos conferidos, não o documento original.</span></div>
        </>}

        {view === 'movements' && <section className="panel movement-panel"><div className="panel-head"><div><h2>Histórico de movimentações</h2><p>Entradas, saídas, cadastros e ajustes deste navegador.</p></div><span className="history-count">{movements.length} registros</span></div>{movements.length ? <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>TIPO</th><th>QUANTIDADE</th><th>MOTIVO</th><th>DATA</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td><div className="product-cell"><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span><b>{m.product}</b><small>Movimentação de estoque</small></span></div></td><td><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type}</span></td><td><b>{qty(m.quantity)}</b></td><td>{m.reason}</td><td>{m.date}</td></tr>)}</tbody></table></div> : <div className="empty-docs">Ainda não há movimentações.</div>}</section>}
        <footer className="footer"><span><b>estoque+</b><i>/</i> Projeto GPT</span><span>Protótipo em desenvolvimento <i>•</i> {supabase ? (saveStatus || 'Banco compartilhado') : (loaded ? 'Dados salvos localmente' : 'Carregando dados')}</span></footer>
      </div>
    </main>

    {modal === 'product' && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">{editing ? 'ATUALIZAÇÃO DE CADASTRO' : 'NOVO CADASTRO'}</div><h2>{editing ? 'Editar produto' : 'Adicionar produto'}</h2><p>Defina os dados básicos para acompanhar o estoque.</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveProduct}><label className="field full"><span>Nome do produto *</span><input required autoFocus value={productForm.name} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Ex.: Farinha de trigo"/></label><div className="form-grid"><label className="field"><span>Código / SKU</span><input value={productForm.sku} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="Opcional"/></label><label className="field"><span>Categoria</span><select value={productForm.category} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>{['Mercearia','Cafés','Laticínios','Confeitaria','Embalagens','Bebidas','Limpeza','Outros'].map((c) => <option key={c}>{c}</option>)}</select></label><label className="field"><span>Unidade</span><select value={productForm.unit} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}>{['un','kg','g','L','ml','cx','pct','fardo'].map((u) => <option key={u}>{u}</option>)}</select></label><label className="field"><span>Quantidade atual</span><input type="number" min="0" step="any" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}/></label>{currentUser?.role === 'admin' && <><label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="any" value={productForm.min} onChange={(e) => setProductForm({ ...productForm, min: e.target.value })}/></label><label className="field"><span>Custo unitário (R$)</span><input type="number" min="0" step="any" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}/></label></>}</div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal('')}>Cancelar</button><button type="submit" className="btn primary"><Icon type="check" size={17}/>{editing ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form></section></div>}
    {modal === 'adjust' && editing && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal compact" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">MOVIMENTAÇÃO MANUAL</div><h2>Ajustar estoque</h2><p>{editing.name} · saldo atual: {qty(editing.stock)} {editing.unit}</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveAdjustment}><label className="field"><span>Tipo de movimentação</span><select value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value, reason: e.target.value === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' })}><option>Entrada</option><option>Saída</option></select></label><label className="field"><span>Quantidade ({editing.unit})</span><input type="number" required min="0.001" step="any" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}/></label><label className="field"><span>Motivo</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}/></label><div className="modal-actions"><button className="btn secondary" type="button" onClick={() => setModal('')}>Cancelar</button><button className="btn primary" type="submit"><Icon type="check" size={17}/>Registrar {adjust.type.toLowerCase()}</button></div></form></section></div>}
    {detailDoc && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailDoc(null); }}><section className="modal detail-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">DOCUMENTO JÁ PROCESSADO</div><h2>{detailDoc.supplier || detailDoc.fileName || 'Documento fiscal'}</h2><p>{detailDoc.fileName}{detailDoc.invoiceNumber ? ' · Nº ' + detailDoc.invoiceNumber : ''}{detailDoc.officialVerified ? ' · Conferido com consulta pública' : ''}</p></div><button className="close-btn" onClick={() => setDetailDoc(null)}><Icon type="close"/></button></div><div className="detail-summary"><span><small>Status</small><b>{detailDoc.status}</b></span><span><small>Fornecedor</small><b>{detailDoc.supplier || 'Não informado'}</b></span><span><small>Registrado em</small><b>{detailDoc.importedAt || detailDoc.date || 'Não informado'}</b></span><span><small>Quem conferiu</small><b>{detailDoc.checkedBy || 'Não informado'}</b></span></div><div className="detail-summary" style={{marginTop:12}}><span><small>Subtotal</small><b>{money(detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0))}</b></span><span><small>Desconto</small><b>{money(detailDoc.discount || 0)}</b></span><span><small>Total final</small><b>{money(detailDoc.total ?? ((detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0)) - Number(detailDoc.discount || 0)))}</b></span></div><div className="detail-items"><div className="detail-items-head"><b>Itens do documento</b><span>{detailDoc.items.length} itens</span></div>{detailDoc.items.map((it, i) => <div className="detail-item" key={i}><span><b>{it.name}</b><small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><strong>{money(receiptItemTotal(it))}</strong></div>)}</div><div className="modal-actions"><button className="btn primary" onClick={() => setDetailDoc(null)}>Fechar detalhes</button></div></section></div>}
    {toast && <div className="toast"><span><Icon type="check" size={17}/></span>{toast}<button onClick={() => setToast('')}><Icon type="close" size={15}/></button></div>}
  </div>;
}
