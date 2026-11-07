import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createSimulation, type DnsTrace } from "../src/lib/system-simulator";
import { useSystemLab, type DnsObservation } from "../src/lib/system-store";

const originalFetch = globalThis.fetch;
const sessionId = "test-session";
const dnsTrace = (revision = 0): DnsTrace => ({
  revision, device: "client", sourceIp: "192.168.10.100", resolverIp: "192.168.10.10",
  queryName: "portal.lab.test", queryType: "A", resolverDevice: "server", transport: "network",
  reachability: "reachable", outcome: "answer", answerIp: "192.168.10.10",
});
const observation = (): DnsObservation => ({ id: 10, command: "nslookup portal.lab.test", trace: dnsTrace() });
beforeEach(() => {
  useSystemLab.setState({ sessionId: null, state: null, report: "", busy: false, initializing: false, error: "", notice: "", terminal: [], dnsObservation: null, generation: 0, view: "overview", launchId: null });
});

test("UI initializes one authoritative session even when initialization is called twice", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return Response.json({ sessionId, state: createSimulation(), report: "Healthy" }, { status: 201 });
  };
  await Promise.all([useSystemLab.getState().initialize(), useSystemLab.getState().initialize()]);
  assert.equal(count, 1);
  assert.equal(useSystemLab.getState().sessionId, sessionId);
  assert.equal(useSystemLab.getState().busy, false);
});

test("a revision conflict resyncs the view and preserves the actionable error", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const state = createSimulation(); state.revision = 8;
  const saved = observation();
  useSystemLab.setState({ sessionId, state: createSimulation(), dnsObservation: saved });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.expectedRevision, 0);
    return Response.json({ sessionId, state, report: "Current", error: "Stale revision" }, { status: 409 });
  };
  await useSystemLab.getState().act({ type: "client.link", connected: false });
  assert.equal(useSystemLab.getState().state?.revision, 8);
  assert.equal(useSystemLab.getState().error, "Stale revision");
  assert.equal(useSystemLab.getState().busy, false);
  assert.equal(useSystemLab.getState().dnsObservation, saved);
});

test("reset can recover from an expired server session without reloading the page", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  useSystemLab.setState({ sessionId, state: createSimulation(), dnsObservation: observation() });
  const operations: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body)); operations.push(body.operation);
    return body.operation === "reset" ? Response.json({ error: "Expired" }, { status: 404 })
      : Response.json({ sessionId: "replacement", state: createSimulation("unconfigured"), report: "New" }, { status: 201 });
  };
  assert.equal(await useSystemLab.getState().reset("unconfigured"), true);
  assert.deepEqual(operations, ["reset", "create"]);
  assert.equal(useSystemLab.getState().sessionId, "replacement");
  assert.equal(useSystemLab.getState().generation, 1);
  assert.equal(useSystemLab.getState().state?.roles.dns, false);
  assert.equal(useSystemLab.getState().dnsObservation, null);
});

test("diagnostic history records the observed revision without mutating state", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const state = createSimulation(); state.revision = 2;
  useSystemLab.setState({ sessionId, state });
  globalThis.fetch = async () => Response.json({ output: "Reply", revision: 3 });
  assert.deepEqual(await useSystemLab.getState().diagnose("client", "ping 192.168.10.10"), { output: "Reply", revision: 3 });
  const s = useSystemLab.getState();
  assert.equal(s.state, state);
  assert.equal(s.state.revision, 2);
  assert.equal(s.terminal[0].revision, 3);
  assert.equal(s.terminal[0].device, "client");
});

test("DNS observations capture the authoritative trace with the terminal record id without changing state", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const state = createSimulation();
  const trace = dnsTrace();
  const command = "nslookup portal.lab.test";
  useSystemLab.setState({ sessionId, state });
  globalThis.fetch = async () => Object.assign(Response.json({}), {
    json: async () => ({ output: "DNS answer", revision: 0, dnsTrace: trace }),
  });

  assert.deepEqual(await useSystemLab.getState().diagnose("client", command), { output: "DNS answer", revision: 0 });
  const s = useSystemLab.getState();
  assert.equal(s.state, state);
  assert.deepEqual(s.dnsObservation, { id: s.terminal[0].id, command, trace });
  assert.notEqual(s.dnsObservation?.trace, trace);

  trace.answerIp = "192.168.10.99";
  assert.equal(s.dnsObservation?.trace.answerIp, "192.168.10.10");
});

