import { registerTheme } from '/overlay/registry.js';

// Black keys, white text and a bright yellow press: the easiest to read, for any viewer.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'high-contrast',
  name: 'High contrast',
  style: {
    keyFill: '#000000ff',
    keyFillPressed: '#ffd400ff',
    borderColor: '#ffffffff',
    borderColorPressed: '#ffd400ff',
    borderWidth: 3,
    radius: 6,
    fontFamily: 'Segoe UI',
    fontSize: 20,
    fontWeight: 800,
    textColor: '#ffffffff',
    textColorPressed: '#000000ff',
    glowColor: '#ffd400ff',
    glowSize: 0,
  },
  animation: { type: 'pressdown', speed: 90, easing: 'default', intensity: 1 },
});
