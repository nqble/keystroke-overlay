# Games tested with Keystroke Overlay

Which games the overlay has been tried in, and what happened. It lists only what someone actually saw; a game that
isn't here simply hasn't been tried yet. Most games work, because the app never touches the game: it only asks Windows
(or macOS) for a copy of each key press, and never opens, reads or changes the game.

**Anti-cheat:** some anti-cheat tools judge every program running on the PC, not just the ones that touch the game. If
a game's anti-cheat refuses to start while Keystroke Overlay runs, quit the app (tray → Quit) before playing that game.
Keystroke Overlay will never try to get around an anti-cheat.

| Game | Anti-cheat | System | App version | Result | Notes |
|---|---|---|---|---|---|
| Valorant | Riot Vanguard | Windows | 1.3 | ✅ Works | Standard, app not run as administrator |
| osu! | osu! (its own) | Windows | 1.3 | ✅ Works | Standard, app not run as administrator |
| Apex Legends (Steam) | Easy Anti-Cheat | Windows | 1.3 | ❌ Blocked, being looked into | With the app running (not as administrator), in both Standard and Compatibility, Apex stopped at "anti-cheat authentication failed". Not yet known whether the app being open is enough, or only while it reads keys. |

**Results:** ✅ works · ⚠️ works with a tip (say which, for example "Compatibility") · ❌ blocked.

## Add a game

Tried one that isn't here, or got a different result? Open an issue (or a pull request adding a row) with: the game, its
anti-cheat if you know it, Windows or macOS, the app version (General → Updates), Standard or Compatibility, and what
happened. If a game is blocked, say what its error screen said. Never send a log that holds anything private.
