// The lenient JSON reader NohBoard files need (ui/settings/json-lenient.js): a byte-order mark and trailing commas are
// read, commas inside strings are kept, and anything else that isn't JSON still fails.
// Run with: node --test tests/ui/json-lenient.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLenientJson } from '../../ui/settings/json-lenient.js';

test('plain JSON reads as JSON.parse reads it', () => {
  const text = '{ "Elements": [1, 2, { "a": "b" }], "Version": 2 }';
  assert.deepEqual(parseLenientJson(text), JSON.parse(text));
});

test('a byte-order mark at the start is dropped', () => {
  assert.deepEqual(parseLenientJson('﻿{ "Version": 2 }'), { Version: 2 });
});

test('a comma before ] or } is dropped, even across lines', () => {
  assert.deepEqual(parseLenientJson('{ "KeyCodes": [ 65, ],\n "Text": "A",\n}'), { KeyCodes: [65], Text: 'A' });
});

test('commas and brackets inside strings are kept, escaped quotes too', () => {
  assert.deepEqual(parseLenientJson('{ "Text": ",]", "ShiftText": "\\",}" }'), { Text: ',]', ShiftText: '",}' });
});

test('anything else that is not JSON still fails', () => {
  assert.throws(() => parseLenientJson('{ Version: 2 }'));
  assert.throws(() => parseLenientJson('[1,, 2]'));
  assert.throws(() => parseLenientJson("{ 'a': 1 }"));
  assert.throws(() => parseLenientJson(''));
});
