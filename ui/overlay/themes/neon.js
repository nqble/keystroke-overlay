import { registerTheme } from '/overlay/registry.js';

registerTheme({
  id: 'neon', name: 'Neon glow',
  style: {
    keyFill: '#0b0b14cc', keyFillPressed: '#ff2bd6ff', borderColor: '#00e5ffff', borderColorPressed: '#ffffffff',
    borderWidth: 2, radius: 10, fontFamily: 'Segoe UI', fontSize: 18, fontWeight: 700,
    textColor: '#00e5ffff', textColorPressed: '#ffffffff', glowColor: '#ff2bd6ff', glowSize: 26,
  },
  animation: { type: 'glow', speed: 140, easing: 'default', intensity: 1 },
});
