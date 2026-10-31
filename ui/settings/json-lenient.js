// =====================================================================================================================
//  Reads JSON the way .NET does for NohBoard's keyboard files (nohboard-layout.js): a byte-order mark at the start and
//  a comma right before `]` or `}` are allowed, because files written by NohBoard or a Windows editor have them. Nothing
//  else is relaxed: anything else that isn't JSON still throws, like JSON.parse. Tested by tests/ui/json-lenient.test.mjs.
// =====================================================================================================================

const BYTE_ORDER_MARK = '﻿';

/** JSON.parse that also accepts a leading byte-order mark and trailing commas (outside strings). */
export function parseLenientJson(text) {
  const withoutMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  return JSON.parse(withoutTrailingCommas(withoutMark));
}

/** The text with each comma that is followed only by spaces and then `]` or `}` removed; strings are left as they are. */
function withoutTrailingCommas(text) {
  let result = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      result += character;
      if (character === '\\') {
        result += text[index + 1] ?? '';
        index += 1;
      } else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    if (character === ',' && closesNext(text, index + 1)) continue;
    result += character;
  }
  return result;
}

/** Is the next character after `start` that isn't white space a `]` or `}`? */
function closesNext(text, start) {
  const rest = text.slice(start).trimStart();
  return rest.startsWith(']') || rest.startsWith('}');
}