test("a DNS observation remains a snapshot when configuration changes", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const saved = observation();
  useSystemLab.setState({ sessionId, state: createSimulation(), dnsObservation: saved });
  const changed = createSimulation("dns-record"); changed.revision = 1;
  globalThis.fetch = async () => Response.json({ sessionId, state: changed, report: "Changed" });

  await useSystemLab.getState().act({ type: "dns.record", address: "192.168.10.99" });
  const s = useSystemLab.getState();
  assert.equal(s.state?.dns.record, "192.168.10.99");
  assert.equal(s.dnsObservation, saved);
  assert.equal(s.dnsObservation.trace.revision, 0);
  assert.equal(s.dnsObservation.trace.answerIp, "192.168.10.10");
});

test("unrelated diagnostics preserve the latest DNS observation and do not fabricate traces", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  useSystemLab.setState({ sessionId, state: createSimulation() });
  globalThis.fetch = async () => Response.json({ output: "Reply", revision: 0 });
  await useSystemLab.getState().diagnose("client", "nslookup portal.lab.test");
  assert.equal(useSystemLab.getState().dnsObservation, null);

  const saved = observation();
  useSystemLab.setState({ dnsObservation: saved });
  await useSystemLab.getState().diagnose("client", "ping 192.168.10.10");
  assert.equal(useSystemLab.getState().dnsObservation, saved);
});

test("DNS traces with a mismatched revision or device cannot replace the captured observation", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const saved = observation();
  useSystemLab.setState({ sessionId, state: createSimulation(), dnsObservation: saved });
  globalThis.fetch = async () => Response.json({ output: "DNS answer", revision: 0, dnsTrace: dnsTrace(1) });
  await useSystemLab.getState().diagnose("client", "nslookup portal.lab.test");
  assert.equal(useSystemLab.getState().dnsObservation, saved);

  globalThis.fetch = async () => Response.json({ output: "DNS answer", revision: 0, dnsTrace: { ...dnsTrace(), device: "server" } });
  await useSystemLab.getState().diagnose("client", "nslookup portal.lab.test");
  assert.equal(useSystemLab.getState().dnsObservation, saved);
  assert.equal(useSystemLab.getState().terminal.length, 2);
});

test("clearing terminal history also clears the captured DNS observation", () => {
  useSystemLab.setState({ dnsObservation: observation(), terminal: [{ id: 10, device: "client",
    command: "nslookup portal.lab.test", output: "DNS answer", revision: 0 }] });
  useSystemLab.getState().clearTerminal();
  assert.equal(useSystemLab.getState().dnsObservation, null);
  assert.deepEqual(useSystemLab.getState().terminal, []);
});

test("a delayed DNS observation from a previous generation cannot appear in the new entry", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let finishPrevious!: (response: Response) => void;
  useSystemLab.setState({ sessionId, state: createSimulation(), launchId: "old-entry", dnsObservation: observation() });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.operation === "diagnose") return new Promise<Response>((resolve) => { finishPrevious = resolve; });
    return Response.json({ sessionId: "new-session", state: createSimulation("dns-stopped"), report: "New DNS" });
  };
  const previous = useSystemLab.getState().diagnose("client", "nslookup portal.lab.test");
  await useSystemLab.getState().initialize("dns-stopped", "new-entry");
  finishPrevious(Response.json({ output: "DNS answer", revision: 0, dnsTrace: dnsTrace() }));

  assert.equal(await previous, null);
  assert.equal(useSystemLab.getState().sessionId, "new-session");
  assert.equal(useSystemLab.getState().dnsObservation, null);
  assert.deepEqual(useSystemLab.getState().terminal, []);
});
