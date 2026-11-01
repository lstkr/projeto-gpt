/** Mapeia dados oficiais para os campos existentes da conferência, sem dados do consumidor. */
export function svrsDraftFields(data) {
  return {
    supplier: data.supplier, supplierCnpj: data.supplierCnpj,
    address: data.address, invoiceNumber: data.invoiceNumber, series: data.series, date: data.date,
    contingency: data.contingency, payments: data.payments,
    change: data.totals.change, taxes: data.totals.taxes,
    additionalCharges: 0,
    officialWarnings: data.warnings || [], totalsWarning: (data.warnings || []).join(' ')
  };
}
