//! Local web server for the OBS Browser Source.
//!
//! * Binds 127.0.0.1 ONLY (never reachable from the network).
//! * Read-only HTTP API + one WebSocket. All writes go through Tauri IPC.
//! * Host/Origin checks stop DNS-rebinding and other websites from opening
//!   the WebSocket and watching your keystrokes.

use crate::keyhook::{Bus, KeyEvent};
use crate::settings::Paths;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use std::sync::{Arc, RwLock};
use tokio::sync::{broadcast, watch};

/// The overlay web app, embedded in the binary. Anything dropped into
/// ui/overlay/{layouts,animations,themes} is picked up automatically.
static OVERLAY: Dir = include_dir!("$CARGO_MANIFEST_DIR/../ui/overlay");

pub struct Shared {
    pub bus: Arc<Bus>,
    pub settings: RwLock<Value>,
    pub paths: Paths,
    /// Fired whenever settings change so overlays re-fetch /api/config.
    pub cfg_tx: broadcast::Sender<()>,
}

pub struct ServerHandle {
    pub port: u16,
    shutdown: watch::Sender<bool>,
}
impl ServerHandle {
    pub fn stop(&self) { let _ = self.shutdown.send(true); }
}

#[derive(Clone)]
struct St { shared: Arc<Shared>, port: u16, sd: watch::Receiver<bool> }

pub fn start(shared: Arc<Shared>, port: u16) -> Result<ServerHandle, String> {
    let std_l = std::net::TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("Port {port} unavailable: {e}"))?;
    std_l.set_nonblocking(true).map_err(|e| e.to_string())?;
    let (sd_tx, sd_rx) = watch::channel(false);
    let st = St { shared, port, sd: sd_rx.clone() };

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

    let mut sd = sd_rx;
    tauri::async_runtime::spawn(async move {
        let l = tokio::net::TcpListener::from_std(std_l).unwrap();
        let _ = axum::serve(l, app)
            .with_graceful_shutdown(async move { let _ = sd.changed().await; })
            .await;
    });
    Ok(ServerHandle { port, shutdown: sd_tx })
}

