import { load } from 'cheerio';
import { validSupplierCnpj } from './fiscal-identity.mjs';

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// Escala fixa: toda conferência financeira usa inteiros, nunca multiplicação de floats.
function scaledNumber(value, scale = 2) {
  const token = clean(value).match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?/g)?.at(-1);
  if (!token) return null;
  const [whole, fraction = ''] = token.replace(/\./g, '').split(',');
  if (fraction.length > scale) return null;
  const result = Number(whole + fraction.padEnd(scale, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

function readTotals($) {
  const cents = { subtotal: null, discount: 0, total: null, change: 0, taxes: null };
  const payments = [];
  $('#totalNota label').each((_, element) => {
    const label = clean($(element).text());
    const value = scaledNumber($(element).siblings('.totalNumb').first().text());
    if (value === null) return;
    if (/^Valor total\b/i.test(label)) cents.subtotal = value;
    else if (/^Descontos?\b/i.test(label)) cents.discount = value;
    else if (/^Valor a pagar\b/i.test(label)) cents.total = value;
    else if (/^Troco\b/i.test(label)) cents.change = value;
    else if (/Tributos Totais/i.test(label)) cents.taxes = value;
    else if ($(element).hasClass('tx')) payments.push({ method: label, amountCents: value, amount: value / 100 });
  });
  return { cents, payments };
}

function readIssuer($, accessKey, warnings) {
  const header = $('#u20');
  const blocks = header.siblings('div.text').map((_, element) => clean($(element).text())).get();
  const pageCnpj = blocks.join(' ').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0].replace(/\D/g, '') || '';
  const keyCnpj = /^\d{44}$/.test(accessKey) ? accessKey.slice(6, 20) : '';
  if (pageCnpj && keyCnpj && pageCnpj !== keyCnpj) warnings.push('CNPJ da página diverge da chave. Confira o emitente.');
  if (pageCnpj && !validSupplierCnpj(pageCnpj)) warnings.push('CNPJ da página inválido; confira o emitente pela chave.');
  return { supplier: clean(header.text()), supplierCnpj: validSupplierCnpj(pageCnpj) ? pageCnpj :
    validSupplierCnpj(keyCnpj) ? keyCnpj : '', address: blocks.filter((block) => !/CNPJ/i.test(block)).join(' ') };
}

/** Lê emitente e totais impressos; a leitura existente dos itens permanece no endpoint. */
export function parseSvrsHtml(html) {
  const $ = load(html);
  const warnings = [];
  const accessKey = clean($('span.chave').first().text()).replace(/\s/g, '');
  const { cents, payments } = readTotals($);
  const general = clean($('h4').filter((_, element) => /Informações gerais/i.test($(element).text())).parent().text());
  if (cents.subtotal === null || cents.total === null || cents.subtotal - cents.discount !== cents.total)
    warnings.push('Subtotal menos descontos difere do total final. Confira a nota.');
  return { accessKey, ...readIssuer($, accessKey, warnings),
    invoiceNumber: general.match(/Número:\s*(\d+)/i)?.[1] || '',
    series: general.match(/Série:\s*(\d+)/i)?.[1] || '',
    date: general.match(/Emissão:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i)?.[1] || '',
    contingency: /EMITIDA EM CONTINGÊNCIA/i.test(general), payments, warnings,
    totalsCents: cents, totals: Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value === null ? null : value / 100])) };
}
