import { validSupplierCnpj } from './fiscal-identity.mjs';

// NF-e key checksum uses the same base-11 weights for every character. With
// alphanumeric CNPJ, Receita's specification maps each character to ASCII - 48.
export function validateNfceAccessKey(raw) {
  const key = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^\d{6}[A-Z0-9]{14}\d{24}$/.test(key) || key.slice(20, 22) !== '65') return false;
  let sum = 0;
  let weight = 2;
  for (let index = 42; index >= 0; index--) {
    sum += (key.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return digit === Number(key[43]);
}

export function issuerCnpjFromNfceAccessKey(raw) {
  const key = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!validateNfceAccessKey(key)) return '';
  const issuer = key.slice(6, 20);
  return validSupplierCnpj(issuer) ? issuer : '';
}

export function extractNfceAccessKeyFromText(text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const compact = line.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (compact.length < 44 || compact.length > 80) continue;
    for (let offset = 0; offset <= compact.length - 44; offset++) {
      const candidate = compact.slice(offset, offset + 44);
      if (validateNfceAccessKey(candidate)) return candidate;
    }
  }
  return '';
}
