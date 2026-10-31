// The JavaScript linter (ESLint): `npm run check:lint`, also in CI. It catches likely mistakes (a name used but never
// defined, a variable never used) and the house rules from CLAUDE.md section 2 (short functions, shallow nesting, files
// under ~400 lines), all as errors, so CI fails on them.
// The UI code is type-checked by `npm run check:types` (jsconfig.json), which already knows every browser name, so
// "is this name defined?" is checked here only for the Node scripts (tools/, tests/, .claude/hooks/).
import js from '@eslint/js';

// The Node built-ins the scripts in tools/ and tests/ use. Add one here if a script needs another.
const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  queueMicrotask: 'readonly',
  WebSocket: 'readonly',
  EventTarget: 'readonly',
  CustomEvent: 'readonly',
};

// CLAUDE.md section 2 and 4: functions under ~40 lines, no more than two levels of nested ifs, files under ~400 lines.
const MAX_FUNCTION_LINES = 40;
const MAX_DEPTH = 3;
const MAX_FILE_LINES = 400;

export default [
  { ignores: ['ui/settings/vendor/**', 'src-tauri/target/**', 'node_modules/**', 'tests/visual/diff/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      eqeqeq: ['error', 'smart'],
      'max-depth': ['error', MAX_DEPTH],
      'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: MAX_FILE_LINES, skipBlankLines: true, skipComments: true }],
    },
  },
  // The one file still over the length limit: the key-editor e2e suite, one long script whose later steps build on the
  // earlier ones. Splitting it needs an e2e run on Windows to prove each part still passes on its own.
  { files: ['tests/e2e/suites/keys-editor.mjs'], rules: { 'max-lines': 'off' } },
  // Pages that run in a browser (the UI, and the sandbox's stand-ins for the app).
  { files: ['ui/**/*.js', 'tools/sandbox/**/*.js'], rules: { 'no-undef': 'off' } },
  {
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', '.claude/hooks/**/*.mjs', '*.mjs'],
    languageOptions: { globals: NODE_GLOBALS },
  },
];
