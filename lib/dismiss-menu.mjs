/** Fecha o menu por interação externa ou Escape; devolve a limpeza dos listeners. */
export function listenForMenuDismiss(element, dismiss) {
  const owner = element.ownerDocument;
  function outside(event) {
    if (!element.contains(event.target)) dismiss();
  }
  function keyboard(event) {
    if (event.key !== 'Escape') return;
    dismiss();
    element.querySelector('button')?.focus();
  }
  owner.addEventListener('pointerdown', outside, true);
  owner.addEventListener('focusin', outside);
  owner.addEventListener('keydown', keyboard);
  return () => {
    owner.removeEventListener('pointerdown', outside, true);
    owner.removeEventListener('focusin', outside);
    owner.removeEventListener('keydown', keyboard);
  };
}
