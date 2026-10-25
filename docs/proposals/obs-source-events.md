# Proposal: OBS scene awareness through the Browser source's page API

Status: **Part (b), scene rules, built in v2.0** (**General → OBS scenes → Edit scenes…**). **Part (a), pausing the
drawing while the source is hidden, is open** (2026-10-20): it waits for a measurement in OBS, and is likely not worth
building.

What the overlay can do with the page API that OBS's Browser source (obs-browser) gives every page it shows: change per
OBS scene (built), and pause drawing while the source is hidden (open, measure first). No network code.

## Summary

| Part | What | State |
|---|---|---|
| (a) Pause drawing while hidden | Skip the key drawing while OBS says the source is not visible | **Open. Measure first; likely not worth building.** OBS already stops painting a hidden source (see "What OBS already does for a hidden source"), and the overlay has no timers. |
| (b) Scene rules | Hide the overlay, or show another layout, in the scenes the user lists | **Built in v2.0** (see "Built: part (b), scene rules") |

The page API facts below were read from obs-browser's source (commit `07227af`, 2026-10-16, plugin version 2.27.3). The
facts that still need a real OBS to confirm are marked **(verify in OBS)**.

## Built: part (b), scene rules

Turn on **General → OBS scenes**, click **Edit scenes…** and list scenes by name: for each, hide the overlay or show
another layout. Inside OBS, the overlay page hears the scene change (`obsSceneChanged`, plus `getCurrentScene` once at
start when **Page permissions** allow it) and follows the rules. Outside OBS, and in the live preview, nothing changes.
The scene's name stays in the overlay page: it is never saved, logged or sent, not even to the app. Only the rules are
saved, in `obs.scenes`.

