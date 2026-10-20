// Unit tests for the privacy check's patterns (tools/privacy-patterns.mjs). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMEPAD_LIB,
  GAMEPAD_NO_RUMBLE,
  GAMEPAD_RUMBLE,
  LINUX_ACTIVE,
  LINUX_DEVICES,
  LOG,
  MAC_ACTIVE,
  NET,
  UI_SOCKET,
  WRITE,
  joinSplitPaths,
  withoutTestModules,
} from '../../tools/privacy-patterns.mjs';

test('network code is caught, including the ways the outside review found missing', () => {
  for (const line of [
    'let s = TcpStream::connect(addr)?;',
    'let socket = tokio::net::TcpSocket::new_v4()?;',
    'UdpSocket::bind("0.0.0.0:0")',
    'let c = reqwest::Client::new();',
    'UnixStream::connect(path)',
  ]) {
    assert.match(line, NET, line);
  }
  assert.doesNotMatch('let listener = TcpListener::bind(addr)', NET); // listening has its own rule
});

test('a WebSocket client in Rust is network code too (the server only accepts)', () => {
  for (const line of [
    'let (socket, _) = tokio_tungstenite::connect_async("ws://127.0.0.1:4455").await?;',
    'tokio_tungstenite::client_async(request, stream)',
    'let (socket, _) = tungstenite::connect(url)?;',
    'let (socket, _) = tungstenite::client::connect(url)?;',
  ]) {
    assert.match(line, NET, line);
  }
  assert.doesNotMatch('let ws = tokio_tungstenite::accept_async(stream).await?;', NET);
});

test('the UI may open a WebSocket to its own server only', () => {
  assert.doesNotMatch('const address = `ws://${location.host}/ws`;', UI_SOCKET);
  for (const line of [
    "new WebSocket('ws://127.0.0.1:4455')",
    'new WebSocket("wss://example.com/feed")',
    'const obs = `ws://localhost:${port}`;',
  ]) {
    assert.match(line, UI_SOCKET, line);
  }
});

test('file writes are caught, including File::options and write_all', () => {
  for (const line of [
    'std::fs::write(path, data)',
    'File::options().append(true).open(p)',
    'OpenOptions::new().write(true)',
    'file.write_all(bytes)?;',
    'tokio::fs::write(p, b).await',
    'fs::create_dir_all(dir)',
  ]) {
    assert.match(line, WRITE, line);
  }
  assert.doesNotMatch('let text = fs::read_to_string(p)?;', WRITE);
});

test('logging is caught', () => {
  for (const line of ['println!("{key}")', 'log::info!("x")', 'tracing::debug!(k)', 'dbg!(event)']) {
    assert.match(line, LOG, line);
  }
});

test('a path split over two lines is joined before checking', () => {
  assert.match(joinSplitPaths('std::fs\n    ::write(p, d)'), WRITE);
  assert.match(joinSplitPaths('tokio::net::\n    TcpSocket::new_v4()'), NET);
});

test('only test modules are skipped: code after them is still checked', () => {
  const source = [
    'fn real() {}',
    '#[cfg(test)]',
    'mod tests {',
    '    fn helper() { let _ = std::fs::write("t", "x"); if true { } }',
    '}',
    'fn after() { let _ = tokio::net::TcpSocket::new_v4(); }',
  ].join('\n');
  const checked = withoutTestModules(source);
  assert.doesNotMatch(checked, WRITE); // inside the test module: skipped
  assert.match(checked, NET); // after it: still checked
  assert.equal(checked.split('\n').length, source.split('\n').length); // line numbers unchanged
});

test('unbalanced braces: nothing is skipped', () => {
  const source = '#[cfg(test)]\nmod tests {\n fn t() { std::fs::write("a", "b"); \n';
  assert.equal(withoutTestModules(source), source);
});

test('macOS code that does more than listen is caught, in any spelling', () => {
  for (const line of [
    'CGEventTapOptions::Default,',
    'CGEventTapOptions :: Default,',
    'CGEventPost(tap, event);',
    'ev.post(CGEventTapLocation::HID);',
    'event.post_to_pid(pid);',
    'CGEventTapPostEvent(proxy, event);',
  ]) {
    assert.match(line, MAC_ACTIVE, line);
  }
});

test('the listen-only tap the app really uses is allowed', () => {
  for (const line of ['CGEventTapOptions::ListenOnly,', 'use core_graphics::event::{CGEventTap, CGEventTapOptions};']) {
    assert.doesNotMatch(line, MAC_ACTIVE, line);
  }
});

test('doing more than reading the keyboards on Linux is caught', () => {
  for (const line of [
    'keyboard.grab()?;',
    'let device = RawDevice::open(path)?;',
    'let device = VirtualDeviceBuilder::new()?',
    'std::fs::File::open("/dev/uinput")',
    'device.send_events(&events)',
  ]) {
    assert.match(line, LINUX_ACTIVE, line);
  }
});

test('the read-only Linux capture the app really uses is allowed', () => {
  for (const line of ['let Ok(events) = keyboard.fetch_events() else {', 'RawDevice::from_fd(file.into())']) {
    assert.doesNotMatch(line, LINUX_ACTIVE, line);
  }
  assert.match('use evdev::raw_stream::RawDevice;', LINUX_DEVICES);
});

test('the controller library is found however it is named', () => {
  for (const line of [
    'let built = gilrs::GilrsBuilder::new()',
    'use gilrs::{Button, Event};',
    'gilrs_core::Gilrs::new()',
  ]) {
    assert.match(line, GAMEPAD_LIB, line);
  }
  assert.doesNotMatch('let mut gilrs = open_gilrs()?;', GAMEPAD_LIB); // a variable, not the library
});

test('the controller library is caught however it is brought in', () => {
  for (const line of ['use gilrs;', 'use gilrs as pads;', 'extern crate gilrs;', 'use ::gilrs_core::Gamepad;']) {
    assert.match(line, GAMEPAD_LIB, line);
  }
});

test('force feedback is caught unless it is a plain false', () => {
  for (const line of ['.with_force_feedback(on)', '.with_force_feedback(!false)', '.with_force_feedback( true )']) {
    assert.match(line, GAMEPAD_RUMBLE, line);
  }
});

test('sending anything to a controller is caught', () => {
  for (const line of [
    '.with_force_feedback(true)',
    '.with_force_feedback( true )',
    'use gilrs::ff::{BaseEffect, EffectBuilder};',
    'let effect = EffectBuilder::new().finish(&mut gilrs)?;',
    'gamepad.set_ff_state(true);',
    'let rumble: Effect = make();',
  ]) {
    assert.match(line, GAMEPAD_RUMBLE, line);
  }
});

test('force feedback switched off is what gamepad/mod.rs must say, and is allowed', () => {
  assert.match('        .with_force_feedback(false)', GAMEPAD_NO_RUMBLE);
  assert.doesNotMatch('        .with_force_feedback(false)', GAMEPAD_RUMBLE);
  assert.doesNotMatch('.with_force_feedback(true)', GAMEPAD_NO_RUMBLE);
  assert.doesNotMatch('let diff::Changes = side_effect(x);', GAMEPAD_RUMBLE); // ff inside other words
});
