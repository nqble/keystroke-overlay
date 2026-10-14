import { registerTheme } from '/overlay/registry.js';

// Blocky, Minecraft-streamer look.
registerTheme({
  id: 'minecraft', name: 'Blocky (stone)',
  style: {
    keyFill: '#6b6b6bf2', keyFillPressed: '#a8a8a8ff', borderColor: '#2a2a2aff', borderColorPressed: '#ffffffff',
    borderWidth: 4, radius: 0, fontFamily: 'Consolas', fontSize: 18, fontWeight: 700,
    textColor: '#f0f0f0ff', textColorPressed: '#ffffffff', glowColor: '#ffffffff', glowSize: 10,
  },
  animation: { type: 'pressdown', speed: 90, easing: 'default', intensity: 1.2 },
});
