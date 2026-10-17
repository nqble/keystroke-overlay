import { registerTheme } from '/overlay/registry.js';

// A light, flat look for bright scenes.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'minimal-light',
  name: 'Minimal light',
  style: {
    keyFill: '#ffffffe6',
    keyFillPressed: '#222222ff',
    borderColor: '#00000026',
    borderColorPressed: '#222222ff',
    borderWidth: 1,
    radius: 12,
    fontFamily: 'Segoe UI',
    fontSize: 17,
    fontWeight: 600,
    textColor: '#222222ff',
    textColorPressed: '#ffffffff',
    glowColor: '#000000ff',
    glowSize: 12,
  },
  animation: { type: 'fade', speed: 120, easing: 'default', intensity: 1 },
});
