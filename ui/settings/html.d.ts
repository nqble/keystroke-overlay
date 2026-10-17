// Types for html.js (Preact with htm), so the type check (npm run check:types) knows what screens import. html.js and
// the copied libraries in ./vendor/ are not type-checked themselves: they are pinned third-party code (jsconfig.json).
// Loose on purpose, like the rest of the UI's checking. Keep in step with what html.js exports.
export function html(strings: TemplateStringsArray, ...values: unknown[]): any;
export function render(element: any, parent: Element): void;
export function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
export function useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void;
export function useRef<T>(initial: T): { current: T };
