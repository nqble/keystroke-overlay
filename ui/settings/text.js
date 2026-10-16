// =====================================================================================================================
//  The words the user reads, kept short (docs/design/v2-redesign.md, "Fewer words for users"). Some sentences are
//  checked word for word by tests/e2e (secure link, keyboard input): change those together with their test.
// =====================================================================================================================
export const TEXT = {
  layoutLimitReached: (max) => `You have ${max} layouts, the most the app keeps. Delete one to make room.`,
  newLayoutHelp: 'It starts as the full keyboard. Hide keys on the Keys tab.',
  resetBodyWhatChanges: 'Every option goes back to its default. Your layouts, presets, fonts and port are kept.',
  resetBodyLinkNote: 'If the secure link was on, copy the OBS link into OBS again.',
  manualInstallDialog: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  layoutTabHelp: 'Pick a keyboard, or make your own with +.',
  keysTabHelp: 'Click a key to edit it. Drag to move. Drag a box to select several. Saved automatically.',
  nothingSelected: 'No keys selected',
  shortcutsHint:
    'Shortcuts: arrow keys nudge · Shift = a whole key · Delete hides · Ctrl+Z undo · Ctrl+Shift+Z redo · ' +
    'Ctrl+A select all · Esc clear',
  clickToDismiss: 'Click to dismiss',
  noKeysMoved: 'No keys moved from the layout file',
  snapMenuHelp: 'How far a key jumps when moved. Off: anywhere.',
  gridHelp: 'Faint dots at every snap step.',
  groupEditorTip: 'Drag any selected key to move them all. Click an empty spot to clear.',
  animationTabNote: 'Light on your PC. Press keys to try it.',
  fontsTabHelp: 'Add TTF, OTF or WOFF files, then pick them in Style → Font family.',
  keyEditorTip: 'Tip: symbols like ⎵ or ↑ work, or words like "Jump".',
  keyPictureHelp: 'Drag a key to move it. Drag on the background to select several. Tab and Enter work too.',
  serverNote: 'Only this PC can connect. Key presses are never saved or sent. OBS reconnects by itself.',
  secureLinkOff:
    '**Off (default):** your OBS link is simple and needs no extra step. Any program running on this ' +
    'PC can read your key presses through it. Turn this on if you share the PC or want that closed.',
  secureLinkOn:
    '**On:** your OBS link now contains a private key, and only a program that knows the full link ' +
    'can read your key presses. **Copy the new link into your OBS Browser Source once** — the old ' +
    'link stops working. Keep the link off your stream. “Make a new key” cuts off anyone who has the ' +
    'old one.',
  inputStandard:
    '**Standard** is what the app has always used: it listens to your keys through a Windows keyboard ' +
    'hook. It works with nearly every game, so keep it unless keys stop lighting up in one particular ' +
    'game.',
  inputCompatibility:
    '**Compatibility** reads your keys straight from the keyboard (Windows Raw Input) instead of ' +
    'hooking into Windows. Some games and anti-cheat tools block the standard method but not this ' +
    'one, so try it if keys don’t light up in a certain game. It uses the same tiny amount of CPU. If ' +
    'anything looks off, switch back to Standard.',
  inputNote:
    'Both methods read keys the same way and never save or send them. If a game runs as ' +
    'administrator, start Keystroke Overlay as administrator too. Not sure? Leave it on Standard.',
  debugModeHelp: 'Adds a Debug tab for finding problems. Nothing is saved or sent.',
  manualInstallNote: 'Install this one by hand: get the installer from GitHub, close this app, run it.',
  updateChannelHelp: 'Stable: the main releases (recommended). Latest: every release, small fixes too.',
  updatesNote: 'Never installs without your click. Only checks GitHub for new versions; your key presses stay here.',
};
