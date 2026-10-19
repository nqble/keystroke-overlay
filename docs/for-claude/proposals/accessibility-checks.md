# Proposal: automatic accessibility checks with axe-core in the end-to-end tests

Status: **Proposed** (2026-10-19, Advisory session research; not approved)

How the e2e tests could check the settings window for accessibility problems on every run, with
[axe-core](https://github.com/dequelabs/axe-core), without loosening the window's content-security policy and without
shipping anything new to users.

## Goal

- A new e2e suite, `a11y`, opens every tab and the main popups of the **real** settings window (WebView2, the test copy of
  the app) and runs axe-core on each.
- It **fails** on the two basics that [ACCESSIBILITY.md](../../ACCESSIBILITY.md) and CLAUDE.md section 5 call firm:
  everything clickable works with the keyboard, and every control has a name.
- It **reports, without failing,** everything in the "aim for" group (contrast, landmarks, headings, target size), so
  regressions show up but never block a change.
- axe-core lives only in `tests/`, is loaded only by the test harness, and is never part of a build or an installer.

## Non-goals

- Not a replacement for the hands-on screen-reader pass that ACCESSIBILITY.md still lists (axe finds roughly the
  machine-checkable part; it can't say whether a screen makes sense when heard).
- No change to the content-security policy in `src-tauri/tauri.conf.json`, and no "bypass the policy" switch in tests.
- No checks of the overlay page OBS shows (it has no controls; the live preview frame is skipped).
- No new CI job in the first version: the suite runs where the e2e runs (Windows, locally and in the non-blocking
  **E2E (Windows)** workflow).
- No npm package added to `package.json` (see "How axe gets into the repository").

## How it works

### axe-core, as of 2026-10

| | |
|---|---|
| License | MPL-2.0 (file-level copyleft: we may use and ship it next to MIT code; if we changed `axe.min.js` itself, our changes to that file would be MPL-2.0 too. We don't change it) |
| Versions | 4.13.0 (2026-08-05), 4.14.0 (2026-10-05) |
| File | `axe.min.js`, about 580 KB (about 155 KB gzipped), one script that defines `window.axe` |
| API | `axe.run(context, options)` returns `{ violations, incomplete, passes, inapplicable }`; each result has a rule `id`, `impact`, `tags`, `helpUrl` and the `nodes` (with a CSS `target`) |
| Eval | The built-in rules use a table of functions; `new Function` is used only for custom rules or messages passed as text, which this suite never does. So the default rules run under `script-src 'self'` without `unsafe-eval` (to confirm in step 1: the suite fails on any policy violation while axe runs) |

### How axe gets into the window without touching the policy

The window's policy is `script-src 'self'` (no inline scripts, no other sites), and the `csp` suite proves it blocks a
`<script>` added to the page. The e2e suites don't add scripts: they drive the window through the Chrome DevTools Protocol
on port 9222 (`tests/e2e/lib/cdp.mjs`), and code sent with `Runtime.evaluate` runs with DevTools' rights, not as a page
script, so the policy doesn't apply to it. Every suite already works this way under the same policy.

So the suite does this, and only this:

1. Read `tests/e2e/vendor/axe-core/axe.min.js` from disk (Node, in the test runner).
2. Send its text once with `Runtime.evaluate` into the settings page's context (the `send()` that `connect()` returns; the
   `ev()` helper wraps code in an async function, which isn't needed for a library file).
3. Listen for `securitypolicyviolation` events the way the `csp` suite does, and fail if axe causes any.
4. Call `axe.run(...)` through `ev()` for each screen and bring back only what the report needs (rule id, impact, help
   URL, and for each node its target and the nearest `data-test` name).

What it never does: change `tauri.conf.json`, call `Page.setBypassCSP`, add a `<script>` element, or put any file in
`ui/`. The app restarts before every suite (`run.mjs`), so `window.axe` never outlives this suite.

### How axe gets into the repository

Copied in, like Preact and htm ([v2-preact.md](done/v2-preact.md)), by `tools/vendor.mjs`:

- `LIBRARIES` gets an entry for `axe-core` at an exact version, with the files `axe.min.js`, `LICENSE` and
  `LICENSE-3RD-PARTY.txt`, and a **target folder** per library (today the tool has one `VENDOR_DIR`): `ui/settings/vendor/`
  for Preact and htm, `tests/e2e/vendor/axe-core/` for axe.
- The tool already downloads from npm, checks npm's integrity hash and writes `VENDOR.json` with each file's SHA-256; the
  same for axe. `tests/ui/vendor.test.mjs` checks the new folder too.
- `tools/vendor.mjs --check` (run by the weekly **Security** scan) then also lists newer axe versions and advisories.
- `.prettierignore` gets `tests/e2e/vendor`; `check-style.mjs` and `check-docs.mjs` already skip folders named `vendor`.
- **Never shipped:** the app's web files are `ui/settings/` (`frontendDist`) and the overlay's are `ui/overlay/`
  (`include_dir!`), so nothing in `tests/` can reach a build. A new line in `tools/check-privacy.mjs` makes it explicit:
  no file under `ui/` may name `axe`, and no file outside `tests/` may load `tests/e2e/vendor/`.

The other way, an npm `devDependency`, is in the open questions: Dependabot would see it, but every `npm ci` (CI, every
contributor) would download 3 MB for a suite only Windows runs.

### Which rules, in which group

All rules with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice` run
(`runOnly: { type: 'tag', values: [...] }`), with `iframes: false` (the live preview is the overlay page from the local
server; its frame element is still checked for a title). Results are then sorted into two groups by rule id, in one table
in the suite (`BASIC_RULES`), so it is one place to change.

**Basic: fails the suite.** These are the two firm rules, as axe can see them:

| Firm rule | axe rules |
|---|---|
| Every control has a name | `button-name`, `input-button-name`, `label`, `select-name`, `link-name`, `aria-input-field-name`, `aria-toggle-field-name`, `aria-command-name`, `aria-progressbar-name`, `aria-dialog-name`, `frame-title`, `image-alt`, `svg-img-alt` |
| Works with the keyboard | `nested-interactive`, `scrollable-region-focusable`, `aria-hidden-focus`, `tabindex` |
| The names and roles are real (otherwise a screen reader can't say them) | `aria-allowed-attr`, `aria-required-attr`, `aria-valid-attr`, `aria-valid-attr-value`, `aria-roles`, `aria-required-children`, `aria-required-parent` |

**Aim for: printed, never fails.** Every other rule that runs, for example `color-contrast`, `target-size`, `region`,
`heading-order`, `landmark-*`, `document-title`, `html-has-lang`.

**Needs review** (axe's `incomplete`, for example contrast over a gradient): printed under its own heading, never fails.

### Which screens

Each one is reached through `data-test` hooks only, as `tests/README.md` requires:

| Screen | How the suite gets there |
|---|---|
| Layout, Keys, Style, Animation, General tabs | `tab` + `data-tab` |
| Keys tab with one key selected, and with several | `key-cell` clicks, as `keys-editor` does |
| The Reset ▾ and "⋯" menus | `keys-reset-menu`, `layout-menu` (`context-menu` open) |
| New layout popup with Other layouts open | `layout-add`, `other-layouts-toggle` |
| Reset all settings popup | `general-reset` |
| General with Advanced open, and with the secure link on | `general-advanced-toggle`, `secure-link-toggle` |
| The update popup and the release-notes popup | Debug mode on, `debug-fake-update`, `debug-whats-new` |
| Debug tab | `toggle-general-debug-mode` |
| First run setup | `general-first-run` |

The macOS and Linux keyboard-access notice can't be shown on Windows; it is covered when a non-Windows e2e exists
(below).

### The report

- One `check()` line per Basic rule per screen, so a failure reads like any other e2e failure:
  `FAIL  a11y basic, Keys tab: button-name — [data-test="key-undo"] (https://dequeuniversity.com/rules/axe/4.13/button-name)`.
- After the checks, an "Aim for" list grouped by rule, with the screens and `data-test` names it was found on, and a
  "Needs review" list. Printed only; nothing is saved in the repository.
- `--suite a11y -- --json <file>` writes the full axe results to a file the person picks, for working through a list.

### How it fits ACCESSIBILITY.md

- The page keeps "guidance, not a gate" for the "aim for" items. A new short section **Automatic checks** says what the
  suite checks, which group fails and why, and how to run it (`npm run test:e2e -- --suite a11y`).
- The audit table gets a column **axe rule** for the rows axe can see (row 1: `nested-interactive` or `button-name`; row 3:
  `label`; row 4: `color-contrast`; and so on), so a future finding links to the row it belongs to.
- A new "aim for" finding from the suite becomes a row in that table with status "Open", in the same change that first
  shows it, not a silent list in the test.
- "What is left" gets the result of the first run (step 2 below).

### Later: the same check without Windows

The UI sandbox (`npm run ui-sandbox`) serves the real settings window to any browser. A headless Chromium driven over the
same DevTools Protocol could run this suite on Linux CI, covering the macOS and Linux notices too. That needs a browser in
CI (a new dependency or a CI image change), so it is a separate proposal once this suite has proved itself.

## Files to change

| File | Change |
|---|---|
| `tests/e2e/vendor/axe-core/` (new) | `axe.min.js`, its two license files and `VENDOR.json`, written by `tools/vendor.mjs` |
| `tools/vendor.mjs` | A target folder per library; the axe entry |
| `tests/ui/vendor.test.mjs` | Check both vendor folders |
| `tests/e2e/suites/a11y.mjs` (new) | Load axe, the screens, the groups, the report |
| `tests/e2e/run.mjs` | `a11y` in `SUITES` (part of "all", since the Basic group must hold everywhere) |
| `tests/e2e/lib/cdp.mjs` | Maybe a small `loadScript(path)` helper next to `connect()`, if a second suite ever needs it (not before) |
| `tools/check-privacy.mjs` (+ tests) | `axe` never under `ui/`; `tests/e2e/vendor/` never loaded from outside `tests/` |
| `.prettierignore` | `tests/e2e/vendor` |
| `ui/settings/…` | Only the fixes the first run asks for, each its own commit |

## Privacy

Nothing changes for users: axe is not in the app, not in the installer, and loaded only into the throwaway test copy
(`com.keyoverlay.test`, port 7879). axe-core makes no network requests while it runs (its rule help links are only text in
the results); the policy's `connect-src` would block them anyway, and the suite's policy-violation check would fail. The
results hold page structure and `data-test` names, never key presses. `npm run check:privacy` keeps it out of `ui/`.

## Tests

- The suite itself, run three times in a row on Windows: same results each time (axe is deterministic for the same page).
- **It can fail:** on a scratch branch, remove the `aria-label` from one icon button and remove the label link of one
  control; the suite must fail with both, then pass again. Recorded in the pull request.
- No policy violations while axe loads and runs (in the suite).
- `tests/ui/vendor.test.mjs` covers the copied files; the privacy-check tests cover the new rule.
- The `csp` suite still passes unchanged (it is not touched).

## Docs to update

- [ACCESSIBILITY.md](../../ACCESSIBILITY.md): the **Automatic checks** section, the **axe rule** column, the first run's
  findings.
- [tests/README.md](../../../tests/README.md): the `a11y` suite in the list and in the suite names; that axe is a copied file
  in `tests/e2e/vendor/`, updated with `tools/vendor.mjs`.
- [ARCHITECTURE.md](../../ARCHITECTURE.md): the folder map's `tests/` line and the `vendor.mjs` description ("copies Preact,
  htm and, for the tests, axe-core").
- CONTRIBUTING.md, if it lists the checks to run before a change to the settings window.
- `docs/for-claude/README.md`: this plan's line and status.

## Risks

- **First run finds real problems.** Likely a few. They are fixed before the suite joins "all" (step 2), never hidden with
  an exception list.
- **False positives in Basic.** If axe flags something that is fine (for example a Preact pattern it misreads), the rule
  for that one element is turned off in the suite's options with a comment that says why and links the axe issue; never a
  whole rule, and Jordan sees it in review.
- **axe updates move results.** New rules land in the "aim for" group automatically (only listed ids fail), so an update
  can't suddenly fail the suite unless a Basic rule gets stricter; updates are a reviewed `tools/vendor.mjs` run.
- **Runtime:** about 1 to 3 seconds per screen, so 30 to 60 seconds for the suite.
- **580 KB file in git.** Once per version; the alternative is in the open questions.

## Work order

Each step its own commit, all checks between steps.

1. Jordan approves axe-core as a development dependency (CLAUDE.md section 7) and the copied-file route. Then:
   `tools/vendor.mjs` with target folders, the axe copy, `vendor.test.mjs`, `.prettierignore`, the privacy-check line.
2. `a11y.mjs` on the five tabs only, Basic group printed but not failing yet; run it, list what it finds in
   ACCESSIBILITY.md, and fix the Basic findings (one commit per fix, with the test that fails without it, as CLAUDE.md asks).
3. Turn on failing for the Basic group; add the remaining screens; the "aim for" and "needs review" report; `--json`.
4. Prove it can fail (the scratch-branch check), run the full e2e, add `a11y` to `SUITES`.
5. Docs: ACCESSIBILITY.md, tests/README.md, ARCHITECTURE.md, CONTRIBUTING.md.

## Effort

About 1 to 2 days for steps 1, 3, 4 and 5. Step 2 depends on what the first run finds: likely a few hours, more if contrast
or landmark work is taken on at the same time (it doesn't have to be).

## Open questions for Jordan

1. May axe-core (MPL-2.0) be added as a development-only dependency?
2. Copied file in `tests/e2e/vendor/` (proposed: pinned, fingerprinted, no download for anyone else) or an npm
   `devDependency` (Dependabot sees it, but every `npm ci` downloads it)?
3. Which version: 4.13.0 (two months old, like choosing Preact's mature line) or 4.14.0 (two weeks old)?
4. Is the Basic list right? In particular `tabindex` (a positive `tabindex`) and `aria-dialog-name` are best-practice rules
   in axe, not WCAG; they are in Basic because a missing dialog name and a jumbled Tab order lock people out.
5. Should `color-contrast` fail too, once the first run shows the window passes it (the tokens were fixed in v1.4.0)?
6. Later, a Linux CI run through the UI sandbox and a headless browser: worth a separate proposal?