| Where | What |
|---|---|
| [ui/overlay/obs-source.js](../../ui/overlay/obs-source.js) | `watchObs`, `sceneRule`, `sceneView`: listening to OBS and choosing what to draw |
| [ui/settings/tabs/general-obs-scenes.js](../../ui/settings/tabs/general-obs-scenes.js) | The **OBS scenes** card: the switch and a count |
| [ui/settings/obs-scenes-popup.js](../../ui/settings/obs-scenes-popup.js), [obs-scene-rules.js](../../ui/settings/obs-scene-rules.js) | The **Edit scenes…** popup and which rows are saved |
| [src-tauri/src/obs_scenes.rs](../../src-tauri/src/obs_scenes.rs) | Cleaning the saved rules (at most 20, names up to 100 characters, each scene once) |
| [USER-GUIDE.md, Keep it smooth and light in OBS](../USER-GUIDE.md#keep-it-smooth-and-light-in-obs) | How to use it, and the **Page permissions** step |
| [FILE-FORMATS.md](../FILE-FORMATS.md), [PRIVACY.md](../../PRIVACY.md) | The `obs.scenes` setting; what the overlay learns from OBS |

Ideas left for later, not planned: the overlay telling the app the scene list, so the popup could offer a dropdown
instead of a text box (the first client-to-app message, so it would need a protocol decision record); app-side
"forward no keys in a scene" through obs-websocket ([obs-websocket.md](obs-websocket.md), not planned).

## Goal (part a)

- Spend no work on drawing keys that nobody can see, if measuring shows that this saves anything.
- Behave exactly as today everywhere else: in another streaming app, in a normal browser and in the live preview.

## Non-goals

- **No obs-websocket** and no other network code. That is the separate proposal [obs-websocket.md](obs-websocket.md).
- **No control of OBS.** The overlay never calls `setCurrentScene`, `startStreaming` or any other function that changes
  OBS, and never asks the user for more than read access.
- **No change to the protocol.** The overlay keeps receiving only ([PROTOCOL.md](../PROTOCOL.md): "Nothing a client
  sends changes the app").
- **No setting.** Pausing the drawing while hidden changes nothing anyone can see.
- **Rejected:** closing the WebSocket while hidden. The app's header would then say "Not connected to OBS" whenever the
  scene changes, and **Shutdown source when not visible** already gives that behavior to anyone who wants it.

## The page API (researched)

Source: `README.md`, `browser-app.cpp`, `browser-client.cpp`, `obs-browser-source.cpp`, `obs-browser-plugin.cpp` and
`obs-browser-source.hpp` in github.com/obsproject/obs-browser.

### `window.obsstudio`

Created for every page a Browser source loads (`BrowserApp::OnContextCreated`). It holds `pluginVersion` (a string such
as `"2.27.3"`) and these functions: `getControlLevel`, `getCurrentScene`, `getStatus`, `getScenes`, `getTransitions`,
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

Two details from `BrowserClient::OnProcessMessageReceived`:

- **A getter called below its level still calls back, with `null`.** For example `getCurrentScene` at the default level
  1 answers `null`, not an error. (If OBS has no current scene at all, it doesn't call back.)
- **Events are not gated by the level.** `DispatchJSEvent` sends every event to the page whatever its permissions, so
  `obsSceneChanged` and `obsSourceVisibleChanged` arrive at the default level 1.

### Events

Each is a `CustomEvent` dispatched on `window` (to every frame of the page), with the payload in `event.detail`.

| Event | `event.detail` | Sent to | Added (obs-browser commit; earliest tag that has it) |
|---|---|---|---|
| `obsSceneChanged` | `{ name, width, height }` of the current (program) scene | every Browser source | 2016-09-19 (`66ddf15`); tag 1.27 |
| `obsSceneListChanged` | array of scene names | every Browser source | 2022-05-26 (`0674786`); tag 2.23.4 |
| `obsSourceVisibleChanged` | `{ visible: true \| false }` | this source only | 2019-02-17 (`a2fac6a`); tag 2.8.5 |
| `obsSourceActiveChanged` | `{ active: true \| false }` | this source only | 2019-02-17 (`a2fac6a`); tag 2.8.5 |
| `obsExit` | `null` | every Browser source | 2016-09-19; tag 1.27 |

And for the functions: `getCurrentScene` 2016-12-21 (tag 1.27); `getControlLevel` and the levels 2021-07-12 (tag
2.16.2); `getScenes` 2021-08-28 (tag 2.17.9). The legacy callbacks `window.obsstudio.onVisibilityChange` and
`onActiveChange` still work but are marked deprecated in the README; use the events.

**Which OBS version has them.** obs-browser's tags are its own version numbers, not OBS's, and the repository's history
doesn't say which plugin version each OBS release bundles. Every item above was committed before OBS 28.0 came out
(2022-08-31), so OBS 28 and later should have all of them. **This mapping is inferred from dates, not checked against
OBS's release notes.** The code doesn't depend on a version: it checks that each function exists before calling it.

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
shows. The user guide already recommends that option for an overlay that is only in some scenes
([USER-GUIDE.md, Keep it smooth and light in OBS](../USER-GUIDE.md#keep-it-smooth-and-light-in-obs)). Whether
`WasHidden` also sets `document.visibilityState` to `hidden` in OBS's CEF is likely but **(verify in OBS)**.

So on a hidden source the overlay's remaining work per key is: receive the WebSocket frame, `JSON.parse`, one
`classList.toggle`. No frames are painted and no transitions run.

### Pages outside OBS

`window.obsstudio` is missing in every other host: a normal browser, the settings window's live preview (WebView2,
WKWebView or WebKitGTK), `npm run preview`, and other streaming apps. Some other apps that embed Chromium may define a
partial `window.obsstudio` **(not checked)**, which is why every call is guarded by `typeof … === 'function'`.

## (a) Pause drawing while the source is hidden: measure first

### Expected result

Small. The overlay already has no timers or polling while connected ([overlay.js](../../ui/overlay/overlay.js) header,
ARCHITECTURE.md "The overlay animates only transform and opacity and has no timers while connected"), and OBS already
stops painting it. The likely outcome is "measured, not built". The measurement is still worth an hour, because the
result belongs here.

### How to measure (Windows, by hand: the e2e tests can't run OBS)

1. Install the app, and in OBS 28 or later make scene **A** with one Browser source of the OBS URL (full-size layout, an
   animation with a glow) and an empty scene **B**. Close the Multiview and any projector; studio mode off.
2. Find OBS's page processes: `obs-browser-page.exe` (several; the renderer of this source is one of them). Sum their CPU
   time with a short PowerShell line in the style of [tests/bench/tree.ps1](../../tests/bench/tree.ps1)
   (`Get-Process obs-browser-page | Measure-Object CPU -Sum`).
3. For each case, read the CPU time, send 8,000 key presses with
   `powershell -File tests/e2e/lib/inject.ps1 -scenario flood -n 8000` (it presses Right Ctrl only), read again:
   - scene A on program (visible, active);
   - scene B on program (hidden);
   - scene B on program with **Shutdown source when not visible** on (the page is gone: the floor);
   - studio mode with A in the preview and B on program (visible, not active).
4. Five runs per case, the median. Also note OBS's own **Docks → Stats** (CPU usage, average time to render a frame).
5. Then build the change (below) on a branch and repeat the hidden case.

The [overlay-speed](../../tests/e2e/suites/overlay-speed.mjs) e2e suite can't measure this: it reaches the live
preview, which is never hidden by OBS, and the key handler isn't reachable from outside the page without a test-only
hook, which we don't want in the page OBS loads.

**Decision rule** (proposed): build (a) only if the hidden case uses at least 25% less page CPU during the flood, and
the saving is above the run-to-run noise. Otherwise write the numbers here, mark (a) "measured, not built", and stop.

### What the change would be (only if the measurement says so)

- In [ui/overlay/obs-source.js](../../ui/overlay/obs-source.js), `watchObs` also listens for `obsSourceVisibleChanged`
  (`event.detail?.visible !== false`) and reports it through an `onVisible` callback.
- In [overlay.js](../../ui/overlay/overlay.js), `setKey` keeps updating the `held` set while hidden (cheap, and needed
  so no key looks stuck) but skips `classList.toggle`. On visible again, one pass sets `down` on exactly the held keys
  (the same loop `snapshot()` uses).
- Pause on **visible false only**, never on *active false*: a preview or Multiview still shows the overlay.
- Settings changes (`cfg`) are still applied while hidden; they are rare.
- Not in the live preview, as for the scene rules.

## Files to change (part a)

| File | Change |
|---|---|
| [ui/overlay/obs-source.js](../../ui/overlay/obs-source.js) | `obsSourceVisibleChanged` and `onVisible` in `watchObs` |
| [ui/overlay/overlay.js](../../ui/overlay/overlay.js) | Skip drawing while hidden; resync on show |
| [ui/globals.d.ts](../../ui/globals.d.ts) | The type of the `obsSourceVisibleChanged` event, if not there yet |
| [tests/ui/obs-source.test.mjs](../../tests/ui/obs-source.test.mjs) | `obsSourceVisibleChanged` false and true; a missing `detail` |

No change to `server.rs`, `keyboard/`, `tools/check-privacy.mjs`, the settings or the protocol.

## Privacy

None. No network, no keystrokes leave the page, nothing is written. The overlay only reads whether OBS shows it.

## Tests

- **Unit tests** in `tests/ui/obs-source.test.mjs`, with the fake host the scene tests already use (an `EventTarget`
  with an `obsstudio` object): `obsSourceVisibleChanged` with `visible: false` and `true` calls `onVisible`; a missing
  `detail` counts as visible.
- A unit test of the resync: keys pressed and released while hidden end up drawn exactly as held when shown.
- **By hand in OBS** (Windows, and a Mac if one is at hand): the measurement above; hiding and showing with a key held;
  studio mode; **Shutdown source when not visible** on and off.
- The overlay's screenshots must not change.

## Docs to update

- This proposal: the measured numbers and the decision. If (a) is not built, its status says "measured, not built"; if
  it is, the proposal is deleted and the lasting facts go to ARCHITECTURE.md.
- [docs/proposals/README.md](README.md): the status.
- `CHANGELOG.md`, only if (a) is built.

## Risks

| Risk | How we handle it |
|---|---|
| Part (a) hides a key change that should show | It only skips drawing while OBS says nobody sees the page, and resyncs on show; unit-tested |
| A preview or Multiview shows a stale overlay | Pause only on *visible false*, never on *active false* |
| OBS changes the page API | Every call is guarded; events that never come mean today's behavior |
| overlay.js grows past ~400 lines | The logic lives in `obs-source.js`; a larger move is a refactor to agree with the maintainer first (CLAUDE.md section 7) |

## Work order

1. The measurement by hand; `docs(proposals): measured cost of a hidden obs source`, with the numbers and the decision.
2. Only if step 1 says so: `perf(overlay): skip drawing keys while the obs source is hidden`, with the `obs-source.js`
   change and its tests, and the manual OBS check.

## Effort

| Part | Estimate |
|---|---|
| Measurement and write-up | 0.5 day |
| The change, if worth it | 0.5 day |

## Open questions

1. **The decision rule:** at least 25% less page CPU, above noise? Or skip the measurement entirely and keep
   recommending **Shutdown source when not visible**?
2. Does `WasHidden` set `document.visibilityState` to `hidden` in OBS's CEF? If it does, the standard
   `visibilitychange` event could be used instead of `obsSourceVisibleChanged` (both need checking in OBS).
