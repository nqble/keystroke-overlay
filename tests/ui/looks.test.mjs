// Every built-in theme and animation file (ui/overlay/themes/, ui/overlay/animations/) registers what docs/EXTENDING.md
// describes: an id that is its file name, a theme that sets every style value within the ranges the app keeps
// (src-tauri/src/sanitize.rs), and an animation whose spec has only the allowed fields, so only transform and opacity
// ever change. The files import the registry by its overlay address, so each is loaded here with that line swapped for
// a stand-in. Run with: node --test tests/ui/looks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const OVERLAY = new URL('../../ui/overlay/', import.meta.url);
/** Every style value a theme sets, with the range it must stay in (null: a color). Keep in step with RANGES in sanitize.rs. */
const STYLE_RANGES = {
  keyFill: null,
  keyFillPressed: null,
  borderColor: null,
  borderColorPressed: null,
  textColor: null,
  textColorPressed: null,
  glowColor: null,
  borderWidth: [0, 20],
  radius: [0, 100],
  fontSize: [0, 120],
  fontWeight: [100, 900],
  glowSize: [0, 100],
};
const COLOR = /^#[0-9a-f]{8}$/i;
const SPEED_RANGE = [0, 2000];
const INTENSITY_RANGE = [0, 4];
const SPEC_FIELDS = new Set(['down', 'idle', 'glow', 'press', 'release']);
/** The strengths an animation is tried at: none, the default, and the slider's top. */
const STRENGTHS = [0, 1, 4];
let loads = 0; // each load gets its own address: Node would hand back a cached module, which doesn't register again

/** Loads one file of `folder` and returns what it registered. */
async function registered(folder, name) {
  const source = readFileSync(new URL(`${folder}/${name}`, OVERLAY), 'utf8');
  const stand = source.replace(
    /^import \{ (register\w+) \} from '\/overlay\/registry\.js';$/m,
    'const $1 = (item) => globalThis.__registered.push(item);',
  );
  globalThis.__registered = [];
  loads += 1;
  await import(`data:text/javascript,${encodeURIComponent(`${stand}\n// load ${loads}`)}`);
  return globalThis.__registered;
}
const filesIn = (folder) => readdirSync(new URL(folder, OVERLAY)).filter((name) => name.endsWith('.js'));
const inRange = (value, [min, max]) => typeof value === 'number' && value >= min && value <= max;

test('every theme is named for its file and sets every style value within range', async () => {
  for (const file of filesIn('themes')) {
    const [theme] = await registered('themes', file);
    assert.equal(theme.id, file.replace(/\.js$/, ''), `${file}: id is the file name`);
    assert.ok(theme.name, `${file}: has a name`);
    for (const [field, range] of Object.entries(STYLE_RANGES)) {
      const value = theme.style[field];
      if (range) assert.ok(inRange(value, range), `${file}: ${field} ${value} within ${range}`);
      else assert.match(String(value), COLOR, `${file}: ${field} is #rrggbbaa`);
    }
    assert.ok(inRange(theme.animation.speed, SPEED_RANGE), `${file}: speed`);
    assert.ok(inRange(theme.animation.intensity, INTENSITY_RANGE), `${file}: intensity`);
  }
});

test("every theme's animation is a built-in animation", async () => {
  const animationIds = new Set(filesIn('animations').map((file) => file.replace(/\.js$/, '')));
  for (const file of filesIn('themes')) {
    const [theme] = await registered('themes', file);
    assert.ok(animationIds.has(theme.animation.type), `${file}: ${theme.animation.type}`);
  }
});

test('every animation is named for its file and gives only the allowed fields at any strength', async () => {
  for (const file of filesIn('animations')) {
    const [animation] = await registered('animations', file);
    assert.equal(animation.id, file.replace(/\.js$/, ''), `${file}: id is the file name`);
    assert.ok(animation.name, `${file}: has a name`);
    for (const intensity of STRENGTHS) {
      const spec = animation.apply({ ms: 120, intensity });
      for (const field of Object.keys(spec)) assert.ok(SPEC_FIELDS.has(field), `${file}: unknown field ${field}`);
      if (spec.glow !== undefined) assert.ok(inRange(spec.glow, [0, 1]), `${file}: glow is 0..1`);
      for (const timing of [spec.press, spec.release].filter(Boolean)) {
        assert.ok(timing.ms >= 0 && typeof timing.ease === 'string', `${file}: timing`);
      }
    }
  }
});
