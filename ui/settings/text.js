// =====================================================================================================================
//  The words the user reads, kept short (docs/design/ui-design-v2.md, "Words"). Some sentences are
//  checked word for word by tests/e2e (secure link, keyboard input): change those together with their test.
// =====================================================================================================================
export const TEXT = {
  layoutLimitReached: (max) => `You have ${max} layouts, the most allowed. Delete one to add another.`,
  resetBodyWhatChanges: 'Every option goes back to its default. Your layouts, presets, fonts and port are kept.',
  resetBodyLinkNote: 'If the secure link was on, copy the OBS URL into OBS again.',
  manualInstallDialog: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  noKeySelected: 'No key selected',
  inspectorTip: 'Click a key to label or hide it.',
  overlapNote: 'This key overlaps another.',
  closeGapsHelp: 'Slide keys together to fill gaps.',
  resetLayoutBody: 'Positions, sizes, hidden keys and labels go back to the layout file. You can undo this.',
  groupInspectorTip: 'Drag to move them together, or use the bar above to line them up.',
  clickToDismiss: 'Click to dismiss',
  snapHelp: 'Keys snap to quarter keys and to other keys’ edges.',
  gridHelp: 'Dots every half key (whole key in the Even grid).',
  showHiddenHelp: 'Show hidden keys, dimmed.',
  animationTabNote: 'Press keys to try one.',
  keyPictureHelp: 'Drag on the background to select several keys. Tab and Enter work too.',
  secureLinkOff:
    '**Off (default):** your OBS URL is simple and needs no extra step. Any program running on this ' +
    'PC can read your key presses through it. Turn this on if you share the PC or want that closed.',
  secureLinkOn:
    '**On:** your OBS URL now contains a private key, and only a program that knows the full link ' +
    'can read your key presses. **Copy the new link into your OBS Browser Source once** — the old ' +
    'link stops working. Keep the link off your stream. “Make a new key” cuts off anyone who has the ' +
    'old one.',
  debugModeHelp: 'Adds a Debug tab for finding problems. Nothing is saved or sent.',
  manualInstallNote: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  updateChannelHelp: 'Stable: the main releases (recommended). Latest: every release, small fixes too.',
  updatesNote: 'Never installs without your click. Only checks GitHub for new versions; your key presses stay here.',
};
