// Which pages may talk to the overlay as its live preview (overlay.js, ?preview=1). Only the app's own settings window
// may ask it for the list of animations, themes and layouts: a website that framed the overlay page must get nothing
// (outside code review, 2026-11-01). The settings window's address differs per system (Tauri); the UI sandbox and the
// overlay preview tool (tools/) run on this computer's own addresses. No imports, so tests/ui can check it.

// The settings window's address: Windows (WebView2) uses the host tauri.localhost over http or https, macOS and Linux
// the tauri scheme with the host localhost. The UI sandbox is a page this computer serves itself, over http, on any port.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** May a page at `origin` act as the overlay's live preview? */
export function isSettingsWindow(origin) {
  let address;
  try {
    address = new URL(origin);
  } catch {
    return false; // "null" (a sandboxed frame) and anything that isn't an address
  }
  if (address.protocol === 'tauri:') return address.hostname === 'localhost';
  if (address.hostname === 'tauri.localhost') return address.protocol === 'http:' || address.protocol === 'https:';
  return address.protocol === 'http:' && LOCAL_HOSTS.has(address.hostname);
}
