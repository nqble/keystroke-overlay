// =====================================================================================================================
//  The words the user reads, kept short (docs/design/ui-design-v2.md, "Words"). Some sentences are
//  checked word for word by tests/e2e (secure link, keyboard input): change those together with their test.
// =====================================================================================================================
export const TEXT = {
  layoutLimitReached: (max) => `You have ${max} layouts, the most the app keeps. Delete one to make room.`,
  newLayoutHelp: 'It starts as the full keyboard. Hide keys on the Keys tab.',
  resetBodyWhatChanges: 'Every option goes back to its default. Your layouts, presets, fonts and port are kept.',
  resetBodyLinkNote: 'If the secure link was on, copy the OBS link into OBS again.',
  manualInstallDialog: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  noKeySelected: 'No key selected',
  inspectorTip: 'Click a key to label or hide it. Dragged keys line up with their neighbours. Saved for each layout.',
  overlapNote: 'This key overlaps another. Drag it to a free spot, or press Close gaps.',
  inspectorTipGrid:
    'Want every key the same size in neat columns? Switch Layout style to Even grid. Each style keeps its own positions.',
  closeGapsHelp: 'Slide keys together to close the space left by hidden or moved keys. The shape stays the same.',
  resetMenuHelp: 'Put keys, labels or the whole layout back the way the layout file has them. You can undo it.',
  resetLayoutBody:
    'Positions, sizes, hidden keys and labels go back to the layout file, and the style to Keyboard shape. You can undo this.',
  groupInspectorTip: 'Drag any of them to move them together. The bar above them lines them up or spaces them.',
  clickToDismiss: 'Click to dismiss',
  gridHelp: 'Faint dots at every snap step.',
  animationTabNote: 'Light on your PC. Press keys to try it.',
  keyPictureHelp: 'Drag a key to move it. Drag on the background to select several. Tab and Enter work too.',
  secureLinkOff:
    '**Off (default):** your OBS link is simple and needs no extra step. Any program running on this ' +
    'PC can read your key presses through it. Turn this on if you share the PC or want that closed.',
  secureLinkOn:
    '**On:** your OBS link now contains a private key, and only a program that knows the full link ' +
    'can read your key presses. **Copy the new link into your OBS Browser Source once** — the old ' +
    'link stops working. Keep the link off your stream. “Make a new key” cuts off anyone who has the ' +
    'old one.',
  debugModeHelp: 'Adds a Debug tab for finding problems. Nothing is saved or sent.',
  manualInstallNote: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  updateChannelHelp: 'Stable: the main releases (recommended). Latest: every release, small fixes too.',
  updatesNote: 'Never installs without your click. Only checks GitHub for new versions; your key presses stay here.',
};
