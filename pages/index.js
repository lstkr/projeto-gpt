Warning: truncated output (original token count: 74909)
Total output lines: 4028

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TenantAdministration from '../components/TenantAdministration';
import CountPrintAction from '../components/CountPrintAction';
import { createPortal } from 'react-dom';
import { printPurchasePlan } from '../lib/purchase-print.mjs';
import { useAccessibleDialog } from '../components/useAccessibleDialog';
import { createClient } from '@supabase/supabase-js';
import { previewDatabaseIsBlocked } from '../lib/preview-database-policy.mjs';
import { sessionHealth, SESSION_CHECK_INTERVAL_MS } from '../lib/session-health.mjs';
import { normalizeFiscalDraftReview } from '../lib/fiscal-line-review.mjs';
import { updateFiscalLine, resolveFiscalSubtotal } from '../lib/fiscal-calculation.mjs';
import { canStartFiscalFinalReview, canConfirmFiscalDocument } from '../lib/fiscal-confirmation.mjs';
import { filterDocumentHistory, formatDocumentIssueDate } from '../lib/document-history.mjs';
import { cnpjDigits, formatSupplierCnpj, fiscalCodeIdentity, validSupplierCnpj, extractIssuerCnpj, supplierAliasProduct, supplierAliasProducts, prepareFiscalIdentity } from '../lib/fiscal-identity.mjs';
import { pendingConfirmationState } from '../lib/pending-confirmation.mjs';
import { COUNT_DEFAULTS, countDay, countDateLabel, countDueDate } from '../lib/stock-count.mjs';
import { CASH_CHANNELS,cashTotals,validateCashClosing,aggregateCashMonthly,aggregateCashYearly } from '../lib/cash-closing.mjs';
import { summarizeCashMonthly } from '../lib/cash-chart-references.mjs';
import { parseCashReport, parseCashReportCandidates } from '../lib/cash-report-parser.mjs';
import { detectCashFileType } from '../lib/cash-file-type.mjs';
import { cashReportMimeFromBytes, cashReportSafeDownloadName, decodeCashReportBase64, encodeCashReportBase64, cashReportFileMatchesMime } from '../lib/cash-report-ui.mjs';
import { needsSecondOcrPass } from '../lib/receipt-ocr-strategy.mjs';
import { getPendingReceiptPreviewType, safePendingReceiptFilename } from '../lib/pending-receipt-preview.mjs';
import { adaptiveBinarizeImageData } from '../lib/receipt-image-preprocess.mjs';
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
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const isLow = (p) => Number(p.stock) <= Number(p.min);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dpauqdihvhbbaellwjav.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7YF3ypYXkL-7MVcwozMx7w_AnLDFju7';
const PREVIEW_DEPLOY = process.env.ESTOQUE_DEPLOY_ENV === 'preview';
// Fail closed unless Preview uses a separate database or explicitly allows
// the existing one on this homologation branch. This is not an auth bypass.
const PREVIEW_UNSAFE = PREVIEW_DEPLOY && previewDatabaseIsBlocked({
  deploymentEnv: process.env.ESTOQUE_DEPLOY_ENV,
  databaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  allowSharedDatabase: process.env.ESTOQUE_SHARED_DB_PREVIEW === 'true',
  branch: process.env.ESTOQUE_PREVIEW_BRANCH
});
const HAS_SUPABASE_CONFIG = !PREVIEW_UNSAFE && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

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


