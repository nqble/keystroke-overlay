// =====================================================================================================================
//  Settings window themes, step 1: every color of the settings window, worked out from a theme's six base colors
//  (docs/proposals/app-themes.md). The default theme's colors stay written out in settings.css (:root), so today's look
//  never depends on this file; a picked theme sets the results as CSS variables instead.
//  Why JavaScript and not CSS color-mix(): the exact formulas need CSS relative colors, which the WebKit on macOS 11
//  and 12 lacks, and plain color-mix() can't match the default's blues (decision of 2026-10-31).
//  Each derived color keeps the hue of a source base color, and its lightness is a fraction of the way from an anchor
//  base color toward the text color, so a light theme (dark text) gets darker lines where a dark theme gets lighter
//  ones. The numbers were fitted so the default theme gives back today's colors exactly (tests/ui/theme-colors.test.mjs).
// =====================================================================================================================

/** The six base colors a theme sets, and the CSS variable each one is. */
export const BASE_TOKENS = {
  background: '--color-bg',
  panel: '--color-panel',
  text: '--color-text',
  dim: '--color-text-dim',
  accent: '--color-accent',
  error: '--color-danger',
};

// Each derived color: [anchor, hue source, how, amount, chroma scale, hue shift in degrees].
// how 'toward': lightness = anchor's + amount × (text's − anchor's). how 'shift': lightness = anchor's + amount (the
// accent fills keep white text readable whatever the theme, so they always darken).
const DERIVED = {
  '--color-panel-raised': ['panel', 'panel', 'toward', 0.0545, 1.284, -0.1],
  '--color-well': ['background', 'background', 'toward', -0.0314, 0.873, -2.7],
  '--color-line': ['panel', 'panel', 'toward', 0.1184, 1.545, -0.1],
  '--color-line-hover': ['panel', 'panel', 'toward', 0.2871, 2.503, -2.3],
  '--color-control-line': ['panel', 'panel', 'toward', 0.4506, 2.317, 1.1],
  '--color-line-dashed': ['panel', 'panel', 'toward', 0.1803, 2.004, -1.0],
  '--color-line-dashed-hover': ['panel', 'panel', 'toward', 0.3914, 2.746, -0.3],
  '--color-accent-strong': ['accent', 'accent', 'shift', -0.0944, 0.938, 0.5],
  '--color-accent-pressed': ['accent', 'accent', 'shift', -0.1618, 0.845, 0.9],
  '--color-selected-bg': ['background', 'accent', 'toward', 0.0956, 0.216, 5.3],
  '--color-error-bg': ['background', 'error', 'toward', 0.151, 0.335, -8.3],
  '--color-error-bg-soft': ['background', 'error', 'toward', 0.1026, 0.251, -9.9],
  '--color-error-text': ['error', 'error', 'toward', 0.7959, 0.315, -7.6],
  '--color-error-line': ['background', 'error', 'toward', 0.294, 0.554, -4.5],
  '--color-update-bg': ['background', 'accent', 'toward', 0.1324, 0.339, 3.2],
  '--color-update-text': ['accent', 'accent', 'toward', 0.5345, 0.537, -0.4],
  '--color-update-hover': ['background', 'accent', 'toward', 0.1881, 0.41, 2.7],
  '--color-update-pressed': ['background', 'accent', 'toward', 0.0975, 0.305, 2.4],
  '--color-control-pressed': ['background', 'background', 'toward', 0.0415, 1.297, -1.8],
  '--color-switch-off': ['panel', 'panel', 'toward', 0.2018, 1.777, -0.1],
  '--color-key-fill': ['panel', 'panel', 'toward', 0.1137, 1.862, -0.4],
  '--color-key-line': ['panel', 'panel', 'toward', 0.3392, 3.046, 1.8],
  '--color-toast-bg': ['panel', 'accent', 'toward', 0.1206, 0.324, 7.9],
  '--color-menu-hover': ['panel', 'panel', 'toward', 0.1305, 1.844, -0.3],
  '--color-scrollbar-thumb': ['panel', 'panel', 'toward', 0.1692, 1.806, -0.2],
};

// Colors that mean something (live green, paused amber, the window's red close button, release-note colors) stay the
// same in every theme, so they aren't listed here: settings.css keeps them.

/**
 * Every themed CSS variable for a theme's base colors ({ background, panel, text, dim, accent, error }, each '#rrggbb'),
 * as { '--color-bg': '#rrggbb', ... }: the six base colors and the colors worked out from them.
 */
export function themeColors(base) {
  const lch = {};
  const colors = {};
  for (const [name, token] of Object.entries(BASE_TOKENS)) {
    lch[name] = toOklch(base[name]);
    colors[token] = base[name].toLowerCase();
  }
  for (const [token, rule] of Object.entries(DERIVED)) colors[token] = derive(rule, lch);
  return colors;
}

function derive(rule, lch) {
  const [anchor, source, how, amount, chromaScale, hueShift] = rule;
  const from = lch[anchor];
  const lightness = how === 'shift' ? from.l + amount : from.l + amount * (lch.text.l - from.l);
  return fromOklch({ l: lightness, c: lch[source].c * chromaScale, h: lch[source].h + hueShift });
}

/** The WCAG contrast ratio of two '#rrggbb' colors (1 to 21): 4.5 or more is easy to read for normal text. */
export function contrastRatio(one, other) {
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => toLinear(parseInt(hex.slice(at, at + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---- OKLCH conversions (https://bottosson.github.io/posts/oklab/), for '#rrggbb' colors ----

const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

function toOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => toLinear(parseInt(hex.slice(at, at + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bb),
    h: (Math.atan2(bb, a) * 180) / Math.PI,
  };
}

function fromOklch({ l: lightness, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const channels = linear.map((value) => Math.round(Math.min(1, Math.max(0, fromLinear(value))) * 255));
  return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}
