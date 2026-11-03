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

/** Anything that writes a file. Never allowed in keyboard/, mouse/ or server.rs. */
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

/**
 * The input-device library. Allowed only in src-tauri/src/keyboard/linux_devices.rs and
 * src-tauri/src/mouse/linux_devices.rs, which open devices read-only.
 */
export const LINUX_DEVICES = /\bevdev::/;

/**
 * Where the mouse pointer is or how it moves, in any system's words: asking Windows for the cursor position, the low-level
 * mouse hook (whose record carries the position), the movement fields of a Raw Input record, macOS's event location and
 * its moved and dragged events (a tap given those wakes the app for every movement), X11's raw motion events and the
 * pointer's root and event coordinates. (`.location(` is matched only on something named like an event: a panic report
 * has a `.location()` too, the source line of a crash.) The app reads mouse buttons and the wheel only (docs/design/future-inputs.md,
 * section 7), so none of this is allowed anywhere in the app's Rust code.
 */
export const POINTER_POSITION =
  /\b(GetCursorPos|GetPhysicalCursorPos|MSLLHOOKSTRUCT|WH_MOUSE_LL|lLastX|lLastY|CGEventGetLocation|XI_RawMotion|RAW_MOTION|root_x|root_y|event_x|event_y)\b|\b(?:\w*[Ee]vent\w*|evt|ev|e)\s*\.\s*location\s*\(|CGEventMaskBit\s*\([^)]*Moved|\w*Mouse(?:Moved|Dragged)\w*/;

/**
 * Linux movement codes (the pointer's relative and absolute axes). In src-tauri/src/mouse/ they may appear only on the
 * line that masks them out of what the kernel hands the app (`EVIOCSMASK`). Other code may use them: a controller's
 * sticks use the absolute axes.
 */
export const MOUSE_MOVEMENT_CODES = /\b(REL_X|REL_Y|ABS_X|ABS_Y)\b/;

/** Logging and printing: a log line is how keystrokes usually leak. Never allowed. */
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
