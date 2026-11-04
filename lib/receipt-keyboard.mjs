/** Impede envio implícito ao pressionar Enter em um campo da nota. */
export function preventReceiptImplicitSubmit(event) {
  const control = event.target;
  if (event.key !== 'Enter' || control?.tagName !== 'INPUT') return;
  if (['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(control.type)) return;
  event.preventDefault();
}
