// The patterns tools/check-privacy.mjs looks for in the app's Rust code, kept here so tests/ui/privacy-patterns.test.mjs
// can check that each one catches what it should. The check is a tripwire, not a proof: it reads the code line by line
// and can't see what a dependency does. Code review (CLAUDE.md section 8) is the real safeguard.

/**
 * Anything that opens a network connection, including a WebSocket client (tungstenite's connect, connect_async and
 * client_async: the server only accepts). Allowed only in src-tauri/src/commands/updates.rs.
 */
export const NET =
  /\b(reqwest|TcpStream|TcpSocket|UdpSocket|UnixStream|UnixDatagram|updater_builder|hyper::client|ureq|isahc|surf|connect_async|client_async)\b|\btungstenite::(client::)?connect\b|\.updater\(\)/;

/**
 * A WebSocket address in the UI that isn't the page's own server. The overlay connects with `ws://${location.host}/…`;
 * any other ws:// or wss:// address (another program on the PC, or the internet) is refused. The overlay page has no
 * security policy of its own to stop it, so this check is the guard.
 */
export const UI_SOCKET = /\bwss?:\/\/(?!\$\{location\.host\})/;

/** Anything that writes a file. Never allowed in keyboard/, gamepad/ or server.rs. */
export const WRITE =
  /\b(fs::write|fs::copy|fs::rename|fs::create_dir(?:_all)?|File::create|File::options|OpenOptions|tokio::fs|write_all)\b/;

/**
 * macOS key capture must only listen. These are the ways to do more: an active (not listen-only) tap, or sending key
 * events (the C names and the Rust crate's own methods). The tap's own options are matched in any spelling, not just
 * `CGEventTapOptions::Default`. Note that `.post(` is matched anywhere in Rust code, so an HTTP POST would trip it too.
 */
export const MAC_ACTIVE =
  /CGEventTapOptions\s*::\s*Default|CGEventPost|CGEventTapCreate|CGEventTapPostEvent|\.post\s*\(|\.post_to_pid\s*\(|CGEventTapOptions\s*\(\s*0|\bCGEventTapOptions\b(?!\s*::\s*ListenOnly)(?!\s*,)(?!\s*\})/;

/**
 * Linux key capture must only read the keyboards. These are the ways to do more: grabbing a keyboard (which takes its
 * keys away from every other app), opening a device with evdev's own open (which asks for writing too), making a virtual input device (whose emit() sends keys),
 * or sending input events. A plain .emit( is not matched: the app uses it everywhere for window events.
 */
export const LINUX_ACTIVE = /\.grab\s*\(|RawDevice::open|Device::open|\bVirtualDevice\w*|\buinput\b|\.send_events\s*\(/;

/** The keyboard-device library. Allowed only in src-tauri/src/keyboard/linux_devices.rs, which opens devices read-only. */
export const LINUX_DEVICES = /\bevdev::/;

/**
 * The controller library (gilrs, only in a build with the cargo feature `gamepad`). Allowed only in
 * src-tauri/src/gamepad/mod.rs, so one file shows everything the app asks of it.
 */
export const GAMEPAD_LIB = /\bgilrs(_core)?::/;

/**
 * Sending anything to a controller: turning gilrs's force feedback (rumble) on, or using its effects. Never allowed. With
 * force feedback on, gilrs also starts a thread that wakes every 50 ms forever.
 */
export const GAMEPAD_RUMBLE = /\.with_force_feedback\s*\(\s*true|\bff::|\bset_ff_state\b|\bEffect(Builder)?\b/;

/** What gamepad/mod.rs must say when it builds gilrs: force feedback off (gilrs's own default is on). */
export const GAMEPAD_NO_RUMBLE = /\.with_force_feedback\s*\(\s*false\s*\)/;

/**
 * Logging and printing: a log line is how keystrokes usually leak. Never allowed. Not installing a logger is also what
 * keeps the libraries' own log lines silent: gilrs, for example, logs every controller event at trace level.
 */
export const LOG = /\b(println!|eprintln!|print!|eprint!|dbg!|log::|tracing::|env_logger)/;

/** Joins a path that rustfmt or a person split over lines ("std::fs\n    ::write"), so the line-by-line patterns see it. */
export const joinSplitPaths = (text) => text.replace(/\s*::\s*\n\s*/g, '::').replace(/\n\s*::/g, '::');

/**
 * The code without its test modules (`#[cfg(test)] mod name { ... }`), which may use the disk and the network. Only the
 * module itself is removed, found by counting braces, so code after it is still checked. If the braces don't balance,
 * nothing is removed: checking too much is safe, checking too little is not.
 */
export function withoutTestModules(text) {
  const start = /#\[cfg\(test\)\]\s*mod\s+\w+\s*\{/g;
  let result = '';
  let copiedUpTo = 0;
  for (const match of text.matchAll(start)) {
    if (match.index < copiedUpTo) continue;
    const end = closingBrace(text, match.index + match[0].length);
    if (end < 0) return text;
    // keep the line breaks, so the line numbers in the report stay right
    result += text.slice(copiedUpTo, match.index) + text.slice(match.index, end + 1).replace(/[^\n]/g, '');
    copiedUpTo = end + 1;
  }
  return result + text.slice(copiedUpTo);
}

/** Where the `{` just before `from` closes, or -1. */
function closingBrace(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return i;
  }
  return -1;
}
