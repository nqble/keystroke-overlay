import { registerTheme } from '/overlay/registry.js';

registerTheme({
  id: 'glass', name: 'Frosted glass',
  style: {
    keyFill: '#ffffff1f', keyFillPressed: '#ffffff80', borderColor: '#ffffff59', borderColorPressed: '#ffffffd9',
    borderWidth: 1, radius: 14, fontFamily: 'Segoe UI', fontSize: 18, fontWeight: 500,
    textColor: '#ffffffff', textColorPressed: '#ffffffff', glowColor: '#ffffffff', glowSize: 14,
  },
  animation: { type: 'scale', speed: 140, easing: 'default', intensity: 0.8 },
});
