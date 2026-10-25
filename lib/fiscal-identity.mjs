// Keep letters intact: newer CNPJs must never collide with a numeric issuer.
export const cnpjDigits = (value) => String(value || '').replace(/[.\/\s-]/g, '').toUpperCase();
export function formatSupplierCnpj(value) {
  const id=cnpjDigits(value).replace(/[^A-Z\d]/g,'').slice(0,14);
  let result=id.slice(0,2);
  if(id.length>2)result+='.'+id.slice(2,5);
  if(id.length>5)result+='.'+id.slice(5,8);
  if(id.length>8)result+='/'+id.slice(8,12);
  if(id.length>12)result+='-'+id.slice(12,14);
  return result;
}
export const fiscalCodeIdentity = (value) => String(value ?? '').trim();
export function validSupplierCnpj(value) {
  const digits = cnpjDigits(value);
  if (!/^[A-Z\d]{12}\d{2}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const valueOf = (character) => character.charCodeAt(0) - 48;
  const digit = (base) => {
    const weights = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const remainder = [...base].reduce((sum, character, i) => sum + valueOf(character) * weights[i], 0) % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  return digits[12] === digit(digits.slice(0,12)) && digits[13] === digit(digits.slice(0,13));
}

const CNPJ_OCR_DIGIT = { O:'0', Q:'0', I:'1', L:'1', S:'5', B:'8' };
function validOcrCnpjCandidates(raw) {
  const compact = cnpjDigits(raw).replace(/[^A-Z\d]/g, '');
  if (!/^[A-Z\d]{14}$/.test(compact)) return [];
  const choices = [...compact].map((character, index) => {
    if (index >= 12) return CNPJ_OCR_DIGIT[character] ? [CNPJ_OCR_DIGIT[character]] : [character];
    if (!CNPJ_OCR_DIGIT[character]) return [character];
    return [...new Set([character, CNPJ_OCR_DIGIT[character]])];
  });
  const count = choices.reduce((total, values) => total * values.length, 1);
  if (count > 4096) return [];
  const valid = new Set();
  const candidate = [];
  const visit = (index) => {
    if (index === choices.length) {
      const value = candidate.join('');
      if (validSupplierCnpj(value)) valid.add(value);
      return;
    }
    for (const value of choices[index]) { candidate[index] = value; visit(index + 1); }
  };
  visit(0);
  return [...valid];
}

// Restrict recognition to the issuer header. A recipient CNPJ is never an issuer fallback.
export function extractIssuerCnpj(text) {
  const header = String(text || '').split(/\b(?:DESTINAT|DADOS\s+DO\s+CLIENTE|CONSUMIDOR\s*(?=:|CNPJ\b|CPF\b|NAO\b|IDENTIFICADO\b|$))/i)[0];
  const labeled = [...header.matchAll(/\bCNPJ\b\s*[:.-]?\s*([A-Z\d]{2}\s*\.?\s*[A-Z\d]{3}\s*\.?\s*[A-Z\d]{3}\s*\/?\s*[A-Z\d]{4}\s*-?\s*[A-Z\d]{2})(?![A-Z\d])/gi)];
  const contiguous = [...header.matchAll(/(?<![A-Z\d])([A-Z\d]{14})(?![A-Z\d])/gi)];
  const matches = [...labeled, ...contiguous];
  const valid = new Set();
  for (const match of matches) {
    for (const candidate of validOcrCnpjCandidates(match[1])) valid.add(candidate);
  }
  return valid.size === 1 ? [...valid][0] : '';
}
export function supplierAliasProducts(item, catalog, issuer) {
  if (!validSupplierCnpj(issuer)) return [];
  const code = fiscalCodeIdentity(item?.code);
  if (!code) return [];
  return catalog.filter((product) => (product.supplierCodes || []).some((alias) =>
    cnpjDigits(alias.cnpj) === cnpjDigits(issuer) && fiscalCodeIdentity(alias.code) === code));
}
export function supplierAliasProduct(item, catalog, issuer) {
  const candidates = supplierAliasProducts(item, catalog, issuer);
  return candidates.length === 1 ? candidates[0] : null;
}

export function receiptUnitFactor(invoiceUnit, stockUnit) {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '');
  const invoice = normalize(invoiceUnit);
  const stock = normalize(stockUnit);
  const aliases = (value) => ({ pc:'un', pç:'un', peça:'un', peças:'un', unidade:'un', unidades:'un', litro:'l', litros:'l', quilo:'kg', quilos:'kg', grama:'g', gramas:'g', mililitro:'ml', mililitros:'ml' })[value] || value;
  const from = aliases(invoice);
  const to = aliases(stock);
  if (!from || !to) return null;
  if (from === to) return 1;
  const base = { g: { kg: 0.001 }, kg: { g: 1000 }, ml: { l: 0.001 }, l: { ml: 1000 } };
  return base[from]?.[to] ?? null;
}

export function supplierAliasConversion(item, product, issuer) {
  if (!product || !validSupplierCnpj(issuer)) return null;
  const code = fiscalCodeIdentity(item?.code);
  const alias = (product.supplierCodes || []).find((entry) =>
    cnpjDigits(entry.cnpj) === cnpjDigits(issuer) && fiscalCodeIdentity(entry.code) === code);
  if (!alias) return null;
  const invoiceUnit = String(item?.unit || '').trim();
  const stockUnit = String(product.unit || '').trim();
  const automatic = receiptUnitFactor(invoiceUnit, stockUnit);
  if (automatic !== null) return { factor: automatic, invoiceUnit, stockUnit, saved: false };
  const conversion = alias.unitConversion;
  const factor = Number(conversion?.factor);
  if (String(conversion?.invoiceUnit || '').trim().toLocaleLowerCase('pt-BR') !== invoiceUnit.toLocaleLowerCase('pt-BR') ||
      String(conversion?.stockUnit || '').trim().toLocaleLowerCase('pt-BR') !== stockUnit.toLocaleLowerCase('pt-BR') ||
      !Number.isFinite(factor) || factor <= 0 || factor > 1000000) return null;
  return { factor, invoiceUnit, stockUnit, saved: true };
}

export function prepareFiscalIdentity(draft, previous, catalog, documents, suppliers = []) {
  if (!draft?.items) return draft;
  const issuer = cnpjDigits(draft.supplierCnpj);
  const issuerChanged = issuer !== cnpjDigits(previous?.supplierCnpj);
  const registered = suppliers.find((supplier) => cnpjDigits(supplier.cnpj) === issuer);
  const historical = validSupplierCnpj(issuer) && (!previous || issuerChanged)
    ? registered ? { supplier: registered.name } : documents.find((doc) => cnpjDigits(doc.supplierCnpj) === issuer && doc.supplier?.trim()) : null;
  const unit = (value) => String(value || '').trim().toLowerCase();
  return {
    ...draft,
    ...(historical ? { originalSupplier: draft.originalSupplier ?? draft.supplier, supplier: historical.supplier } : {}),
    items: draft.items.map((item) => {
      const old = previous?.items?.find((row) => row.lineId && row.lineId === item.lineId);
      const mapped = supplierAliasProduct(item, catalog, issuer);
      const canSuggest = !old || issuerChanged || old.code !== item.code || old.unit !== item.unit;
      const result = { ...item, originalName: item.originalName ?? item.name, originalCode: item.originalCode ?? item.code };
      const conversion = mapped && supplierAliasConversion(item, mapped, issuer);
      if (canSuggest && mapped && !item.manualName && (!item.productId || item.productId === mapped.id) &&
          (unit(mapped.unit) === unit(item.unit) || conversion))
        return { ...result, name: mapped.name, standardNameProductId: mapped.id,
          ...(conversion && unit(mapped.unit) !== unit(item.unit) ? { productId: mapped.id, conversionFactor: conversion.factor } : {}) };
      return result;
    })
  };
}