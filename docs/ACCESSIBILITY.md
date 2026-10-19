# Accessibility

Keystroke Overlay should be usable with a keyboard alone and with a screen reader, and readable for people with low
vision. This page is **guidance, not a gate**: nothing here blocks a change in CI, and most developers won't need to think
about it, because the shared building blocks (`row`, `toggle`, `button`, dialogs, the tab bar) do the work for them.

## The approach

1. **Accessible by default.** Fix things once in the shared helpers and design tokens, so every screen built from them
   gets it for free. New screens built from the building blocks (CLAUDE.md UI rules) are accessible without extra effort.
2. **Two basics everyone keeps.** These are the ones that, when missed, lock people out:
   - **Everything that works with the mouse also works with the keyboard** (Tab to reach it, Enter or Space to use it).
     Use a real `<button>`, `<input>` or `<select>` for anything clickable, not a `<div>` with `onclick`.
   - **Every control has a name** a screen reader can say: a linked label, its text, or `aria-label` for icon-only
     buttons.
3. **Everything else is "aim for".** Contrast, focus outlines, announcements and the rest below are good practice. Improve
   them when you touch that part of the app ("leave it cleaner"), but they never block a change.

## Audit of the settings window (v1.3.0)

Checked against WCAG 2.1 AA by reading the code and measuring colors; a hands-on screen-reader pass is still to do (see
the end). Already good: body text contrast (12–15:1), the page language, named window buttons, dialogs marked up as
dialogs and closing with Escape, and the Keys tab's key map, which is fully keyboard-usable with spoken key names.

| # | Issue | WCAG | Priority | Fix | Status |
|---|---|---|---|---|---|
| 1 | Layout cards are clickable `div`s, so a layout can't be picked without a mouse | 2.1.1 | **Basic** | Make cards `<button>`s with `aria-pressed` for the selected one | Fixed on v1.4.0-dev (not released yet) |
| 2 | Deleting a custom layout is right-click only | 2.1.1 | **Basic** | Open the same menu with the Menu key / Shift+F10 on a focused card, or add a delete button | Fixed on v1.4.0-dev (not released yet) |
| 3 | Settings labels aren't linked to their controls (`row()` renders a bare `<label>`), so screen readers read "slider" with no name and clicking a label doesn't toggle its checkbox | 1.3.1, 4.1.2 | **Basic** | Once, in the shared `row()` helper: give the control an id and the label `htmlFor` | Fixed on v1.4.0-dev (not released yet) |
| 4 | White on the accent blue is 3.22:1 (primary buttons, active tab); 4.5:1 is the aim | 1.4.3 | Aim for | Tokens step: use `#3a6fd8` (4.72:1) or a darker accent as the fill under white text | Fixed on v1.4.0-dev (not released yet) |
| 5 | Field and button borders are 1.30:1 against the panels, so fields are hard to see; 3:1 is the aim | 1.4.11 | Aim for | Tokens step: lighten the line token to about `#5a6175` | Fixed on v1.4.0-dev (not released yet) |
| 6 | Sliders show no focus outline (removed to hide it on mouse click) | 2.4.7 | Aim for | Hide it only for mouse clicks: show it on `:focus-visible` | Fixed on v1.4.0-dev (not released yet) |
| 7 | The general dialog doesn't move focus into itself, Tab can reach the page behind it, and focus isn't returned afterwards | 2.4.3 | Aim for | Shared dialog building block: focus the first button, keep Tab inside, restore focus on close | Fixed on v1.4.0-dev (not released yet) |
| 8 | Messages at the bottom ("Preset saved") aren't announced and vanish after 2.6 s | 4.1.3 | Aim for | `role="status"` on the toast; keep error messages until dismissed | Fixed on v1.4.0-dev (not released yet) |
| 9 | The tab bar doesn't say which tab is current | 4.1.2 | Aim for | `aria-current="page"` on the active tab button | Fixed on v1.4.0-dev (not released yet) |
Also worth noting: hidden keys in the Keys tab are drawn at 0.28 opacity (2.30:1). Inactive things are exempt from the
contrast rule, but about 0.45 would be easier to read.

## What is left

All nine issues above are fixed on the `v1.4.0-dev` branch (they ship with v1.4.0). Still to do:
- A hands-on screen-reader pass (NVDA or Narrator) of the whole settings window.
- Hidden keys in the Keys tab are still drawn at 0.28 opacity; about 0.45 would be easier to read.
- The key editor makeover (docs/design/key-editor.md) is built keyboard-usable and named from the start, keeping the key
  map's current keyboard support.

## Checking it (optional, a few minutes)

- **Keyboard only:** unplug the mouse or don't touch it; Tab through every tab and use each control.
- **Screen reader:** NVDA (free) or Windows Narrator (Ctrl+Win+Enter); listen to each tab once.
- **Zoom:** Ctrl and + to 200%: nothing important should be cut off.
