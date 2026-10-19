# File formats

The files the app reads and writes. All are plain JSON or tiny JavaScript, and everything the app loads from the outside
is validated and cleaned first. Schemas for the two shareable formats are in [`docs/schemas/`](schemas).

Where user files live: `%APPDATA%\com.keyoverlay.app\` on Windows (General → App → Open data folder).

## Settings (`settings.json`)
Versioned (`"version": 3` since v1.3.0; 2 in v1.2.x) and migrated on load; see [decision 0007](decisions/0007-versioned-settings-with-migrations.md).
The defaults live in `defaults()` in `src-tauri/src/settings.rs`, which is the single source of truth. Shape:

```jsonc
{
  "version": 3,
  "general": { "port": 7878, "autostart": false, "minimizeToTray": true, "openOnLaunch": true,
               "autoCheckUpdates": true, "inputMethod": "hook",            // "hook" | "rawinput"
               "secureLink": false, "linkKey": "", "updateChannel": "stable", // "stable" | "latest"
               "debugMode": false, "lastSeenVersion": "" },
  "layout": { "id": "tkl",
              "profiles": { "<layoutId>": { "disabledKeys": ["KeyW"], "labels": { "Space": "Jump" } } },   // see "Key edits" below
              "editor": { "snap": 0.25, "grid": false } },   // the Keys tab's choices, see below
  "style": { "keyFill": "#1e222bd9", "keyFillPressed": "#4f8cffff", "borderColor": "#ffffff40", "borderColorPressed": "#ffffffff",
             "borderWidth": 2, "radius": 8, "fontFamily": "Segoe UI", "fontSize": 18, "fontWeight": 600,
             "textColor": "#e6e9f0ff", "textColorPressed": "#ffffffff", "glowColor": "#4f8cffff", "glowSize": 18,
             "keySize": 52, "gap": 6, "scale": 1.0, "opacity": 1.0 },
  "animation": { "type": "none", "speed": 120, "easing": "default", "intensity": 1.0 }
}
```

**Key edits (since v1.3.0).** Besides `disabledKeys` and `labels`, a profile can remember where the user moved
keys to and how wide they made them. These belong to a *layout style*: `"shape"` (keys as the layout file draws them, the
default) or `"grid"` (every key one key wide in neat columns). A profile picks its style with `"layoutStyle": "grid"` (written only
when chosen), and keeps each style's edits under `styles`:

```jsonc
"<layoutId>": {
  "disabledKeys": ["KeyW"], "labels": { "Space": "Jump" },        // shared by both styles
  "layoutStyle": "grid",                                           // omitted for the default "shape"
  "styles": {
    "shape": { "positions": { "KeyW": { "x": 1.25, "y": 0 } },     // where keys were dragged to, in key units
               "sizes":     { "Space": { "w": 4.5 }, "KeyW": { "h": 2 } } },  // how wide and tall keys were made (w, h or both), in key sizes
    "grid":  { "positions": { }, "sizes": { } }
  }
}
```

Only keys the user moved or resized are listed; every other key stays where, and as wide as, the layout style puts it. On load,
entries that are not finite numbers are dropped, positions are limited to −100 to 100 (a key may sit left of or above the layout's own origin, so the Keys tab can center the layout on its board) and widths and heights to 0.25–100, values are rounded to
2 decimals, at most 300 keys are kept per list, an unknown `layoutStyle` means `"shape"`, and parts with nothing in them are not
written (so older settings files stay small). Files saved by version 2 kept `positions` directly on the profile; version 3 moves
them into `styles.shape.positions`. The Keys tab limits keys more tightly than these hard caps (they stay inside its board).

**`layout.editor` (since v1.3.0).** The Keys tab remembers two choices between sessions: `snap`, how far a
dragged or nudged key jumps in key widths (only `0` for off, `0.25`, `0.5` or `1` are accepted), and `grid`, whether the faint
grid dots are shown (`true` or `false`). Anything else, or a settings file saved before these existed, gets the defaults
(`0.25` and `false`). The overlay ignores them.

Numbers are clamped to these ranges on load: port 1024–65535, borderWidth 0–20, radius 0–100, fontSize 0–120,
fontWeight 100–900, glowSize 0–100, keySize 16–200, gap 0–60, scale 0.2–4, opacity 0–1, animation speed 0–2000,
intensity 0–4. Colors are `#rrggbb` or `#rrggbbaa`. Wrong types fall back to the default.

## Layout (`layouts/<id>.json`)
Schema: [`schemas/layout.schema.json`](schemas/layout.schema.json).

```json
{
  "id": "mine",
  "name": "My layout",
  "keys": [
    { "code": "KeyW", "label": "W", "x": 1, "y": 0 },
    { "code": "KeyA", "label": "A", "x": 0, "y": 1 },
    { "code": "Space", "label": "", "x": 0, "y": 2, "w": 3 }
  ]
}
```

`x`, `y` are the key's position and `w`, `h` its size, in key units (1 = one normal key). `code` is a key name from the
[protocol](PROTOCOL.md). The app keeps at most **20** layouts you made.

**Exported layout file** (Layout tab → Export, and what Import reads):

```json
{ "format": "keystroke-overlay-layouts", "version": 1,
  "layouts": [ { "id": "mine", "name": "My layout", "keys": [ ... ] } ],
  "profiles": { "mine": { "disabledKeys": ["KeyW"], "labels": { "Space": "Jump" } } } }
```

Import also accepts a single bare layout object. It cleans the data (at most 300 keys of 40-character codes, labels of 16
characters, names of 30), never overwrites an existing layout (a number is added to the id instead), and stops at the
20-layout limit.

## Preset (exported style, `presets/<name>.json`)
Schema: [`schemas/preset.schema.json`](schemas/preset.schema.json). It is the `style` and `animation` parts of the
settings, nothing else:

```json
{ "style": { "radius": 14, "keyFill": "#ffffff1f" }, "animation": { "type": "scale", "speed": 140 } }
```

Any subset of fields is allowed; missing ones keep their current value.

## Themes and animations (JavaScript modules)
Small files that register themselves. They are loaded only by the overlay page. How to write one is in
[EXTENDING.md](EXTENDING.md); the registry API is documented at the top of `ui/overlay/registry.js`.

## Compatibility
Files from older versions must keep working. Any change to these formats comes with a migration (settings) or a
backwards-compatible reader (layouts, presets) and a test.
