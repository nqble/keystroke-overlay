# Logo

Design A, "Keycap K", chosen for v2.0. These SVG files are the source for every size: they are vectors, so they stay
sharp at any resolution. Make PNG or ICO files from them, never the other way round.

| File | Use |
|---|---|
| `logo.svg` | The app icon: blue (#4f8cff) keycap, dark key face (#1e222b). |
| `logo-dev.svg` | Devbuild icon: purple (#8b5cf6, the devbuild purple since v1.2) keycap, near-black face (#0a0810). Same shape. |
| `logo-tray.svg` | Tray icon: one colour (white), with the key face cut out so the taskbar shows through. |

`src-tauri/icons/` and `ui/settings/logo.png` are made from `logo.svg`:
`npx tauri icon assets/logo/logo.svg -o src-tauri/icons`, then copy `src-tauri/icons/64x64.png` to `ui/settings/logo.png`
and delete the `android/` and `ios/` folders it also creates. `npm run devbuild` makes its own set from `logo-dev.svg`.
