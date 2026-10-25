// Type descriptions for the few globals the UI pages use, for `npm run check:types` (jsconfig.json) and editors.
// Declarations only: nothing here runs or ships.

interface Window {
  /** Tauri's JavaScript API in the settings window (`invoke`, `event`, …). */
  __TAURI__: any;
  /** The overlay's drawn size, read by the settings preview and the tests (ui/overlay/overlay.js). */
  __size: { w: number; h: number } | null;
  /** Debug-mode helpers for the console and the tests (ui/settings/debug.js). */
  ko: any;
  /** When the settings window finished its first screen, read by the performance tests (ui/settings/settings.js). */
  __uiReady: number;
  /** A few private module functions, reachable by the end-to-end tests and the inspector (ui/settings/settings.js). */
  __ko: any;
  /** OBS Studio's Browser source page API (obs-browser), only inside OBS (ui/overlay/obs-source.js). */
  obsstudio?: {
    pluginVersion?: string;
    getCurrentScene?: (callback: (scene: { name: string; width: number; height: number } | null) => void) => void;
  };
}
