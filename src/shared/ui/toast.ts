/**
 * Toast notification — a non-blocking, auto-dismissing UI feedback element.
 */

import { CONFIG } from '@shared/config';

type ToastType = 'success' | 'error' | 'warn' | 'info';

export function showToast(message: string, type: ToastType = 'success'): void {
  const existing = document.getElementById('unix-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'unix-toast';
  el.textContent = message;

  Object.assign(el.style, {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    backgroundColor: CONFIG.ui.colors[type],
    color: '#fff',
    padding: '10px 24px',
    borderRadius: '12px',
    zIndex: '9999999',
    opacity: '0',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    if (el.parentNode) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(10px)';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }
  }, CONFIG.delays.toastLife);
}
