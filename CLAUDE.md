# Keystroke Overlay: how we build it

Read this before changing anything. It is the standing brief for every session and contributor, human or Claude.
When this file and your habits disagree, this file wins. When this file is unclear, ask before guessing.

## 1. Principles, in priority order

When two principles conflict, the higher one wins.

1. **Privacy first.** Keystrokes never touch disk, logs or the network. Only `src-tauri/src/commands/updates.rs` may use the
   network. The local server binds `127.0.0.1` only. `npm run check:privacy` enforces this; never weaken or bypass it.
2. **Readable by a newcomer.** Write for a developer who knows JavaScript or Rust but has never seen this project: they should
   understand a file by reading it top to bottom. Prefer obvious code over clever code, even when the clever version is shorter
   or slightly faster.
3. **Lightweight and fast.** Readability wins over small optimizations, but these promises are never broken: about 0% CPU at
   idle (no timers or polling while idle), the settings window fully destroyed on close, and animations using only
   `transform` and `opacity`. Measure before and after any change that could cost speed or memory.
4. **Simple to extend.** Layouts, themes and animations stay one plain file each. Don't add a step to that.

## 2. Code shape

- **Formatting is automatic.** Run `npm run format` before every commit; CI rejects unformatted code. Don't argue with the
  formatter or hand-align code.
- **One statement per line.** No chains of `;` on one line, and no long `.map().filter().map()` chains: name the steps.
- **Short functions.** Aim for under ~40 lines. If a function needs a comment to separate its parts, split it.
- **Return early** instead of nesting `if`s more than two levels deep.
- **Descriptive names.** `settings`, not `S`. `selectedKey`, not `selKey`. Single letters only in tiny lambdas (`k => k.code`).
- **No magic numbers.** Name them as constants (`const MAX_LAYOUTS = 20`), and say where else they must match.
- **No dead code, no commented-out code, no duplicate helpers.** Search for an existing helper before writing a new one.
- **User-facing text** goes in the file's `TEXT` block, not inline in the logic. Write it in plain, friendly English.

## 3. Comments

- **Explain why, not what.** The code already says what it does; the comment says why it has to be this way.
- **Each file starts with a short header:** what the file is for, and where to look for related code.
- **Keep comments true.** If you change the code, fix the comment in the same commit.

## 4. Structure

- Follow the map in `docs/ARCHITECTURE.md`. A new feature gets its own module (Rust) or ES module (`ui/`); don't grow an
  existing file past ~400 lines.
- **No framework, no bundler, no build step for the UI.** Plain JavaScript ES modules and CSS.
- **Dependencies:** ask first (see section 6) and say why in the commit message. Every crate runs next to a keyboard hook.
- **Settings:** a default in `settings.rs`, a line in `CONTROLS`, used in `overlay.js`. Renaming or restructuring needs a
  migration and a unit test.
- **OS-specific code** goes in `platform.rs` or `keyboard/`, nowhere else.
- **Mouse, controller, game detection, global hotkeys or an overlay window:** follow `docs/design/future-inputs.md` (names,
  protocol, settings, privacy rules) before building any of them.

## 5. Tests

- **Every bug fix comes with a test** that fails without the fix. Every feature comes with tests for it.
- Before committing: `npm test`, `npm run check:format`, and clippy with zero warnings.
- Before a release: the full e2e suite (`npm run test:e2e`) and the install test.
- If a test fails, stop and report it. Never delete or weaken a test to make it pass.

## 6. Commits and releases

- **Small, focused commits.** One change per commit; formatting-only changes go in their own commit.
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):** `type(scope): summary`, lower case,
  no full stop, under ~72 characters. Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style` (formatting only),
  `build`, `ci`, `chore`. Scope is the area, e.g. `fix(overlay): ...`, `feat(keys): ...`. Add a body when the why isn't
  obvious. A breaking change to settings or the overlay link gets `!` (e.g. `feat(settings)!: ...`).
- **No AI co-author or "Generated with" lines** in commits, pull requests or code.
- **Ask Jordan before:** pushing to `main`, force-pushing, rewriting history, creating tags or releases, posting on GitHub,
  changing repository settings, adding any dependency (even development-only), or starting a big refactor (restructuring
  files or moving code between modules). For a refactor, describe the plan first.
- Version rule and the release steps are in `docs/RELEASING.md`.

## 7. When you finish a task

Report in plain, beginner-friendly language: what changed, the test results, and anything you skipped or changed from the
plan, with the reason. Jordan is learning to code; explain jargon the first time you use it.
