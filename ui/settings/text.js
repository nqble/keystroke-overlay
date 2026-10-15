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
  keysTabHelp:
    'Click a key to edit it and drag it to move it. To work with several keys at once, drag a box around them ' +
    '(or Ctrl-click keys one by one), then drag any of them or use the arrows. Disabled keys are hidden in the ' +
    'overlay. Changes are saved automatically for each layout.',
  nothingSelected: 'No keys selected',
  noKeysMoved: 'No keys moved from the layout file',
  snapMenuHelp:
    'How far a key jumps while you drag it or use the arrow buttons. Off lets you place a key anywhere. ' +
    'Remembered next time.',
  gridHelp: 'Show faint dots at every snap step. Remembered next time.',
  groupEditorTip:
    'Drag any selected key to move them all together, or use the arrow buttons above. Click an empty spot to ' +
    'clear the selection.',
  animationTabNote:
    'Only transform and opacity are animated (GPU friendly). Click keys in the preview to try an ' + 'animation.',
  fontsTabHelp:
    'Add TTF, OTF or WOFF files. They are copied into the app’s fonts folder. After adding, pick it ' +
    'in Style → Font family (under “Your fonts”), or click Use.',
  keyEditorTip:
    'Tip: use symbols like ⎵ or ↑, or words like "Jump". Drag a key on the keyboard to move it, or ' +
    'select it and use the arrow buttons above or the arrow keys (Shift moves a whole key).',
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
