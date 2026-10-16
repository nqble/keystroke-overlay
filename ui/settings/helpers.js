// =====================================================================================================================
//  Small helpers every module uses: talking to the Rust side, building page elements, toasts.
//  It imports only text.js (the words, which imports nothing), so every other module can import it without a cycle.
// =====================================================================================================================
import { TEXT } from './text.js';

export const { invoke } = window.__TAURI__.core; // call a Rust command:  await invoke('name', { args })

export const tauriEvent = window.__TAURI__.event; // listen for messages the Rust side sends us

export const $ = (selector, root = document) => root.querySelector(selector);

/** Read / write a value inside an object using a dotted path:  get(settings, 'style.radius')  /  put(settings, 'style.radius', 8) */
export const get = (obj, path) => path.split('.').reduce((o, key) => o?.[key], obj);

export function put(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, key) => o[key], obj)[last] = value;
}

/**
 * Make a page element:  el('button', { textContent: 'Hi', onclick }, child1, child2)
 * The special property `test` becomes the data-test attribute, a stable name the end-to-end tests use to find the element
 * (see "Test hooks" in tests/README.md). It is an attribute only: no style may use it.
 */
export function el(tag, props = {}, ...children) {
  const { test, ...otherProps } = props;
  const element = Object.assign(document.createElement(tag), otherProps);
  if (test) element.dataset.test = test;
  for (const child of children.flat()) if (child != null) element.append(child);
  return element;
}

export const heading = (text) => el('h2', { textContent: text, test: 'section-heading' });

export const note = (text) => el('p', { className: 'note', textContent: text });

export const button = (text, onclick, className = '', test = '') =>
  el('button', { textContent: text, onclick, className, test });

/** One settings row: a label on the left, controls on the right. */
let fieldCounter = 0;

/**
 * One settings row: a label on the left, controls on the right. The label is linked to the first field in the row (so a
 * screen reader reads it out, and clicking the label focuses the field or toggles the tickbox).
 */
export const row = (label, ...controls) => {
  const labelElement = el('label', { textContent: label });
  const field = controls.flat().find((control) => control?.matches?.('input, select, textarea, button'));
  if (field) {
    field.id ||= `field-${++fieldCounter}`;
    labelElement.htmlFor = field.id;
  }
  return el('div', { className: 'row' }, labelElement, el('div', { className: 'ctl' }, controls));
};

// The timer that hides the current toast, so a new message restarts it.
let toastTimer = 0;

/** A small message at the bottom of the window. */
export function toast(message, isError = false) {
  const toastElement = $('#toast');
  toastElement.textContent = message;
  toastElement.className = isError ? 'err' : '';
  toastElement.setAttribute('role', isError ? 'alert' : 'status'); // read out by screen readers
  toastElement.title = isError ? TEXT.clickToDismiss : '';
  toastElement.onclick = () => {
    toastElement.hidden = true;
  };
  toastElement.hidden = false;
  clearTimeout(toastTimer);
  // a normal message goes away by itself; an error stays until it is clicked (or the next message replaces it)
  if (!isError) {
    toastTimer = setTimeout(() => {
      toastElement.hidden = true;
    }, 2600);
  }
}

/** Run a Rust command; if it fails, show the error in a toast and pass the failure on. */
export async function call(command, args) {
  try {
    return await invoke(command, args);
  } catch (error) {
    toast(String(error), true);
    throw error;
  }
}

/** For risky buttons: the first click asks "Click again to confirm", the second click really does it. */
export function confirmTwice(btn, normalText, action) {
  let timer = 0;
  btn.onclick = () => {
    if (!timer) {
      btn.textContent = 'Click again to confirm';
      timer = setTimeout(() => {
        timer = 0;
        btn.textContent = normalText;
      }, 3500);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    btn.textContent = normalText;
    action();
  };
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
