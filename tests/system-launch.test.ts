import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/lib/system-simulator";
import { useSystemLab } from "../src/lib/system-store";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  useSystemLab.setState({ sessionId: null, state: null, report: "", busy: false,
    initializing: false, error: "", notice: "", terminal: [], dnsObservation: null, generation: 0,
    view: "overview", launchId: null });
});

test("a distinct homepage entry creates its selected preset and clears previous tool state", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const presets: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    presets.push(body.presetId);
    return Response.json({ sessionId: `session-${presets.length}`,
      state: createSimulation(body.presetId), report: body.presetId });
  };
  await useSystemLab.getState().initialize("healthy", "first-entry");
  useSystemLab.setState({ view: "iis", terminal: [{ id: 1, device: "client",
    command: "ping 192.168.10.10", output: "old output", revision: 0 }] });

  await useSystemLab.getState().initialize("dns-stopped", "second-entry");
  assert.deepEqual(presets, ["healthy", "dns-stopped"]);
  assert.equal(useSystemLab.getState().launchId, "second-entry");
  assert.equal(useSystemLab.getState().state?.dns.running, false);
  assert.equal(useSystemLab.getState().view, "overview");
  assert.deepEqual(useSystemLab.getState().terminal, []);
});

test("rerenders and duplicate effects retain the same entry session", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ sessionId: "one-session", state: createSimulation("dns-stopped"), report: "DNS" });
  };
  await Promise.all([useSystemLab.getState().initialize("dns-stopped", "entry"),
    useSystemLab.getState().initialize("dns-stopped", "entry")]);
  useSystemLab.setState({ view: "network" });
  await useSystemLab.getState().initialize("dns-stopped", "entry");
  await useSystemLab.getState().initialize();
  assert.equal(requests, 1);
  assert.equal(useSystemLab.getState().view, "network");
});

test("a newer entry wins over a delayed previous initialization", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let finishPrevious!: (response: Response) => void;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.presetId === "healthy") return new Promise<Response>((resolve) => { finishPrevious = resolve; });
    return Response.json({ sessionId: "new-session", state: createSimulation("dns-stopped"), report: "New DNS" });
  };
  const previous = useSystemLab.getState().initialize("healthy", "old-entry");
  await useSystemLab.getState().initialize("dns-stopped", "new-entry");
  finishPrevious(Response.json({ sessionId: "old-session", state: createSimulation(), report: "Old" }));
  await previous;
  assert.equal(useSystemLab.getState().sessionId, "new-session");
  assert.equal(useSystemLab.getState().launchId, "new-entry");
  assert.equal(useSystemLab.getState().report, "New DNS");
  assert.equal(useSystemLab.getState().initializing, false);
});

test("a delayed mutation from the previous entry cannot replace the new session", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let finishPrevious!: (response: Response) => void;
  useSystemLab.setState({ sessionId: "old-session", state: createSimulation(), launchId: "old-entry" });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.operation === "action") return new Promise<Response>((resolve) => { finishPrevious = resolve; });
    return Response.json({ sessionId: "new-session", state: createSimulation("dns-stopped"), report: "New DNS" });
  };
  const mutation = useSystemLab.getState().act({ type: "client.link", connected: false });
  await useSystemLab.getState().initialize("dns-stopped", "new-entry");
  finishPrevious(Response.json({ sessionId: "old-session", state: createSimulation(), report: "Old" }));
  await mutation;
  assert.equal(useSystemLab.getState().sessionId, "new-session");
  assert.equal(useSystemLab.getState().state?.dns.running, false);
  assert.equal(useSystemLab.getState().report, "New DNS");
});