/// Reject requests whose Host/Origin isn't this server on localhost.
async fn guard(State(st): State<St>, req: Request, next: Next) -> Response {
    let p = st.port;
    let host_ok = req.headers().get(header::HOST).and_then(|h| h.to_str().ok()).is_some_and(|h| {
        h == format!("localhost:{p}") || h == format!("127.0.0.1:{p}")
    });
    let origin_ok = req.headers().get(header::ORIGIN).map_or(true, |o| {
        o.to_str().is_ok_and(|o| o == format!("http://localhost:{p}") || o == format!("http://127.0.0.1:{p}"))
    });
    if !host_ok || !origin_ok {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut r = next.run(req).await;
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}

fn mime(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "ttf" => "font/ttf", "otf" => "font/otf", "woff" => "font/woff", "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
fn bytes_resp(name: &str, body: Vec<u8>) -> Response {
    ([(header::CONTENT_TYPE, mime(name))], body).into_response()
}
fn safe(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

async fn serve_overlay(Path(p): Path<String>) -> Response {
    if p.split('/').any(|s| s == "..") { return StatusCode::NOT_FOUND.into_response(); }
    match OVERLAY.get_file(&p) {
        Some(f) => bytes_resp(&p, f.contents().to_vec()),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_user(State(st): State<St>, Path((kind, file)): Path<(String, String)>) -> Response {
    if !["layouts", "animations", "themes"].contains(&kind.as_str()) || !safe(&file) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match std::fs::read(st.shared.paths.user(&kind).join(&file)) {
        Ok(b) => bytes_resp(&file, b),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_font(State(st): State<St>, Path(file): Path<String>) -> Response {
    if !safe(&file) { return StatusCode::NOT_FOUND.into_response(); }
    match std::fs::read(st.shared.paths.fonts().join(&file)) {
        Ok(b) => bytes_resp(&file, b),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn api_config(State(st): State<St>) -> Json<Value> {
    Json(json!({ "settings": *st.shared.settings.read().unwrap(), "port": st.port }))
}
async fn api_layouts(State(st): State<St>) -> Json<Value> { Json(json!(layouts(&st.shared.paths))) }
async fn api_fonts(State(st): State<St>) -> Json<Value> { Json(json!(font_files(&st.shared.paths))) }
async fn api_modules(State(st): State<St>) -> Json<Value> {
    Json(json!({
        "animations": module_urls("animations", &st.shared.paths),
        "themes": module_urls("themes", &st.shared.paths),
    }))
}

/// A layout must have an id and a list of keys that each have a code and x/y position.
fn valid_layout(v: &Value) -> bool {
    v["id"].as_str().is_some_and(|s| !s.is_empty())
        && v["keys"].as_array().is_some_and(|k| k.iter().all(|k| k["code"].is_string() && k["x"].is_number() && k["y"].is_number()))
}

/// All layouts: built-in first, then user ones (same id overrides built-in).
pub fn layouts(paths: &Paths) -> Vec<Value> {
    let mut out: Vec<Value> = OVERLAY.get_dir("layouts").into_iter().flat_map(|d| d.files())
        .filter_map(|f| serde_json::from_slice::<Value>(f.contents()).ok()).filter(valid_layout).collect();
    if let Ok(rd) = std::fs::read_dir(paths.user("layouts")) {
        for e in rd.flatten() {
            if let Some(v) = std::fs::read_to_string(e.path()).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()).filter(valid_layout) {
                out.retain(|o| o["id"] != v["id"]);
                out.push(v);
            }
        }
    }
    out
}
pub fn font_files(paths: &Paths) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(paths.fonts()).into_iter().flatten().flatten()
        .filter_map(|e| e.file_name().into_string().ok()).collect();
    v.sort();
    v
}
fn module_urls(kind: &str, paths: &Paths) -> Vec<String> {
    let mut v: Vec<String> = OVERLAY.get_dir(kind).into_iter().flat_map(|d| d.files())
        .filter_map(|f| f.path().file_name()?.to_str().map(|n| format!("/overlay/{kind}/{n}"))).collect();
    if let Ok(rd) = std::fs::read_dir(paths.user(kind)) {
        for e in rd.flatten() {
            if let Ok(n) = e.file_name().into_string() {
                if n.ends_with(".js") { v.push(format!("/user/{kind}/{n}")); }
            }
        }
    }
    v.sort();
    v
}

async fn ws_upgrade(State(st): State<St>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |s| client(s, st))
}

fn ev_msg(e: KeyEvent) -> Message {
    Message::Text(format!(r#"{{"t":"{}","k":"{}"}}"#, if e.down { "d" } else { "u" }, e.code).into())
}
fn snapshot(st: &St) -> Message {
    let held: Vec<&str> = st.shared.bus.held.lock().unwrap().iter().copied().collect();
    Message::Text(json!({ "t": "snap", "down": held }).to_string().into())
}

/// One task per connected overlay. Sleeps until a key event/config change.
async fn client(mut sock: WebSocket, st: St) {
    let mut keys = st.shared.bus.tx.subscribe();
    let mut cfg = st.shared.cfg_tx.subscribe();
    let mut sd = st.sd.clone();
    if sock.send(snapshot(&st)).await.is_err() { return; }
    loop {
        let msg = tokio::select! {
            r = keys.recv() => match r {
                Ok(e) => ev_msg(e),
                Err(broadcast::error::RecvError::Lagged(_)) => snapshot(&st), // resync, no stuck keys
                Err(_) => break,
            },
            r = cfg.recv() => match r {
                Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => Message::Text(r#"{"t":"cfg"}"#.into()),
                Err(_) => break,
            },
            m = sock.recv() => match m { Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break, _ => continue },
            _ = sd.changed() => break,
        };
        if sock.send(msg).await.is_err() { break; }
    }
}
