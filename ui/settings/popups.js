// =====================================================================================================================
//  Popups: the general dialog, our own right-click menu, release notes, and the update dialog.
// =====================================================================================================================
import { $, call, el, invoke, toast } from './helpers.js';
import { frame, previewSrc, saveNow, updateObs } from './preview.js';
import { headingOf, sectionOf } from './release-notes.js';
import { render } from './settings.js';
import {
  MAX_LAYOUTS,
  settings,
  lastUpdate,
  layouts,
  setLastUpdate,
  setLayouts,
  setObsUrl,
  setSelectedKey,
  setTab,
  setUpdateProgress,
  tab,
  updateProgress,
} from './state.js';
import { TEXT } from './text.js';

// ---- Keyboard focus for popups ------------------------------------------------------------------------------------------
// Three popups (the general dialog, the release notes, the update dialog) show and hide themselves by toggling `hidden`.
// This one place gives all of them proper keyboard behaviour: when a popup opens, focus moves into it; while it is open,
// Tab and Shift+Tab stay inside it; when it closes, focus goes back to whatever opened it.
const POPUPS = ['#dlg', '#modal', '#updModal'];
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openers = new Map(); // popup element -> the element that had focus when it opened, and its test hook
// The popups move focus into themselves the moment they open, so "what had focus" is tracked as it changes: the last
// element focused outside every popup.
let lastFocusOutsidePopups = /** @type {HTMLElement | null} */ (null);
document.addEventListener('focusin', (focusEvent) => {
  const target = /** @type {HTMLElement} */ (focusEvent.target);
  if (!POPUPS.some((selector) => $(selector).contains(target))) lastFocusOutsidePopups = target;
});

const focusablesIn = (popup) => [...popup.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null);

const popupWatcher = new MutationObserver((records) => {
  for (const record of records) {
    const popup = /** @type {HTMLElement} */ (record.target);
    if (!popup.hidden) {
      const opener = lastFocusOutsidePopups;
      openers.set(popup, { element: opener, hook: opener?.dataset?.test });
      focusablesIn(popup)[0]?.focus();
    } else {
      const opener = openers.get(popup);
      openers.delete(popup);
      if (!opener) continue;
      // the tab behind the popup may have been redrawn meanwhile: then look for the button's twin by its test hook
      const target = document.contains(opener.element)
        ? opener.element
        : opener.hook && $(`[data-test="${opener.hook}"]`);
      target?.focus();
    }
  }
});
for (const selector of POPUPS) popupWatcher.observe($(selector), { attributes: true, attributeFilter: ['hidden'] });

addEventListener('keydown', (keyEvent) => {
  if (keyEvent.key !== 'Tab') return;
  const popup = POPUPS.map((selector) => $(selector)).find((item) => !item.hidden);
  const items = popup ? focusablesIn(popup) : [];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const outside = !popup.contains(document.activeElement);
  if (outside || (keyEvent.shiftKey && document.activeElement === first)) {
    keyEvent.preventDefault();
    (outside || !keyEvent.shiftKey ? first : last).focus();
  } else if (!keyEvent.shiftKey && document.activeElement === last) {
    keyEvent.preventDefault();
    first.focus();
  }
});

// ---- 6a. The general-purpose dialog (new layout, limit reached, reset). Same look as the release-notes and update
// popups.
/**
 * Show a dialog. buttons: [{ label, test?, primary?, danger?, run? }]. `test` is the button's test hook. If `run` returns
 * false the dialog stays open.
 */
