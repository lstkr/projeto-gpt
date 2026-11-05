const EDITABLE_CONTROLS = 'input:not([type="hidden"]), select, textarea';
const ACTION_INPUT_TYPES = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'];

/** Enter navega sem envio implícito; botões e seletores mantêm ativação deliberada. */
export function preventReceiptImplicitSubmit(event) {
  const control = event.target;
  if (event.key !== 'Enter' || control?.tagName !== 'INPUT' || event.isComposing) return;
  if (ACTION_INPUT_TYPES.includes(control.type)) return;
  event.preventDefault();
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const panel = control.closest?.('.review-panel');
  if (!panel) return;
  const fields = [...panel.querySelectorAll(EDITABLE_CONTROLS)].filter(field =>
    !field.matches(':disabled') && !field.readOnly && field.tabIndex >= 0 &&
    field.getClientRects().length && !ACTION_INPUT_TYPES.includes(field.type));
  const index = fields.indexOf(control);
  if (index < 0) return;
  // O último campo nunca transfere Enter ao botão de lançamento.
  fields[index + (event.shiftKey ? -1 : 1)]?.focus();
}
