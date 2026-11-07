import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation } from "../src/lib/system-simulator";
import { allowedDesktopApps, createDesktopState, isDesktopAppAllowed, reduceDesktopState, type DesktopEvent, type DesktopState } from "../src/lib/device-desktop";

function dispatch(state: DesktopState, ...events: DesktopEvent[]) {
  return events.reduce(reduceDesktopState, state);
}

test("each virtual device exposes only its own management apps and opens one window per app", () => {
  assert.deepEqual(allowedDesktopApps("server"), ["server-manager", "services", "dns-manager", "dhcp-manager", "iis-manager", "files", "worker", "events", "terminal"]);
  assert.deepEqual(allowedDesktopApps("client"), ["network", "terminal", "browser"]);
  assert.equal(isDesktopAppAllowed("client", "services"), false);
  const initial = createDesktopState();
  assert.equal(reduceDesktopState(initial, { type: "open", device: "client", app: "dns-manager" }), initial);
  const once = reduceDesktopState(initial, { type: "open", device: "server", app: "services" });
  const twice = reduceDesktopState(once, { type: "open", device: "server", app: "services" });
  assert.equal(twice.devices.server.windows.length, 1);
  assert.equal(twice.devices.server.activeApp, "services");
  assert.equal(twice, once, "reopening the active visible window is a presentation no-op");
});

test("switching desktops retains each device's windows, taskbar state and unsaved input", () => {
  const state = dispatch(createDesktopState(),
    { type: "open", device: "server", app: "terminal" },
    { type: "set-draft", device: "server", app: "terminal", key: "command", value: "Get-Service DNS" },
    { type: "select-device", device: "client" },
    { type: "open", device: "client", app: "terminal" },
    { type: "set-draft", device: "client", app: "terminal", key: "command", value: "nslookup portal.lab.test" },
    { type: "open", device: "client", app: "browser" },
    { type: "set-draft", device: "client", app: "browser", key: "url", value: "http://portal.lab.test" },
    { type: "select-device", device: "server" });
  assert.equal(state.selectedDevice, "server");
  assert.equal(state.devices.server.activeApp, "terminal");
  assert.equal(state.devices.server.windows[0].draft.command, "Get-Service DNS");
  assert.equal(state.devices.client.activeApp, "browser");
  assert.equal(state.devices.client.windows[0].draft.command, "nslookup portal.lab.test");
  assert.equal(state.devices.client.windows[1].draft.url, "http://portal.lab.test");
});

test("minimize and close move keyboard focus to the last visible window, never a minimized one", () => {
  let state = dispatch(createDesktopState(),
    { type: "open", device: "server", app: "server-manager" },
    { type: "open", device: "server", app: "services" },
    { type: "open", device: "server", app: "terminal" });
  state = reduceDesktopState(state, { type: "minimize", device: "server", app: "services" });
  assert.equal(state.devices.server.activeApp, "terminal");
  state = reduceDesktopState(state, { type: "close", device: "server", app: "terminal" });
  assert.equal(state.devices.server.activeApp, "server-manager");
  assert.equal(state.devices.server.windows.find((window) => window.app === "services")?.minimized, true);
  state = reduceDesktopState(state, { type: "minimize", device: "server", app: "server-manager" });
  assert.equal(state.devices.server.activeApp, null, "desktop receives focus when all taskbar windows are minimized");
  state = reduceDesktopState(state, { type: "restore", device: "server", app: "services" });
  assert.equal(state.devices.server.activeApp, "services");
  assert.equal(state.devices.server.windows.at(-1)?.app, "services");
  assert.equal(state.devices.server.windows.at(-1)?.minimized, false);
});

test("raising and maximizing a window preserve its draft and its independent minimized/maximized state", () => {
  let state = dispatch(createDesktopState("client"),
    { type: "open", device: "client", app: "browser" },
    { type: "set-draft", device: "client", app: "browser", key: "url", value: "http://192.168.10.10" },
    { type: "toggle-maximize", device: "client", app: "browser" },
    { type: "minimize", device: "client", app: "browser" },
    { type: "open", device: "client", app: "terminal" },
    { type: "focus", device: "client", app: "browser" });
  const browser = state.devices.client.windows.at(-1)!;
  assert.equal(browser.app, "browser");
  assert.equal(browser.maximized, true);
  assert.equal(browser.minimized, false);
  assert.equal(browser.draft.url, "http://192.168.10.10");
  state = reduceDesktopState(state, { type: "toggle-maximize", device: "client", app: "browser" });
  assert.equal(state.devices.client.windows.at(-1)?.maximized, false);
  assert.equal(state.devices.client.activeApp, "browser");
});

test("closing a window discards only its own draft; a new session starts with fresh desktop state", () => {
  const state = dispatch(createDesktopState(),
    { type: "open", device: "server", app: "dns-manager" },
    { type: "set-draft", device: "server", app: "dns-manager", key: "address", value: "192.168.10.99" },
    { type: "open", device: "client", app: "browser" },
    { type: "close", device: "server", app: "dns-manager" },
    { type: "open", device: "server", app: "dns-manager" });
  assert.deepEqual(state.devices.server.windows[0].draft, {});
  assert.equal(state.devices.client.windows[0].app, "browser");
  assert.deepEqual(createDesktopState(), { selectedDevice: "server", devices: { server: { windows: [], activeApp: null }, client: { windows: [], activeApp: null } } });
});

test("presentation operations are immutable and cannot change authoritative machine state", () => {
  const simulation = createSimulation("dns-stopped");
  const beforeSimulation = structuredClone(simulation);
  const initial = createDesktopState();
  const beforeDesktop = structuredClone(initial);
  const next = dispatch(initial,
    { type: "open", device: "server", app: "services" },
    { type: "set-draft", device: "server", app: "services", key: "selected", value: "DNS" },
    { type: "toggle-maximize", device: "server", app: "services" },
    { type: "select-device", device: "client" });
  assert.deepEqual(initial, beforeDesktop);
  assert.deepEqual(simulation, beforeSimulation);
  assert.equal(simulation.dns.running, false);
  assert.notEqual(next.devices.server, initial.devices.server);
  assert.equal(next.devices.client, initial.devices.client, "untouched device keeps its state identity");
  const allowed = allowedDesktopApps("server") as string[];
  allowed.splice(0);
  assert.equal(allowedDesktopApps("server").length, 9, "callers cannot modify the shared app allowlist");
});

test("events for missing windows and invalid draft keys leave the desktop unchanged", () => {
  let state = createDesktopState();
  for (const type of ["close", "focus", "restore", "minimize", "toggle-maximize"] as const)
    assert.equal(reduceDesktopState(state, { type, device: "server", app: "terminal" }), state);
  state = reduceDesktopState(state, { type: "open", device: "server", app: "terminal" });
  for (const key of ["__proto__", "constructor", "prototype", "key.with.dots", ""])
    assert.equal(reduceDesktopState(state, { type: "set-draft", device: "server", app: "terminal", key, value: "text" }), state);
  assert.equal(reduceDesktopState(state, { type: "set-draft", device: "server", app: "terminal", key: "command", value: "x".repeat(16_385) }), state);
});
