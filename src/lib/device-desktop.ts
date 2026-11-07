import type { DeviceId } from "./system-simulator";

export type DeviceDesktopApp = "server-manager" | "services" | "dns-manager" | "dhcp-manager" | "iis-manager" | "files" | "worker" | "events" | "terminal" | "network" | "browser";

export type DesktopWindow = {
  app: DeviceDesktopApp;
  minimized: boolean;
  maximized: boolean;
  draft: Record<string, string>;
};

export type DeviceDesktopState = {
  // Back-to-front order; minimized windows remain available in the taskbar.
  windows: DesktopWindow[];
  activeApp: DeviceDesktopApp | null;
};

export type DesktopState = {
  selectedDevice: DeviceId;
  devices: Record<DeviceId, DeviceDesktopState>;
};

export type DesktopEvent =
  | { type: "select-device"; device: DeviceId }
  | { type: "open" | "close" | "minimize" | "restore" | "toggle-maximize" | "focus"; device: DeviceId; app: DeviceDesktopApp }
  | { type: "set-draft"; device: DeviceId; app: DeviceDesktopApp; key: string; value: string };

const apps: Record<DeviceId, readonly DeviceDesktopApp[]> = {
  server: ["server-manager", "services", "dns-manager", "dhcp-manager", "iis-manager", "files", "worker", "events", "terminal"],
  client: ["network", "terminal", "browser"],
};

export function allowedDesktopApps(device: DeviceId): readonly DeviceDesktopApp[] {
  return [...apps[device]];
}

export function isDesktopAppAllowed(device: DeviceId, app: DeviceDesktopApp): boolean {
  return apps[device].includes(app);
}

// Presentation state only: opening, arranging or editing a window cannot change
// a virtual PC's configuration. New sessions create independent desktop state.
export function createDesktopState(selectedDevice: DeviceId = "server"): DesktopState {
  return {
    selectedDevice,
    devices: {
      server: { windows: [], activeApp: null },
      client: { windows: [], activeApp: null },
    },
  };
}

export function reduceDesktopState(state: DesktopState, event: DesktopEvent): DesktopState {
  if (event.type === "select-device") {
    return event.device === state.selectedDevice ? state : { ...state, selectedDevice: event.device };
  }
  if (!isDesktopAppAllowed(event.device, event.app)) return state;
  const desktop = state.devices[event.device];
  const current = desktop.windows.find((window) => window.app === event.app);
  if (!current && event.type !== "open") return state;

  let windows = desktop.windows;
  let activeApp = desktop.activeApp;
  const fallback = (list: DesktopWindow[]) => list.findLast((window) => !window.minimized)?.app ?? null;
  switch (event.type) {
    case "open":
    case "focus":
    case "restore": {
      const next = current
        ? { ...current, minimized: false }
        : { app: event.app, minimized: false, maximized: false, draft: {} };
      if (current && !current.minimized && activeApp === event.app && windows.at(-1)?.app === event.app) return state;
      windows = [...windows.filter((window) => window.app !== event.app), next];
      activeApp = event.app;
      break;
    }
    case "close":
      windows = windows.filter((window) => window.app !== event.app);
      if (activeApp === event.app) activeApp = fallback(windows);
      break;
    case "minimize":
      if (current!.minimized) return state;
      windows = windows.map((window) => window.app === event.app ? { ...window, minimized: true } : window);
      if (activeApp === event.app) activeApp = fallback(windows);
      break;
    case "toggle-maximize":
      windows = [...windows.filter((window) => window.app !== event.app), { ...current!, minimized: false, maximized: !current!.maximized }];
      activeApp = event.app;
      break;
    case "set-draft":
      // Keep drafts small, serializable and free from object-prototype keys.
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(event.key)
        || ["constructor", "prototype", "__proto__"].includes(event.key)
        || event.value.length > 16_384
        || (!Object.hasOwn(current!.draft, event.key) && Object.keys(current!.draft).length >= 32)) return state;
      if (current!.draft[event.key] === event.value) return state;
      windows = windows.map((window) => window.app === event.app
        ? { ...window, draft: { ...window.draft, [event.key]: event.value } } : window);
      break;
  }
  return { ...state, devices: { ...state.devices, [event.device]: { windows, activeApp } } };
}
