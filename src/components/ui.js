/** Small shared UI helpers: page heads, toasts, modal. No app state in here. */
import { escapeHtml, $ } from '../utils/helpers.js';
import { icon } from './icons.js';

export function pageHead(kicker, title, sub = '') {
  return `<div class="page-head"><div><div class="page-kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1>${sub ? `<p class="subtle">${escapeHtml(sub)}</p>` : ''}</div></div>`;
}

export function actionCard(iconName, title, description, action) {
  return `<button class="card action-card" data-action="${action}"><div class="action-icon">${icon(iconName)}</div><div><strong>${escapeHtml(title)}</strong><div class="small">${escapeHtml(description)}</div></div>${icon('arrow', 18)}</button>`;
}

/* ------------------------------------------------------------------ toast */

const MAX_TOASTS = 3;
export function toast(message, type = 'info') {
  const region = $('#toast-region');
  if (!region) return;
  [...region.children].forEach((el) => { if (el.textContent === message) el.remove(); });
  while (region.children.length >= MAX_TOASTS) region.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${['success', 'warning', 'error'].includes(type) ? type : ''}`.trim();
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 4200 : 2600);
}
export function clearToasts() { const region = $('#toast-region'); if (region) region.replaceChildren(); }

/* ------------------------------------------------------------------ modal */

let lastFocus = null;
let onCloseCb = null;

export function modalShell(title, body, actions = '') {
  return `<div class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close', 17)}</button></div><div class="modal-body">${body}${actions ? `<div class="modal-actions">${actions}</div>` : ''}</div>`;
}

export function openModal(content, { onClose = null, label = 'Dialog' } = {}) {
  const root = $('#modal-root');
  if (!root.firstChild) lastFocus = document.activeElement;
  onCloseCb = onClose;
  root.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-label="${escapeHtml(label)}">${content}</div></div>`;
  document.body.classList.add('modal-open');
  const first = root.querySelector('select, input, button.primary-btn, button.danger-btn, .modal button');
  first?.focus({ preventScroll: true });
}
export function closeModal({ silent = false } = {}) {
  const root = $('#modal-root');
  if (!root.firstChild) return;
  root.replaceChildren();
  document.body.classList.remove('modal-open');
  const cb = onCloseCb; onCloseCb = null;
  if (!silent) cb?.();
  try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* element gone */ }
  lastFocus = null;
}
export const isModalOpen = () => !!$('#modal-root')?.firstChild;

/** Keep Tab inside the dialog. */
export function trapFocus(ev) {
  if (ev.key !== 'Tab') return;
  const modal = $('#modal-root .modal');
  if (!modal) return;
  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]')].filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}
