// =====================================================================================================================
//  The header's OBS status: "Live in OBS", "Paused" or "Not connected to OBS" (docs/design/v2-redesign.md, Header).
//  Plain logic, no page code, so tests/ui can run it with Node; messages.js paints it. The app sends the number of
//  connected OBS overlays (server.rs, OverlayCount) only when it changes, so nothing here polls.
//  A new status (e.g. a secure link that needs copying again) is one more rule in obsStatus().
// =====================================================================================================================

const TEXT = {
  live: '● Live in OBS',
  paused: '⏸ Paused',
  pausedNoObs: '⏸ Paused · OBS not connected',
  noObs: '○ Not connected to OBS',
  debug: (overlays, paused) =>
    `${overlays} overlay ${overlays === 1 ? 'client' : 'clients'} · paused: ${paused ? 'yes' : 'no'}`,
};

/**
 * What the status shows. `kind` picks the colour in settings.css (.obs-status.live / .paused / .off).
 * Paused wins over everything, because it is the one the streamer chose.
 */
export function obsStatus(paused, overlays) {
  const connected = overlays > 0;
  if (paused) return { kind: 'paused', text: connected ? TEXT.paused : TEXT.pausedNoObs };
  if (connected) return { kind: 'live', text: TEXT.live };
  return { kind: 'off', text: TEXT.noObs };
}

/** The extra line Debug mode shows next to the status. */
export function obsStatusDetail(paused, overlays) {
  return TEXT.debug(overlays, paused);
}
