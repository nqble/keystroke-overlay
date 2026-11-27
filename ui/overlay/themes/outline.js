import { registerTheme } from '/overlay/registry.js';

// Only an outline until pressed, so the overlay covers as little of the game as possible.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'outline',
  name: 'Outline',
  style: {
    keyFill: '#00000000',
    keyFillPressed: '#ffffffe6',
    borderColor: '#ffffffb3',
    borderColorPressed: '#ffffffff',
    borderWidth: 2,
    radius: 8,
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 700,
    textColor: '#ffffffcc',
    textColorPressed: '#111111ff',
    glowColor: '#ffffffff',
    glowSize: 10,
  },
  animation: { type: 'fade', speed: 110, easing: 'default', intensity: 1 },
});
