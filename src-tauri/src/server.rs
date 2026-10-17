//! Local web server for the OBS Browser Source.
//!
//! * Binds 127.0.0.1 ONLY (never reachable from the network).
//! * Read-only HTTP API + one WebSocket. All writes go through Tauri IPC.
//! * Host/Origin checks stop DNS-rebinding and other websites from opening
//!   the WebSocket and watching your keystrokes.

use crate::keyboard::{Bus, KeyEvent};
use crate::settings::{public_settings, Paths};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, RawQuery, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::serve::{Listener, ListenerExt, TapIo};
use axum::{Json, Router};
use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};

/// The overlay web app, embedded in the binary. Anything dropped into
/// ui/overlay/{layouts,animations,themes} is picked up automatically.
static OVERLAY: Dir = include_dir!("$CARGO_MANIFEST_DIR/../ui/overlay");

pub struct Shared {
    pub bus: Arc<Bus>,
    pub settings: RwLock<Value>,
    pub paths: Paths,
    /// "cfg" = settings/pause changed (overlays get the new settings in the message itself);
    /// "assets" = fonts or layouts changed (overlays re-fetch them).
    pub cfg_tx: broadcast::Sender<&'static str>,
    /// How many OBS overlay pages are connected right now (the settings window's own preview is not counted).
    /// A watch channel, so the settings window's status hears about each change without anyone polling.
    pub overlays: watch::Sender<usize>,
}

pub struct ServerHandle {
    pub port: u16,
    shutdown: watch::Sender<bool>,
}
impl ServerHandle {
    pub fn stop(&self) {
        let _ = self.shutdown.send(true);
    }
}

#[derive(Clone)]
struct St {
    shared: Arc<Shared>,
    port: u16,
    sd: watch::Receiver<bool>,
}

pub fn start(shared: Arc<Shared>, port: u16) -> Result<ServerHandle, String> {
    let std_listener = std::net::TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AddrInUse {
            format!("Port {port} is already in use by another program")
        } else {
            format!("Port {port} unavailable: {e}")
        }
    })?;
    std_listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let (sd_tx, sd_rx) = watch::channel(false);
    let st = St {
        shared,
        port,
        sd: sd_rx.clone(),
    };

    let app = Router::new()
        .route("/", get(|| serve_overlay(Path("index.html".into()))))
        .route("/overlay/{*p}", get(serve_overlay))
        .route("/user/{kind}/{file}", get(serve_user))
        .route("/fonts/{file}", get(serve_font))
        .route("/api/config", get(api_config))
        .route("/api/layouts", get(api_layouts))
        .route("/api/modules", get(api_modules))
        .route("/api/fonts", get(api_fonts))
        .route("/ws", get(ws_upgrade))
        .layer(middleware::from_fn_with_state(st.clone(), guard))
        .with_state(st);

    let mut shutdown_rx = sd_rx;
    tauri::async_runtime::spawn(async move {
        let listener = without_send_delay(TcpListener::from_std(std_listener).unwrap());
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.changed().await;
            })
            .await;
    });
    Ok(ServerHandle { port, shutdown: sd_tx })
}

/// A connection the server accepted from the overlay (incoming only: this module never opens connections itself).
type Connection = <TcpListener as Listener>::Io;

/// Turns off Nagle's algorithm on one accepted connection. Each key press is a tiny WebSocket message; with Nagle on,
/// the system may hold one back until the previous one is acknowledged, which can delay a key lighting up in OBS.
fn send_without_delay(connection: &mut Connection) {
    let _ = connection.set_nodelay(true);
}

/// The server's listener with Nagle's algorithm turned off on every connection it accepts (axum leaves it on).
fn without_send_delay(listener: TcpListener) -> TapIo<TcpListener, fn(&mut Connection)> {
    listener.tap_io(send_without_delay as fn(&mut Connection))
}

