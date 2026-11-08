// =====================================================================================================================
//  English: the source every other language is translated from (docs/proposals/interface-languages.md). Grouped by the
//  file that shows them (`words('header')` in header.js). `{name}` is filled in by the code; a translation keeps every
//  placeholder and may move it. Some sentences are checked word for word by tests/e2e (secure link, keyboard input):
//  change those together with their test. Kept short and plain (docs/design/ui-design-v2.md, "Words").
// =====================================================================================================================

export default {
  // shared by several screens (formerly ui/settings/text.js)
  shared: {
    layoutLimitReached: 'You have {max} layouts, the most allowed. Delete one to add another.',
    resetBodyWhatChanges: 'Every option goes back to its default. Your layouts, presets, fonts and port are kept.',
    resetBodyLinkNote: 'If the secure link was on, copy the OBS URL into OBS again.',
    manualInstall: 'Install this one by hand: download it from GitHub, quit the app, then run it.',
    noKeySelected: 'No key selected',
    inspectorTip: 'Click a key to label or hide it.',
    overlapNote: 'This key overlaps another.',
    positionX: 'Position X',
    positionY: 'Position Y',
    closeGapsHelp: 'Fill the holes hidden keys leave in a row.',
    gapsClosed: 'Gaps closed',
    noGapsToClose: 'No holes to fill',
    resetLayoutBody: 'Positions, sizes, hidden keys and labels go back to the layout file. You can undo this.',
    groupInspectorTip: 'Drag to move them together, or use the bar above to line them up.',
    clickToDismiss: 'Click to dismiss',
    snapHelp: 'Keys snap to quarter keys and to other keys’ edges.',
    gridHelp: 'Dots every half key (whole key in the Even grid).',
    showHiddenHelp: 'Show hidden keys, dimmed.',
    animationTabNote: 'Press keys to try one.',
    keyPictureHelp: 'Drag on the background to select several keys. Tab and Enter work too.',
    // a drawn device's block on the Keys tab's board (docs/proposals/drawn-devices.md)
    deviceNames: { Mouse: 'Mouse', Controller: 'Controller' },
    secureLinkOff:
      '**Off (default):** any program on this PC can read your key presses through the OBS URL. ' +
      'Turn this on if you share the PC.',
    secureLinkOn:
      '**On:** only programs with the full OBS URL can read your key presses. **Copy the new OBS URL ' +
      'into OBS once**; the old one stops working. Keep it off your stream. **Make a new key** cuts off ' +
      'anyone with the old one.',
    debugModeHelp: 'Adds a Debug tab for finding problems. Nothing is saved or sent.',
    updateChannelHelp: 'Stable is recommended. Latest gets every small fix too.',
    updatesNote: 'Checks GitHub for new versions only. Nothing installs until you click.',
  },

  // the header (header.js)
  header: {
    statusTip: 'OBS URL settings', // the status opens General, where the OBS URL and port live
    copy: 'Copy OBS URL',
    update: 'Update ready',
  },

  // the update messages (messages.js)
  messages: {
    downloading: 'Downloading… {done}',
    downloadingOf: 'Downloading… {done} of {total} ({percent}%)',
    installing: 'Installing… the app will restart.',
  },

  // the live preview's round pause button (pause-button.js)
  pauseButton: {
    pauseWord: 'Pause',
    resumeWord: 'Resume',
    pauseName: 'Pause overlay',
    resumeName: 'Resume overlay',
  },

  // the eye button under it (eye-button.js)
  eyeButton: {
    button: 'What the overlay shows',
    show: { keyboard: 'Show the keyboard', mouse: 'Show the mouse', controller: 'Show the controller' },
  },

  // the GitHub button at the bottom of the tab bar (github-link.js)
  githubLink: {
    name: 'Keystroke Overlay on GitHub', // the tooltip and what a screen reader says
  },
};