function dialog({ title, body, buttons }) {
  $('#dTitle').textContent = title;
  $('#dBody').replaceChildren(...body);
  const close = () => {
    $('#dlg').hidden = true;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  $('#dFoot').replaceChildren(
    ...buttons.map((buttonSpec) =>
      el('button', {
        type: 'button',
        textContent: buttonSpec.label,
        className: buttonSpec.primary ? 'primary' : buttonSpec.danger ? 'danger' : '',
        test: buttonSpec.test,
        onclick: async () => {
          if (!buttonSpec.run || (await buttonSpec.run()) !== false) close();
        },
      }),
    ),
  );
  $('#dlg').hidden = false;
  document.addEventListener('keydown', onKey);
  return close;
}

export function addLayoutDialog() {
  if (layouts.filter((l) => l.user).length >= MAX_LAYOUTS) {
    dialog({
      title: 'Max layouts reached',
      body: [el('p', { textContent: TEXT.layoutLimitReached(MAX_LAYOUTS) })],
      buttons: [{ label: 'OK', test: 'dialog-ok', primary: true }],
    });
    return;
  }
  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Layout name',
    maxLength: 30,
    test: 'dialog-layout-name',
  });
  const create = async () => {
    try {
      const id = await invoke('create_layout', { name: nameInput.value });
      setLayouts(await call('list_layouts'));
      settings.layout.id = id;
      setSelectedKey(null);
      setTab('keys');
      toast('Layout created. Click keys to hide the ones you don’t want.');
      render();
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') $('#dFoot .primary').click();
  };
  dialog({
    title: 'New layout',
    body: [el('p', { textContent: TEXT.newLayoutHelp }), nameInput],
    buttons: [
      { label: 'Cancel', test: 'dialog-cancel' },
      { label: 'Create', test: 'dialog-create', primary: true, run: create },
    ],
  });
  nameInput.focus();
}

export function resetDialog() {
  const reset = async () => {
    try {
      setObsUrl(await invoke('reset_settings'));
      frame.src = previewSrc();
      updateObs();
      toast('All settings reset');
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: 'Reset all settings?',
    body: [el('p', { textContent: TEXT.resetBodyWhatChanges }), el('p', { textContent: TEXT.resetBodyLinkNote })],
    buttons: [
      { label: 'Cancel', test: 'dialog-cancel' },
      { label: 'Reset everything', test: 'dialog-reset-confirm', danger: true, run: reset },
    ],
  });
}

// ---- 6b. Our own right-click menu. The browser's menu never appears; only layout cards show this one.
let menuEl = null;

export function hideMenu() {
  menuEl?.remove();
  menuEl = null;
}

/** Show a small menu at the mouse. items: [{ label, run?, danger?, disabled? }] */
export function showMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  hideMenu();
  menuEl = el(
    'div',
    { className: 'ctxmenu', test: 'context-menu' },
    items.map((item) =>
      el('button', {
        test: 'context-menu-item',
        type: 'button',
        textContent: item.label,
        className: item.danger ? 'danger' : '',
        disabled: !!item.disabled,
        onclick: () => {
          hideMenu();
          item.run?.();
        },
      }),
    ),
  );
  document.body.append(menuEl);
  const box = menuEl.getBoundingClientRect(); // keep the menu fully inside the window
  menuEl.style.left = Math.max(4, Math.min(event.clientX, innerWidth - box.width - 4)) + 'px';
  menuEl.style.top = Math.max(4, Math.min(event.clientY, innerHeight - box.height - 4)) + 'px';
}

// layout cards call showMenu first, which stops this
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener(
  'mousedown',
  (e) => {
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
  },
  true,
);

addEventListener('blur', hideMenu);

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
});

// nothing in this window can be dragged away
addEventListener('dragstart', (e) => e.preventDefault());

// ---- 6c. Release notes ("What's new"), fetched from GitHub
/**
 * A tiny, safe markdown reader: headings, bullets, **bold** and `code`. Everything is inserted as plain text.
 * Release-note sections (release-notes.js) get their colour: the heading and the list under it share a notes-<kind>
 * class.
 */
