// =====================================================================================================================
//  Release notes ("What's new"), fetched from GitHub: a tiny safe markdown reader with coloured sections
//  (release-notes.js), the quick typing reveal, and the notes popup.
// =====================================================================================================================
import { $, el, invoke } from './helpers.js';
import { popupKeys } from './popup.js';
import { headingOf, sectionOf } from './release-notes.js';

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
}

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
  popupKeys('#modal', { onEscape: closeModal });
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
