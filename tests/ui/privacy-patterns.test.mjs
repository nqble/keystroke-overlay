// Unit tests for the privacy check's patterns (tools/privacy-patterns.mjs). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG, MAC_ACTIVE, NET, WRITE, joinSplitPaths, withoutTestModules } from '../../tools/privacy-patterns.mjs';

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
