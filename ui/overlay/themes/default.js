import { registerTheme } from '/overlay/registry.js';

registerTheme({
  id: 'default', name: 'Default (dark blue)',
  style: {
    keyFill: '#1e222bd9', keyFillPressed: '#4f8cffff', borderColor: '#ffffff40', borderColorPressed: '#ffffffff',
    borderWidth: 2, radius: 8, fontFamily: 'Segoe UI', fontSize: 18, fontWeight: 600,
    textColor: '#e6e9f0ff', textColorPressed: '#ffffffff', glowColor: '#4f8cffff', glowSize: 18,
  },
  animation: { type: 'none', speed: 120, easing: 'default', intensity: 1 },
});
