// The patterns tools/check-privacy.mjs looks for in the app's Rust code, kept here so tests/ui/privacy-patterns.test.mjs
// can check that each one catches what it should. The check is a tripwire, not a proof: it reads the code line by line
// and can't see what a dependency does. Code review (CLAUDE.md section 8) is the real safeguard.

/** Anything that opens a network connection. Allowed only in src-tauri/src/commands/updates.rs. */
export const NET =
  /\b(reqwest|TcpStream|TcpSocket|UdpSocket|UnixStream|UnixDatagram|updater_builder|hyper::client|ureq|isahc|surf)\b|\.updater\(\)/;

/** Anything that writes a file. Never allowed in keyboard/ or server.rs. */
export const WRITE =
  /\b(fs::write|fs::copy|fs::rename|fs::create_dir(?:_all)?|File::create|File::options|OpenOptions|tokio::fs|write_all)\b/;

/** Logging and printing: a log line is how keystrokes usually leak. Never allowed. */
// macOS key capture must only listen. These are the ways to do more: an active (not listen-only) tap, or sending key
// events (the C names and the Rust crate's own methods). The tap's own options are matched in any spelling, not just
// `CGEventTapOptions::Default`.
export const MAC_ACTIVE =
  /CGEventTapOptions\s*::\s*Default|CGEventPost|CGEventTapCreate|CGEventTapPostEvent|\.post\s*\(|\.post_to_pid\s*\(|CGEventTapOptions\s*\(\s*0|\bCGEventTapOptions\b(?!\s*::\s*ListenOnly)(?!\s*,)(?!\s*\})/;
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
