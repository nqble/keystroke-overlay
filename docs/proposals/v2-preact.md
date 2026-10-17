# Plan: Preact + htm for the settings window (v2.0)

Status: **approved by Jordan (2026-10-17); steps 1–4 done (Jordan approved the header trial); step 5: Debug, General, Style and Layout done, Animation next**, on `advisor/v2.0`. It is
v2.0 work and changes nothing in v1.4. The libraries live in `ui/settings/vendor/` because the window only serves
`ui/settings/`.

## Why

The v2.0 redesign ([ui-design-v2.md](../design/ui-design-v2.md)) adds the screens where updating the page by hand gets
tangled: drag-to-reorder cards, galleries, menus, the first run setup screen and, above all, the key editor. Preact lets each
screen say what it looks like for the current state, and updates the page itself. That reads better top to bottom
(CLAUDE.md principle 2). htm writes the markup as plain JavaScript (``html`<button>…</button>` ``), so there is still **no
build step**: change a file, reload, see it.

Why these and not another framework: Preact is the React model most developers and Claude sessions already know, its
hooks keep a screen's state next to the code that draws it, it uses the normal page so our CSS files and tokens work as
they are, and it never builds code from text, so the settings window's security policy (`script-src 'self'`, no
`unsafe-eval`) allows it. Alpine, Vue without a build and petite-vue need `unsafe-eval`; Svelte, Solid (JSX) and React need
a build step.

## What we add

| File | What | Version | Size (gzip) |
|---|---|---|---|
| `ui/settings/vendor/preact.module.js` | Preact | 10.29.8 (2026-08-01) | 4.9 KB |
| `ui/settings/vendor/hooks.module.js` | Preact hooks (`useState`, `useEffect`, …) | 10.29.8 | 1.6 KB |
| `ui/settings/vendor/htm.module.js` | htm | 3.1.1 | 0.7 KB |
| `ui/settings/html.js` | ours: `html` = htm bound to Preact's `h`, plus re-exports | — | — |

- **Version choice:** Preact 11 is 2½ weeks old (11.0.1, 2026-10-08). For an app that runs next to a keyboard hook we take the
  mature 10.x line and move to 11 later as its own reviewed change.
- **Never from the internet.** The files are copied into the repository. Nothing is fetched at run time; the security
  policy already forbids it.
