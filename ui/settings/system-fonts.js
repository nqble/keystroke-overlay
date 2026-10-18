// =====================================================================================================================
//  The fonts the Style → Font family list offers, for the system the app runs on (`platform`, state.js): Windows fonts
//  on Windows, Mac fonts on a Mac. Plain logic, no page code, so tests/ui can run it with Node; controls.js draws the
//  list. Each entry is { value, label }: `value` is the font name saved in the settings and used by the overlay.
//
//  The saved default font is "Segoe UI" on every system (changing it would need a settings migration). A Mac has no
//  Segoe UI, so there the overlay falls back to the system font (see FONT_FALLBACKS in ui/overlay/overlay.js), and the
//  Mac list shows that default as "System font (default)". A font a Mac does not have simply falls back the same way.
// =====================================================================================================================

/** The default font's saved name, the same on every system (src-tauri/src/settings.rs). */
export const DEFAULT_FONT = 'Segoe UI'; // per-system: the saved default on every system, a Windows font name

const WINDOWS_FONTS = [
  // all of these come with Windows 10 and 11
  'Segoe UI', // per-system: the Windows font list
  'Segoe UI Semibold', // per-system: the Windows font list
  'Segoe UI Black', // per-system: the Windows font list
  'Bahnschrift',
  'Arial',
  'Arial Black',
  'Calibri',
  'Candara',
  'Cascadia Code',
  'Cascadia Mono',
  'Consolas',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Palatino Linotype',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Comic Sans MS',
];

const MAC_FONTS = [
  // all of these come with macOS
  'Helvetica Neue',
  'Helvetica',
  'Arial',
  'Arial Black',
  'Avenir',
  'Avenir Next',
  'Avenir Next Condensed',
  'Futura',
  'Gill Sans',
  'Optima',
  'Palatino',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Impact',
  'American Typewriter',
  'Baskerville',
  'Didot',
  'Rockwell',
  'Menlo',
  'Monaco',
  'Courier New',
  'Times New Roman',
  'Comic Sans MS',
];

const SYSTEM_FONT_LABEL = 'System font (default)';

const plain = (name) => ({ value: name, label: name });

/** The font group for this system: { group: the group's name, fonts: [{ value, label }] }. Windows is the default. */
export function systemFonts(platform) {
  if (platform === 'macos') {
    return {
      group: 'Mac fonts',
      fonts: [{ value: DEFAULT_FONT, label: SYSTEM_FONT_LABEL }, ...MAC_FONTS.map(plain)],
    };
  }
  return { group: 'Windows fonts', fonts: WINDOWS_FONTS.map(plain) }; // per-system: the Windows list
}
