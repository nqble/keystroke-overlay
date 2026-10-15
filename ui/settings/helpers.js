// =====================================================================================================================
//  Small helpers every module uses: talking to the Rust side, building page elements, toasts.
// =====================================================================================================================

export const { invoke } = window.__TAURI__.core; // call a Rust command:  await invoke('name', { args })

export const ev = window.__TAURI__.event; // listen for messages the Rust side sends us

export const $ = (selector, root = document) => root.querySelector(selector);

/** Read / write a value inside an object using a dotted path:  get(S, 'style.radius')  /  put(S, 'style.radius', 8) */
export const get = (obj, path) => path.split('.').reduce((o, key) => o?.[key], obj);

export function put(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, key) => o[key], obj)[last] = value;
}

/** Make a page element:  el('button', { textContent: 'Hi', onclick }, child1, child2) */
export function el(tag, props = {}, ...children) {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) element.append(child);
  return element;
}

export const heading = (text) => el('h2', { textContent: text });

export const note = (text) => el('p', { className: 'note', textContent: text });

export const button = (text, onclick, className = '') => el('button', { textContent: text, onclick, className });

/** One settings row: a label on the left, controls on the right. */
export const row = (label, ...controls) =>
  el('div', { className: 'row' }, el('label', { textContent: label }), el('div', { className: 'ctl' }, controls));

/** A small message at the bottom of the window. */
export function toast(message, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.className = isError ? 'err' : '';
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
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