/// Reject requests whose Host/Origin isn't this server on localhost.
async fn guard(State(st): State<St>, req: Request, next: Next) -> Response {
    let headers = req.headers();
    let host = headers.get(header::HOST).map(|value| value.to_str().unwrap_or(""));
    let origin = headers.get(header::ORIGIN).map(|value| value.to_str().unwrap_or(""));
    // Two Host headers are an attempt to confuse the check (HTTP says to answer 400): only the first would be read below.
    if headers.get_all(header::HOST).iter().count() > 1 {
        return StatusCode::BAD_REQUEST.into_response();
    }
    // A request line can carry its own address ("GET http://evil.example/ ..."); that address must also be this server.
    let target = req.uri().authority().map(|authority| authority.as_str());
    if !from_this_server(host, origin, st.port) || !target_is_this_server(target, st.port) {
        return StatusCode::FORBIDDEN.into_response();
    }
    // Optional secure link: the data endpoints and the key-press stream need the private key. The overlay's own page and
    // scripts (/ and /overlay/*) are open-source code with nothing private in them, so they stay open.
    if is_protected(req.uri().path()) && !key_ok(&st.shared.settings.read().unwrap(), req.uri().query()) {
        return (
            StatusCode::UNAUTHORIZED,
            "This overlay link is secured. Copy the current link from Keystroke Overlay (General > Secure link).",
        )
            .into_response();
    }
    let mut response = next.run(req).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// The main defence against websites reading key presses: a web page the user visits can make the browser call
/// 127.0.0.1, but the browser then sends that page's Origin (and, after a DNS-rebinding trick, its own Host name). So
/// the Host must be this server, and an Origin, when there is one, must be this server too. OBS and the settings window
/// send no foreign Origin. (This stops browsers only; other programs on the PC are what the secure link is for.)
fn from_this_server(host: Option<&str>, origin: Option<&str>, port: u16) -> bool {
    let host_ok = host.is_some_and(|host| host == format!("localhost:{port}") || host == format!("127.0.0.1:{port}"));
    let origin_ok = origin.is_none_or(|origin| {
        origin == format!("http://localhost:{port}") || origin == format!("http://127.0.0.1:{port}")
    });
    host_ok && origin_ok
}

/// True when the request line has no address of its own, or its address is this server.
fn target_is_this_server(authority: Option<&str>, port: u16) -> bool {
    authority
        .is_none_or(|authority| authority == format!("localhost:{port}") || authority == format!("127.0.0.1:{port}"))
}

/// Paths that need the key when the secure link is on.
fn is_protected(path: &str) -> bool {
    path.starts_with("/api/") || path == "/ws" || path.starts_with("/fonts/") || path.starts_with("/user/")
}

/// True if the secure link is off, or the request carries the right `key=` (compared in constant time).
pub fn key_ok(settings: &Value, query: Option<&str>) -> bool {
    let general = &settings["general"];
    if !general["secureLink"].as_bool().unwrap_or(false) {
        return true;
    }
    let want = general["linkKey"].as_str().unwrap_or("");
    if want.is_empty() {
        return false;
    } // secure link on but no key: refuse everything rather than open up
    let got = query
        .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("key=")))
        .unwrap_or("");
    got.len() == want.len() && got.bytes().zip(want.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

fn mime(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
fn bytes_resp(name: &str, body: Vec<u8>) -> Response {
    ([(header::CONTENT_TYPE, mime(name))], body).into_response()
}
/// A plain file name: no folder parts, no drive letter, no "..". Every name from outside (a web request, the settings
/// window) passes this before it touches the disk (also used by commands/assets.rs).
pub(crate) fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

async fn serve_overlay(Path(file_path): Path<String>) -> Response {
    if file_path.split('/').any(|s| s == "..") {
        return StatusCode::NOT_FOUND.into_response();
    }
    match OVERLAY.get_file(&file_path) {
        Some(file) => bytes_resp(&file_path, file.contents().to_vec()),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_user(State(st): State<St>, Path((kind, file)): Path<(String, String)>) -> Response {
    if !["layouts", "animations", "themes"].contains(&kind.as_str()) || !is_plain_file_name(&file) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match std::fs::read(st.shared.paths.user(&kind).join(&file)) {
        Ok(bytes) => bytes_resp(&file, bytes),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_font(State(st): State<St>, Path(file): Path<String>) -> Response {
    if !is_plain_file_name(&file) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match std::fs::read(st.shared.paths.fonts().join(&file)) {
        Ok(bytes) => bytes_resp(&file, bytes),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn api_config(State(st): State<St>) -> Json<Value> {
    Json(
        json!({ "settings": public_settings(&st.shared.settings.read().unwrap()), "port": st.port, "paused": st.shared.bus.paused.load(Ordering::Relaxed) }),
    )
}
async fn api_layouts(State(st): State<St>) -> Json<Value> {
    Json(json!(layouts(&st.shared.paths)))
}
async fn api_fonts(State(st): State<St>) -> Json<Value> {
    Json(json!(font_files(&st.shared.paths)))
}
async fn api_modules(State(st): State<St>) -> Json<Value> {
    Json(json!({
        "animations": module_urls("animations", &st.shared.paths),
        "themes": module_urls("themes", &st.shared.paths),
    }))
}

/// A layout must have an id and a list of keys that each have a code and x/y position.
pub fn valid_layout(layout: &Value) -> bool {
    layout["id"].as_str().is_some_and(|s| !s.is_empty())
        && layout["keys"].as_array().is_some_and(|keys| {
            keys.iter()
                .all(|key| key["code"].is_string() && key["x"].is_number() && key["y"].is_number())
        })
}

/// All layouts: built-in first, then user ones (same id overrides built-in).
pub fn layouts(paths: &Paths) -> Vec<Value> {
    let mut out: Vec<Value> = OVERLAY
        .get_dir("layouts")
        .into_iter()
        .flat_map(|d| d.files())
        .filter_map(|f| serde_json::from_slice::<Value>(f.contents()).ok())
        .filter(valid_layout)
        .collect();
    if let Ok(entries) = std::fs::read_dir(paths.user("layouts")) {
        for entry in entries.flatten() {
            if let Some(layout) = std::fs::read_to_string(entry.path())
                .ok()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .filter(valid_layout)
            {
                let mut layout = layout;
                layout["user"] = Value::Bool(true);
                out.retain(|o| o["id"] != layout["id"]);
                out.push(layout);
            }
        }
    }
    // The even-grid style's positions are worked out here, once, for the Keys tab and the overlay (see grid.rs).
    for layout in &mut out {
        let grid = crate::grid::even_grid(layout["keys"].as_array().map(Vec::as_slice).unwrap_or(&[]));
        layout["grid"] = grid;
    }
    out
}
pub fn font_files(paths: &Paths) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(paths.fonts())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}
fn module_urls(kind: &str, paths: &Paths) -> Vec<String> {
    let mut urls: Vec<String> = OVERLAY
        .get_dir(kind)
        .into_iter()
        .flat_map(|d| d.files())
        .filter_map(|f| f.path().file_name()?.to_str().map(|n| format!("/overlay/{kind}/{n}")))
        .collect();
    if let Ok(entries) = std::fs::read_dir(paths.user(kind)) {
        for entry in entries.flatten() {
            if let Ok(file_name) = entry.file_name().into_string() {
                if file_name.ends_with(".js") {
                    urls.push(format!("/user/{kind}/{file_name}"));
                }
            }
        }
    }
    urls.sort();
    urls
}

async fn ws_upgrade(State(st): State<St>, RawQuery(query): RawQuery, ws: WebSocketUpgrade) -> Response {
    let counted = !is_preview(query.as_deref());
    ws.on_upgrade(move |s| client(s, st, counted))
}

/// The settings window's live preview adds `preview=1` to its address (ui/overlay/overlay.js). It is not OBS,
/// so it must not make the status say "Live in OBS".
fn is_preview(query: Option<&str>) -> bool {
    query.is_some_and(|q| q.split('&').any(|kv| kv == "preview=1"))
}

/// Counts one OBS overlay for as long as it lives. Counting out happens in `drop`, so every way a
/// connection can end (closed, crashed, app shutting down) is counted.
struct OverlayCount {
    overlays: watch::Sender<usize>,
}
impl OverlayCount {
    fn start(overlays: &watch::Sender<usize>) -> Self {
        overlays.send_modify(|count| *count += 1);
        OverlayCount {
            overlays: overlays.clone(),
        }
    }
}
impl Drop for OverlayCount {
    fn drop(&mut self) {
        self.overlays.send_modify(|count| *count = count.saturating_sub(1));
    }
}

fn ev_msg(event: KeyEvent) -> Message {
    Message::Text(
        format!(
            r#"{{"t":"{}","k":"{}"}}"#,
            if event.down { "d" } else { "u" },
            event.code
        )
        .into(),
    )
}
/// One WebSocket message describing a settings change. Sending the settings inline saves the overlay
/// three HTTP requests per change (it used to re-fetch config, layouts and fonts every time).
fn cfg_msg(st: &St, kind: &str) -> Message {
    if kind == "assets" {
        return Message::Text(r#"{"t":"assets"}"#.into());
    }
    let paused = st.shared.bus.paused.load(Ordering::Relaxed);
    Message::Text(
        json!({ "t": "cfg", "s": public_settings(&st.shared.settings.read().unwrap()), "paused": paused })
            .to_string()
            .into(),
    )
}
fn snapshot(st: &St) -> Message {
    let held: Vec<&str> = if st.shared.bus.paused.load(Ordering::Relaxed) {
        vec![]
    } else {
        st.shared.bus.held.lock().unwrap().iter().copied().collect()
    };
    Message::Text(json!({ "t": "snap", "down": held }).to_string().into())
}

/// One task per connected overlay. Sleeps until a key event/config change.
async fn client(mut sock: WebSocket, st: St, counted: bool) {
    let _overlay_count = counted.then(|| OverlayCount::start(&st.shared.overlays));
    let mut keys = st.shared.bus.tx.subscribe();
    let mut cfg = st.shared.cfg_tx.subscribe();
    let mut shutdown = st.sd.clone();
    if sock.send(snapshot(&st)).await.is_err() {
        return;
    }
    loop {
        let msg = tokio::select! {
            key_result = keys.recv() => match key_result {
                Ok(_) if st.shared.bus.paused.load(Ordering::Relaxed) => continue,
                Ok(event) => ev_msg(event),
                Err(broadcast::error::RecvError::Lagged(_)) => snapshot(&st), // resync, no stuck keys
                Err(_) => break,
            },
            cfg_result = cfg.recv() => match cfg_result {
                Ok(kind) => cfg_msg(&st, kind),
                Err(broadcast::error::RecvError::Lagged(_)) => cfg_msg(&st, "cfg"),
                Err(_) => break,
            },
            incoming = sock.recv() => match incoming { Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break, _ => continue },
            _ = shutdown.changed() => break,
        };
        if sock.send(msg).await.is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn accepted_connections_send_without_delay() {
        let std_listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        std_listener.set_nonblocking(true).unwrap();
        let address = std_listener.local_addr().unwrap();
        let mut listener = without_send_delay(TcpListener::from_std(std_listener).unwrap());
        // Test only: a client on this machine connecting to the server's own 127.0.0.1 listener.
        let _client = tokio::net::TcpSocket::new_v4().unwrap().connect(address).await.unwrap();
        let (connection, _) = listener.accept().await;
        assert!(connection.nodelay().unwrap());
    }

    #[test]
    fn the_settings_preview_is_not_counted_as_obs() {
        assert!(is_preview(Some("preview=1")));
        assert!(is_preview(Some("key=abc&preview=1")));
        assert!(!is_preview(None));
        assert!(!is_preview(Some("key=abc")));
        assert!(!is_preview(Some("preview=10")));
    }
    #[test]
    fn overlay_count_goes_up_while_connected_and_back_down_when_closed() {
        let (overlays, watcher) = watch::channel(0);
        let first = OverlayCount::start(&overlays);
        let second = OverlayCount::start(&overlays);
        assert_eq!(*watcher.borrow(), 2);
        drop(first);
        assert_eq!(*watcher.borrow(), 1);
        drop(second);
        assert_eq!(*watcher.borrow(), 0);
    }

    fn cfg(on: bool, key: &str) -> Value {
        json!({ "general": { "secureLink": on, "linkKey": key } })
    }
    #[test]
    fn only_plain_file_names_are_accepted() {
        assert!(is_plain_file_name("Pixel Operator.ttf"));
        for bad in ["", "..", "../x.ttf", "a/b.ttf", "a\\b.ttf", "C:x.ttf", "x..ttf"] {
            assert!(!is_plain_file_name(bad), "{bad}");
        }
    }
    #[test]
    fn only_requests_from_this_server_get_through_the_guard() {
        let port = 7878;
        assert!(from_this_server(Some("localhost:7878"), None, port)); // OBS
        assert!(from_this_server(
            Some("127.0.0.1:7878"),
            Some("http://127.0.0.1:7878"),
            port
        ));
        assert!(from_this_server(
            Some("localhost:7878"),
            Some("http://localhost:7878"),
            port
        ));
        let refused = [
            (None, None),                                             // no Host at all
            (Some("evil.example:7878"), None),                        // DNS rebinding: a foreign name for 127.0.0.1
            (Some("localhost:7879"), None),                           // another port
            (Some("localhost:7878"), Some("http://evil.example")),    // a website calling 127.0.0.1
            (Some("localhost:7878"), Some("null")),                   // a sandboxed page or a local file
            (Some("localhost:7878"), Some("https://localhost:7878")), // not this server's address
            (Some("localhost:7878"), Some("http://localhost:7878.evil.example")),
            (Some("localhost:7878"), Some("")), // a header that isn't text
        ];
        for (host, origin) in refused {
            assert!(!from_this_server(host, origin, port), "{host:?} {origin:?}");
        }
    }
    #[test]
    fn a_request_line_with_its_own_address_must_name_this_server() {
        let port = 7878;
        for ok in [None, Some("localhost:7878"), Some("127.0.0.1:7878")] {
            assert!(target_is_this_server(ok, port), "{ok:?}");
        }
        for bad in [
            "evil.example:7878",
            "localhost:7879",
            "localhost",
            "127.0.0.1:7878.evil.example",
        ] {
            assert!(!target_is_this_server(Some(bad), port), "{bad}");
        }
    }
    #[test]
    fn open_when_secure_link_is_off() {
        assert!(key_ok(&cfg(false, ""), None));
        assert!(key_ok(&cfg(false, "abc"), Some("key=wrong")));
    }
    #[test]
    fn requires_the_exact_key_when_on() {
        let config = cfg(true, "0123456789abcdef0123456789abcdef");
        assert!(key_ok(&config, Some("key=0123456789abcdef0123456789abcdef")));
        assert!(key_ok(&config, Some("preview=1&key=0123456789abcdef0123456789abcdef")));
        assert!(!key_ok(&config, None));
        assert!(!key_ok(&config, Some("key=")));
        assert!(!key_ok(&config, Some("key=0123456789abcdef0123456789abcdee")));
        assert!(!key_ok(&config, Some("key=0123456789abcdef0123456789abcdef0")));
        assert!(!key_ok(&config, Some("notkey=0123456789abcdef0123456789abcdef")));
    }
    #[test]
    fn secure_link_on_without_a_key_refuses_everything() {
        assert!(!key_ok(&cfg(true, ""), None));
        assert!(!key_ok(&cfg(true, ""), Some("key=")));
    }
    #[test]
    fn only_data_endpoints_are_protected() {
        for path in [
            "/api/config",
            "/api/layouts",
            "/ws",
            "/fonts/a.ttf",
            "/user/animations/x.js",
        ] {
            assert!(is_protected(path), "{path}");
        }
        for path in ["/", "/overlay/overlay.js", "/overlay/animations/glow.js"] {
            assert!(!is_protected(path), "{path}");
        }
    }
}
