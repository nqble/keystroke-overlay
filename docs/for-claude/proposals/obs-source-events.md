# Proposal: OBS scene awareness through the Browser source's page API

Status: **Proposed** (2026-10-19, Advisory session research; not approved)

What the overlay could do with the page API that OBS's Browser source (obs-browser) gives every page it shows: pause drawing
while the source is hidden (measure first), and change per OBS scene (hide, or show another layout). No network code.

## Summary

| Part | What | Verdict of this research |
|---|---|---|
| (a) Pause drawing while hidden | Skip the key drawing while OBS says the source is not visible | **Measure first; likely not worth building.** OBS already stops painting a hidden source (see "What OBS already does"), and the overlay has no timers. |
| (b) Scene awareness | Per-scene rules: hide the overlay, or show another layout, in the scenes the user lists | Buildable in about 3–4 days, overlay-only, no protocol change. Worth a yes/no from Jordan first: OBS's own scenes already cover part of it (open question 1). |

Everything here was read from obs-browser's source (commit `07227af`, 2026-10-16, plugin version 2.27.3), not from memory.
The facts that still need a real OBS to confirm are marked **(verify in OBS)**.

## Goal

1. Spend no work on drawing keys that nobody can see, if measuring shows that this saves anything.
2. Let a streamer say "in my *Just Chatting* scene, hide the keys" or "in my *Coding* scene, show the full-size keyboard
   instead of WASD", once, in the settings window, and have the overlay in OBS follow the scene by itself.
3. Behave exactly as today everywhere else: in another streaming app, in a normal browser, in the live preview, and for
   everyone who doesn't turn the feature on.

## Non-goals

- **No obs-websocket** and no other network code. That is the separate proposal [obs-websocket.md](obs-websocket.md).
- **No control of OBS.** The overlay never calls `setCurrentScene`, `startStreaming` or any other function that changes OBS,
  and never asks the user for more than read access.
