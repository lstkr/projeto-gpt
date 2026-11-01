import { cnpjDigits, validSupplierCnpj, extractIssuerCnpj } from './fiscal-identity.mjs';

/** Aceita apenas CNPJ com dígitos verificadores válidos, sem corrigir números por aproximação. */
export function validatedSupplierCnpj(value) {
  return validSupplierCnpj(value) ? cnpjDigits(value) : '';
}

/** Mapeia dados oficiais para os campos existentes da conferência, sem dados do consumidor. */
export function svrsDraftFields(data, current = {}) {
  return {
    supplier: data.supplier || current.supplier || '',
    supplierCnpj: validatedSupplierCnpj(data.supplierCnpj) || validatedSupplierCnpj(current.supplierCnpj) || validatedSupplierCnpj(extractIssuerCnpj(current.ocrText)),
    address: data.address, invoiceNumber: data.invoiceNumber, series: data.series, date: data.date,
    contingency: data.contingency, payments: data.payments,
    change: data.totals.change, taxes: data.totals.taxes,
    officialWarnings: data.warnings || [], totalsWarning: (data.warnings || []).join(' ')
  };
}