- **Two small changes to the copies, and only these.** `hooks.module.js` imports `"preact"` by bare name, which only works with a bundler or an inline
  import map (the policy blocks inline scripts). `tools/vendor.mjs` rewrites that one import to `./preact.module.js` while
  copying, and removes the source-map line at the end of each file (the maps aren't copied).
- **Pinned and checked.** `tools/vendor.mjs` downloads the exact versions from npm, checks npm's published integrity hash,
  copies the files and writes `ui/settings/vendor/VENDOR.json` (name, version, source URL, SHA-256 of each file as stored). A unit
  test fails if any vendored file's hash differs from VENDOR.json, so a hand edit or a corrupted copy can't slip in.
  Updating = run the tool with a new version, review the diff, commit (the same review as any dependency).
- **The privacy check** gets one narrow rule for `ui/settings/vendor/`: these files are checked against VENDOR.json instead of the
  line-by-line UI rules (minified library code contains strings like `http://www.w3.org` that are not requests). Every other
  UI file keeps the existing rules, and no code outside `ui/settings/vendor/` may import from a URL.
- **Licences:** Preact is MIT, htm is Apache-2.0 (both permissive and fine for this MIT project). Both require their
  licence text to ship with the code, so `tools/vendor.mjs` copies each `LICENSE` next to it, and
  `ui/settings/vendor/LICENSES.md` lists them.

## CLAUDE.md change (applied with step 1, after Jordan approves)

Section 4 today: "**No framework, no bundler, no build step for the UI.** Plain JavaScript ES modules and CSS."

Applied in step 1 (CLAUDE.md now reads): "**No bundler, no build step for the UI.** Plain JavaScript ES modules and CSS. The settings window uses
**Preact with htm** (copied into `ui/settings/vendor/`, pinned and hash-checked, see `docs/proposals/v2-preact.md`); write new
screens as Preact components with `html` from `ui/settings/html.js`. The overlay OBS shows stays plain JavaScript, with no
library."

## What stays the same

- **The overlay in OBS** (`ui/overlay/`) does not use Preact: it stays the smallest, fastest page it can be.
- **Plain logic stays plain.** Anything that can be a pure function (status wording, layout maths, release-note parsing)
  stays a pure function in its own file with unit tests in `tests/ui/`, exactly as today. Components only draw.
- **The rules in ui-design-v2.md and CLAUDE.md:** design tokens, `data-test` hooks, keyboard and screen-reader names, idle
  CPU at zero (no timers; Preact does nothing until state changes), only `transform` and `opacity` animate, and the window
  is fully destroyed on close.
- **Files stay small:** one component per file where it is more than a few lines, no file past about 400 lines.

## Steps (each its own commit, all checks and the UI sandbox between steps; stop and report on any failure)

1. **Vendor the libraries.** `tools/vendor.mjs`, `ui/settings/vendor/` with VENDOR.json and LICENSES.md, the hash test, the
   privacy-check rule, `ui/settings/html.js`, CLAUDE.md and ARCHITECTURE.md updated. No screen uses it yet.
2. **Trial on one small screen: the header** (status, Copy OBS link, Update ready). It is small, already built for v2.0
   and well covered by tests. Before and after: the same `data-test` hooks pass the e2e suite, the screenshots match, and
   window open time and memory are measured (`tests/bench/run.mjs`). **Jordan reviews this step** before the rest goes
   ahead; if Preact doesn't earn its place here, we stop and revert it.
3. **Shared building blocks as components:** section card, switch, segmented choice, gallery card, "⋯" menu, popup. Each
   has the states from ui-design-v2.md.
4. **One list of tabs** (step 5 of [v2-tab-restructure.md](v2-tab-restructure.md)), as the Preact app shell. Tabs not yet
   converted keep working inside it through a small wrapper that runs their old `render()`.
5. **Each tab as it is redesigned** (steps 6–11 of the tab plan): Debug, General, Style with Fonts, Layout, Animation, then
   the key editor. A tab is written once, in the new style.
6. **Tidy up** when the last tab is converted: remove the wrapper and any helper nothing uses any more.

## Step 2 results (the header trial)

The header's status, Copy OBS link and Update ready are one Preact component (`ui/settings/header.js`); `paintHeader()`
replaced the hand-written updates in messages.js, preview.js and update-popup.js. Measured in the UI sandbox (headless
Chromium; to confirm on Windows with `tests/bench/run.mjs`):

- **Looks:** 6 of 8 states pixel-identical; in the other 2, 15–18 pixels on the status pill's rounded edge differ by one
  shade out of 255 (anti-aliasing rounding, invisible). Same text, classes, test hooks and screen-reader names in all 8.
- **Behaviour:** 14 checks pass (status opens General, copying copies and clears "link changed", the arrow waits 150 ms,
  ignores a pass-over, always finishes, starts at once on keyboard focus, the chip opens the popup and focus returns on Esc).
- **Open time:** median about 79 ms before, 89 ms after (+10 ms, three runs of 30 each); preloading the library didn't help.
  A one-time cost: more Preact screens don't add to it.
- **Memory:** +174 KB of JavaScript heap, also one-time.
- **Idle:** no timers at all in 5 s of an idle open window.

## Risks and how we handle them

- **Two styles side by side** while tabs convert: the wrapper keeps them apart, and docs/EXTENDING.md says new screens use
  Preact.
- **A library bug or bad update:** pinned versions, hash check, and updates reviewed like any dependency.
- **Missed security fixes:** copied-in files are not npm dependencies, so neither Dependabot nor the weekly security scan
  sees them. `tools/vendor.mjs --check` lists newer versions and known advisories for the three libraries; the Monday
  Security scan runs it too, so a fix can't go unnoticed.
- **Speed or memory regressions:** measured at step 2 and again at the end; the budget is no visible change in open time and
  a few hundred KB of memory at most.
