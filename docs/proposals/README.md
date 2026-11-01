# Proposals

Plans for features and changes that are not built yet: what they would do, how, what they would cost, and the open
questions. A proposal is not a promise; each one says its status on its first lines. Anyone can pick one up: read it,
then open an issue or a pull request that says which proposal you're working from (see
[CONTRIBUTING.md](../../CONTRIBUTING.md)). Decisions already made are in [../decisions/](../decisions/README.md);
approved designs in [../design/](../design/).

When a proposal is built, its lasting facts move into the reference docs (the user guide, ARCHITECTURE.md, a decision
record) and the proposal is deleted; git history keeps it. A new proposal is one file here, with a **Status** line at
the top and a line in this list.

| Proposal | What it is | Status |
|---|---|---|
| [key-rotation.md](key-rotation.md) | Turn single keys in the Keys tab and in layout files (KLE angles kept) | Being built: formats and settings v5 done; overlay and editor next |
| [drawn-devices.md](drawn-devices.md) | A drawn mouse and controller on the overlay, Add ▾ in the Keys tab, the Inputs card and the eye button (show or hide each input) | Being built: the eye button and the tray's Show menu done; devices next |
| [mouse-input.md](mouse-input.md) | Mouse buttons and wheel on the overlay (never the pointer's position) | Planned with drawn-devices.md (mouse first); how it looks is there |
| [controllers-gilrs.md](controllers-gilrs.md) | Game controller input, with the gilrs library compared to our own code | Proposed; common gamepads first, idle improvements in drawn-devices.md |
| [obs-source-events.md](obs-source-events.md) | OBS scene awareness through the Browser source's page API | Scene rules built in v2.0; pausing while hidden is open |
| [accessibility-checks.md](accessibility-checks.md) | Automatic accessibility checks (axe-core) in the end-to-end tests | Proposed |
| [stream-deck-companion.md](stream-deck-companion.md) | Stream Deck control through Bitfocus Companion | Open idea: wanted; how it is built is open |
| [analog-keys-wooting.md](analog-keys-wooting.md) | Analog key pressure (Wooting Analog SDK) | Open research |
| [obs-websocket.md](obs-websocket.md) | The app talking to OBS through obs-websocket | Not planned; kept as documentation |
| [two-pc-ndi.md](two-pc-ndi.md) | Two PCs with NDI video instead of a tunnel | Not planned; kept as documentation |