export function md(source) {
  const fragment = document.createDocumentFragment();
  let list = null;
  let sectionClass = ''; // e.g. "notes-section notes-fixed" while inside the Fixed section
  const inline = (parent, text) => {
    // turns **bold** and `code` into elements
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0,
      match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) parent.append(text.slice(last, match.index));
      parent.append(
        match[0].startsWith('**')
          ? el('strong', { textContent: match[0].slice(2, -2) })
          : el('code', { textContent: match[0].slice(1, -1) }),
      );
      last = match.index + match[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  };
  for (const rawLine of source.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links become plain text
    let match;
    if (!line.trim()) {
      list = null;
      continue;
    }
    const headingText = headingOf(line);
    if (headingText !== null) {
      list = null;
      const section = sectionOf(headingText);
      sectionClass = section ? `notes-section notes-${section.kind}` : '';
      const heading = el('h4', { className: sectionClass });
      inline(heading, headingText);
      fragment.append(heading);
    } else if ((match = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      if (!list) {
        list = el('ul', { className: sectionClass });
        fragment.append(list);
      }
      const li = el('li');
      inline(li, match[1]);
      list.append(li);
    } else {
      list = null;
      const paragraph = el('p');
      inline(paragraph, line);
      fragment.append(paragraph);
    }
  }
  return fragment;
}

function closeModal() {
  $('#modal').hidden = true;
  document.removeEventListener('keydown', closeOnKey);
}

const closeOnKey = (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') closeModal();
};

/*
 * "Typing" reveal for the release notes. Each piece of text is split into [typed part][hidden rest]. The hidden rest
 * still takes up its space, so nothing shifts or re-wraps while typing. It runs on animation frames for under a
 * second and leaves no timer behind.
 */
let typingRun = 0;

function typeIn(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // respect the "reduce motion" setting
  const run = ++typingRun;
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) if (node.nodeValue) textNodes.push(node);
  const parts = textNodes.map((node) => {
    const full = node.nodeValue,
      typed = document.createTextNode(''),
      rest = el('span', { textContent: full });
    rest.style.visibility = 'hidden';
    /** @type {ChildNode} */ (node).replaceWith(typed, rest);
    return { full, typed, rest, done: 0 };
  });
  const total = parts.reduce((sum, p) => sum + p.full.length, 0);
  if (!total) return;
  const duration = Math.min(800, Math.max(300, total * 7)); // always under one second
  let shown = 0,
    index = 0,
    startTime = 0;
  const step = (now) => {
    if (run !== typingRun || $('#modal').hidden) return; // cancelled or closed
    startTime ||= now;
    const want = Math.min(total, Math.ceil((total * (now - startTime)) / duration));
    while (shown < want && index < parts.length) {
      const part = parts[index],
        take = Math.min(part.full.length - part.done, want - shown);
      if (take > 0) {
        part.done += take;
        shown += take;
        part.typed.nodeValue = part.full.slice(0, part.done);
        part.rest.textContent = part.full.slice(part.done);
      }
      if (part.done >= part.full.length) {
        part.rest.remove();
        index++;
      } else break;
    }
    if (shown < total) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // safety net if animation frames are paused
  setTimeout(() => {
    if (run !== typingRun) return;
    for (const part of parts) {
      part.typed.nodeValue = part.full;
      part.rest.remove();
    }
  }, duration + 400);
}

/** Three dots that appear one after another while the notes load (pure CSS animation). */
const loadingDots = () =>
  el(
    'p',
    { className: 'dots', role: 'status', ariaLabel: 'Loading release notes' },
    el('span', { textContent: '.' }),
    el('span', { textContent: '.' }),
    el('span', { textContent: '.' }),
  );

export async function showNotes(version, title) {
  typingRun++; // cancel any typing still going
  $('#mTitle').textContent = title || `Release notes — v${version}`;
  const body = $('#mBody');
  body.replaceChildren(loadingDots());
  $('#modal').hidden = false;
  document.addEventListener('keydown', closeOnKey);
  $('#mOk').focus();
  try {
    const notes = await invoke('get_release_notes', { version });
    if ($('#modal').hidden) return;
    body.replaceChildren(
      notes.body.trim()
        ? md(notes.body)
        : el('p', { className: 'hint', textContent: 'This release has no written notes.' }),
    );
    typeIn(body);
  } catch (error) {
    if (!$('#modal').hidden) body.replaceChildren(el('p', { className: 'hint', textContent: String(error) }));
  }
}

$('#mOk').onclick = closeModal;

// ---- 6d. The update button (bottom-left corner) and its dialog.
//      Nothing is downloaded or installed until the user clicks the button AND confirms in the dialog.
let updateBusy = false;

/** Remember the latest update answer and show or hide the corner button. */
export function setUpdate(result) {
  setLastUpdate(result);
  $('#updateBtn').hidden = !(result && result.available);
  return result;
}

/** A new answer arrived (from a background check); redraw General only if it actually changed. */
export function showUpdateResult(result) {
  const isNew = JSON.stringify(result) !== JSON.stringify(lastUpdate);
  setUpdate(result);
  if (isNew && tab === 'general') render();
}

export function openUpdateDialog() {
  const update = lastUpdate;
  if (!update?.available) return;
  $('#uTitle').textContent = `Update available — v${update.version}`;
  $('#uBody').replaceChildren(
    ...[
      el('p', {
        className: 'hint',
        textContent: `You have v${update.current} · ${update.channel === 'latest' ? 'Latest' : 'Stable'} channel`,
      }),
      update.manual ? el('p', { textContent: TEXT.manualInstallDialog }) : null,
      update.notes ? md(update.notes) : null,
      // replaceChildren would print "null" for empty slots
    ].filter(Boolean),
  );
  $('#uGo').textContent = update.manual ? 'Open GitHub installer' : 'Update now';
  $('#uGo').disabled = $('#uLater').disabled = false;
  updateBusy = false;
  setUpdateProgress(null);
  paintProgress();
  $('#uText').textContent = '';
  $('#updModal').hidden = false;
  $('#uGo').focus();
}

$('#updateBtn').onclick = openUpdateDialog;

$('#uLater').onclick = () => {
  if (!updateBusy) $('#updModal').hidden = true;
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !updateBusy && !$('#updModal').hidden) $('#updModal').hidden = true;
});

