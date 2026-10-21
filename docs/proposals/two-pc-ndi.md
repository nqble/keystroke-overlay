# Proposal: a second two-PC route, sending the overlay as video with NDI (DistroAV)

Status: **Kept as documentation only** (Jordan, 2026-10-20: NDI is widely used but redundant next to the SSH tunnel; not added to the user guide, and untested because only one PC is available. The steps and the privacy warning stay here for others to try)

A documentation-only proposal: a second way to use the overlay with two PCs, next to the SSH tunnel in the user guide.
OBS on the gaming PC draws the overlay and sends it as video over the local network with NDI; OBS on the streaming PC
receives it. The app doesn't change.

## Goal

- Give two-PC streamers a way that needs no SSH server, no terminal and no secure link, when both PCs are on the same
  wired home network.
- Say plainly when to pick it and when the SSH tunnel is the better choice.
- Keep the app exactly as it is: its server still listens on `127.0.0.1` only and nothing in it uses the network.

## Non-goals

- No app change, no built-in network mode, no NDI code in the app (the app would need the proprietary NDI SDK and would
  start sending pictures of key presses itself; both are against principle 1 in CLAUDE.md).
- No NDI across the internet, over Tailscale, or between different networks (NDI Bridge, NDI Discovery Server): out of
  scope for the guide.
- No support for NDI or DistroAV problems beyond these steps; the guide links their own help.

## How it works

### The pieces (all installed by the user)

