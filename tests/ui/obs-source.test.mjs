// OBS scenes in the overlay (ui/overlay/obs-source.js): listening to OBS, and which rule applies in which scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneRule, sceneView, watchObs } from '../../ui/overlay/obs-source.js';

/** A stand-in for OBS's window: events can be sent to it, and getCurrentScene answers `startScene`. */
function fakeObs(startScene, { withGetter = true } = {}) {
  const host = new EventTarget();
  const pending = [];
  host.obsstudio = withGetter ? { getCurrentScene: (callback) => pending.push(callback) } : {};
  host.answerStart = () => pending.forEach((callback) => callback(startScene));
  host.switchTo = (name) => host.dispatchEvent(new CustomEvent('obsSceneChanged', { detail: { name } }));
  return host;
}

const listen = (host) => {
  const heard = [];
  const inObs = watchObs(host, { onScene: (name) => heard.push(name) });
  return { heard, inObs };
};

test('outside OBS nothing listens', () => {
  const host = new EventTarget();
  let added = 0;
  host.addEventListener = () => added++;
  assert.equal(watchObs(host, { onScene: () => {} }), false);
  assert.equal(added, 0);
});

test('a scene switch is passed on; one without a name is ignored', () => {
  const host = fakeObs(null);
  const { heard, inObs } = listen(host);
  assert.equal(inObs, true);
  host.switchTo('Coding');
  host.dispatchEvent(new CustomEvent('obsSceneChanged'));
  assert.deepEqual(heard, ['Coding']);
});

test('the start-up scene is used when OBS allows reading it', () => {
  const host = fakeObs({ name: 'Intro', width: 1920, height: 1080 });
  const { heard } = listen(host);
  host.answerStart();
  assert.deepEqual(heard, ['Intro']);
});

test('without the permission (null) the overlay waits for the first switch', () => {
  const host = fakeObs(null);
  const { heard } = listen(host);
  host.answerStart();
  assert.deepEqual(heard, []);
});

test('a late start-up answer never overwrites a newer switch', () => {
  const host = fakeObs({ name: 'Intro' });
  const { heard } = listen(host);
  host.switchTo('Game');
  host.answerStart();
  assert.deepEqual(heard, ['Game']);
});

test('an OBS without getCurrentScene still follows switches', () => {
  const host = fakeObs(null, { withGetter: false });
  const { heard } = listen(host);
  host.switchTo('Game');
  assert.deepEqual(heard, ['Game']);
});

const rules = [
  { scene: 'Just Chatting', show: false, layout: '' },
  { scene: 'Coding', show: true, layout: 'full' },
  { scene: 'coding', show: false, layout: '' }, // a later duplicate never wins
];
const on = { scenes: { enabled: true, rules } };

test('no rule applies while the feature is off or the scene is unknown', () => {
  assert.equal(sceneRule({ scenes: { enabled: false, rules } }, 'Coding'), null);
  assert.equal(sceneRule(on, null), null);
  assert.equal(sceneRule(undefined, 'Coding'), null);
  assert.equal(sceneRule(on, 'Elsewhere'), null);
});

test('names match trimmed and whatever their case; the first match wins', () => {
  assert.equal(sceneRule(on, '  CODING ').layout, 'full');
  assert.equal(sceneRule(on, 'just chatting').show, false);
});

const layouts = [{ id: 'tkl' }, { id: 'full' }];
const settingsWith = (obs) => ({ layout: { id: 'tkl' }, obs });

test('what to draw: hide, another layout, or the chosen layout', () => {
  assert.deepEqual(sceneView(settingsWith(on), 'Just Chatting', layouts), { layoutId: 'tkl', hidden: true });
  assert.deepEqual(sceneView(settingsWith(on), 'Coding', layouts), { layoutId: 'full', hidden: false });
  assert.deepEqual(sceneView(settingsWith(on), 'Elsewhere', layouts), { layoutId: 'tkl', hidden: false });
});

test('a rule naming a layout that no longer exists shows the chosen layout', () => {
  const gone = { scenes: { enabled: true, rules: [{ scene: 'Coding', show: true, layout: 'deleted' }] } };
  assert.deepEqual(sceneView(settingsWith(gone), 'Coding', layouts), { layoutId: 'tkl', hidden: false });
});

test('settings saved before this feature (no obs section) draw the chosen layout', () => {
  assert.deepEqual(sceneView({ layout: { id: 'tkl' } }, 'Coding', layouts), { layoutId: 'tkl', hidden: false });
});

test('the live preview never follows OBS scenes', () => {
  const source = readFileSync(new URL('../../ui/overlay/overlay.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!PREVIEW\) \{\s*watchObs\(/);
});
