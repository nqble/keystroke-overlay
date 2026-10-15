import { registerTheme } from '/overlay/registry.js';

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
