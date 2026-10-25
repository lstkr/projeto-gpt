import { useEffect, useRef } from 'react';

const FIELD_SELECTOR = [
  '[data-initial-focus]', '[autofocus]',
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled])', 'textarea:not([disabled])'
].join(', ');

function visible(element) {
  return Boolean(element && element.getClientRects().length && !element.closest('[inert]'));
}

export function focusFirstRelevant(container) {
  if (!container || container.closest('[inert]')) return null;
  const field = Array.from(container.querySelectorAll(FIELD_SELECTOR)).find(visible);
  const target = field || Array.from(container.querySelectorAll('h1, h2, h3, button:not([disabled]), a[href]')).find(visible) || container;
  if (!target.hasAttribute('tabindex') && target === container) target.tabIndex = -1;
  if (/^H[1-3]$/.test(target.tagName) && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  const rect = target.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  return target;
}

/** Focuses a newly opened panel once, and optionally restores its opener on close. */
export function useAccessibleFocus(key, selector, { restoreFocus = false } = {}) {
  const previousKey = useRef(key);
  const opener = useRef(null);
  const activeKey = useRef(key);
  activeKey.current = key;

  useEffect(() => {
    if (!restoreFocus) return undefined;
    const rememberOpener = (event) => {
      if (activeKey.current) return;
      const control = event.target?.closest?.('button, a[href]');
      if (control) opener.current = control;
    };
    document.addEventListener('pointerdown', rememberOpener, true);
    document.addEventListener('focusin', rememberOpener, true);
    return () => {
      document.removeEventListener('pointerdown', rememberOpener, true);
      document.removeEventListener('focusin', rememberOpener, true);
    };
  }, [restoreFocus]);

  useEffect(() => {
    if (previousKey.current === key) return undefined;
    const wasOpen = Boolean(previousKey.current);
    previousKey.current = key;
    if (!key) {
      if (restoreFocus && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
      opener.current = null;
      return undefined;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled || activeKey.current !== key) return;
      focusFirstRelevant(document.querySelector(selector));
    });
    if (!wasOpen && !restoreFocus) opener.current = null;
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [key, selector, restoreFocus]);
}