$('#uGo').onclick = async () => {
  const update = lastUpdate;
  if (!update?.available) return;
  if (update.manual) {
    // cannot be installed from inside the app
    try {
      await invoke('open_release_page', { url: update.url });
    } catch (error) {
      toast(String(error), true);
    }
    return;
  }
  updateBusy = true;
  $('#uGo').disabled = $('#uLater').disabled = true;
  // nothing pending when the app restarts
  await saveNow();
  setUpdateProgress({ pct: 0, text: 'Starting download…' });
  paintProgress();
  try {
    // downloads, verifies the signature, installs, restarts
    await invoke('install_update');
  } catch (error) {
    updateBusy = false;
    setUpdateProgress(null);
    paintProgress();
    $('#uText').textContent = String(error);
    $('#uGo').disabled = $('#uLater').disabled = false;
  }
};

/** Draw the download progress bar in the update dialog and, if General is showing, in General too. */
export function paintProgress() {
  const dialogBar = $('#uBar');
  if (dialogBar) {
    dialogBar.hidden = !updateProgress;
    $('#uFill').style.width = (updateProgress ? Math.max(0, updateProgress.pct) : 0) + '%';
    // negative = size unknown, show a moving bar
    $('#uFill').classList.toggle('indet', !!updateProgress && updateProgress.pct < 0);
    if (updateProgress) $('#uText').textContent = updateProgress.text;
  }
  const bar = $('#upBar'),
    fill = $('#upFill'),
    text = $('#upText');
  if (!bar) return; // General is not showing
  bar.hidden = !updateProgress;
  if (updateProgress) {
    fill.style.width = updateProgress.pct + '%';
    fill.classList.toggle('indet', updateProgress.pct < 0);
    text.textContent = updateProgress.text;
  } else text.textContent = '';
}
