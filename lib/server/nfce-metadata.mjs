import { load } from 'cheerio';
import { validSupplierCnpj } from '../fiscal-identity.mjs';

// Read issuer and summary independently from item/payment tables.
export function parseNfceMetadata(html, text, accessKey = '') {
  const $ = load(html);
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const money = s => {
    const match = String(s || '').match(/(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b|\d+\.\d{2}\b/);
    return match ? Number(match[0].includes(',') ? match[0].replace(/\./g, '').replace(',', '.') : match[0]) : null;
  };
  const totals = { subtotal: null, discount: null, total: null };
  let payable = null;
  for (let i = 0; i < lines.length; i++) {
    const label = normal(lines[i]);
    // Some portal templates put the value in the following block.
    const value = money(lines[i]) ?? (/^(?:R\$\s*)?\d/.test(lines[i+1] || '') ? money(lines[i+1]) : null);
    if (value === null) continue;
    if (/SUB[ -]?TOTAL|VALOR TOTAL DOS PRODUTOS/.test(label)) totals.subtotal = value;
    else if (/VALOR A PAGAR|TOTAL A PAGAR/.test(label)) payable = value;
    else if (/VALOR TOTAL|TOTAL DA NOTA/.test(label) && !/ITENS|TRIBUT/.test(label)) totals.total = value;
    if (/\bDESCONTOS?\b/.test(label)) totals.discount = value;
  }
  if (payable !== null) {
    if (totals.subtotal === null) totals.subtotal = totals.total;
    totals.total = payable;
  }
  const issuerLine = lines.findIndex(line => /CNPJ\s*:/i.test(line));
  const printed = (lines[issuerLine] || '').match(/CNPJ\s*:\s*([\d.\/\s-]+)/i)?.[1]?.replace(/\D/g, '') || '';
  const keyIssuer = /^\d{44}$/.test(accessKey) ? accessKey.slice(6,20) : '';
  const cnpj = validSupplierCnpj(printed) ? printed : validSupplierCnpj(keyIssuer) ? keyIssuer : '';
  // Never associate the page with an issuer different from the requested key.
  if (printed && validSupplierCnpj(printed) && keyIssuer && printed !== keyIssuer)
    throw new Error('O emitente da consulta não corresponde à chave deste cupom.');
  const selected = $('#u20, .txtTopo').first().text().replace(/\s+/g,' ').trim();
  const preceding = issuerLine > 0 ? lines[issuerLine-1] : '';
  const name = (selected || preceding).replace(/\s+CNPJ\s*:.*/i, '').trim().slice(0,160);
  return { supplier: { name, cnpj }, totals };
}