- **No change to the protocol.** The overlay keeps receiving only (docs/PROTOCOL.md: "Nothing a client sends changes the
  app"); it never tells the app which scene is on. The app doesn't learn scene names.
- **No change to the tray, the header status or the live preview.** The preview keeps showing the layout chosen in the
  settings window; only the overlay inside OBS follows scenes.
- **No per-scene style or animation** (only show/hide and layout). The rule shape leaves room for it later.
- Streaming, recording, replay buffer and virtual camera events are out of scope.

## The page API (researched)

Source: `README.md`, `browser-app.cpp`, `browser-client.cpp`, `obs-browser-source.cpp`, `obs-browser-plugin.cpp` and
`obs-browser-source.hpp` in github.com/obsproject/obs-browser.

### `window.obsstudio`

Created for every page a Browser source loads (`BrowserApp::OnContextCreated`). It holds `pluginVersion` (a string such as
`"2.27.3"`) and these functions: `getControlLevel`, `getCurrentScene`, `getStatus`, `getScenes`, `getTransitions`,
`getCurrentTransition`, `saveReplayBuffer`, `startReplayBuffer`, `stopReplayBuffer`, `setCurrentScene`,
`setCurrentTransition`, `startStreaming`, `stopStreaming`, `startRecording`, `stopRecording`, `pauseRecording`,
`unpauseRecording`, `startVirtualcam`, `stopVirtualcam`. Every getter takes a callback; nothing returns a promise.

### Page permissions (control levels)

Set per Browser source in OBS: right-click the source → **Properties** → **Page permissions**. The default is level 1.

| Level | OBS's own words (`data/locale/en-US.ini`) | Unlocks (each level includes the ones below) |
|---|---|---|
| 0 | No access to OBS | `getControlLevel` |
| 1 (**default**) | Read access to OBS status information | `getStatus` |
| 2 | Read access to user information (current Scene Collection, Transitions) | `getScenes`, `getCurrentScene`, `getTransitions`, `getCurrentTransition` |
| 3 | Basic access to OBS (Save replay buffer, etc.) | `saveReplayBuffer` |
| 4 | Advanced access to OBS (Change scenes, Start/Stop replay buffer, etc.) | `setCurrentScene`, `setCurrentTransition`, replay buffer start/stop |
| 5 | Full access to OBS (Start/Stop streaming without warning, etc.) | streaming, recording, virtual camera |

Two details from `BrowserClient::OnProcessMessageReceived` that matter for this design:

- **A getter called below its level still calls back, with `null`.** For example `getCurrentScene` at the default level 1
  answers `null`, not an error. (If OBS has no current scene at all, it doesn't call back.)
- **Events are not gated by the level.** `DispatchJSEvent` sends every event to the page whatever its permissions, so
  `obsSceneChanged` arrives at the default level 1. Only the *starting* scene needs level 2.

### Events

Each is a `CustomEvent` dispatched on `window` (to every frame of the page), with the payload in `event.detail`.

| Event | `event.detail` | Sent to | Added (obs-browser commit; earliest tag that has it) |
|---|---|---|---|
| `obsSceneChanged` | `{ name, width, height }` of the current (program) scene | every Browser source | 2016-09-19 (`66ddf15`); tag 1.27 |
| `obsSceneListChanged` | array of scene names | every Browser source | 2022-05-26 (`0674786`); tag 2.23.4 |
| `obsSourceVisibleChanged` | `{ visible: true \| false }` | this source only | 2019-02-17 (`a2fac6a`); tag 2.8.5 |
| `obsSourceActiveChanged` | `{ active: true \| false }` | this source only | 2019-02-17 (`a2fac6a`); tag 2.8.5 |
| `obsExit` | `null` | every Browser source | 2016-09-19; tag 1.27 |

And for the functions: `getCurrentScene` 2016-12-21 (tag 1.27); `getControlLevel` and the levels 2021-07-12 (tag 2.16.2);
`getScenes` 2021-08-28 (tag 2.17.9). The legacy callbacks `window.obsstudio.onVisibilityChange` and `onActiveChange` still
work but are marked deprecated in the README; use the events.

**Which OBS version has them.** obs-browser's tags are its own version numbers, not OBS's, and the repository's history
doesn't say which plugin version each OBS release bundles. Every item above was committed before OBS 28.0 came out
(2022-08-31), so OBS 28 and later should have all of them. **This mapping is inferred from dates, not checked against OBS's
release notes.** The design below doesn't depend on a version: it checks that each function exists before calling it.

### What "visible" and "active" mean

From libobs's source callbacks as obs-browser uses them (`info.show` / `info.hide` call `SetShowing`, `info.activate` /
`info.deactivate` call `SetActive`):

- **Visible (showing):** something draws the source right now: the program, the studio-mode preview, a projector or the
  Multiview. A source in a scene that isn't on screen anywhere is not visible.
- **Active:** the source is on the **program** output (what the stream and recording get).
- So *active false, visible true* is common (studio-mode preview, Multiview). Only *visible false* means nobody sees it.
- Neither event is sent when the page loads: the page has to assume "visible and active" until told otherwise.
  obs-browser does tell CEF the starting visibility (`SendBrowserVisibility` after creating the browser).

### What OBS already does for a hidden source

`BrowserSource::SetShowing(false)` (when **Shutdown source when not visible** is off) calls
`CefBrowserHost::WasHidden(true)` and frees the source's texture. CEF's documentation for `WasHidden` says painting stops
while hidden. With **Shutdown source when not visible** on, OBS destroys the page instead, and loads it again when it
shows. The user guide already recommends that option ([USER-GUIDE.md, Keep it smooth and light in
OBS](../../USER-GUIDE.md#keep-it-smooth-and-light-in-obs)). Whether `WasHidden` also sets `document.visibilityState` to
`hidden` in OBS's CEF is likely but **(verify in OBS)**.

So on a hidden source the overlay's remaining work per key is: receive the WebSocket frame, `JSON.parse`, one
`classList.toggle`. No frames are painted and no transitions run.

### Pages outside OBS

`window.obsstudio` is missing in every other host: a normal browser, the settings window's live preview (WebView2,
WKWebView or WebKitGTK), `npm run preview`, and other streaming apps. Some other apps that embed Chromium may define a
partial `window.obsstudio` **(not checked)**, which is why every call is guarded by `typeof … === 'function'`.

## (a) Pause drawing while the source is hidden: measure first

### Expected result

Small. The overlay already has no timers or polling while connected ([overlay.js](../../../ui/overlay/overlay.js) header,
ARCHITECTURE.md "The overlay animates only transform and opacity and has no timers while connected"), and OBS already stops
painting it. Like the measured decisions in [done/loading-and-lifetime.md](done/loading-and-lifetime.md) (section B), the
likely outcome is "measured, not built". The measurement is still worth an hour, because the result belongs in this plan.

### How to measure (Windows, by hand: the e2e tests can't run OBS)

1. Install the app, and in OBS 28 or later make scene **A** with one Browser source of the OBS URL (full-size layout, an
   animation with a glow) and an empty scene **B**. Close the Multiview and any projector; studio mode off.
2. Find OBS's page processes: `obs-browser-page.exe` (several; the renderer of this source is one of them). Sum their CPU
   time with a short PowerShell line in the style of [tests/bench/tree.ps1](../../../tests/bench/tree.ps1)
   (`Get-Process obs-browser-page | Measure-Object CPU -Sum`).
3. For each case, read the CPU time, send 8,000 key presses with
   `powershell -File tests/e2e/lib/inject.ps1 -scenario flood -n 8000` (it presses Right Ctrl only), read again:
   - scene A on program (visible, active);
   - scene B on program (hidden);
   - scene B on program with **Shutdown source when not visible** on (the page is gone: the floor);
   - studio mode with A in the preview and B on program (visible, not active).
4. Five runs per case, the median. Also note OBS's own **Docks → Stats** (CPU usage, average time to render a frame).
5. Then build the change (below) on a branch and repeat the hidden case.

The [overlay-speed](../../../tests/e2e/suites/overlay-speed.mjs) e2e suite can't measure this: it reaches the live
preview, which is never hidden by OBS, and the key handler isn't reachable from outside the page without a test-only hook,
which we don't want in the page OBS loads.

**Decision rule** (proposed): build (a) only if the hidden case uses at least 25% less page CPU during the flood, and the
saving is above the run-to-run noise. Otherwise write the numbers into this plan, mark (a) "measured, not built", and stop.

### What the change would be (only if the measurement says so)

- In `ui/overlay/obs-source.js` (below), `obsSourceVisibleChanged` reports `visible`.
- In [overlay.js](../../../ui/overlay/overlay.js), `setKey` keeps updating the `held` set while hidden (cheap, and needed so
  no key looks stuck) but skips `classList.toggle`. On visible again, one pass sets `down` on exactly the held keys
  (the same loop `snapshot()` uses).
- Pause on **visible false only**, never on *active false*: a preview or Multiview still shows the overlay.
- No setting: it changes nothing anyone can see. Settings changes (`cfg`) are still applied while hidden; they are rare.
- **Rejected:** closing the WebSocket while hidden. The app's header would then say "Not connected to OBS" whenever the
  scene changes, and **Shutdown source when not visible** already gives that behavior to anyone who wants it.

## (b) Scene awareness

### What the user sees

A card on the **General** tab, after **Connection**: **OBS scenes** (file `ui/settings/tabs/general-obs-scenes.js`, a
Preact component like [general-hotkey.js](../../../ui/settings/tabs/general-hotkey.js)). Proposed words, kept in the file's
`WORDS` block:

| Where | Text |
|---|---|
| Card title | OBS scenes |
| Switch | Change the overlay per OBS scene |
| Note under it | Hide the keys, or show another layout, in the scenes you list. This works in OBS Studio's Browser source; anywhere else the overlay always shows your chosen layout. |
| Permission note | So the overlay knows the scene as soon as OBS starts, right-click the Browser source in OBS, choose **Properties**, and set **Page permissions** to **Read access to user information**. Without it, the overlay follows the scene from the first scene switch on. |
| Preview note | The live preview always shows your chosen layout. |
| Each rule row | a **Scene name** text box, a **Show** / **Hide** choice (`Segmented`), and a **Layout** dropdown (first entry **Your chosen layout**, then the layouts the Layout tab shows), plus a **✕** button named "Remove this scene" |
| Add button | + Add a scene |
| At the limit | You can list up to 20 scenes. |

The **Layout** dropdown is disabled while **Hide** is chosen. The rows show only while the switch is on (like the pause
shortcut's picker). All controls are real `<button>`, `<input>` and `<select>` elements with labels, so they work with the
keyboard and a screen reader (CLAUDE.md section 5).

**Every system:** OBS, its Browser source and the words above are the same on Windows, macOS and Linux, so no entry in
`system-words.js` is needed; `npm run check:systems` will confirm. On Linux, OBS's Browser source also works under Wayland
(obs-browser's README excludes only docks and service integration there).

**Test hooks** (added to the table in [tests/README.md](../../../tests/README.md)): `general-obs-scenes`,
`toggle-obs-scenes-enabled`, `obs-scene-rule` + `data-index`, `obs-scene-name`, `obs-scene-show`, `obs-scene-layout`,
`obs-scene-remove`, `obs-scene-add`.

### Settings

A top-level `obs` section, off by default, with the rule shape kept parallel to the reserved `games.rules`
([design/future-inputs.md section 5](../../design/future-inputs.md#5-settings-reserved-sections)) so one rule editor could
later serve both:

```jsonc
"obs": {
  "scenes": {
    "enabled": false,
    "rules": []   // e.g. [ { "scene": "Just Chatting", "show": false, "layout": "" },
                  //        { "scene": "Coding", "show": true, "layout": "full" } ]
  }
}
```

- `scene`: the OBS scene name. Matched after trimming spaces, ignoring upper and lower case (open question 3).
- `show`: `false` hides the keys in that scene.
- `layout`: a layout id, or `""` for the layout chosen in the settings window. An id that no longer exists counts as `""`.
- The first rule whose name matches wins; a scene with no rule shows the chosen layout.

Where it goes, following [EXTENDING.md section 4](../../EXTENDING.md#4-a-setting):

1. `defaults()` in [settings.rs](../../../src-tauri/src/settings.rs): the section above.
2. [sanitize.rs](../../../src-tauri/src/sanitize.rs): one line in `LIST_RULES`,
   `("obs.scenes.rules", clean_scene_rules)`. The function keeps at most `MAX_SCENE_RULES = 20` rules (must match the
   card's limit), drops non-objects, a missing or empty `scene`, a `scene` over 100 characters or with control characters,
   and later duplicates of the same name; `show` that isn't a boolean becomes `true`; `layout` that isn't `""` or `is_id`
   becomes `""`; unknown fields are dropped. The scene name is only ever compared, never put into HTML or CSS, so plain text
   is safe.
3. [tools/sandbox/default-settings.json](../../../tools/sandbox/default-settings.json): the same default (a Rust test fails
   until it matches).
4. The overlay already receives the whole public settings in `cfg` and `/api/config`
   (`public_settings()` in settings.rs strips only the link key), so **no protocol or server change** is needed.
5. Reserve `obs` in [design/future-inputs.md section 5](../../design/future-inputs.md#5-settings-reserved-sections) in the
   same commit, so a later obs-websocket feature (if ever) adds to `obs` instead of inventing another name.

**Migration:** none is needed to read the data: it is additive, and an older file gets the defaults
(settings.rs: "No migration is needed for purely additive changes"). **But a downgrade would lose it** (open question 4):
`downgrade.rs` keeps a copy only when the file's format `version` is newer, and an additive change doesn't bump it, so a
version of the app without `obs` (same format version 3) drops the section on its next save. CLAUDE.md section 4 says "A
downgrade must never lose a user's settings". The fix is to bump `CURRENT_VERSION` to 4 with a step that changes nothing,
plus its unit test. (The same gap already exists on v2.0 for `hotkeys`, `layout.order` and `style.keyLabels`: v1.4.0 is
also format 3, checked with `git show v1.4.0:src-tauri/src/settings.rs`.)

### How it works in the overlay

A separate file `ui/overlay/obs-source.js` with **no imports** (like `fit.js` and `structure.js`, so `node --test` can load
it), holding plain functions:

```js
/** Starts listening to OBS. Returns false (and does nothing) when the page isn't in OBS. */
export function watchObs(host, { onScene, onVisible }) { … }
/** The rule for this scene, or null (feature off, scene unknown, or no rule matches). */
export function sceneRule(obsSettings, sceneName) { … }
/** What to draw: { layoutId, hidden } from the settings, the current scene and the layouts we have. */
export function sceneView(settings, sceneName, layouts) { … }
```

`watchObs(window, …)`:

1. If `host.obsstudio` is missing: return `false`. Nothing else happens; the overlay behaves exactly as today.
2. Add listeners for `obsSceneChanged` (`event.detail?.name`) and, for part (a) only, `obsSourceVisibleChanged`
   (`event.detail?.visible !== false`). Listeners cost nothing while idle: no timer, no polling.
3. If `typeof host.obsstudio.getCurrentScene === 'function'`, call it once. A `null` answer (Page permissions below level 2)
   is ignored: the scene stays unknown until the first `obsSceneChanged`. If an `obsSceneChanged` already arrived before
   the answer, the answer is ignored, so a late reply never overwrites a newer scene.

In [overlay.js](../../../ui/overlay/overlay.js) (about 20 lines; it is 365 lines today and must stay under ~400):

- Keep `currentScene` (starts `null`). `onScene` stores it and calls `apply(settings)` again.
- `apply()` asks `sceneView()` which layout to use and passes the chosen id to `profileOf`, `structureKey` and `build`
  instead of `settings.layout.id`. Rebuilding happens only when the structure key changes, as today.
- Hidden by a rule uses the same switch as pause: `stage.style.visibility = paused || sceneHidden ? 'hidden' : ''`. Unlike
  pause, it doesn't release held keys (no key is lost; they show correctly when the scene changes back).
- **Order of precedence:** the tray's **Pause overlay** wins, then a scene rule, then the chosen layout.
- `watchObs` is not called when `PREVIEW` is true: the live preview shows the chosen layout, always.
- `reportSize()` keeps posting the size only to the preview, so a scene layout never changes the size shown in
  **General → Connection**.
- The scene name is kept only in that one variable: never logged (no `console.*`), never stored, never sent.

[ui/globals.d.ts](../../../ui/globals.d.ts) gets a small type for `window.obsstudio` and the three events, so
`npm run check:types` passes.

### Behavior worth knowing (and saying in the user guide)

- **Starting scene:** with the default Page permissions, the overlay follows the scene from the first switch on; until then
  it shows the chosen layout. Level 2 fixes that. The overlay never asks for more than level 2.
- **Size:** the Browser source's box has one size. A scene layout that is smaller or larger than the chosen one is scaled to
  fit that box by `fitInBox()` ([fit.js](../../../ui/overlay/fit.js)), so a WASD layout in a box sized for a full keyboard
  is drawn large (open question 5).
- **Studio mode:** `obsSceneChanged` reports the *program* scene (it uses `obs_frontend_get_current_scene`), so in studio
  mode the preview shows the overlay as the program scene's rule says **(verify in OBS)**.
- **Transitions:** the change happens when OBS sends `obsSceneChanged`, which may be at the start of a transition
  **(verify in OBS)**.
- **Several overlays:** every Browser source gets `obsSceneChanged`, so two overlay sources follow the same rules.
- **Refresh browser when scene becomes active** reloads the page, which forgets the scene until it is told again (level 2
  answers at once). The user guide already says to leave it off.

### Alternatives considered

| Alternative | For | Against |
|---|---|---|
| **Do nothing; use OBS's own scenes.** Leave the source out of the scenes where it shouldn't show. | Zero code. Already works. | Doesn't cover one shared overlay scene nested in many scenes, or a different layout per scene. |
| **A layout in the OBS URL** (`?layout=wasd`), one Browser source per layout, OBS's scenes do the switching. | Works in every streaming app, not only OBS. No permissions. Simple to explain. | Each source is its own web page (memory), unless **Shutdown source when not visible** is on; **Copy OBS URL** needs a layout choice; the URL has `?key=` and `?preview=` rules already. |
| **The overlay tells the app the scene list**, so the card offers a dropdown instead of a text box. | No typing mistakes. | The first message from a client to the app: changes PROTOCOL.md's "read-only by design", needs a decision record. Can come later. |
| **obs-websocket** from the app. | Works when no overlay page is loaded. | Network code, a password, setup in OBS. See [obs-websocket.md](obs-websocket.md). |

## Exact files to change

| File | Change | Part |
|---|---|---|
| `ui/overlay/obs-source.js` | **Added**: `watchObs`, `sceneRule`, `sceneView`; header comment pointing to this plan and PRIVACY.md | a, b |
| [ui/overlay/overlay.js](../../../ui/overlay/overlay.js) | call `watchObs` (not in the preview); `apply()` uses `sceneView()`; one visibility switch for pause and scene; (a) skip drawing while hidden | a, b |
| [ui/globals.d.ts](../../../ui/globals.d.ts) | types for `window.obsstudio` and the events | a, b |
| [src-tauri/src/settings.rs](../../../src-tauri/src/settings.rs) | `obs` default; maybe `CURRENT_VERSION` 4 + an empty migration step | b |
| [src-tauri/src/sanitize.rs](../../../src-tauri/src/sanitize.rs) | `clean_scene_rules`, `MAX_SCENE_RULES`, one `LIST_RULES` line | b |
| [src-tauri/src/settings/tests.rs](../../../src-tauri/src/settings/tests.rs) | defaults, cleaning and (if bumped) migration tests | b |
| [tools/sandbox/default-settings.json](../../../tools/sandbox/default-settings.json) | the default | b |
| [tools/sandbox/fake-app.js](../../../tools/sandbox/fake-app.js) | one state with two rules, for the UI sandbox | b |
| `ui/settings/tabs/general-obs-scenes.js` | **Added**: the card | b |
| [ui/settings/tabs/general.js](../../../ui/settings/tabs/general.js) | one line: `<${ObsScenes} />` after `Connection`; the subtitle "Connection, startup and updates." stays | b |
| `tests/ui/obs-source.test.mjs` | **Added**: unit tests with a fake `window.obsstudio` | a, b |
| `tests/e2e/suites/obs-scenes.mjs` + `SUITES` in [tests/e2e/run.mjs](../../../tests/e2e/run.mjs) | **Added**: the e2e suite | b |

No change to `server.rs`, `keyboard/`, `tools/check-privacy.mjs` or the protocol.

## Privacy impact

None expected, and none to the promises: no network, no keystrokes involved, nothing written but the rules the user types.

- The overlay reads the current scene's name **from OBS, inside OBS's own page**, compares it with the rules, and forgets it
  when the next one comes. It is never stored, logged or sent, not even to the app.
- Stored: only the rules the user types (scene names and layout ids), in `settings.json`, like every other setting. They
  are included in the public settings the overlay gets (as all settings except the link key are).
- The overlay asks for no more than **Read access to user information**, and only in the user guide's words; it never asks
  for a level that can change OBS.
- `tools/check-privacy.mjs` already covers what matters here (no external addresses, no tracking APIs in `ui/`). Nothing to
  weaken; no rule to add.
- PRIVACY.md gets one paragraph under "What the app can see" (text in "Docs to update").

## Tests

**Unit tests, `tests/ui/obs-source.test.mjs`** (Node, no browser). The fake host is an `EventTarget` with an `obsstudio`
object whose `getCurrentScene(callback)` answers a chosen value, so the tests can send real `CustomEvent`s:

- No `obsstudio`: `watchObs` returns `false` and adds no listener (count with a wrapped `addEventListener`).
- `obsSceneChanged` with `{ detail: { name: 'Coding' } }` calls `onScene('Coding')`; a missing `detail` is ignored.
- `getCurrentScene` answering `null` (permission too low) calls nothing; answering `{ name: 'A' }` calls `onScene('A')`;
  an answer after an event is ignored; `obsstudio` without `getCurrentScene` still listens to events.
- `obsSourceVisibleChanged` false / true (part a).
- `sceneRule`: feature off → `null`; unknown scene → `null`; trimmed, case-insensitive match; first match wins.
- `sceneView`: hide rule → `hidden: true`; layout rule → that id; an id not in `layouts` → the chosen layout; no rule →
  the chosen layout.
- A source-text test (like the ones in `obs-status.test.mjs`) that overlay.js calls `watchObs` only outside `PREVIEW`.

**Rust tests** in `src-tauri/src/settings/tests.rs`: the default is off with no rules; `clean_scene_rules` with junk types,
21 rules, a 101-character name, control characters, duplicates, a bad layout id and a non-boolean `show`; the hostile-input
tests already walk every default, so they cover the section by themselves. If the version is bumped: a version-3 file
loads unchanged as version 4, and the downgrade copy test covers the `obs` section.

**End to end, `tests/e2e/suites/obs-scenes.mjs`** (Windows; the app, not OBS):

- `save_settings` with good and bad rules, then `get_state`: the sanitized result.
- The General card through its `data-test` hooks: the switch, adding three rules, typing a name, choosing **Hide** and a
  layout, removing one, the 20-rule limit; the settings saved match.
- In the live preview frame (`evIn`), dispatching a fake `obsSceneChanged` changes nothing (the preview never follows
  scenes), and the page has no `window.obsstudio`.
- `ui-sweep` already fails on any JavaScript error on the General tab.

**Visual:** the General tab's screenshot changes (a card is added), so `npm run test:visual` shows a difference; update the
baseline only after Jordan has seen before and after. The overlay's screenshots must not change.

**What can't be tested automatically** (OBS can't run in the e2e or CI), checked by hand on Windows and on a Mac with OBS 28
or later, ideally also the latest OBS:

- the events arrive with the payloads above; `getCurrentScene` at level 1 (answers `null`) and level 2;
- hide and layout rules on scene switches, with and without studio mode, with a fade transition;
- two overlay sources; **Shutdown source when not visible** on and off; **Refresh browser when scene becomes active** on;
- part (a)'s CPU measurement.

## Docs to update in the same commit as the code

| Doc | Change |
|---|---|
| [FILE-FORMATS.md](../../FILE-FORMATS.md) | `obs.scenes` in the settings shape, and the cleaning limits (20 rules, 100 characters, layout ids) |
| [USER-GUIDE.md](../../USER-GUIDE.md) | under **Add it to OBS**, a short "Change the overlay per scene" part with the Page permissions step; the General row of the Settings table gets **OBS scenes** |
| [PRIVACY.md](../../../PRIVACY.md) | under "What the app can see": "From v2.x, if you turn on **General → OBS scenes**, the overlay asks OBS which scene is on, inside OBS, to follow your rules. The scene's name stays in the overlay page: it is never saved, logged or sent anywhere, not even to the app. Only the rules you write are saved." (extra care: CLAUDE.md section 8) |
| [design/future-inputs.md](../../design/future-inputs.md) | reserve `obs` in section 5 |
| [ARCHITECTURE.md](../../ARCHITECTURE.md) | folder map: `ui/overlay/obs-source.js`, `tabs/general-obs-scenes.js` |
| [tests/README.md](../../../tests/README.md) | the hooks, and the `obs-scenes` suite in the list |
| [decisions/ideas-not-decided.md](../../decisions/ideas-not-decided.md) | "OBS scene awareness" links to this plan |
| [for-claude/README.md](../README.md) | lists this plan (already with the plan's own commit); its status line when done |
| [NEXT-RELEASE.md](../NEXT-RELEASE.md) | the feature line for the release notes |

## Risks

| Risk | How we handle it |
|---|---|
| The starting scene is unknown at the default Page permissions, so a "hide" rule doesn't apply until the first switch | Say so in the card and the user guide; the overlay shows (fails open) rather than hides. |
| A typo in a scene name: the rule silently does nothing | Case-insensitive, trimmed matching; the user guide says names must match OBS's. A dropdown needs the protocol change (open question 6). |
| A scene layout of another size looks too large or small in the fixed box | Documented; open question 5. |
| OBS changes the page API | Every call is guarded; events that never come mean today's behavior. |
| Another app defines a partial `window.obsstudio` | `typeof` checks per function; events that never come change nothing. |
| overlay.js grows past ~400 lines | The logic lives in `obs-source.js`; if overlay.js still crosses the line, move the preview bridge to its own file first (a refactor: ask Jordan). |
| Part (a) hides a key change that should show | It only skips drawing while OBS says nobody sees the page, and resyncs on show; unit-tested. |

## Work order (small commits; `npm test`, `check:format`, `check:types`, `check:docs`, `check:style` and clippy between them)

1. `docs(plans): obs scene awareness proposal`: this file, listed in `docs/for-claude/README.md`.
2. *(Jordan answers the open questions.)*
3. Part (a) measurement by hand; `docs(plans): measured cost of a hidden obs source`, with the numbers and the decision.
4. Only if step 3 says so: `perf(overlay): skip drawing keys while the obs source is hidden`, with `obs-source.js`'s
   `watchObs` and its tests.
5. `feat(settings): obs scene rules setting, off by default`: defaults, sanitizer, Rust tests, sandbox defaults,
   FILE-FORMATS.md, future-inputs.md (and the version bump, if chosen, with its test).
6. `feat(overlay): follow obs scene rules`: `obs-source.js` (or its rest), overlay.js, `globals.d.ts`, unit tests,
   ARCHITECTURE.md.
7. `feat(general): obs scenes card`: the component, hooks, `tests/README.md`, the sandbox state, the e2e suite.
8. `docs(guide): obs scenes in the user guide and privacy page`: USER-GUIDE.md, PRIVACY.md, ideas-not-decided.md,
   NEXT-RELEASE.md (or fold into steps 6–7, since docs belong with the change).
9. Manual OBS check (list above) on Windows and macOS; `npm run test:visual` before and after, shown to Jordan; baseline
   update only with Jordan's OK.
10. `docs(plans): obs scene awareness done`: status line, move to `proposals/done/`.

`npm run format` changes go in their own `style:` commit.

## Effort

| Part | Estimate |
|---|---|
| (a) measurement and write-up | 0.5 day |
| (a) change, if worth it | 0.5 day |
| (b) settings and sanitizer with tests | 0.5 day |
| (b) overlay module and unit tests | 0.5–1 day |
| (b) General card, hooks, sandbox, e2e | 1–1.5 days |
| (b) docs, manual OBS checks on two systems, visual review | 0.5–1 day |
| **Total** | **about 3–4.5 days** |

## Open questions for Jordan

1. **Is (b) worth building**, given that OBS's own scenes (leave the source out) and a `?layout=` OBS URL option cover much
   of it? If yes, which matters more: hiding per scene, or a layout per scene?
2. **Which tab:** a card on **General** (next to Connection, where the OBS things are), or on **Layout** (where layouts are
   picked)?
3. **Matching:** case-insensitive and trimmed (friendlier), or exactly as OBS spells it?
4. **Downgrades:** bump the settings format to 4 so `downgrade.rs` keeps the `obs` section when going back a version? (And
   the same question for v2.0's `hotkeys`, `layout.order` and `style.keyLabels`, which a v1.4.0 save would drop today.)
5. **Size of a scene layout:** scale it to fill the source's box (today's `fitInBox`), or draw it at the chosen layout's
   scale and only shrink it when it doesn't fit?
6. **Later:** may the overlay tell the app the scene list (a first client-to-app message, so a protocol decision record),
   so the card can offer a dropdown?
7. **Part (a):** agree with the decision rule (at least 25% less page CPU, above noise), or skip the measurement entirely
   and keep recommending **Shutdown source when not visible**?
