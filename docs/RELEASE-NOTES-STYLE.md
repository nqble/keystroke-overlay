# Release notes style

Release notes should be **fun to read but never vague**. A reader should smile and still know exactly what changed.

## The recipe

- **One change per bullet.** Start with the feature name in **bold**, then say what it does and, if needed, how to use it.
- **Direct first, playful second.** The first half of the bullet states the fact; the joke (if any) comes after, and it is
  short. One light touch per bullet at most. Skip the joke if it doesn't fit.
- **Say what the user will notice**, with numbers when we have them ("0.7 s", "23 → 9 threads").
- **Name where to find it** ("General → Program updates").
- **No hype words** ("revolutionary", "supercharged"), no vague claims ("various improvements"), no blaming.
- Keep bullets under ~25 words. Plain language, no jargon the streamer wouldn't know.
- Be honest about fixes: say what was wrong, not just "fixed a bug".

## Layout

```
**v1.2.3 — a short, friendly title**

**✨ New**
- **Thing:** what it does. Light touch.

**🛠 Improved**
- **Thing:** what got better, with a number if we have one.

**🐛 Fixed**
- **Thing:** what was wrong and that it no longer is.

Your settings, presets and fonts are kept.
```

(The in-app "What's new" window renders `**bold**`, `-` bullets and `` `code` ``. Emoji in section titles are fine.)

## Before and after

| Flat | Better |
|---|---|
| Fixed window flash on startup. | **No more white flash:** the settings window used to flash white like a camera. It now opens dark and draws in about 0.7 s. |
| Added update channels. | **Stable or Latest:** pick your pace in General → Program updates. Stable only gets releases that have been tested for a while; Latest gets everything the moment it ships. |
| Reduced thread count. | **Lighter on your PC:** background threads went from 23 to 9 and idle memory dropped, so your game keeps more of your PC. |
