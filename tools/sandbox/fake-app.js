// A stand-in for the real app, loaded by tools/ui-sandbox.mjs before the settings page's own code. It provides
// window.__TAURI__ (commands and events) with harmless made-up answers, so the real ui/settings/ page runs in a normal
// browser: no Windows, no build, no keyboard hook. Nothing is saved; reloading starts fresh.
//
// Pick what to show with the address (several can be combined with &):
//   ?state=live | off | paused | paused-no-obs | port-in-use | update | whats-new | whats-new-long | first-run | mac-allow | mac-restart | mac-secure
//   ?tab=layout | keys | style | animation | fonts | general | debug     (debug also turns Debug mode on)
//   ?platform=macos | linux                                              pretend to be another system (the mac-* states are macOS)
//   ?devbuild                                                            the DEV badge, as a devbuild shows it
// Add a state: a line in STATES below, and a line in the list above.
// Tests and Claude sessions can call window.__sandbox.emit('event-name', payload) to send an app message.
(() => {
  const params = new URLSearchParams(location.search);
  const stateName = params.get('state') || 'live';
  const tab = params.get('tab');

  // What each state changes in the app's answer to get_state (and the update check).
  const STATES = {
    live: { overlays: 1 },
    off: { overlays: 0 },
    paused: { overlays: 1, paused: true },
    'paused-no-obs': { overlays: 0, paused: true },
    'port-in-use': { overlays: 0, serverError: 'Port 7878 is already in use by another program' },
    update: { overlays: 1, update: true },
    'whats-new': { overlays: 1, whatsNew: true },
    'whats-new-long': { overlays: 1, whatsNew: true, longNotes: true },
    // a brand-new install, before OBS is set up: emit('overlays-changed', 1) to play OBS connecting
    'first-run': { overlays: 0, firstRun: true },
    // macOS keyboard access notice (ui/settings/keyboard-access.js): not allowed yet, allowed but needs a restart, Secure Input on
    'mac-allow': {
      overlays: 0,
      access: { allowed: false, secureInput: false },
      inputError: 'macOS has not let the app read the keyboard',
    },
    'mac-restart': {
      overlays: 0,
      access: { allowed: true, secureInput: false },
      inputError: 'macOS has not let the app read the keyboard',
    },
    'mac-secure': { overlays: 1, access: { allowed: true, secureInput: true } },
  };
  const chosen = STATES[stateName] ?? STATES.live;

  const NOTES =
    '### ✨ New\n- **Sandbox notes:** made up for the UI sandbox.\n\n### 🐛 Fixed\n- Nothing real was fixed here.';
  // Long enough to need scrolling, to check the popup's size rule.
  const LONG_NOTES = Array.from({ length: 30 }, (_, i) => `- Sandbox line ${i + 1}: made up, to fill the popup.`);
  const SHOWN_NOTES = chosen.longNotes ? `### ✨ New\n${LONG_NOTES.join('\n')}` : NOTES;
  const UPDATE = {
    available: true,
    version: '9.9.0',
    current: '1.4.0',
    channel: 'stable',
    notes: NOTES,
    manual: false,
  };
  const NO_UPDATE = { available: false, current: '1.4.0', channel: 'stable' };

  const loaded = Promise.all([
    fetch('/__sandbox__/default-settings.json').then((response) => response.json()),
    fetch('/__sandbox__/layouts.json').then((response) => response.json()),
  ]);
  let settings = null;
  const presets = {};
  let ownLayouts = [];
  let paused = !!chosen.paused;
  let firstRun = !!chosen.firstRun;
  const log = [[0, 'sandbox started: nothing here is real']];

  async function getState() {
    const [defaults] = await loaded;
    settings ??= structuredClone(defaults);
    if (tab === 'debug') settings.general.debugMode = true;
    return {
      settings,
      url: `http://127.0.0.1:${window.__SANDBOX_OVERLAY_PORT__}/`,
      serverError: chosen.serverError ?? null,
      version: '1.4.0',
      paused,
      overlays: chosen.overlays,
      whatsNew: !!chosen.whatsNew,
      firstRun,
      inputError: chosen.inputError ?? null,
      keyboardAccess: { applies: !!chosen.access, ...chosen.access },
      platform: params.get('platform') || (chosen.access ? 'macos' : 'windows'),
      inputActive: 'hook',
      secureLink: false,
      gotoTab: tab,
      updateBadge: !!chosen.update,
    };
  }

  const COMMANDS = {
    get_state: getState,
    get_keyboard_access: async () => (await getState()).keyboardAccess,
    request_keyboard_access: () => {},
    restart_app: () => {},
    list_layouts: async () => [...(await loaded)[1], ...ownLayouts],
    // your own layouts live in memory for the visit too, so making and deleting one can be tried
    create_layout: async ({ name }) => {
      const full = (await loaded)[1].find((layout) => layout.id === 'full');
      const id = `user-${ownLayouts.length + 1}-${Date.now()}`;
      ownLayouts.push({ ...structuredClone(full), id, name: name.trim() || 'My layout', user: true });
      return id;
    },
    delete_layout: ({ id }) => {
      ownLayouts = ownLayouts.filter((layout) => layout.id !== id);
    },
    list_fonts: () => [],
    // presets live in memory for the visit, so saving, loading and deleting can be tried
    list_presets: () => Object.keys(presets),
    save_preset: ({ name, data }) => {
      presets[name] = structuredClone(data);
    },
    load_preset: ({ name }) => structuredClone(presets[name]),
    delete_preset: ({ name }) => {
      delete presets[name];
    },
    save_settings: ({ settings: saved }) => {
      settings = saved;
    },
    copy_text: ({ text }) => {
      window.__sandbox.copied = text;
    },
    // A new port or key gives a new link, like the app does; the header then asks to copy it again.
    set_port: ({ port }) => `http://127.0.0.1:${port}/`,
    regenerate_link_key: () => `http://127.0.0.1:${window.__SANDBOX_OVERLAY_PORT__}/?key=sandbox${Date.now()}`,
    set_secure_link: ({ enabled }) =>
      `http://127.0.0.1:${window.__SANDBOX_OVERLAY_PORT__}/` + (enabled ? `?key=sandbox${Date.now()}` : ''),
    set_pause_hotkey: ({ enabled, shortcut }) => {
      settings.hotkeys = { enabled, pause: shortcut };
    },
    toggle_pause: () => {
      paused = !paused;
      return paused;
    },
    ack_first_run: () => {
      firstRun = false;
    },
    get_release_notes: () => ({ body: SHOWN_NOTES }),
    auto_check_update: () => (chosen.update ? UPDATE : NO_UPDATE),
    check_update: () => (chosen.update ? UPDATE : NO_UPDATE),
    debug_info: () => ({
      version: '1.4.0',
      build: 'sandbox',
      os: 'sandbox',
      uptimeSecs: 60,
      memoryMb: 0,
      handles: 0,
      port: 7878,
      serverError: chosen.serverError ?? null,
      inputActive: 'hook',
      inputError: null,
      settingsValid: true,
      dataDir: '(sandbox: no data folder)',
      dataWritable: true,
    }),
    debug_defaults: async () => (await loaded)[0],
    debug_log: () => log,
  };

  const listeners = {};
  const invoke = async (name, args = {}) => {
    if (!(name in COMMANDS)) {
      log.push([log.length, `sandbox: "${name}" does nothing here`]);
      return null;
    }
    return COMMANDS[name](args);
  };
  const listen = async (name, handler) => {
    (listeners[name] ??= []).push(handler);
    return () => {};
  };
  const emit = (name, payload) => (listeners[name] ?? []).forEach((handler) => handler({ payload }));
  const fakeWindow = {
    minimize() {},
    toggleMaximize() {},
    close() {},
    isMaximized: async () => false,
    onResized() {},
  };

  window.__TAURI__ = {
    core: { invoke },
    event: { listen },
    window: { getCurrentWindow: () => fakeWindow },
  };
  // A devbuild gets its badge from tools/devbuild-title.mjs at build time; the sandbox adds the same element here (it may
  // only use Node's own modules on the server side, so it can't import that helper).
  if (params.has('devbuild')) {
    addEventListener('DOMContentLoaded', () => {
      const badge = Object.assign(document.createElement('span'), { className: 'dev-badge', textContent: 'DEV' });
      badge.dataset.test = 'dev-badge';
      document.querySelector('[data-test="brand-title"]').append(' ', badge);
    });
  }
  window.__sandbox = { state: stateName, states: Object.keys(STATES), emit, copied: null };
})();
