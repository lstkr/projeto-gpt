const EDITABLE_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="file"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])';

/** Foca o destino visível sem disputar o foco com um diálogo aberto. */
export function focusNavigationDestination(documentRoot) {
  if (documentRoot.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const main = documentRoot.querySelector('main.main');
  if (!main || main.closest('[inert]')) return;
  const form = main.querySelector('.cash-entry form, .manual-entry-panel, .review-panel');
  const editable = form && Array.from(form.querySelectorAll(EDITABLE_SELECTOR))
    .find((element) => element.getClientRects().length && !element.matches(':disabled') && !element.closest('[inert]'));
  const target = editable || main.querySelector('h1');
  if (!target) return;
  if (!editable) target.tabIndex = -1;
  target.focus({ preventScroll: false });
}
