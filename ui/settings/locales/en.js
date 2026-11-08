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
  // the General tab: general.js (ui/settings/tabs/)
  general: {
    title: 'General',
    input: 'Keyboard input',
    standard: 'Standard',
    compatibility: 'Compatibility',
    standardNote: 'Works with nearly every game.',
    compatibilityNote: 'For games where keys don’t light up with Standard.',
    adminNote: 'If a game runs as administrator, start Keystroke Overlay as administrator too.',
    inputDetail: {
      rawinput: 'Compatibility = Raw Input (RIDEV_INPUTSINK, message-only window)',
    },
    inputChanged: 'Keyboard input: {name}',
    startup: 'Startup',
    openOnLaunch: 'Open this window on launch',
    advanced: 'Advanced',
    debugMode: 'Debug mode (for developers)',
    devLook: 'Devbuild look: keep the purple logo',
    devLookNote: 'Turn off to see the logo in the theme’s colors. The DEV badge stays.',
    restart: 'Restart server',
    restarted: 'Server restarted',
    dataFolder: 'Open data folder',
    reset: 'Reset all settings…',
    quit: 'Quit app',
  },

  // the General tab: general-connection.js (ui/settings/tabs/)
  generalConnection: {
    title: 'Connection',
    link: 'OBS URL',
    copy: 'Copy',
    port: 'Port',
    apply: 'Apply',
    portChanged: 'Port changed: copy the OBS URL into OBS again.',
    secure: 'Secure my OBS URL',
    copySecure: 'Copy secure link',
    newKey: 'Make a new key',
    secureOn: 'Secure link on: copy the new OBS URL into OBS.',
    secureOff: 'Secure link off.',
    newKeyMade: 'New key made: copy the new OBS URL into OBS.',
    firstRun: 'First run setup',
    serverDetail: 'Local server on 127.0.0.1:{port}',
    keyDetail: '128-bit key, checked in constant time on /api, /ws, /fonts and /user.',
  },

  // the General tab: general-hotkey.js (ui/settings/tabs/)
  generalHotkey: {
    title: 'Pause shortcut',
    enabled: 'Pause with a shortcut',
    note: 'Works from any app, even in a game.',
    none: 'No shortcut yet',
    choose: 'Choose shortcut',
    listening: 'Press the keys… (Esc to cancel)',
    needsModifier: 'Add {modifiers} to that key.',
    clear: 'Clear',
    saved: 'Pause shortcut: {name}',
    openTitle: 'Open settings shortcut',
    openNote: 'Opens this window from any app. Off until you choose keys, for example {example}.',
    openSaved: 'Open settings shortcut: {name}',
  },

  // the General tab: general-mouse.js (ui/settings/tabs/)
  generalMouse: {
    title: 'Mouse',
    switch: 'Show my mouse',
    note: 'Shows your mouse buttons and wheel in layouts that have a mouse. Add WASD + mouse from Other layouts on the Layout tab. The app never sees where your pointer is.',
  },

  // the General tab: general-obs-scenes.js (ui/settings/tabs/)
  generalObsScenes: {
    title: 'OBS scenes',
    enabled: 'Change the overlay per OBS scene',
    note: 'Hide the overlay or show another layout in the scenes you list. The live preview always shows your chosen layout.',
    count: { none: 'No scenes yet', one: '1 scene set', other: '{count} scenes set' },
    edit: 'Edit scenes…',
  },

  // the General tab: general-updates.js (ui/settings/tabs/)
  generalUpdates: {
    title: 'Updates',
    version: 'Version',
    notes: 'Release notes',
    channel: 'Update channel',
    stable: 'Stable',
    latest: 'Latest',
    auto: 'Check automatically',
    check: 'Check now',
    checking: 'Checking…',
    install: 'Install update',
    manualInstall: 'Open GitHub installer',
    upToDate: 'Up to date (version {version})',
    available: 'Version {version} is available',
    manual: 'Version {version} is available: install it by hand',
    detail: 'Manifest: {channel}.json on GitHub · signature checked before install',
  },

  // the General tab: general-appearance.js (ui/settings/tabs/)
  generalAppearance: {
    title: 'Appearance',
    help: 'The look of this window. It doesn’t change the overlay in OBS (that’s the Style tab).',
    keycaps: 'keycaps',
    add: '+ New theme',
    addTip: 'Start from the theme you use now and change its colors',
    import: 'Import…',
    imported: 'Imported “{name}”',
    limit: 'You have {max} themes of your own, the most allowed. Delete one to add another.',
    more: 'More for {name}',
    edit: 'Edit',
    export: 'Export…',
    exported: 'Theme exported',
    delete: 'Delete…',
    deleteTitle: 'Delete “{name}”?',
    deleteBody: 'The theme is removed from this computer. An exported copy stays where you saved it.',
    deleteConfirm: 'Delete theme',
  },

  // the Keys tab: keys.js (ui/settings/tabs/)
  keys: {
    heading: 'Keys — {name}',
    layoutStyle: 'Layout style',
    styleShape: 'Keyboard shape',
    styleGrid: 'Even grid',
    or: 'or', // between two key caps in the hint line
    nudgeTip: 'Arrow keys move the selected keys a quarter key',
    nudge: 'nudge',
    shiftChip: 'Shift',
    wholeKeyTip: 'Shift + arrow moves a whole key',
    wholeKey: 'whole key',
    hide: 'hide',
    zoom: 'zoom',
    pan: 'pan',
  },

  // the Keys tab's toolbar: keys-toolbar.js (ui/settings/tabs/)
  keysToolbar: {
    history: 'History',
    view: 'View',
    tidy: 'Tidy',
    undo: 'Undo',
    redo: 'Redo',
    nothingToUndo: 'Nothing to undo',
    nothingToRedo: 'Nothing to redo',
    snap: 'Snap',
    grid: 'Grid',
    hiddenKeys: 'Hidden keys',
    closeGaps: 'Close gaps',
    reset: 'Reset',
    putSelectedBack: 'Put selected keys back',
    putAllBack: 'Put all keys back',
    showAllHidden: 'Show all hidden keys',
    resetAllLabels: 'Reset all labels',
    resetCompletely: 'Reset this layout completely',
    resetTitle: 'Reset this layout?',
    resetConfirm: 'Reset layout',
    layoutReset: '{name} reset',
    status: '{moved} moved · {hidden} hidden', // tests/e2e keys-editor checks this shape
    overlap: { one: '{count} key overlap', other: '{count} keys overlap' },
  },

  // the Keys tab's inspector: keys-inspector.js (ui/settings/tabs/)
  keysInspector: {
    panel: 'Selected keys',
    show: 'Show',
    keyTitle: 'Key: {code}',
    blankKey: 'Blank key',
    cantLightUp: "can't light up",
    label: 'Label',
    reset: 'Reset',
    width: 'Width in keys',
    height: 'Height in keys',
    angle: 'Angle in degrees',
    position: 'Position',
    x: 'X',
    y: 'Y',
    putBack: 'Put back where it was',
    selected: { one: '{count} key selected', other: '{count} keys selected' }, // tests/e2e keys-editor checks this
    putTheseBack: 'Put these back',
    putTheseBackTip: 'Put back where the layout has them',
    clearSelection: 'Clear selection',
  },

  // the keyboard editor: editor.js, arrange-bar.js and view.js (ui/settings/editor/)
  editor: {
    boardName: 'Keyboard layout {name}',
    arrangeName: 'Arrange the selected keys',
    needMore: 'Select at least {count} keys first',
    arrange: {
      left: { label: 'Left', tip: 'Align left edges' },
      center: { label: 'Center', tip: 'Align centers (vertical)' },
      right: { label: 'Right', tip: 'Align right edges' },
      top: { label: 'Top', tip: 'Align top edges' },
      middle: { label: 'Middle', tip: 'Align middles (horizontal)' },
      bottom: { label: 'Bottom', tip: 'Align bottom edges' },
      across: { label: 'Across', tip: 'Equal gaps, left to right' },
      down: { label: 'Down', tip: 'Equal gaps, top to bottom' },
    },
    resetZoom: 'Reset zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
  },
};