/** Avisos da conferência: popup fora da tabela para não ser cortado pelo scroll horizontal. */
function ReviewIssuePopover({ issues, productName, index, reviewed }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const buttonRef = useRef(null);
  const popupRef = useRef(null);
  const closeTimer = useRef(null);
  const tooltipId = 'receipt-line-alert-' + index;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeSoon = () => {
    cancelClose();
    if (!pinned) closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(360, window.innerWidth - 24);
      const height = popupRef.current?.offsetHeight || 190;
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const top = anchor.bottom + height + 10 <= window.innerHeight
        ? anchor.bottom + 8 : Math.max(12, anchor.top - height - 8);
      setPosition(old => old.top === top && old.left === left ? old : { top, left });
    };
    place();
    const dismissOutside = e => {
      if (!buttonRef.current?.contains(e.target) && !popupRef.current?.contains(e.target)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const dismissEscape = e => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, issues.length]);

  return <>
    <button ref={buttonRef} type="button"
      className={'review-issue-trigger' + (reviewed ? ' is-reviewed' : '')}
      aria-label={issues.length + ' aviso(s) para ' + (productName || 'este produto') + '. Passe o mouse ou clique para ler.'}
      aria-describedby={open ? tooltipId : undefined}
      aria-expanded={open}
      onPointerEnter={e => { if (e.pointerType === 'mouse') { cancelClose(); setOpen(true); } }}
      onPointerLeave={closeSoon}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={closeSoon}
      onClick={() => {
        cancelClose();
        if (pinned) { setPinned(false); setOpen(false); }
        else { setPinned(true); setOpen(true); }
      }}>
      <Icon type="alert" size={18}/>
      <span>{issues.length}</span>
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={popupRef} id={tooltipId} role="tooltip"
        className="review-issue-popup" style={{ top: position.top, left: position.left }}
        onPointerEnter={cancelClose} onPointerLeave={closeSoon}>
        <div className="review-issue-popup-title"><Icon type="alert" size={18}/>
          <b>{reviewed ? 'Avisos já conferidos' : 'Pontos para conferir'}</b>
          <button type="button" aria-label="Fechar avisos" onClick={() => {setPinned(false);setOpen(false);}}>×</button>
        </div>
        <ul>{issues.map((message, warningIndex) => <li key={warningIndex}>{message}</li>)}</ul>
        <p>Compare com a nota antes de confirmar esta linha.</p>
      </div>, document.body
    )}
  </>;
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
  // Some DANFE NFC-e tables print an item number before the supplier's product code.
  const numberedCodePattern = /^(\d{1,3})\s+((?:[A-Z]\d{2,12}|\d{3,12}))\s+(.+)$/i;
  const unitPattern = /\b(KG|KGS|GR|G|ML|LT|L|UND|UNIDADE|UN|IN|CX|PC|PCT|FD|PT)\b/i;
  const cents = (number) => Math.round(number * 100) / 100;
  const header = lines.findIndex((line) => {
    const n = normalize(line);
    return /C[O0]D(?:IGO)?\b/.test(n) && /DESCRI[CCT]/.test(n);
  });
  const start = header >= 0 ? header + 1 : 0;
  const numberedTable = header >= 0 && /(?:^|\s)#\s*C[O0]D(?:IGO)?\b/.test(normalize(lines[header]));
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
    let lineTotal = values.length >= 3 ? values[values.length - 1] : row.inlineTotal;
    // On a two-number OCR row (quantity + amount), the unit price may have
    // disappeared. Do not treat the second printed number as quantity.
    if (lineTotal === null) lineTotal = quantity * unitPrice;
    if (!(lineTotal >= 0) || lineTotal > 1000000 || !(unitPrice >= 0) || unitPrice > 1000000) {
      row = null; return;
    }
    const mismatch = Math.abs(quantity * unitPrice - lineTotal);
    // Never silently overwrite the printed unit price (thermal receipts can round it).
    const readingWarning = (values.length >= 3 || row.inlineTotal !== null) && mismatch > 0.055
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
    const numberedMatch = line.match(numberedCodePattern);
    // Do not mistake the printed item sequence (e.g. 001) for the product code.
    // An explicit # / Cod header is authoritative; a padded 001 also helps if OCR lost the header.
    const hasItemIndex = numberedMatch && (numberedTable || /^0\d{2}$/.test(numberedMatch[1]));
    const codeMatch = hasItemIndex
      ? [numberedMatch[0], numberedMatch[2], numberedMatch[3]]
      : line.match(codePattern);
    const suffix = codeMatch?.[2]?.trim() || '';
    const isProductCode = Boolean(codeMatch && (!suffix || (suffix.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3));
    if (isProductCode) {
      seenProductCode = true;
      flush();
      row = { code: codeMatch[1].replace(/^B(?=\d{2,})/i, '8'), names: [], amounts: [], unit: '', itemDiscount: 0, inlineTotal: null };
      if (suffix) {
        // PSM 6 sometimes merges the whole fiscal row into one OCR line.
        // Anchor quantity to its unit so neither the item index nor package size
        // ("20UN" in a description) becomes a quantity.
        const inlineSale = suffix.match(/^(.*?)\s+(\d+(?:[.,]\d{1,4})?)\s+(KG|KGS|GR|G|ML|LT|L|UND|UNIDADE|UN|IN|CX|PC|PCT|FD|PT)\s*(?:[X×*]\s*)?(\d+(?:[.,]\d{2,4}))(?:\s+(\d+(?:[.,]\d{2,4})))?\s*$/i);
        if (inlineSale) {
          const nameOnly = cleanDescription(inlineSale[1]);
          if (nameOnly) row.names.push(nameOnly);
          const rawUnit = inlineSale[3].toLowerCase();
          row.unit = ({und:'un',unidade:'un',in:'un',kgs:'kg',gr:'g'}[rawUnit] || rawUnit);
          row.amounts.push(localizedValue(inlineSale[2]), localizedValue(inlineSale[4]));
          if (inlineSale[5]) row.amounts.push(localizedValue(inlineSale[5]));
        } else {
          // A right-aligned total can be recognized on the description row,
          // while quantity and unit price are printed on the next row.
          const printedTotal = suffix.match(/(?:^|\s)(\d+(?:\.\d{3})*,\d{2})\s*$/);
          if (printedTotal) row.inlineTotal = localizedValue(printedTotal[1]);
          const nameOnly = cleanDescription(suffix.replace(amountPattern, ' '));
          if (nameOnly) row.names.push(nameOnly);
        }
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
    // Thermal receipts often print an integer quantity: "2 UN X 8,99 17,98".
    // The money matcher intentionally recognizes decimal amounts, not the integer 2.
    const integerQuantity = line.match(/^(\d{1,6})\s+(?:KG|KGS|GR|G|ML|LT|L|UND|UNIDADE|UN|IN|CX|PC|PCT|FD|PT)\b/i);
    if (integerQuantity && values.length) values.unshift(Number(integerQuantity[1]));
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
  return supplierAliasProduct(item, catalog, supplierCnpj);
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
  if (supplierAliasProducts(item, catalog, supplierCnpj).length > 1) return null;
  const bySupplier = findSupplierAliasProduct(item, catalog, supplierCnpj);
  if (bySupplier && normalizeReceiptUnit(bySupplier.unit) === normalizeReceiptUnit(item.unit))
    return bySupplier;
  // Internal SKUs and descriptions are only review hints. Fiscal codes are
  // issuer-scoped text; padding is not proof of equivalence.
  return null;
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

async function decodeQrViaExternalApi(canvas, sessionToken) {
  const crop = createQrFooterCrop(canvas);
  const image = crop.toDataURL('image/jpeg', 0.82);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const response = await fetch('/api/qr-externo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-estoque-session': sessionToken },
      body: JSON.stringify({ image_base64: image }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Serviço externo indisponível.');
    const parsed = parseNfceQrPayload(data.url);
    if (!parsed.qrUrlPreserved || !validateNfceAccessKey(parsed.accessKey)) {
      throw new Error('O leitor externo não encontrou um QR Code fiscal válido do RS.');
    }
    return { ...parsed, qrReader: 'API externa pcelias-ctrl/nfc-e' };
  } finally {
    clearTimeout(timer);
  }
}

async function detectNfceQrCodes(canvases, rawCanvases = [], sessionToken) {
  const empty = () => ({ accessKey: '', consultaUrl: '', qrRaw: '', qrUrlPreserved: false });
  if (typeof window === 'undefined') return canvases.map(empty);
  let decodeQR = null;
  try {
    const module = await import('jsqr');
    decodeQR = module.default || module;
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
    const reference = rawCanvases[index] || canvases[index];
    // Small, capped footer crops are much faster than repeatedly scanning full photos.
    const footer = createQrFooterCrop(reference);
    const rotated = createQrFooterCrop(reference, 180);
    for (const target of [footer, rotated]) {
      if (detector) {
        try {
          for (const hit of await detector.detect(target) || []) {
            const candidate = parseNfceQrPayload(hit.rawValue);
            if (candidate.qrUrlPreserved) { found = candidate; break; }
          }
        } catch (_) {}
      }
      if (found.qrUrlPreserved) break;
      if (decodeQR) {
        try {
          const pixels = target.getContext('2d', { willReadFrequently: true })
            .getImageData(0, 0, target.width, target.height);
          const hit = decodeQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
          if (hit?.data) {
            const candidate = parseNfceQrPayload(hit.data);
            if (candidate.qrUrlPreserved || (candidate.accessKey && !found.accessKey)) found = candidate;
          }
        } catch (_) {}
      }
      if (found.qrUrlPreserved) break;
    }
    // No opt-in button: request the generic external QR decoder automatically as
    // a fallback. Only the footer crop is transmitted, not the full note.
    if (!found.qrUrlPreserved) {
      try {
        found = await decodeQrViaExternalApi(reference, sessionToken);
      } catch (error) {
        const warning = error?.message || 'Leitor QR complementar indisponível.';
        // Keep an offline recovery path when the external API times out.
        for (const target of [footer, rotated]) {
          try {
            const result = await decodeNfceQrWithZXing(target);
            if (result) {
              const candidate = parseNfceQrPayload(result);
              if (candidate.qrUrlPreserved) { found = candidate; break; }
              if (candidate.accessKey && !found.accessKey) found = candidate;
            }
          } catch (_) {}
        }
        if (!found.qrUrlPreserved) found = { ...found, qrReaderWarning: warning };
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
  return extractIssuerCnpj(text);
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
  let printedGrossTotal = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const n = normalize(line);
    if (/QTD(?:E)?\s*TOTAL|TOTAL DE ITENS|SUB[ -]?TOTAL/.test(n)) summary = true;
    const values = amountValues(line);
    if (!values.length) continue;
    if (/\bSUB[\s-]*TOTAL\b|\bVALOR\s+TOTAL\s+DOS\s+PRODUTOS\b/.test(n)) totals.subtotal = values[0];
    if (/\bDESCONTO\b/.test(n) && summary) totals.discount = values[0];
    if (/\bVALOR\s+TOTAL\b/.test(n) && !/\bVALOR\s+TOTAL\s+DOS\s+PRODUTOS\b/.test(n)) printedGrossTotal = values[0];
    if (/\bVALOR\s+A\s+PAGAR\b/.test(n)) {
      if (totals.subtotal == null && printedGrossTotal != null) totals.subtotal = printedGrossTotal;
      totals.total = values[0];
    } else if ((/\bVALOR\s*TOTAL\b|\bTOTAL\s*A\s*PAGAR\b|\bTOTAL\s*DA\s*NOTA\b/.test(n)) &&
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
  for (const [field, label] of [['subtotal', 'subtotal'], ['discount', 'desconto']]) {
    if (primary[field] != null && alternate[field] != null && Math.abs(primary[field] - alternate[field]) > 0.02)
      warnings.push('As duas leituras discordam sobre o ' + label + '.');
  }
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
      const sameName = Boolean(name && officialName) && (name === officialName || (Math.min(name.length, officialName.length) >= 7 &&
        (name.startsWith(officialName) || officialName.startsWith(name))));
      if (!sameCode && !sameName) return null;
      const totalDelta = Math.abs(receiptItemTotal(ocr) - receiptItemTotal(official));
      const qtyDelta = Math.abs(Number(ocr.quantity) - Number(official.quantity));
      return { index, sameName, rank: (sameCode ? 100 : 0) + (sameName ? 30 : 0) +
        (normalizeReceiptUnit(ocr.unit) === normalizeReceiptUnit(official.unit) ? 10 : 0) -
        Math.min(70, totalDelta * 4) - Math.min(70, qtyDelta * 10) - Math.abs(ocrIndex - index) };
    }).filter(Boolean).sort((a, b) => b.rank - a.rank);
    const index = matches.length ? matches[0].index : -1;
    const official = index >= 0 ? officialItems[index] : null;
    if (index >= 0) used.add(index);
    if (!official) return { ocr, official: null, ocrIndex,
      issues: ['Produto não encontrado na consulta.'], status: 'Item ausente na consulta' };
    const issues = [];
    if (!matches[0].sameName) issues.push('Descrição diferente ou ausente');
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

async function prepareReceiptCanvases(file, { splitReceipts = true } = {}) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  // Only segmentation needs a small preview; the final QR and OCR crops still
  // sample the original photo for maximum character/module sharpness.
  const previewScale = Math.min(1, 1600 / originalWidth, 3200 / originalHeight);
  const width = Math.max(1, Math.round(originalWidth * previewScale));
  const height = Math.max(1, Math.round(originalHeight * previewScale));
  const ratioX = originalWidth / width;
  const ratioY = originalHeight / height;
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
  if (twoReceipts && splitReceipts) segments.push([0, seam], [seam, width]);
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
    qrCanvas.getContext('2d').drawImage(image, sx * ratioX, y0 * ratioY, sw * ratioX, qrHeight * ratioY, 0, 0, scaledWidth, qrScaledHeight);
    qrCrops.push(qrCanvas);

    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, sx * ratioX, y0 * ratioY, sw * ratioX, ocrHeight * ratioY, 0, 0, scaledWidth, scaledHeight);
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


function fiscalDocumentAuthorText(document) {
  if (document?.checkedByVerified === true && document.checkedBy) return 'Conferido e lançado por ' + document.checkedBy;
  if (document?.checkedBy) return 'Autoria legada não verificada: ' + document.checkedBy;
  return 'Autoria não informada';
}

export default function Home() {
  const [supabase] = useState(() => HAS_SUPABASE_CONFIG ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);
  const [accessCode, setAccessCode] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const authenticatedReviewerName = currentUser?.display_name || currentUser?.username || 'Usuário autenticado';
  const pendingAttributionRef = useRef(new Map());
  const [activeTenantName,setActiveTenantName]=useState('');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [fiscalPermissions,setFiscalPermissions]=useState(null);
  const [permissionUsers,setPermissionUsers]=useState([]);
  const [permissionBusy,setPermissionBusy]=useState(false);
  const [permissionError,setPermissionError]=useState('');
  const fiscalKeys=[
    ['fiscal.pending.read','Notas fiscais','Visualizar notas pendentes'],
    ['fiscal.pending.create','Notas fiscais','Importar nota'],
    ['fiscal.pending.review','Notas fiscais','Conferir e lançar nota'],
    ['fiscal.pending.cancel','Notas fiscais','Cancelar nota pendente (somente gestor)']
  ];
  const canFiscal=(key)=>fiscalPermissions?.[key]===true;
  async function changeFiscalPermission(user,key,allowed) {
    if(!supabase||!accessCode||currentUser?.role!=='admin'||permissionBusy)return;
    setPermissionBusy(true);setPermissionError('');
    try {
      const {data,error}=await supabase.rpc('inventory_permission_set',{
        p_token:accessCode,p_user_id:user.id,p_key:key,p_allowed:allowed
      });
      if(error||!data?.ok)throw new Error(error?.message||'Permissão não foi salva.');
      const result=await supabase.rpc('inventory_permissions_list',{p_token:accessCode});
      if(result.error||!result.data)throw new Error('Salvo, mas não foi possível atualizar a lista.');
      setFiscalPermissions(result.data.self||{});
      setPermissionUsers(result.data.users||[]);
      setToast('Permissão atualizada e registrada na auditoria.');
    }catch(e){setPermissionError(e?.message||'Erro ao salvar permissão.');}
    finally{setPermissionBusy(false);}
  }
  const [menuOpen,setMenuOpen]=useState(false);
  const [navCollapsed,setNavCollapsed]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
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
  const [historyFilters, setHistoryFilters] = useState({ from: '', to: '', supplier: '', author: '' });
  const [suppliers, setSuppliers] = useState([]);
  const [supplierIdentityLinks, setSupplierIdentityLinks] = useState([]);
  const [pendingReceipts,setPendingReceipts]=useState([]);
  const [pendingBusy,setPendingBusy]=useState(false);
  const [pendingSaveError,setPendingSaveError]=useState('');
  const [pendingSaveErrorById,setPendingSaveErrorById]=useState({});
  const [pendingConfirmRequested,setPendingConfirmRequested]=useState(null);
  const pendingSaveSerial=useRef(Promise.resolve());
  const pendingMarking=useRef(new Set());
  const pendingFingerprints=useRef(new Map());
  const pendingRevisions=useRef(new Map());

  const [closings,setClosings]=useState([]);
  const [cashReports,setCashReports]=useState([]);
  const [cashReportActive,setCashReportActive]=useState(null);
  const [cashReportProgress,setCashReportProgress]=useState(null);
  const [cashReportErrors,setCashReportErrors]=useState({});
  const [cashReportPreview,setCashReportPreview]=useState(null);
  const cashReportIdempotencyRef=useRef(new Map());
  const [cashEditId,setCashEditId]=useState('');
  const [cashSaving,setCashSaving]=useState(false);
  const cashSavingRef=useRef(false);
  const [cashEntryMode,setCashEntryMode]=useState(''); // '', upload, manual, edit
  const [cashImporting,setCashImporting]=useState(false);
  const [cashImportText,setCashImportText]=useState('');
  const [cashImportAlternativeText,setCashImportAlternativeText]=useState('');
  const [cashImportWarnings,setCashImportWarnings]=useState([]);
  const cashFileRef=useRef(null);
  const [cashError,setCashError]=useState('');
  const [cashMonth,setCashMonth]=useState(new Date().toISOString().slice(0,7));
  const [cashChartScope,setCashChartScope]=useState('month');
  const [cashSelectedDay,setCashSelectedDay]=useState('');
  const [cashSelectedClosingId,setCashSelectedClosingId]=useState('');
  const [cashAuditHistory,setCashAuditHistory]=useState([]);
  const [cashAuditLoading,setCashAuditLoading]=useState(false);
  const cashCorrectionContextRef=useRef(null);
  const [cashHighlightedDay,setCashHighlightedDay]=useState('');
  const [cashForm,setCashForm]=useState({
    day:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),register:'003',operator:'',
    cartaoCredito:'0',cartaoDebito:'0',credito:'0',debito:'0',outras:'0',
    dinheiroVendas:'0',cashCounted:'',cashReviewed:false,movements:[]
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
  const [draft, setDraftState] = useState(null);
  const setDraft = (updater) => setDraftState((previous) =>
    normalizeFiscalDraftReview(
      prepareFiscalIdentity(typeof updater === 'function' ? updater(previous) : updater, previous, products, documents, suppliers),
      previous,
      () => typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID() : 'line-' + uid()
    )
  );
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
  const [pendingPreview, setPendingPreview] = useState(null);
  const pendingPreviewUrlRef = useRef('');
  const [error, setError] = useState('');
  const errorAlertRef = useRef(null);
  const firstFiscalFieldRef = useRef(null);
  const focusDraftOnOpenRef = useRef(false);
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
  const sessionRevokedRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const receiptOcrWorkerRef = useRef(null);
  const receiptPaddleOcrRef = useRef(null);

  async function runPaddleOcr(canvas) {
    if (!receiptPaddleOcrRef.current) {
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      receiptPaddleOcrRef.current = await PaddleOCR.create({
        lang: 'pt',
        ocrVersion: 'PP-OCRv6',
        worker: true,
        textDetectionModelAsset: {
          url: `${window.location.origin}/ocr-models/PP-OCRv6_small_det_onnx_infer.tar`
        },
        textRecognitionModelAsset: {
          url: `${window.location.origin}/ocr-models/PP-OCRv6_small_rec_onnx_infer.tar`
        },
        ortOptions: { backend: 'wasm', numThreads: 1, simd: true }
      });
    }
    const [result] = await receiptPaddleOcrRef.current.predict(canvas);
    return (result?.items || []).map((item) => item.text).filter(Boolean).join('\n');
  }

  useEffect(() => {
    if(error) errorAlertRef.current?.focus();
  },[error]);
  useEffect(() => {
    if(!draft || !focusDraftOnOpenRef.current) return;
    focusDraftOnOpenRef.current=false;
    requestAnimationFrame(()=>firstFiscalFieldRef.current?.focus());
  },[draft?.pendingId,draft?.fileName]);
  const receiptOcrProgressRef = useRef({ index: 0, count: 1, pass: 0 });
  const uploadRef = useRef(null);

  // Reconcile the accessibility changes from PR #24 without changing fiscal
  // business rules. Closing is blocked across all controls during a delete.
  const activeDialog = cashReportPreview ? 'cash-report-preview' : mergePair ? 'merge' : detailDoc ? 'details' : pendingPreview ? 'pending-preview' :
    view === 'cash' && cashSelectedDay ? 'cash-day' :
    (modal === 'product' || modal === 'adjust' ? modal : '');
  useAccessibleDialog(activeDialog, () => {
    if (pendingPreview) {
      closePendingPreview();
    } else if (mergePair) {
      if (!mergeBusy) setMergePair(null);
    } else if (cashReportPreview) {
      setCashReportPreview(null);
    } else if (detailDoc) {
      if (!deletingDocId) { setDetailDoc(null); setDeleteError(''); }
    } else if (view === 'cash' && cashSelectedDay) {
      setCashSelectedDay('');
      setCashSelectedClosingId('');
    } else {
      setModal('');
    }
  });

  async function loadSharedInventory(token) {
    if (!supabase || !token) return false;
    const membership = await supabase.rpc('inventory_tenants', { p_token: token });
    if (membership.error || !membership.data?.user) {
      setAccessGranted(false); setDataReady(false); setAccessCode(''); setCurrentUser(null);
      setAccessMessage('Não foi possível validar os acessos da conta. Entre novamente.');
      try { sessionStorage.removeItem('projeto-gpt-session'); } catch (_) {}
      return false;
    }
    const identity = membership.data.user;
    const selectedTenant = (membership.data.tenants||[]).find(tenant=>tenant.id===membership.data.activeTenantId);
    setActiveTenantName(selectedTenant?.name||'');
    const passwordRequired = Boolean(membership.data.mustChangePassword);
    setMustChangePassword(passwordRequired);
    setCurrentUser(identity);
    if (passwordRequired || identity.role === 'superadmin') {
      setProducts([]); setDocuments([]); setMovements([]); setPendingReceipts([]); setClosings([]);
      setAccessCode(token); setAccessGranted(true); setDataReady(true); setLoaded(true);
      try { sessionStorage.setItem('projeto-gpt-session', token); } catch (_) {}
      return true;
    }
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
    setSuppliers(Array.isArray(state.suppliers) ? state.suppliers : []);
    const { data: identityLinks } = await supabase.rpc('supplier_identity_links', { p_token: token });
    setSupplierIdentityLinks(Array.isArray(identityLinks) ? identityLinks : []);
    const {data:pending,error:pendingError}=await supabase.rpc('pending_receipts_list',{p_token:token});
    if(!pendingError&&Array.isArray(pending))setPendingReceipts(pending);

    const {data:cashList,error:cashLoadError}=await supabase.rpc('cash_closings_list',{p_token:token});
    if(!cashLoadError && Array.isArray(cashList)) setClosings(cashList);
    const {data:reportList,error:reportLoadError}=await supabase.rpc('cash_reports_list',{p_token:token});
    if(!reportLoadError && Array.isArray(reportList)) setCashReports(reportList);
    setStockCounts(Array.isArray(state.stockCounts)?state.stockCounts:[]);
    const schedule={...COUNT_DEFAULTS,...(state.countSettings||{})};
    setCountSettings(schedule);setSettingsForm(schedule);
    setCurrentUser(state.user || null);
    const permissionsResult=await supabase.rpc('inventory_permissions_list',{p_token:token});
    if(!permissionsResult.error && permissionsResult.data?.self) {
      setFiscalPermissions(permissionsResult.data.self);
      setPermissionUsers(permissionsResult.data.users||[]);
    } else {
      // Fail closed until the access-permissions migration is installed.
      setFiscalPermissions({});
      setPermissionUsers([]);
    }
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
        let logoutNotice='';
        try {
          logoutNotice=sessionStorage.getItem('projeto-gpt-session-message')||'';
          sessionStorage.removeItem('projeto-gpt-session-message');
        } catch (_) {}
        setAccessMessage(logoutNotice);
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
        if (Array.isArray(state.suppliers)) setSuppliers(state.suppliers);
        if (Array.isArray(state.stockCounts)) setStockCounts(state.stockCounts);
        if (state.countSettings){setCountSettings(state.countSettings);setSettingsForm(state.countSettings);}
      }
    } catch (_) {}
    setLoaded(true);
    setDataReady(true);
  }, [supabase]);

  // Session revocation is enforced on every RPC by the database. This
  // watcher only changes the UI state and clears the local token promptly.
  // No Realtime grants and no private tables are exposed to the browser.
  useEffect(() => {
    if (!supabase || !accessCode || !accessGranted || currentUser?.role==='superadmin') return;
    let live=true;
    let pending=false;
    sessionRevokedRef.current=false;
    async function verifySession() {
      if (!live || pending || sessionRevokedRef.current || document.hidden) return;
      pending=true;
      try {
        const {data,error}=await supabase.rpc('inventory_validate_session',{
          p_session_token:accessCode
        });
        if (!live || sessionRevokedRef.current) return;
        if (sessionHealth({data,error}) === 'revoked') {
          // Mark synchronously before triggering any state changes/re-render.
          sessionRevokedRef.current=true;
          try {
            sessionStorage.removeItem('projeto-gpt-session');
            sessionStorage.removeItem('projeto-gpt-access');
            sessionStorage.setItem('projeto-gpt-session-message',
              'Sua sessão foi encerrada ou sua conta foi desativada. Entre novamente.');
          } catch (_) {}
          setAccessGranted(false);
          setDataReady(false);
          setAccessCode('');
          setCurrentUser(null);
          setDraft(null);
          setDraftQueue([]);
          setSaveStatus('');
          // A full reload destroys stale timers and in-flight component state.
          window.location.replace(window.location.pathname + window.location.search);
        }
      } catch (_) {
        // Offline is not proof of deactivation. The server independently
        // rejects all mutations with an inactive/revoked token.
      } finally { pending=false; }
    }
    const timer=window.setInterval(verifySession,SESSION_CHECK_INTERVAL_MS);
    const onFocus=()=>{void verifySession();};
    const onVisible=()=>{if (!document.hidden) void verifySession();};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    void verifySession();
    return ()=>{
      live=false;
      window.clearInterval(timer);
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[supabase,accessCode,accessGranted,currentUser?.role]);

  useEffect(() => {
    if (!loaded || supabase) return;
    try { localStorage.setItem('projeto-gpt-stock-v1', JSON.stringify({ products, movements, documents, suppliers, stockCounts, countSettings })); } catch (_) {}
  }, [loaded, products, movements, documents, suppliers, stockCounts, countSettings, s…34909 tokens truncated…y={p.id}>
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
            <summary><span><b>{s.name}</b><small>{s.cnpj ? 'CNPJ ' + s.cnpj : 'Sem CNPJ identificado'} · {s.identityStatus} · {s.documents.length} nota(s) · {s.items} linha(s) de produtos</small></span><strong>{money(s.total)}</strong></summary>
            <div className="supplier-documents">{s.documents.map((d, i) => <div className="supplier-document" key={d.id || i}>
              <div className="supplier-document-head"><b>{d.invoiceNumber ? 'Nota nº ' + d.invoiceNumber : d.fileName || 'Documento fiscal'}</b><span>{d.date || d.importedAt || 'Sem data'} · {money(d.total ?? (d.items || []).reduce((sum,item)=>sum + Number(item.lineTotal || item.unitPrice*item.quantity || 0),0))}</span></div>
              {!validSupplierCnpj(d.supplierCnpj) && !d.supplierId && !supplierIdentityLinks.some((link) => String(link.documentId) === String(d.id)) && <label className="supplier-identity-review"><span>Identidade não confirmada. Revise antes de agrupar este histórico.</span><select value="" aria-label={`Vincular nota ${d.invoiceNumber || d.fileName || ''} a um fornecedor validado`} onChange={(event) => { const supplierId = event.target.value; if (supplierId) void linkLegacySupplier(d, supplierId); }}><option value="">Revisar vínculo com fornecedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {formatSupplierCnpj(supplier.cnpj)}</option>)}</select></label>}
              <ul>{(d.items || []).map((it,j) => <li key={j}><span>{it.name} <small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><b>{money(it.lineTotal ?? Number(it.quantity)*Number(it.unitPrice))}</b></li>)}</ul>
            </div>)}</div>
          </details>)}
          {!supplierGroups.length && <div className="empty-docs">Ainda não há compras registradas. Os fornecedores aparecerão após lançar notas fiscais.</div>}
          {supplierGroups.length > 0 && !supplierGroups.some((s)=>norm(s.name+' '+s.cnpj).includes(norm(supplierFilter))) && <div className="empty-docs">Nenhum fornecedor encontrado para esta busca.</div>}
        </section>}

        {view === 'permissions' && currentUser?.role==='admin' && <section className="panel" style={{padding:20}}>
          <h2>Permissões por usuário</h2>
          <p>As operações fiscais são verificadas no banco a cada chamada. Cancelar nota continua exclusivo de contas gestoras.</p>
          {permissionError&&<div className="notice" role="alert">{permissionError}</div>}
          {!permissionUsers.length&&<div className="notice" role="alert">Nenhum usuário carregado. Verifique se a migração db/access-permissions.sql foi aplicada antes de db/pending-receipts.sql.</div>}
          {permissionUsers.map(user=><div key={user.id} style={{borderTop:'1px solid #ddd',padding:'14px 0'}}>
            <b>{user.name}</b> <small>({user.username} · {user.role==='admin'?'Gestor':'Funcionário'}{user.active?'':' · Inativo'})</small>
            {fiscalKeys.map(([key,module,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:10,marginTop:10}}>
              <input type="checkbox" checked={user.permissions?.[key]===true}
                disabled={permissionBusy||!user.active||(key==='fiscal.pending.cancel'&&user.role!=='admin')}
                onChange={e=>void changeFiscalPermission(user,key,e.target.checked)}/>
              <span><small>{module} / </small>{label}</span>
            </label>)}
          </div>)}
        </section>}
        {view === 'documents' && canFiscal('fiscal.pending.read') && <>
<section className="document-banner"><span className="banner-art"><Icon type="file" size={28}/></span><div className="banner-copy"><h2>Da nota fiscal para o estoque</h2><p>Selecione um ou vários arquivos XML, fotos ou PDFs de uma vez. O sistema processa cada arquivo e organiza as notas em sequência para revisão antes de lançar. PDFs ainda exigem preenchimento manual.</p><div className="feature-tags"><span><Icon type="check" size={14}/>XML de NF-e</span><span><Icon type="image" size={14}/>Foto ou PDF</span><span><Icon type="check" size={14}/>Conferência antes de lançar</span></div>
            <div className="notice document-privacy-note" role="note"><span><b>Privacidade do QR Code:</b> o sistema tenta ler o código localmente. Se não conseguir, <b>envia automaticamente um recorte da região inferior da nota a um serviço de terceiros</b> (<a href="https://nfc.kopilot.food/" target="_blank" rel="noopener noreferrer">nfc.kopilot.food ↗</a>). Esse recorte pode incluir dados fiscais e pessoais próximos ao QR. A conferência permanece obrigatória antes do lançamento. O PP-OCRv6 baixa somente os pesos públicos do modelo; o documento é processado no navegador e não é enviado ao servidor do modelo.</span></div>
          </div><div className="manual-top-actions"><button className="btn secondary" type="button" disabled={busy} onClick={openManualEntry}><Icon type="plus" size={17}/>Entrada manual</button><button className="btn secondary" type="button" disabled={busy || manualMode || Boolean(draft)} onClick={startManualInvoice}><Icon type="file" size={17}/>Cadastrar nota manualmente</button>{canFiscal('fiscal.pending.create')&&<button className="btn primary" disabled={busy || manualMode} onClick={() => uploadRef.current?.click()}><Icon type="upload" size={17}/>Selecionar arquivos</button>}</div></section>
          {busy && uploadBatchProgress && <section className="panel fiscal-upload-progress" aria-labelledby="fiscal-upload-progress-title">
            <div className="fiscal-upload-progress-head">
              <h2 id="fiscal-upload-progress-title">Arquivos sendo processados</h2>
              <strong>{uploadBatchProgress.completed} de {uploadBatchProgress.total} · {Math.round(100*uploadBatchProgress.completed/Math.max(1,uploadBatchProgress.total))}%</strong>
            </div>
            <progress value={uploadBatchProgress.completed} max={Math.max(1,uploadBatchProgress.total)} aria-label="Arquivos fiscais concluídos"/>
            <div className="fiscal-upload-current" role="status" aria-live="polite" aria-atomic="true">
              <span className="fiscal-upload-current-file"><b>Arquivo atual:</b> {uploadBatchProgress.fileName || 'Preparando arquivos…'}</span>
              <span>{processingType==='xml' ? 'Lendo XML e identificando itens…' : 'Reconhecendo texto da imagem' + (ocrProgress ? ' — OCR '+ocrProgress+'%' : ' — preparando OCR…')}</span>
              {uploadBatchProgress.failed>0&&<strong className="fiscal-upload-failures">{uploadBatchProgress.failed} {uploadBatchProgress.failed===1?'falha':'falhas'}</strong>}
            </div>
          </section>}
          <section className="panel pending-documents-panel">
            <div className="panel-head"><div><h2>Notas aguardando conferência</h2><p>Originais e OCR salvos no servidor. Você pode fechar a página e retomar depois.</p></div><span className="history-count">{pendingReceipts.length} pendente(s)</span></div>
            {pendingSaveError&&<div className="notice" role="alert">⚠ {pendingSaveError}</div>}
            {pendingBusy&&<small>Salvando conferência no servidor…</small>}
            {pendingReceipts.length?pendingReceipts.map(row=><div className="history-row" key={row.id}>
              <span className="history-file"><Icon type="file" size={18}/></span>
              <span className="history-copy"><b>{row.draft?.supplier||row.fileName}</b><small>{row.fileName} · {row.draft?.items?.length||0} itens · {row.draft?.invoiceNumber||'Sem número'} · pendente</small></span>
              <button className="btn secondary" type="button" onClick={()=>void viewPendingOriginal(row)}>Visualizar arquivo</button>
              {canFiscal('fiscal.pending.review')&&<button className="btn primary" type="button" onClick={()=>void openPendingReceipt(row)}>Conferir</button>}
              {row.canCancel&&<button className="btn secondary" type="button"
                style={{color:'#a33'}} onClick={()=>void cancelPendingReceipt(row)}>Cancelar NF</button>}
            </div>):<div className="empty-docs">Nenhuma nota aguardando conferência.</div>}
          </section>
          {error && <div ref={errorAlertRef} className="error" role="alert" tabIndex={-1}><Icon type="alert" size={18}/><span>{error}</span><button type="button" aria-label="Dispensar erro" onClick={() => setError('')}><Icon type="close" size={16}/></button></div>}
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
            {draftBatch && <div className="notice" style={{marginTop:14}}>Cupom {draftBatch.current} de {draftBatch.total}. Confirme esta entrada para revisar o próximo documento da seleção.</div>}
            {draft.qrReaderWarning && <div className="notice qr-reader-warning" role="status">Leitura complementar do QR Code: {draft.qrReaderWarning} O OCR permanece disponível para conferência.</div>}
            {draft.keyWarning && !draft.accessKey && <div className="notice qr-key-warning" role="alert">
              <b>Chave da NFC-e não validada.</b> {draft.keyWarning}
              {draft.ocrText && <label className="field qr-key-invalid-edit"><span>Corrigir chave de acesso</span><input inputMode="numeric" maxLength={44} value={draft.accessKeyInput ?? draft.accessKey ?? ''} onChange={(e) => changeNfceAccessKey(e.target.value)} placeholder="44 dígitos da chave"/></label>}
            </div>}
            {(draft.accessKey || draft.consultaUrl) && <div className="notice qr-identified-card" role="region" aria-label="Identificação fiscal da nota">
              <div className="qr-identified-content">
                <div className="qr-identified-title"><Icon type="check" size={17}/><b>{draft.qrDetected ? 'QR Code identificado' : 'Chave fiscal identificada'}</b></div>
                {draft.accessKey ? <code className="qr-identified-key">{draft.accessKey}</code> : <span>QR Code encontrado com endereço de consulta.</span>}
                {draft.qrReader?.includes('API externa') ? <small>QR Code obtido pela API externa <a href="https://github.com/pcelias-ctrl/nfc-e" target="_blank" rel="noopener noreferrer">pcelias-ctrl/nfc-e ↗</a>.</small> :
                  draft.qrReader ? <small>Origem da leitura: {draft.qrReader} (leitura local, sem API externa).</small> :
                  <small>Chave obtida pelo reconhecimento do documento; confira com a nota original.</small>}
                {draft.ocrText && <details className="qr-key-correction">
                  <summary>Chave incorreta? Corrigir</summary>
                  <label className="field"><span>Chave de acesso (44 dígitos)</span><input inputMode="numeric" maxLength={44} value={draft.accessKeyInput ?? draft.accessKey ?? ''} onChange={(e) => changeNfceAccessKey(e.target.value)} placeholder="44 dígitos da chave"/></label>
                </details>}
              </div>
              <div className="qr-identified-actions">
                {draft.accessKey && <button type="button" className="btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(draft.accessKey); setToast('Chave de acesso copiada.'); } catch (_) { setToast('Selecione e copie a chave exibida para colá-la na consulta pública.'); } }}>Copiar chave</button>}
                {draft.consultaUrl && <a href={draft.consultaUrl} target="_blank" rel="noopener noreferrer" className="btn secondary">{draft.qrUrlPreserved ? 'Abrir consulta do QR Code ↗' : 'Abrir consulta pública ↗'}</a>}
              </div>
            </div>}
            {draft.consultaUrl && <section className="panel" style={{marginTop:14,background:'#fbfcf9'}}>
              <div className="panel-head"><div><h2>Conferência automática com a SEFAZ/SVRS</h2><p>O sistema tenta abrir a página oficial no servidor e comparar os itens automaticamente com o OCR. Os itens oficiais são adotados por padrão e exigem conferência antes do lançamento.</p></div></div>
              <div className="notice" role="status" style={{marginTop:10}}>{draft.officialStatus || 'Aguardando consulta automática…'}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
                <button type="button" className="btn primary" onClick={() => void consultOfficialAutomatically(draft.consultaUrl, draft.accessKey)}>Consultar e comparar novamente</button>
                <a href={draft.consultaUrl} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{textDecoration:'none'}}>Abrir consulta oficial ↗</a>
                {draft.officialItems?.length > 0 && <button type="button" className="btn secondary" onClick={applyOfficialItems}>Usar itens da consulta pública</button>}
              </div>
              {draft.officialItems?.length > 0 && <><div className="notice" style={{marginTop:12}}>Itens encontrados na consulta: {draft.officialItems.length}. Os itens oficiais são usados por padrão. Revise antes de lançar.{draft.officialTotal !== null && draft.officialTotal !== undefined ? <span style={{display:'block',marginTop:6}}>Total na consulta: <b>{money(draft.officialTotal)}</b>{draft.officialDiscount !== null && draft.officialDiscount !== undefined ? ' · Desconto: ' + money(draft.officialDiscount) : ''}</span> : null}</div><div className="table-wrap review-table" style={{marginTop:10}}><table><thead><tr><th>ITEM NO OCR</th><th>VALOR OCR</th><th>ITEM NA CONSULTA</th><th>VALOR OFICIAL</th><th>RESULTADO</th></tr></thead><tbody>{officialComparison.map((row, index) => <tr key={index}><td>{row.ocr ? <><b>{row.ocr.name}</b><small style={{display:'block'}}>{qty(row.ocr.quantity)} {row.ocr.unit} × {money(row.ocr.unitPrice)}</small></> : '—'}</td><td>{row.ocr ? money(receiptItemTotal(row.ocr)) : '—'}</td><td>{row.official ? <><b>{row.official.name}</b><small style={{display:'block'}}>{qty(row.official.quantity)} {row.official.unit} × {money(row.official.unitPrice)}</small></> : '—'}</td><td>{row.official ? money(receiptItemTotal(row.official)) : '—'}</td><td><span className={row.status === 'Confere' ? 'status ok-status' : 'status low-status'}><i/>{row.status}</span></td></tr>)}</tbody></table></div></>}
            </section>}
            {draft.ocrComparison && <details className="ocr-text-details ocr-comparison">
              <summary>Comparar leituras OCR lado a lado</summary>
              <p>As duas colunas são candidatos locais. Divergências precisam ser conferidas na imagem antes de lançar.</p>
              {draft.ocrComparison.warning&&<div className="notice" role="status">{draft.ocrComparison.warning}</div>}
              <div className="ocr-comparison-grid">
                <section><h3>Tesseract · leitura atual</h3><pre>{draft.ocrComparison.tesseract||'Sem texto reconhecido.'}</pre></section>
                <section><h3>PP-OCRv6 · leitura alternativa</h3><pre>{draft.ocrComparison.paddle||draft.ocrComparison.warning||'Sem texto reconhecido.'}</pre></section>
              </div>
              {draft.ocrComparison.paddle&&<button className="btn secondary" type="button" onClick={usePaddleReceiptOcr}>Preencher campos com PP-OCRv6 para conferir</button>}
            </details>}
            {!draft.ocrComparison&&draft.ocrText&&<details className="ocr-text-details"><summary>Texto reconhecido na foto (conferência)</summary><pre>{draft.ocrText}</pre></details>}
            <section className="invoice-document-details" aria-label="Dados do fornecedor e da nota">
              <div className="invoice-document-heading"><h3>Dados do fornecedor e da nota</h3><p>Confira a identificação do documento antes de revisar os produtos.</p></div>
            <div className="meta-fields"><label><span>Fornecedor</span><input ref={firstFiscalFieldRef} value={draft.supplier} onChange={(e) => changeDraft('supplier', e.target.value)} placeholder="Nome do fornecedor"/></label><label><span>CNPJ do emitente (opcional)</span><input value={formatSupplierCnpj(draft.supplierCnpj||'')} onChange={(e)=>changeDraft('supplierCnpj',formatSupplierCnpj(e.target.value))} placeholder="14 dígitos" inputMode="text"/></label><label><span>Número do documento</span><input value={draft.invoiceNumber} onChange={(e) => changeDraft('invoiceNumber', e.target.value)} placeholder="Ex.: 000123"/></label><label><span>Data de emissão</span><input value={draft.date} onChange={(e) => changeDraft('date', e.target.value)} placeholder="Data, se disponível"/></label></div>
            </section>

            <div className="notice" style={{marginTop:12,background:'#fffbeb',borderLeft:'4px solid #c58a24'}}>
              <b>Conferência do encarregado</b> — campos em amarelo precisam ser confrontados com a nota antes do lançamento.
              {officialMissing > 0 && <span style={{display:'block',marginTop:6,color:'#9a3412'}}>A consulta contém {officialMissing} produto(s) ainda ausente(s) na tabela. Revise-os: o lançamento exigirá confirmação adicional.</span>}
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
                  return <tr key={it.lineId || i} style={{background: attention ? '#fffbeb' : undefined, borderLeft: attention ? '3px solid #c58a24' : undefined}}>
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
                    </div> : <><input className="inline-input name-field" style={fieldStyle('produto')} value={it.name} onChange={(e) => changeItem(i, 'name', e.target.value)} placeholder="Nome do produto"/>{it.originalName && it.originalName !== it.name && <small className="fiscal-code-note">Descrição original: {it.originalName}</small>}{it.code && <small className="fiscal-code-note">Código fiscal: {it.code} (normalizado: {normalizeProductCode(it.code)})</small>}</>}</td>
                    <td><input className="inline-input small-field review-qty" aria-label={'Quantidade de ' + it.name} style={fieldStyle('quantidade')} type="number" min="0.001" step="any" value={it.quantity} onChange={(e) => changeItem(i, 'quantity', e.target.value)}/></td>
                    <td><input className="inline-input unit-field" style={fieldStyle('unidade')} value={it.unit} readOnly={Boolean(draft.manualInvoice)} onChange={(e) => changeItem(i, 'unit', e.target.value)}/></td>
                    <td><input className="inline-input small-field review-money" aria-label={'Custo unitário de ' + it.name} style={fieldStyle('preço')} type="number" min="0" step="any" value={it.unitPrice} onChange={(e) => changeItem(i, 'unitPrice', e.target.value)}/></td>
                    <td><input className="inline-input small-field review-money" style={fieldStyle('total')} type="number" min="0" step="0.01" aria-label={'Total da linha: ' + it.name} value={receiptItemTotal(it)} readOnly/>{it.reportedLineTotal !== undefined && Math.abs(receiptItemTotal(it)-Number(it.reportedLineTotal)) > 0.005 && <small className="fiscal-code-note">Total lido: {money(it.reportedLineTotal)}</small>}{Number(it.itemDiscount || 0) > 0 && <small style={{display:'block',fontSize:11}}>Desconto da linha: {money(it.itemDiscount)}</small>}</td>
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
                    <td className="review-check-cell">
                      {review.requiresReview ? <div className="review-check-row">
                        <label className="review-check-label">
                          <input type="checkbox" checked={Boolean(draft.reviewedItems?.[it.lineId])}
                            onChange={(e) => setDraft((d) => ({ ...d, finalReviewed:false, reviewedItems: { ...(d.reviewedItems || {}), [it.lineId]: e.target.checked } }))}/>
                          <span>Conferido pelo encarregado</span>
                        </label>
                        <ReviewIssuePopover issues={review.issues} productName={it.name} index={i} reviewed={review.done}/>
                      </div> : <span className="review-okay">✓ Dados consistentes</span>}
                    </td>
                    <td><button className="delete-line" aria-label={'Remover ' + (it.name || 'item') + ' da nota'} title="Remover item" onClick={() => setDraft((d) => ({
                      ...d, lineTotalsEdited:true, subtotalManuallyEdited:false,
                      reportedSubtotal:d.reportedSubtotal ?? d.subtotal, reportedTotal:d.reportedTotal ?? d.total,
                      items: d.items.filter((_, j) => j !== i), reviewedItems: d.reviewedItems,
                      finalReviewed: false, officialVerified: false
                    }))}><Icon type="close" size={15}/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="meta-fields" style={{marginTop:16}}>
              <label><span>Subtotal fiscal (R$) {totalsRequireReview ? '⚠ Conferir' : ''}</span><input style={{background: totalsRequireReview ? '#fffbeb' : undefined}} type="number" min="0" step="0.01" value={draftSubtotal} onChange={(e) => changeInvoiceAmount('subtotal', e.target.value)}/></label>
              <label><span>Desconto total (R$) {totalsRequireReview ? '⚠ Conferir' : ''}</span><input style={{background: totalsRequireReview ? '#fffbeb' : undefined}} type="number" min="0" step="0.01" value={draftDiscount} onChange={(e) => changeInvoiceAmount('discount', e.target.value)}/></label>
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
            <div className="review-bottom"><button className="btn secondary" onClick={() => setDraft((d) => ({ ...d, lineTotalsEdited:true, subtotalManuallyEdited:false, reportedSubtotal:d.reportedSubtotal ?? d.subtotal, reportedTotal:d.reportedTotal ?? d.total, reviewedItems:{}, finalReviewed:false, officialVerified:false, items: [...d.items, { name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0, lineTotal: 0, search:'' }] }))}><Icon type="plus" size={16}/>Adicionar item</button><div className="review-sum"><span>Total da nota</span><b>{money(draftTotal)}</b></div></div>
            <section className={'review-final-confirmation' + (readyForFinalReview ? ' is-ready' : ' is-pending')}>
              <div className="review-final-heading"><Icon type={readyForFinalReview ? 'check' : 'alert'} size={19}/><div><b>Conferência final</b><p>{readyForFinalReview ? (totalsRequireReview ? 'Revise os itens, totais e divergências sinalizadas antes da confirmação final.' : 'Itens revisados. Identifique quem realizou a verificação.') : 'Conclua a revisão dos itens destacados para habilitar a confirmação final.'}</p></div></div>
              <div className="review-final-fields">
                <label className="review-final-checkbox"><input type="checkbox" disabled={!readyForFinalReview} checked={Boolean(draft.finalReviewed && readyForFinalReview)} onChange={(e) => setDraft((d) => ({ ...d, finalReviewed:e.target.checked }))}/><span>{totalsRequireReview ? 'Conferi o documento, inclusive os totais e divergências sinalizadas, e autorizo a entrada no estoque.' : 'Conferi todo o documento e autorizo a entrada no estoque.'}</span></label>
                <label className="field review-final-person"><span>Usuário autenticado</span><input value={authenticatedReviewerName} readOnly aria-readonly="true"/></label>
              </div>
            </section>
            <div className="caution"><Icon type="alert" size={18}/><p><b>Confira antes de continuar.</b> Ao confirmar, as quantidades serão somadas ao saldo atual. Produtos com nome igual serão associados ao cadastro existente.</p></div>
            <div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');}}>Cancelar</button><button className="btn primary" disabled={busy || Boolean(pendingConfirmRequested)} onClick={confirmDocument}><Icon type="check" size={17}/>{pendingConfirmRequested?.id===draft.pendingId?'Salvando conferência…':'Confirmar entrada no estoque'}</button></div>{pendingConfirmRequested?.id===draft.pendingId&&<small role="status" aria-live="polite">Aguardando confirmação do servidor antes de lançar esta nota.</small>}
          </section>}
          <section className="panel history-panel">
            <div className="panel-head"><div><h2>Histórico de documentos</h2><p>Notas lançadas no estoque.</p></div><span className="history-count">{filteredHistoryDocuments.length} de {documents.length}</span></div>
            <div className="history-filters" aria-label="Filtros do histórico">
              <label>Data do documento (fuso local)<span><input type="date" value={historyFilters.from} onChange={(event)=>setHistoryFilters((current)=>({...current,from:event.target.value}))} aria-label="Data inicial do documento"/><span aria-hidden="true">até</span><input type="date" value={historyFilters.to} onChange={(event)=>setHistoryFilters((current)=>({...current,to:event.target.value}))} aria-label="Data final do documento"/></span></label>
              <label>Fornecedor ou CNPJ<input type="search" value={historyFilters.supplier} onChange={(event)=>setHistoryFilters((current)=>({...current,supplier:event.target.value}))} placeholder="Buscar no texto disponível" aria-label="Filtrar por fornecedor ou CNPJ"/></label>
              <label>Autor ou situação<input type="search" value={historyFilters.author} onChange={(event)=>setHistoryFilters((current)=>({...current,author:event.target.value}))} placeholder="Nome, legado ou não informado" aria-label="Filtrar por autor ou situação da autoria"/></label>
              <button type="button" className="btn secondary history-clear" onClick={()=>setHistoryFilters({from:'',to:'',supplier:'',author:''})} disabled={!historyFilters.from&&!historyFilters.to&&!historyFilters.supplier&&!historyFilters.author}>Limpar filtros</button>
            </div>
            <p className="history-filter-note">A data e o fornecedor usam somente os valores já salvos no documento. Filtro por data/hora real de lançamento e vínculo canônico de fornecedor aguardam campos validados pelo servidor. A autoria legada não é tratada como autenticada.</p>
            {documents.length && filteredHistoryDocuments.length ? filteredHistoryDocuments.map((d) => <div className="history-row" key={d.id}>
              <span className="history-file"><Icon type="file" size={19}/></span>
              <span className="history-copy"><b>{d.supplier || 'Fornecedor não identificado'}</b>
                <small>{d.supplierCnpj ? 'CNPJ ' + d.supplierCnpj + ' · ' : ''}{d.invoiceNumber ? 'Nº ' + d.invoiceNumber : 'Número não informado'}{d.total !== undefined && d.total !== null ? ' · Total ' + money(d.total) : ''}{d.officialVerified ? ' · Conferido com consulta pública' : ''}</small>
                <span className={'history-author' + (d.checkedByVerified === true ? ' verified-author' : '')}>{pendingAttributionRef.current.has(d.id) ? 'Autoria aguardando confirmação do servidor' : fiscalDocumentAuthorText(d)}</span>
              </span>
              <span className="history-date">{formatDocumentIssueDate(d.date) || 'Data do documento indisponível'}</span>
              <span className="status ok-status"><i/>{d.status}</span>
              {currentUser?.role === 'admin' && <button type="button" className="btn secondary" style={{padding:'7px 11px',fontSize:12,color:'#a33'}} title="Excluir nota fiscal e estornar sua entrada de estoque" disabled={Boolean(deletingDocId) || saveStatus !== 'Sincronizado'} onClick={() => void deleteDocument(d)}>{deletingDocId === d.id ? 'Excluindo…' : 'Excluir NF'}</button>}
              <button className="row-chevron" title="Ver detalhes" onClick={() => {setDeleteError('');setDetailDoc(d);}}><Icon type="chevron" size={17}/></button>
            </div>) : documents.length ? <div className="empty-docs"><b>Nenhum documento corresponde aos filtros</b><button type="button" className="btn secondary" onClick={()=>setHistoryFilters({from:'',to:'',supplier:'',author:''})}>Limpar filtros</button></div> : <div className="empty-docs"><span className="empty-file"><Icon type="file" size={28}/></span><b>Nenhum documento importado</b><p>Envie o XML de uma NF-e ou selecione uma foto/PDF e cadastre os itens.</p></div>}
          </section>
          <div className="privacy-note"><Icon type="check" size={16}/><span>Privacidade: o OCR de imagens é executado no navegador. Quando a leitura local do QR falha, o fallback envia automaticamente um recorte da nota a um serviço externo; esse recorte pode conter informações fiscais. Notas pendentes e seus arquivos podem ficar armazenados no servidor até o lançamento ou cancelamento.</span></div>
        </>}

        {view === 'cash' && <>
          <section className="panel cash-report-queue" aria-labelledby="pending-cash-title">
            <div className="panel-head"><div><h2 id="pending-cash-title">Faturamentos pendentes</h2><p>Cada arquivo é revisado e lançado separadamente.</p></div><span className="history-count">{cashReports.length} pendente(s)</span></div>
            {cashReportProgress&&<div className="cash-report-progress" role="status" aria-live="polite"><b>{cashReportProgress.stage}</b>{cashReportProgress.activeFile&&<span>{cashReportProgress.activeFile}</span>}{cashReportProgress.total>1&&<span>Arquivo {Math.min(cashReportProgress.completed+1,cashReportProgress.total)} de {cashReportProgress.total}</span>}</div>}
            {cashError&&<div className="error" role="alert">{cashError}</div>}
            {cashReports.length ? <div className="cash-report-list">{cashReports.map((report)=><article className="cash-report-card" key={report.id}>
              <div className="cash-report-copy"><b>{report.fileName||'Faturamento sem nome'}</b><span>{report.state==='uploaded'?'Aguardando leitura':report.state==='failed'?'Leitura com falha':'Aguardando conferência'}{report.updatedAt?' · Atualizado '+new Date(report.updatedAt).toLocaleString('pt-BR'):''}{report.duplicateWarning?' · Arquivo semelhante já enviado; não foi combinado':''}</span>
                {cashReportErrors[report.id]&&<span className="cash-report-error" role="status">{cashReportErrors[report.id]}</span>}
                {(Array.isArray(report.warnings)?report.warnings:[]).map((warning,index)=><span className="cash-report-warning" key={index}>{warning}</span>)}
              </div>
              <div className="cash-report-actions"><button type="button" className="btn secondary" disabled={!report.hasOriginal} onClick={()=>void previewCashReport(report)}>Abrir original</button><button type="button" className="btn secondary" disabled={!report.hasOriginal} onClick={()=>void downloadCashReport(report)}>Baixar original</button>
                {report.draft&&<button type="button" className="btn primary" onClick={()=>openCashReportReview(report)}>Revisar</button>}
                {!report.draft&&report.hasOriginal&&<button type="button" className="btn secondary" disabled={cashImporting} onClick={()=>void retryCashReport(report)}>Tentar leitura novamente</button>}
                <button type="button" className="btn secondary" disabled={!report.hasOriginal||cashSaving} onClick={()=>void cancelCashReport(report)}>Cancelar pendência</button></div>
            </article>)}</div> : <div className="empty-docs"><b>Nenhum faturamento pendente</b><p>Os arquivos enviados aparecerão aqui para conferência individual.</p></div>}
          </section>
          {!cashEntryMode && <section className="panel cash-entry cash-entry-collapsed">
            <button className="btn primary" type="button" disabled={cashImporting}
              onClick={()=>{setCashError('');cashFileRef.current?.click();}}><Icon type="plus" size={17}/> Enviar faturamento</button>
            {cashError&&<div className="error" role="alert">{cashError}</div>}
          </section>}
          {(cashEntryMode === 'upload' || cashEntryMode === 'manual' || cashEntryMode === 'edit' || cashEntryMode === 'report-review') && <section className="panel cash-entry">
            <div className="panel-head"><div><h2>{cashEntryMode==='edit'?'Corrigir faturamento':cashEntryMode==='report-review'?'Revisar faturamento pendente':'Conferir novo faturamento'}</h2><p>Revise o faturamento e as movimentações antes de salvar.</p></div><button type="button" className="btn secondary" onClick={()=>{setCashEntryMode('');setCashEditId('');cashCorrectionContextRef.current=null;setCashReportActive(null);setCashError('');}}>Fechar formulário</button></div>
            {cashError&&<div className="error" role="alert">{cashError}</div>}
            <div className="cash-file-import">
              <div><b>Preencher automaticamente pelo fechamento</b><p>Selecione até cinco PDFs ou fotos. Cada arquivo terá seu próprio rascunho e confirmação; nenhum faturamento será somado automaticamente.</p></div>
              <button className="btn secondary" type="button" disabled={cashImporting||cashSaving} onClick={()=>cashFileRef.current?.click()}>{cashImporting?'Enviando e lendo…':'Enviar até 5 arquivos'}</button>
            </div>
            {!cashForm.sourceFileName&&<button className="text-btn" type="button" onClick={()=>newCashClosing('manual')}>Preencher manualmente</button>}
            {!!cashForm.sourceFileName&&<div className="cash-import-review">
              <b>Arquivo importado: {cashForm.sourceFileName}</b>
              {cashImportWarnings.map((w,i)=><p key={i}>⚠ {w}</p>)}
              <p>O formulário combina os campos reconhecidos por PP-OCRv6 e Tesseract. Compare as leituras com o comprovante; nenhum campo é confirmado sem sua revisão.</p>
              {cashImportAlternativeText?<details className="ocr-comparison">
                <summary>Comparar leituras OCR lado a lado</summary>
                <div className="ocr-comparison-grid">
                  <section><h3>Tesseract · leitura atual</h3><pre>{cashImportText.slice(0,20000)||'Sem texto reconhecido.'}</pre></section>
                  <section><h3>PP-OCRv6 · leitura alternativa</h3><pre>{cashImportAlternativeText.slice(0,20000)||'Sem texto reconhecido.'}</pre></section>
                </div>
                <button className="btn secondary" type="button" onClick={useAlternativeCashOcr}>Usar a leitura PP-OCRv6 nos campos para conferir</button>
              </details>:cashImportText&&<details><summary>Visualizar texto extraído</summary><pre>{cashImportText.slice(0,20000)}</pre></details>}
            </div>}
            <form onSubmit={cashEntryMode==='report-review'?savePendingCashReport:saveCashClosing}>
              <fieldset disabled={cashSaving} className="cash-form-fields">
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
              <label className="field cash-counted"><span>Dinheiro contado no fechamento *</span><input required type="number" min="0" step="0.01" value={cashForm.cashCounted} onChange={e=>changeCashField('cashCounted',e.target.value)}/></label>
              {cashForm.cashCounted!==''&&<p className="cash-count-difference">Diferença do caixa físico: <b>{money(Number(cashForm.cashCounted)-cashPreview.cashExpected)}</b></p>}
              <div className="cash-save-row"><label><input type="checkbox" checked={Boolean(cashForm.cashReviewed)} onChange={e=>changeCashField('cashReviewed',e.target.checked)}/> Conferi faturamento, caixa, data e movimentações.</label>{cashEntryMode==='report-review'&&<button type="button" className="btn secondary" disabled={cashSaving||!accessCode} onClick={()=>void savePendingCashDraft()}>Salvar pendência</button>}<button className="btn primary" disabled={cashSaving||!accessCode}>{cashSaving?(cashEntryMode==='report-review'?'Lançando…':'Salvando…'):(cashEntryMode==='report-review'?'Conferir e lançar':cashEntryMode==='edit'?'Salvar correção auditada':'Salvar faturamento')}</button></div>
              </fieldset>
            </form>
          </section>}
          <section className="panel cash-summary">
            <div className="panel-head"><div><h2>Faturamento {cashChartScope==='year'?'do ano':'do mês'}</h2><p>O total de vendas exclui sangrias e suprimentos do fechamento.</p></div>
              <div className="cash-chart-controls"><div className="cash-scope-toggle" role="group" aria-label="Período do gráfico"><button type="button" className={cashChartScope==='month'?'is-active':''} onClick={()=>{setCashChartScope('month');setCashSelectedDay('');setCashSelectedClosingId('');}}>Mês</button><button type="button" className={cashChartScope==='year'?'is-active':''} onClick={()=>{setCashChartScope('year');setCashSelectedDay('');setCashSelectedClosingId('');}}>Ano</button></div>
              {cashChartScope==='month'?<label className="field"><span>Mês de referência</span><input type="month" value={cashMonth} onChange={e=>{setCashMonth(e.target.value);setCashSelectedDay('');setCashSelectedClosingId('');}}/></label>:<label className="field"><span>Ano de referência</span><select value={cashMonth.slice(0,4)} onChange={e=>{setCashMonth(e.target.value+'-01');setCashSelectedDay('');setCashSelectedClosingId('');}}>{[...new Set([new Date().getFullYear(),...closings.map(e=>Number(String(e.day).slice(0,4)))])].sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}</option>)}</select></label>}</div>
            </div>
            <div className="cash-stats">
              <div><small>Faturamento {cashChartScope==='year'?'anual':'mensal'}</small><strong>{money(cashChartData.revenue)}</strong></div>
              <div><small>Fechamentos</small><strong>{cashChartData.count}</strong></div>
              <div><small>Média por fechamento</small><strong>{money(cashChartData.count?cashChartData.revenue/cashChartData.count:0)}</strong></div>
            </div>
            <h3>Faturamento diário — {cashChartScope==='year'?cashMonth.slice(0,4):new Date(cashMonth+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
            <div className="cash-chart-inspector" role="status" aria-live="polite" aria-atomic="true" data-testid="cash-chart-inspector">
              {cashHighlightedEntry ? <>
                <span>{new Date(cashHighlightedEntry.day+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span>
                <strong>{money(cashHighlightedEntry.revenue)}</strong>
              </> : <span>{cashChartData.count ? 'Passe o mouse, toque ou use Tab nas barras para consultar valores; clique para detalhar.' : 'Nenhum fechamento neste período. Os dias sem vendas permanecem zerados.'}</span>}
            </div>
            {cashChartScope==='month'&&<div className="cash-month-reference-legend" data-testid="cash-month-reference-legend" aria-live="polite">
              {cashMonthlyReferences ? <>
                <span className="cash-reference-rule">Considera apenas dias com lançamentos; dias sem fechamento ficam fora da comparação.</span>
                {cashMonthlyReferences.maximum.revenue===cashMonthlyReferences.minimum.revenue
                  ? <span className="cash-reference-item"><i className="cash-reference-swatch is-equal" aria-hidden="true"/>Maior e menor: <b>{money(cashMonthlyReferences.maximum.revenue)}</b> · {cashMonthlyReferences.maximum.day.slice(-2)}/{cashMonthlyReferences.maximum.day.slice(5,7)}</span>
                  : <><span className="cash-reference-item"><i className="cash-reference-swatch is-maximum" aria-hidden="true"/>Maior: <b>{money(cashMonthlyReferences.maximum.revenue)}</b> · {cashMonthlyReferences.maximum.day.slice(-2)}/{cashMonthlyReferences.maximum.day.slice(5,7)}</span>
                    <span className="cash-reference-item"><i className="cash-reference-swatch is-minimum" aria-hidden="true"/>Menor: <b>{money(cashMonthlyReferences.minimum.revenue)}</b> · {cashMonthlyReferences.minimum.day.slice(-2)}/{cashMonthlyReferences.minimum.day.slice(5,7)}</span></>}
              </> : <span className="cash-reference-rule">Sem lançamentos no mês para comparar.</span>}
            </div>}
            <div className={'cash-chart'+(cashChartScope==='month'?' cash-chart-month':'')} aria-label="Gráfico interativo de faturamento por dia">
              {cashChartDays.map(p=>{const date=new Date(p.day+'T12:00:00');const weekday=date.toLocaleDateString('pt-BR',{weekday:'short'});const axisDate=cashChartScope==='year'?p.day.slice(8,10)+'/'+p.day.slice(5,7):p.day.slice(-2);const accessibleDate=date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});const hasRevenue=p.revenue>0;const barHeight=hasRevenue?Math.max(3,p.revenue/cashChartMaxRevenue*100):0;return <button type="button" className={'cash-bar-column'+(cashSelectedDay===p.day?' is-selected':'')+(!hasRevenue?' is-empty':'')+(cashHighlightedDay===p.day?' is-highlighted':'')} key={p.day} aria-label={`${accessibleDate}, faturamento ${money(p.revenue)}`} aria-pressed={cashSelectedDay===p.day} title={hasRevenue?`${accessibleDate}: ${money(p.revenue)}`:undefined} disabled={!hasRevenue} onPointerDown={event=>event.pointerType==='touch'&&hasRevenue&&setCashHighlightedDay(p.day)} onMouseEnter={()=>hasRevenue&&setCashHighlightedDay(p.day)} onMouseLeave={()=>setCashHighlightedDay(day=>day===p.day?'':day)} onFocus={()=>hasRevenue&&setCashHighlightedDay(p.day)} onBlur={()=>setCashHighlightedDay(day=>day===p.day?'':day)} onClick={()=>hasRevenue&&setCashSelectedDay(p.day)}>
                <div className="cash-bar-track">
                  {cashChartScope==='month'&&cashMonthlyReferences&&<span className="cash-reference-line is-maximum" style={{bottom:`calc(${cashMonthlyReferences.maximum.revenue/cashChartMaxRevenue*100}% - 1px)`}} aria-hidden="true"/>}
                  {cashChartScope==='month'&&cashMonthlyReferences&&cashMonthlyReferences.minimum.revenue!==cashMonthlyReferences.maximum.revenue&&<span className="cash-reference-line is-minimum" style={{bottom:`calc(${cashMonthlyReferences.minimum.revenue/cashChartMaxRevenue*100}% - 1px)`}} aria-hidden="true"/>}
                  {cashHighlightedDay===p.day&&hasRevenue&&<span className="cash-bar-value" style={{bottom:`calc(${barHeight}% + 4px)`}} aria-hidden="true">{money(p.revenue)}</span>}
                  <div className="cash-bar-fill" style={{height:barHeight+'%'}}/>
                </div>
                <small>{axisDate}</small><small>{weekday}</small>
              </button>})}
            </div>
          </section>
          <section className="panel cash-history"><div className="panel-head"><div><h2>Histórico de faturamentos</h2><p>Registros individuais por data e número do caixa.</p></div><span className="history-count">{closings.length} registros</span></div>
            <div className="table-wrap"><table><thead><tr><th>DATA</th><th>CAIXA</th><th>OPERADOR</th><th>FATURAMENTO</th><th>TOTAL DO DIA</th><th>FECHADO POR</th><th></th></tr></thead><tbody>
            {closings.map(entry=>{const totals=cashTotals(entry);const dayTotal=closings.filter(e=>e.day===entry.day).reduce((sum,e)=>sum+cashTotals(e).revenue,0);return <tr key={entry.id}><td>{new Date(entry.day+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>{entry.register}</td><td>{entry.operator}</td><td><b>{money(totals.revenue)}</b></td><td><b>{money(dayTotal)}</b></td><td>{entry.createdBy?.displayName||'Autoria anterior não registrada'}</td><td>{currentUser?.role==='admin'&&<button className="text-btn" onClick={()=>void openCashClosingDetail(entry)}>Revisar</button>}</td></tr>})}
            {!closings.length&&<tr><td colSpan={7}>Ainda não há fechamentos registrados.</td></tr>}
            </tbody></table></div>
          </section>
        </>}

        {view==='cash'&&cashSelectedDay&&typeof document!=='undefined'&&createPortal(<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setCashSelectedDay('');setCashSelectedClosingId('');}}}><section className="modal cash-day-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-day-title"><div className="modal-heading"><div><div className="eyebrow">DETALHAMENTO FINANCEIRO</div><h2 id="cash-day-title">{new Date(cashSelectedDay+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</h2><p>Faturamento consolidado dos caixas registrados neste dia.</p></div><button type="button" className="close-btn" aria-label="Fechar detalhamento do dia" onClick={()=>{setCashSelectedDay('');setCashSelectedClosingId('');}}><Icon type="close"/></button></div><div className="cash-day-detail">
  <div className="cash-day-summary">
    <span>{cashSelectedClosingId?'Total do fechamento':'Total de faturamento do dia'}</span>
    <strong>{money(cashChartEntries.reduce((sum,entry)=>sum+cashTotals(entry).revenue,0))}</strong>
    <small>{cashChartEntries.length} {cashChartEntries.length===1?'caixa registrado':'caixas registrados'}</small>
  </div>
  <div className="cash-day-registers">
    {cashChartEntries.length?cashChartEntries.map(entry=>{
      const totals=cashTotals(entry);
      return <article className="cash-day-register-card" key={entry.id}>
        <div className="cash-day-register-head">
          <h3>Caixa {entry.register}</h3><span>Operador: {entry.operator}</span>
        </div>
        <dl className="cash-day-channels">{CASH_CHANNELS.map(([key,label])=><div key={key} className="cash-day-channel"><dt>{label}</dt><dd>{money(totals.revenues[key])}</dd></div>)}</dl>
        <div className="cash-day-register-total"><span>Total do caixa</span><strong>{money(totals.revenue)}</strong></div>
        {cashSelectedClosingId===String(entry.id)&&currentUser?.role==='admin'&&<div className="cash-audit-panel">
          <div className="cash-audit-panel-head"><h4>Histórico de versões</h4><button type="button" className="btn secondary" disabled={cashSaving} onClick={()=>editCashClosing(entry)}>Corrigir fechamento</button></div>
          {cashAuditLoading?<p role="status">Carregando auditoria…</p>:cashAuditHistory.length?<ol>{cashAuditHistory.map((version)=><li key={version.version}><div><b>Versão {version.version} · {version.action==='baseline'?'original':version.action==='restore'?'restauração':'correção'}</b><small>{new Date(version.occurredAt).toLocaleString('pt-BR')} · {version.actor?.displayName||'Autoria anterior não registrada'} · {version.reason}</small></div>{version.version!==cashAuditHistory[0]?.version&&<button type="button" className="text-btn" disabled={cashSaving} onClick={()=>void restoreCashClosingVersion(entry,version.version)}>Recuperar esta versão</button>}</li>)}</ol>:<p>Não há versões anteriores disponíveis.</p>}
        </div>}
        {!cashSelectedClosingId&&currentUser?.role==='admin'&&<div className="cash-day-review-action"><button type="button" className="text-btn" onClick={()=>void openCashClosingDetail(entry)}>Revisar este fechamento e seu histórico</button></div>}
      </article>;
    }):<p className="cash-day-empty">Sem detalhes disponíveis.</p>}
  </div>
</div><div className="modal-actions"><button type="button" className="btn primary" onClick={()=>{setCashSelectedDay('');setCashSelectedClosingId('');}}>Fechar</button></div></section></div>,document.body)}

        {view === 'movements' && <section className="panel movement-panel"><div className="panel-head"><div><h2>Histórico de movimentações</h2><p>Entradas, saídas, cadastros e ajustes deste navegador.</p></div><span className="history-count">{movements.length} registros</span></div>{movements.length ? <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>TIPO</th><th>QUANTIDADE</th><th>MOTIVO</th><th>DATA</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td><div className="product-cell"><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span><b>{m.product}</b><small>Movimentação de estoque</small></span></div></td><td><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type}</span></td><td><b>{qty(m.quantity)}</b></td><td>{m.reason}</td><td>{m.date}</td></tr>)}</tbody></table></div> : <div className="empty-docs">Ainda não há movimentações.</div>}</section>}
        <footer className="footer"><span><b>estoque+</b><i>/</i> Projeto GPT</span><span>Protótipo em desenvolvimento <i>•</i> {supabase ? (saveStatus || 'Banco compartilhado') : (loaded ? 'Dados salvos localmente' : 'Carregando dados')}</span></footer>
      </div>
    </main>

    {modal === 'product' && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><div className="modal-heading"><div><div className="eyebrow">{editing ? 'ATUALIZAÇÃO DE CADASTRO' : 'NOVO CADASTRO'}</div><h2 id="product-dialog-title">{editing ? 'Editar produto' : 'Adicionar produto'}</h2><p>Defina os dados básicos para acompanhar o estoque.</p></div><button className="close-btn" aria-label="Fechar cadastro de produto" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveProduct}><label className="field full"><span>Nome do produto *</span><input required autoFocus value={productForm.name} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Ex.: Farinha de trigo"/></label><div className="form-grid"><label className="field"><span>Código / SKU</span><input value={productForm.sku} readOnly={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="Opcional"/></label><label className="field"><span>Categoria</span><select value={productForm.category} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>{['Mercearia','Cafés','Laticínios','Confeitaria','Embalagens','Bebidas','Limpeza','Outros'].map((c) => <option key={c}>{c}</option>)}</select></label><label className="field"><span>Unidade</span><select value={productForm.unit} disabled={currentUser?.role !== 'admin'} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}>{['un','kg','g','L','ml','cx','pct','fardo'].map((u) => <option key={u}>{u}</option>)}</select></label><label className="field"><span>Quantidade atual</span><input type="number" min="0" step="any" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}/></label>{currentUser?.role === 'admin' && <><label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="any" value={productForm.min} onChange={(e) => setProductForm({ ...productForm, min: e.target.value })}/></label><label className="field"><span>Custo unitário (R$)</span><input type="number" min="0" step="any" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}/></label><label className="field"><span>Fornecedor habitual (opcional)</span><input list="estq-known-suppliers" value={productForm.preferredSupplier || ''} onChange={(e) => setProductForm({ ...productForm, preferredSupplier: e.target.value })} placeholder="Ex.: Atacadista Centro"/><datalist id="estq-known-suppliers">{knownSuppliers.map((name) => <option key={name} value={name}/>)}</datalist><small>Se não escolher, usamos o fornecedor mais frequente das notas fiscais.</small></label></>}</div>{!editing && registrationDuplicateHints.length > 0 && <div className="duplicate-inline" role="alert"><b>⚠ Possível cadastro duplicado — confira com o gestor</b><p>{registrationDuplicateHints.map((match) => match.left.name + ' (' + (match.left.sku || 'sem código') + ')').join(' · ')}. Se for o mesmo produto, edite o cadastro existente.</p></div>}<div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal('')}>Cancelar</button><button type="submit" className="btn primary"><Icon type="check" size={17}/>{editing ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form></section></div>}
    {mergePair && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !mergeBusy) setMergePair(null); }}>
      <section className="modal duplicate-merge-modal" role="dialog" aria-modal="true" aria-labelledby="merge-dialog-title">
        <div className="modal-heading"><div><div className="eyebrow">AÇÃO EXCLUSIVA DO GESTOR</div><h2 id="merge-dialog-title">Consolidar produtos</h2><p>Escolha o cadastro principal e confira as quantidades.</p></div><button type="button" className="close-btn" aria-label="Fechar consolidação de produtos" disabled={mergeBusy} onClick={() => setMergePair(null)}><Icon type="close"/></button></div>
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
    {modal === 'adjust' && editing && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="adjust-dialog-title"><div className="modal-heading"><div><div className="eyebrow">MOVIMENTAÇÃO MANUAL</div><h2 id="adjust-dialog-title">Ajustar estoque</h2><p>{editing.name} · saldo atual: {qty(editing.stock)} {editing.unit}</p></div><button className="close-btn" aria-label="Fechar ajuste de estoque" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveAdjustment}><label className="field"><span>Tipo de movimentação</span><select value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value, reason: e.target.value === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' })}><option>Entrada</option><option>Saída</option></select></label><label className="field"><span>Quantidade ({editing.unit})</span><input type="number" required min="0.001" step="any" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}/></label><label className="field"><span>Motivo</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}/></label><div className="modal-actions"><button className="btn secondary" type="button" onClick={() => setModal('')}>Cancelar</button><button className="btn primary" type="submit"><Icon type="check" size={17}/>Registrar {adjust.type.toLowerCase()}</button></div></form></section></div>}
    {detailDoc && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !deletingDocId) {setDetailDoc(null);setDeleteError('');} }}><section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="details-dialog-title"><div className="modal-heading"><div><div className="eyebrow">DOCUMENTO JÁ PROCESSADO</div><h2 id="details-dialog-title">{detailDoc.supplier || detailDoc.fileName || 'Documento fiscal'}</h2><p>{detailDoc.fileName}{detailDoc.invoiceNumber ? ' · Nº ' + detailDoc.invoiceNumber : ''}{detailDoc.officialVerified ? ' · Conferido com consulta pública' : ''}</p></div><button className="close-btn" aria-label="Fechar detalhes do documento" disabled={Boolean(deletingDocId)} onClick={() => {setDetailDoc(null);setDeleteError('');}}><Icon type="close"/></button></div><div className="detail-summary"><span><small>Status</small><b>{detailDoc.status}</b></span><span><small>Fornecedor</small><b>{detailDoc.supplier || 'Não informado'}</b></span><span><small>Registrado em</small><b>{detailDoc.importedAt || detailDoc.date || 'Não informado'}</b></span><span><small>Autoria do lançamento</small><b>{pendingAttributionRef.current.has(detailDoc.id) ? 'Autoria aguardando confirmação do servidor' : fiscalDocumentAuthorText(detailDoc)}</b></span></div><div className="detail-summary" style={{marginTop:12}}><span><small>Subtotal</small><b>{money(detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0))}</b></span><span><small>Desconto</small><b>{money(detailDoc.discount || 0)}</b></span><span><small>Total final</small><b>{money(detailDoc.total ?? ((detailDoc.subtotal ?? detailDoc.items.reduce((sum, item) => sum + receiptItemTotal(item), 0)) - Number(detailDoc.discount || 0)))}</b></span></div><div className="detail-items"><div className="detail-items-head"><b>Itens do documento</b><span>{detailDoc.items.length} itens</span></div>{detailDoc.items.map((it, i) => <div className="detail-item" key={i}><span><b>{it.name}</b><small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><strong>{money(receiptItemTotal(it))}</strong></div>)}</div>{deleteError && <div className="error" role="alert" style={{marginTop:12}}><Icon type="alert" size={18}/><span>{deleteError}</span></div>}<div className="modal-actions">{currentUser?.role === 'admin' && <button type="button" className="btn secondary" style={{color:'#a33'}} disabled={Boolean(deletingDocId) || saveStatus !== 'Sincronizado'} onClick={() => void deleteDocument(detailDoc)}>{deletingDocId === detailDoc.id ? 'Excluindo…' : 'Excluir NF e estornar estoque'}</button>}<button className="btn primary" disabled={Boolean(deletingDocId)} onClick={() => {setDetailDoc(null);setDeleteError('');}}>Fechar detalhes</button></div></section></div>}
    {pendingPreview && <div className="overlay pending-file-overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget)closePendingPreview();}}>
      <section className="modal pending-file-dialog" role="dialog" aria-modal="true" aria-labelledby="pending-file-title">
        <div className="modal-heading"><div><div className="eyebrow">ARQUIVO ORIGINAL</div><h2 id="pending-file-title">Visualização do arquivo</h2><p>{pendingPreview.fileName}</p></div>
          <button type="button" className="close-btn" aria-label="Fechar visualização do arquivo" onClick={closePendingPreview}><Icon type="close"/></button></div>
        {pendingPreview.previewable ? <div className="pending-file-preview">
          {pendingPreview.mime==='application/pdf'
            ? <iframe title={'Pré-visualização do PDF '+pendingPreview.fileName} src={pendingPreview.url}/>
            : <img alt={'Pré-visualização do arquivo '+pendingPreview.fileName} src={pendingPreview.url}/>}
        </div> : <div className="notice" role="status">Este formato não pode ser pré-visualizado com segurança. Você ainda pode baixar o arquivo original.</div>}
        <div className="modal-actions"><a className="btn secondary" href={pendingPreview.url} download={pendingPreview.fileName}>Baixar arquivo original</a>
          <button type="button" className="btn primary" onClick={closePendingPreview}>Fechar</button></div>
      </section>
    </div>}
    {toast && <div className="toast"><span><Icon type="check" size={17}/></span>{toast}<button type="button" aria-label="Dispensar notificação" onClick={() => setToast('')}><Icon type="close" size={15}/></button></div>}
  </div>;
}

