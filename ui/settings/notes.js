// =====================================================================================================================
//  Release notes ("What's new"), fetched from GitHub: a tiny safe markdown reader with colored sections
//  (release-notes.js), the quick typing reveal, and the notes popup.
// =====================================================================================================================
import { $, el, invoke } from './helpers.js';
import { popupKeys } from './popup.js';
import { headingOf, sectionOf } from './release-notes.js';

/**
 * A tiny, safe markdown reader: headings, bullets, **bold** and `code`. Everything is inserted as plain text.
 * Release-note sections (release-notes.js) get their color: the heading and the list under it share a notes-<kind>
 * class.
 */
export function md(source) {
  const reader = { fragment: document.createDocumentFragment(), list: null, sectionClass: '' };
  for (const rawLine of source.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links become plain text
    readLine(reader, line);
  }
  return reader.fragment;
}

/** One line of the notes: a blank line ends a list; otherwise a heading, a bullet or a paragraph. */
function readLine(reader, line) {
  if (!line.trim()) {
    reader.list = null;
    return;
  }
  const headingText = headingOf(line);
  if (headingText !== null) return addHeading(reader, headingText);
  const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
  if (bullet) return addBullet(reader, bullet[1]);
  reader.list = null;
  reader.fragment.append(withInline(el('p'), line));
}

/** A heading; a known release-note section also colors the list under it (class e.g. "notes-section notes-fixed"). */
function addHeading(reader, headingText) {
  const section = sectionOf(headingText);
  reader.list = null;
  reader.sectionClass = section ? `notes-section notes-${section.kind}` : '';
  reader.fragment.append(withInline(el('h4', { className: reader.sectionClass }), headingText));
}

function addBullet(reader, text) {
  if (!reader.list) {
    reader.list = el('ul', { className: reader.sectionClass });
    reader.fragment.append(reader.list);
  }
  reader.list.append(withInline(el('li'), text));
}

/** Fills `parent` with `text`, turning **bold** and `code` into elements (always as plain text, never as HTML). */
function withInline(parent, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    parent.append(inlineElement(match[0]));
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
  return parent;
}

function inlineElement(marked) {
  if (marked.startsWith('**')) return el('strong', { textContent: marked.slice(2, -2) });
  return el('code', { textContent: marked.slice(1, -1) });
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
    rest.classList.add('invisible');
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
    if (run !== typingRun || $('#modal').hidden) return; // canceled or closed
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
