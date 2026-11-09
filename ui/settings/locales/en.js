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
    clickAgain: 'Click again to confirm', // a risky button's first click (confirmTwice in helpers.js)
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

  // the layout part of the settings window: layout.js (ui/settings/tabs/)
  layout: {
    title: 'Layout',
    count: 'Your layouts: {mine} / {max}',
    add: '+ New layout',
    deleteTitle: 'Delete {name}?',
    deleteBody: 'This can’t be undone.',
    cancel: 'Cancel',
    remove: 'Delete',
    deleted: '{name} deleted',
    import: 'Import…',
    export: 'Export…',
    importTip: 'Add layouts from a file',
    exportTip: 'Save your layouts to a file',
    imported: { one: 'Imported {count} layout', other: 'Imported {count} layouts' },
    importedSkipped: {
      one: 'Imported {count} layout, skipped {skipped}',
      other: 'Imported {count} layouts, skipped {skipped}',
    },
    nothingImported: 'Nothing imported',
    nothingImportedSkipped: 'Nothing imported ({skipped} skipped: empty, or the {max}-layout limit)',
    exported: { one: 'Exported {count} layout', other: 'Exported {count} layouts' },
  },

  // the layout card part of the settings window: layout-card.js (ui/settings/tabs/)
  layoutCard: {
    customized: 'Customized',
    more: 'More for {name}',
    rename: 'Rename…',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    hide: 'Hide',
    remove: 'Delete…',
  },

  // the style part of the settings window: style.js (ui/settings/tabs/)
  style: {
    title: 'Style',
    reset: 'Reset',
    resetLabel: 'Reset the look',
    resetDefault: 'Back to the default look',
    colors: 'Colors',
    shape: 'Shape',
    text: 'Text',
    size: 'Size',
  },

  // the style fonts part of the settings window: style-fonts.js (ui/settings/tabs/)
  styleFonts: {
    yours: 'Your fonts',
    none: 'No fonts added yet.',
    add: 'Add font file…',
    folder: 'Open fonts folder',
    added: 'Added {name}',
    use: 'Use',
    inUse: 'In use',
    remove: 'Remove',
  },

  // the style themes part of the settings window: style-themes.js (ui/settings/tabs/)
  styleThemes: {
    themes: 'Themes',
    presets: 'My presets',
    saveLook: '+ Save current look',
    saveTitle: 'Save current look',
    saveHelp: 'Saves your colors, shape, text, size and animation.',
    namePlaceholder: 'Preset name',
    cancel: 'Cancel',
    save: 'Save',
    saved: 'Preset saved',
    more: 'More for {name}',
    load: 'Use this look',
    remove: 'Delete',
    import: 'Import…',
    export: 'Export…',
    imported: 'Imported',
    exported: 'Exported',
    importTip: 'Load a look from a file',
    exportTip: 'Save this look to a file',
  },

  // the animation part of the settings window: animation.js (ui/settings/tabs/)
  animation: {
    title: 'Animation',
    fineTune: 'Fine-tune',
  },

  // the Style and Animation sliders, color pickers and dropdowns: controls.js (ui/settings/)
  controls: {
    labels: {
      keyFill: 'Fill (idle)',
      keyFillPressed: 'Fill (pressed)',
      borderColor: 'Border (idle)',
      borderColorPressed: 'Border (pressed)',
      glowColor: 'Glow color',
      borderWidth: 'Border thickness',
      radius: 'Corner radius',
      glowSize: 'Glow size',
      fontFamily: 'Font family',
      keyLabels: 'Key labels',
      fontSize: 'Font size',
      fontWeight: 'Font weight',
      textColor: 'Text (idle)',
      textColorPressed: 'Text (pressed)',
      keySize: 'Key size',
      gap: 'Key spacing',
      scale: 'Overall scale',
      opacity: 'Opacity',
      type: 'Animation',
      speed: 'Speed',
      intensity: 'Strength',
      easing: 'Easing',
    },
    myKeyboard: 'My keyboard',
    layoutFile: 'Layout file',
    defaultEasing: 'Default',
    transparency: 'Transparency',
    yourFonts: 'Your fonts',
    otherFont: 'Other (type a name)…',
    fontName: 'Font name',
  },

  // the keyboard access notice above the tabs: access-notice.js
  accessNotice: {
    ask: 'Allow keyboard access so the overlay can see your keys. macOS will ask you to switch on Keystroke Overlay in Input Monitoring.',
    allow: 'Allow keyboard access',
    restart: 'Access is on. Restart Keystroke Overlay once so macOS starts sending it your keys.',
    restartAfterAllow:
      'Did you switch Keystroke Overlay on in Input Monitoring? Restart it once so macOS starts sending it your keys.',
    restartButton: 'Restart now',
    inputGroup:
      'On Wayland, the app needs the input group to read your keyboards. Run this command in a terminal, then log out and back in. Every program you run can then read the keyboards too (see PRIVACY.md).',
    inputGroupCopied:
      'Copied. Paste it in a terminal and run it, then log out and back in. Keystroke Overlay sees your keys after that.',
    copyCommand: 'Copy the command',
    secure:
      'macOS is blocking keys while a password field is open (Secure Input). If it stays on, lock and unlock the screen, or quit the app that is holding it.',
  },

  // first run setup on the Layout tab: first-run.js
  firstRun: {
    title: 'Add Keystroke Overlay to OBS',
    close: 'Close first run setup',
    copyStep: 'Copy the OBS URL',
    copy: 'Copy OBS URL',
    sourceStep: 'Add a Browser source',
    sourceHow: 'In OBS: Sources → + → Browser',
    sizeStep: 'Paste and size it',
    sizeHow: 'Width × height:',
    pauseStep: 'Set up pause, and try it',
    pauseHow:
      'Before typing anything private on stream, pause the overlay: the round button at the top right of the preview. For a shortcut that works in games too:',
    pauseShortcut: 'Pause shortcut…',
    waiting: 'Waiting for OBS…',
    allSet:
      '✓ You’re all set. OBS is connected. Remember Pause (top right of the preview) before typing anything private.',
  },

  // the KLE and NohBoard import popup: kle-import-popup.js; fromFileBefore and fromFileAfter go around the site link
  kleImport: {
    chooseFile: 'Choose file…',
    fromFileBefore: 'In ',
    kleSite: 'keyboard-layout-editor.com',
    fromFileAfter: ', use Download → Download JSON, then choose that file.',
    fromNohBoard:
      "NohBoard keeps each keyboard in its own folder, under the keyboards folder next to NohBoard.exe. Choose the keyboard.json in your keyboard's folder.",
    title: { kle: 'Import from KLE', nohboard: 'Import from NohBoard' },
    name: 'Name',
    // One line: how many keys, how many light up, and by name the ones that can't (drawn dashed in the picture).
    summary: { one: '{count} key · {linked} light up', other: '{count} keys · {linked} light up' },
    unlit: " · {count} can't: {names}",
    // Keys the app can't name (Fn is handled inside the keyboard and never reaches the computer; a second Q can't be told
    // from the first) are kept, so the board looks like the real one, and said here before the layout is made.
    unlitWhy:
      "Dashed keys can't light up, because the app can't tell which key they are (Fn, for example). You can delete them on the Keys tab.",
    blankKey: 'a blank key',
    andMore: 'and {count} more',
    leftOut: {
      one: '{count} key left out: decorations and extra layout choices.',
      other: '{count} keys left out: decorations and extra layout choices.',
    },
    leftOutNohBoard: {
      one: '{count} element left out: the mouse speed indicator and anything unreadable.',
      other: '{count} elements left out: the mouse speed indicator and anything unreadable.',
    },
    // Mouse buttons and wheel keep the mouse's names (MouseLeft, WheelUp…), so they light up with Show my mouse.
    mouse: {
      one: '{count} mouse button light up when Show my mouse is on (General → Mouse).',
      other: '{count} mouse buttons light up when Show my mouse is on (General → Mouse).',
    },
    back: 'Back',
    create: 'Create layout',
    created: 'Layout created',
    // errors, each a toast
    notKle: "This file isn't a KLE layout. In KLE, use Download → Download JSON.",
    noKeys: 'This KLE file has no keys.',
    tooManyKeys: 'This layout has {count} keys. A layout can have at most {max}.',
    brokenFile: "This file couldn't be read. Is it the JSON file from KLE?",
    notNohBoard: "This isn't a NohBoard keyboard file. Choose the keyboard.json in your keyboard's folder.",
    ourFile: 'This is a Keystroke Overlay file. Use Import… on the Layout tab.',
    noKeysNohBoard: 'This NohBoard keyboard has no keys.',
    brokenNohBoard: "This file couldn't be read. Is it a NohBoard keyboard.json?",
  },

  // a layout made from a KLE file: kle-layout.js
  kleLayout: {
    defaultName: 'Imported layout',
  },

  // a layout made from a NohBoard file: nohboard-layout.js
  nohboardLayout: {
    defaultName: 'NohBoard keyboard',
  },

  // the OBS scenes popup: obs-scenes-popup.js
  obsScenes: {
    title: 'OBS scenes',
    intro: 'Scenes you don’t list show your chosen layout.',
    sceneHeading: 'Scene',
    choiceHeading: 'In this scene',
    placeholder: 'As OBS spells it',
    hide: 'Hide the overlay',
    chosenLayout: 'Show your chosen layout',
    showLayout: 'Show: {name}',
    remove: 'Remove {scene}',
    removeUnnamed: 'Remove this scene',
    problem: { empty: 'Type a scene name.', repeat: 'Already listed above.' },
    add: '+ Add a scene',
    atLimit: 'You can list up to {max} scenes.',
    permission:
      'Not working until you switch scenes? In the Browser source **Properties**, set **Page permissions** to **Read access to user information**.',
    cancel: 'Cancel',
    save: 'Save',
  },

  // the OBS status in the header: obs-status.js
  obsStatus: {
    live: '● Live in OBS',
    paused: '⏸ Paused',
    pausedNoObs: '⏸ Paused · OBS not connected',
    noObs: '○ Not connected to OBS',
    linkChanged: 'OBS URL changed: copy it again',
    serverProblem: '⚠ Port in use',
  },

  // the built-in layouts list in New layout: other-layouts.js
  otherLayouts: {
    add: 'Add',
    addLabel: 'Add {name}',
  },

  // the theme editor bar: theme-edit-bar.js; `contrast` names what is hard to read (theme-colors.js)
  themeEditBar: {
    title: 'Edit theme',
    name: 'Name',
    colors: { background: 'Window', panel: 'Panels', text: 'Text', dim: 'Dim text', accent: 'Accent', error: 'Errors' },
    easyToRead: 'Easy to read',
    hardToRead: 'Some text is hard to read: {what}, {ratio} : 1',
    export: 'Export…',
    exported: 'Theme exported',
    cancel: 'Cancel',
    save: 'Save',
    saved: 'Saved “{name}”',
    needsName: 'Give the theme a name first',
    contrast: {
      textOnWindow: 'text on the window',
      textOnPanels: 'text on panels',
      dimOnWindow: 'dim text on the window',
      dimOnPanels: 'dim text on panels',
      textOnAccent: 'text on accent buttons',
      controlBorders: 'control borders',
    },
  },

  // the tab bar (tabs/index.js); the Debug tab keeps its English name
  tabs: {
    layout: 'Layout',
    keys: 'Keys',
    style: 'Style',
    animation: 'Animation',
    general: 'General',
  },

  // the small dialogs: New layout, Rename layout, Reset all settings (dialogs.js)
  dialogs: {
    start: {
      label: 'Start from',
      blank: 'Blank',
      builtIn: 'Built-in',
      kle: 'From a KLE file',
      nohboard: 'From a NohBoard file',
      close: 'Close',
    },
    newLayout: 'New layout',
    layoutName: 'Layout name',
    cancel: 'Cancel',
    create: 'Create',
    created: 'Layout created',
    renameTitle: 'Rename layout',
    rename: 'Rename',
    renamed: 'Layout renamed',
    resetTitle: 'Reset all settings?',
    resetConfirm: 'Reset everything',
    resetDone: 'All settings reset',
  },

  // the update popup (update-popup.js)
  updatePopup: {
    current: 'You have v{version} · {channel} channel',
    latest: 'Latest',
    stable: 'Stable',
    install: 'Update now',
    manualInstall: 'Open GitHub installer',
    starting: 'Starting download…',
  },
};