| Piece | What it is | License |
|---|---|---|
| OBS Studio on **both** PCs | OBS 31.1.1 or later (DistroAV's requirement) | GPL-2.0 |
| [DistroAV](https://github.com/DistroAV/DistroAV) on both PCs | The OBS plugin for NDI (formerly obs-ndi). Windows: `winget install --exact --id DistroAV.DistroAV`; macOS: its Homebrew tap; Linux: Flatpak or the Ubuntu package | GPL-2.0 |
| NDI Runtime on both PCs | NDI's own library, version 6.3 or later; DistroAV offers to install it, or from ndi.video | Proprietary, free to use; the user accepts NDI's license |

Keystroke Overlay ships, bundles and links none of these, so their licenses put no conditions on this project. The guide
only links to their pages.

### What happens

```
gaming PC:   keyboard -> Keystroke Overlay -> 127.0.0.1 -> OBS browser source -> DistroAV NDI Output filter
                                                                                      |  video with transparency,
                                                                                      v  over the local network
streaming PC:                                                     OBS "NDI Source" -> your scene -> stream
```

The key presses never leave the gaming PC as data. What leaves it is a moving picture of the overlay, made by OBS and sent
by NDI.

### Steps for the guide

**On the gaming PC (PC A)**

1. Install DistroAV and the NDI Runtime, and start OBS.
2. Add the overlay to a scene as in **Add it to OBS**: **Sources → + → Browser**, paste the OBS URL from **Copy OBS URL**,
   and set the size the app shows. The plain link is fine here, because OBS and the app are on the same PC.
3. In that browser source's properties, leave **Shutdown source when not visible** off, so it keeps drawing while OBS on
   this PC isn't showing it.
4. Right-click the source → **Filters** → **+** → **DistroAV NDI Output**. Give it a name, for example `Keystroke Overlay`.
5. Leave OBS running (minimized is fine). It doesn't need to stream or record.

**On the streaming PC (PC B)**

1. Install DistroAV and the NDI Runtime.
2. In OBS: **Sources → + → NDI Source**. Under **Source name**, pick the one from PC A (it shows as the PC's name with
   `Keystroke Overlay`).
3. **Bandwidth**: Highest. **Latency Mode**: Low.
4. If the edges of the keys look dark or have a halo, tick **Fix alpha blending (adds a filter to this source)**.
5. Size and place the source in your scene. To make the keys bigger, change **Style → Size → Overall scale** in the app on
   PC A instead of stretching the source, as for one PC.

**Good to know**

- **Pause overlay** works as usual: the pause happens in the app on PC A, and the picture goes empty.
- Fonts come from PC A, because PC A draws the overlay. (With the SSH tunnel they come from PC B.)
- The app on PC A shows **Live in OBS**, because OBS on PC A is connected to it.
- Close OBS on PC A and the overlay disappears from PC B until OBS starts again.

### Transparency

NDI can carry an alpha channel. DistroAV's filter sends the source as BGRA (color plus alpha, read from its code), and the
receiving **NDI Source** keeps it, so the overlay stays transparent over the game. Some setups show dark fringes on soft
edges (glow, rounded corners) because of how the alpha is blended; that is what DistroAV's **Fix alpha blending** option is
for. The hands-on test below checks both, over a bright and a dark scene.

### Compared with the SSH tunnel

| | SSH tunnel (in the guide today) | NDI with DistroAV (this proposal) |
|---|---|---|
| What travels between the PCs | The key events and settings (a few KB per second while typing) | Video of the overlay: an estimated 20 to 40 Mbit/s for a TKL-sized overlay at 60 fps (NDI's full-bandwidth video is up to about 150 Mbit/s at 1080p60, and the overlay is about a fifth of that area; to measure) |
| Network | Any, including Wi-Fi and Tailscale between different places | Same local network; wired gigabit recommended, Wi-Fi not |
| Extra delay | A few milliseconds on a home network; the overlay is drawn on PC B | NDI's own delay (about a frame on a wired network) plus OBS drawing on both PCs: about 1 to 3 frames in all (to measure) |
| Picture quality | Pixel-perfect, drawn by OBS on PC B | Lightly compressed by NDI; text edges may soften slightly |
| Fonts | Must exist on PC B (or added in the app) | From PC A |
| Load on the gaming PC | Almost none (the SSH server) | OBS running a browser source and sending NDI: small, but not zero (to measure) |
| Setup | An SSH server on PC A, Tailscale, a command in a terminal on PC B each time | OBS, DistroAV and the NDI Runtime on both PCs; no terminal |
| Who can watch | Only someone with the secure link's key, through the encrypted tunnel | **Anyone on the same network with NDI software**: NDI video is not encrypted and has no password by default |

### Privacy: the one thing the guide must say

The NDI picture shows your key presses, live. NDI announces its sources on the local network and doesn't encrypt them, so
any device on that network running NDI software (NDI Studio Monitor, another OBS) can find and watch the overlay. So the
guide says:

- Use NDI only on a home network you trust, or a cable straight between the two PCs.
- DistroAV's **NDI groups** setting on the filter hides the source from programs that don't know the group, but it is not a
  password.
- **Pause overlay** before typing anything private, as on one PC.
- If that matters to you, use the SSH tunnel instead: it is encrypted and needs the secure link's key.

Nothing about the app's own behavior changes, so PRIVACY.md keeps its promises as written. One line is added to its
"Things outside this app's control" list: if you send OBS's picture to another computer (for example with NDI), what that
picture shows travels over your network, outside the app.

### When to recommend which

| Your setup | Use |
|---|---|
| One PC | Neither: add the OBS URL to OBS as usual |
| Two PCs, both on one wired home network, OBS and NDI already in use, no wish to run a terminal | NDI |
| Two PCs, Wi-Fi between them, or in different places | SSH tunnel over Tailscale |
| Other people or devices on the network you don't trust (shared house, dorm, office) | SSH tunnel |
| The gaming PC has no spare CPU or GPU at all | SSH tunnel |
| You want the overlay pixel-perfect on stream | SSH tunnel |

### Rejected: VDO.Ninja

[VDO.Ninja](https://github.com/steveseguin/vdo.ninja) can send a browser tab or an OBS output to another PC as WebRTC video,
and OBS on the other PC shows it as a browser source. It is not recommended in the guide:

- **It goes through outside servers.** The two PCs find each other through VDO.Ninja's own servers on the internet, and
  when a direct connection fails the video goes through relay servers. A live picture of every key press would then depend
  on a third party's servers, which is against the project's privacy-first rule.
- Running your own copy of its servers avoids that, but is far more setup than the SSH tunnel.
- It is AGPL-3.0. That doesn't affect a user who only visits it, but it rules out ever building it into the app or hosting a
  copy for users.

## Files to change (docs only)

| File | Change |
|---|---|
| `docs/USER-GUIDE.md` | "Using two PCs" becomes two parts: "With an SSH tunnel" (today's text, unchanged) and "With NDI (DistroAV)" (the steps, transparency, good to know, the privacy warning), with the "When to recommend which" table above both; the contents list at the top follows |
| `PRIVACY.md` | The one line in "Things outside this app's control" |
| `docs/decisions/ideas-not-decided.md` | The dual-PC bullet mentions that two no-code routes are documented |
| `docs/for-claude/proposals/tailscale-dual-pc.md` | Its update note links the NDI section too |
| `docs/for-claude/README.md` | This plan's line and status |

No decision record is needed: the app doesn't change, and [decision 0002](../decisions/0002-local-only-server-and-optional-secure-link.md)
stays true (the app never listens on the network). README's feature list can say "two PCs: see the user guide" if it
mentions two PCs at all.

## Privacy

Covered above. In short: the app is unchanged, the key events stay on PC A, and the guide warns that the NDI picture is
visible to anything on the local network.

## Tests

No automatic test (nothing in the app changes); `npm run check:docs` for the wording and links. One hands-on test on two
Windows PCs on a wired network, recorded in the pull request, before the section is published:

1. The steps work as written, word for word, with the current OBS, DistroAV and NDI Runtime (note the versions).
2. Transparency over a bright and a dark scene, with and without **Fix alpha blending**, with the glow animation on.
3. Network use (Task Manager → Performance → Ethernet on PC A) while idle and while typing, at the default TKL size.
4. Delay: film both screens with a phone at a high frame rate while pressing a key; compare with the SSH tunnel on the same
   PCs.
5. CPU and GPU on PC A with OBS minimized (Task Manager), and whether the filter keeps sending when the source isn't in
   PC A's current scene.
6. Pause, OBS restart on either PC, and PC B's OBS opened before PC A's.
7. That an NDI viewer on a third device on the network can see the source (to confirm the warning).
8. One check on a Mac as PC B if one is at hand.

## Docs to update

The files listed under "Files to change"; nothing else.

## Risks

- **People miss the warning** and send key presses across a shared network. The warning sits in the steps, not only in a
  footnote, and the "When to recommend which" table names shared networks.
- **Support questions about NDI and DistroAV.** The guide links DistroAV's troubleshooting wiki and says the app can't see or
  fix NDI problems.
- **The plugin changes its labels.** The test notes the versions; the labels are DistroAV's English ones (from its
  `en-US.ini` at 2026-10-16) and are checked again in the hands-on test.
- **The numbers are estimates** until step 3 and 4 of the test are done; the guide prints measured numbers or none.

## Work order

1. Jordan agrees to document a second route.
2. Hands-on test on two PCs (above); write down versions and numbers.
3. Write the USER-GUIDE.md section and the table, using the measured numbers; the PRIVACY.md line; the
   ideas-not-decided.md and tailscale-dual-pc.md notes.
4. `npm run check:docs`; one commit (`docs(guide): add a two-pc route with ndi`).

## Effort

About half a day: 1 to 2 hours for the hands-on test with two PCs, 2 to 3 hours to write and check the docs.

## Open questions for Jordan

1. Is it fine for the guide to recommend a route that needs proprietary software (the NDI Runtime) when the user installs
   it themselves?
2. Should the NDI route come first or second in the guide? (Proposed: the table first, then the SSH tunnel, then NDI, so
   the encrypted route stays the default for anyone unsure.)
3. Are two PCs available for the hands-on test, and is a Mac needed for it?
4. Should the guide mention "NDI is a registered trademark of Vizrt" as NDI's brand rules ask of products? (Probably not
   needed in a how-to; to check.)
