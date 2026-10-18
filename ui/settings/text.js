// =====================================================================================================================
//  The words the user reads. Longer explanations live here so the code stays short and the wording is easy to find.
// =====================================================================================================================

// ---------------------------------------------------------------------------------------------------------------------
// Words the user reads. The longer explanations live here, so the code below stays short and the wording is easy to
// find.
// ---------------------------------------------------------------------------------------------------------------------
export const TEXT = {
  layoutLimitReached: (max) =>
    `You can make up to ${max} layouts of your own. Right-click one you no longer need and choose ` +
    `Delete layout to free a spot.`,
  newLayoutHelp: 'It starts as the full-size keyboard. You then pick which keys to keep or hide on the Keys tab.',
  resetBodyWhatChanges:
    'Style, animation, key edits, keyboard input, secure link, start-with-Windows and the other ' +
    'options go back to their defaults. Your own layouts, presets and fonts are kept, and so is your ' +
    'port.',
  resetBodyLinkNote:
    'If the secure link was on, your OBS link goes back to the plain address, so paste it into OBS ' + 'again.',
  manualInstallDialog:
    'This update needs a manual install: download the new installer from GitHub, close this app, and ' +
    'run it. Your settings are kept.',
  layoutTabHelp:
    'Pick a layout, or click + to make your own from the full-size keyboard. Right-click a layout you ' +
    'made to delete it.',
  dragHint: 'Drag a key to move it. Ctrl-click to add.',
  noKeySelected: 'No key selected',
  inspectorTip:
    'Click a key to change its label or hide it. Drag keys anywhere and they line up with their neighbours. ' +
    'Changes are saved automatically for each layout.',
  overlapNote: 'This key overlaps another. Drag it to a free spot, or press Close gaps.',
  inspectorTipGrid:
    'Want every key the same size in neat columns? Switch Layout style to Even grid. Each style keeps its own ' +
    'positions, so you can switch back and forth.',
  closeGapsHelp: 'Slide keys together to close the empty space left by hidden or moved keys. The shape stays the same.',
  resetMenuHelp: 'Put keys, labels or the whole layout back the way the layout file has them. You can undo it.',
  resetLayoutBody:
    'Positions, sizes, hidden keys and labels go back to the layout file, and the layout style goes back to Keyboard ' +
    'shape. You can undo this.',
  groupInspectorTip:
    'Drag any of them to move them together. Use the bar above them to line them up or space them evenly.',
  clickToDismiss: 'Click to dismiss',
  snapHelp:
    'Keys jump a quarter key while you drag them or use the arrow keys, and stick to the edges of other keys. ' +
    'Off lets you place a key anywhere. Remembered next time.',
  gridHelp: 'Show faint dots on the board: every half key, or every whole key in the Even grid. Remembered next time.',
  showHiddenHelp:
    'Show the keys you hid (dimmed, so you can show them again). Turn it off to see only the keys the overlay draws. Remembered next time.',
  animationTabNote:
    'Only transform and opacity are animated (GPU friendly). Click keys in the preview to try an ' + 'animation.',
  fontsTabHelp:
    'Add TTF, OTF or WOFF files. They are copied into the app’s fonts folder. After adding, pick it ' +
    'in Style → Font family (under “Your fonts”), or click Use.',
  keyPictureHelp:
    'Drag a key to move it. Drag on the empty background to select several keys. Tab to a key and press ' +
    'Enter to select it.',
  serverNote:
    'The server only listens on 127.0.0.1 (this PC). Keystrokes are never saved or sent anywhere. OBS ' +
    'reconnects by itself after a restart.',
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
  debugModeHelp:
    'Adds a Debug tab with tools for finding problems. Nothing is recorded while it is off, nothing ' +
    'is saved to disk, and nothing leaves this PC.',
  manualInstallNote:
    'It can’t be installed from inside the app. Download the new installer from GitHub, close this ' +
    'app, and run it; your settings are kept.',
  updateChannelHelp:
    'Stable: the main, well-tested releases (like 1.2.0 or 1.3.0) — recommended. Latest: every ' +
    'release as soon as it is published, including the small fixes in between (like 1.2.1).',
  updatesNote:
    'Updates are never installed without your click. The app only contacts GitHub for the update ' +
    'check (about once an hour while the app runs, and when this window opens) and for release notes, ' +
    'and sends nothing except its version. Your keystrokes never leave this PC.',
};
