// Keep letters intact: newer CNPJs must never collide with a numeric issuer.
export const cnpjDigits = (value) => String(value || '').replace(/[.\/\s-]/g, '').toUpperCase();
export const fiscalCodeIdentity = (value) => String(value ?? '').trim();
export function validSupplierCnpj(value) {
  const digits = cnpjDigits(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const digit = (base) => {
    const weights = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const remainder = [...base].reduce((sum, n, i) => sum + Number(n) * weights[i], 0) % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  return digits[12] === digit(digits.slice(0,12)) && digits[13] === digit(digits.slice(0,13));
}

// Restrict recognition to the issuer header. A recipient CNPJ is never an issuer fallback.
export function extractIssuerCnpj(text) {
  const header = String(text || '').split(/\b(?:DESTINAT[ÁA]RIO|DADOS\s+DO\s+CLIENTE|CONSUMIDOR\s*(?=:|CNPJ\b|CPF\b|N[ÃA]O\b|IDENTIFICADO\b))/i)[0];
  const candidates = [...header.matchAll(/\bCNPJ\s*[:.-]?\s*([A-Z\d]{2}\.?[A-Z\d]{3}\.?[A-Z\d]{3}\/?[A-Z\d]{4}-?\d{2})(?![A-Z\d])/gi)]
    .map((match) => cnpjDigits(match[1])).filter((value) => validSupplierCnpj(value) || /[A-Z]/.test(value));
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : '';
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
      if (canSuggest && mapped && !item.manualName && (!item.productId || item.productId === mapped.id) && unit(mapped.unit) === unit(item.unit))
        return { ...result, name: mapped.name, standardNameProductId: mapped.id };
      return result;
    })
  };
}
