// =====================================================================================================================
//  The header's OBS status: live, paused, not connected, link changed or port in use (docs/design/ui-design-v2.md,
//  Header).
//  Plain logic, no page code, so tests/ui can run it with Node; messages.js paints it. The app sends the number of
//  connected OBS overlays (server.rs, OverlayCount) only when it changes, so nothing here polls.
//  A new status is one more rule in obsStatus().
// =====================================================================================================================

const TEXT = {
  live: '● Live in OBS',
  paused: '⏸ Paused',
  pausedNoObs: '⏸ Paused · OBS not connected',
  noObs: '○ Not connected to OBS',
  linkChanged: 'OBS URL changed: copy it again',
  serverProblem: '⚠ Port in use',
  debug: (overlays, paused) =>
    `${overlays} overlay ${overlays === 1 ? 'client' : 'clients'} · paused: ${paused ? 'yes' : 'no'}`,
};

/**
 * What the status shows, from the facts the window knows: { paused, overlays, serverError, linkChanged }.
 * `kind` picks the color in header.css (.obs-status.live / .paused / .off / .bad). The order matters:
 *   1. a server that couldn't start: nothing works until it is fixed;
 *   2. paused: the one the streamer chose;
 *   3. a changed link: OBS still has the old one, so it can't connect until the new one is copied;
 *   4. live or not connected.
 */
export function obsStatus({ paused, overlays, serverError = null, linkChanged = false }) {
  const connected = overlays > 0;
  if (serverError) return { kind: 'bad', text: TEXT.serverProblem };
  if (paused) return { kind: 'paused', text: connected ? TEXT.paused : TEXT.pausedNoObs };
  if (linkChanged) return { kind: 'bad', text: TEXT.linkChanged };
  if (connected) return { kind: 'live', text: TEXT.live };
  return { kind: 'off', text: TEXT.noObs };
}

/** The extra line Debug mode shows next to the status. */
export function obsStatusDetail(paused, overlays) {
  return TEXT.debug(overlays, paused);
}
