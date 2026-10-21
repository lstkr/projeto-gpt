import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Gerencia foco e teclado dos diálogos existentes sem alterar seus fluxos de negócio.
 * O fechamento continua sendo decidido pelo chamador (ex.: bloquear durante salvamento).
 */
export function useAccessibleDialog(dialogKey, onRequestClose) {
  const closeRef = useRef(onRequestClose);
  const openerRef = useRef(null);
  closeRef.current = onRequestClose;

  // React autoFocus runs during mount, before this hook's dialog effect.
  // Track the triggering control in advance so closing always restores its focus.
  useEffect(() => {
    const rememberOpener = (event) => {
      if (document.querySelector('.overlay [role="dialog"][aria-modal="true"]')) return;
      const control = event.target?.closest?.('button, a, input, select, [tabindex]');
      if (control) openerRef.current = control;
    };
    document.addEventListener('focusin', rememberOpener, true);
    document.addEventListener('pointerdown', rememberOpener, true);
    return () => {
      document.removeEventListener('focusin', rememberOpener, true);
      document.removeEventListener('pointerdown', rememberOpener, true);
    };
  }, []);

  useEffect(() => {
    if (!dialogKey) return;

    const dialog = document.querySelector('.overlay [role="dialog"][aria-modal="true"]');
    if (!dialog) return;

    const activeElement = document.activeElement;
    const previouslyFocused = dialog.contains(activeElement) ? openerRef.current : activeElement;
    const background = [
      document.querySelector('.shell > .sidebar'),
      document.querySelector('.shell > .main')
    ].filter(Boolean);
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });

    // Permite focar o título/conteúdo do diálogo caso não haja controles disponíveis.
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;

    const focusableElements = () => Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));

    const initialFocus = dialog.querySelector('[autofocus]') || focusableElements()[0] || dialog;
    initialFocus.focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (!dialog.isConnected) return;

      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [dialogKey]);
}
