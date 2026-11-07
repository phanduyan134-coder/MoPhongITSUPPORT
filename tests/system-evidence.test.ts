import assert from "node:assert/strict";
import test from "node:test";
import { createSessionStore, SimulationSessionError, systemSessions } from "../src/lib/system-session";
import type { AgentRunEvidence } from "../src/lib/system-evidence";
import { POST as simulationPost } from "../src/app/api/simulation/route";

function agentRun(revision = 0): AgentRunEvidence {
  return {
    id: `run-${revision}`, purpose: "diagnose", source: "local", fallback: false, model: null,
    startedAt: "2026-10-28T00:00:00.000Z", durationMs: 12, revision,
    question: "Vì sao máy trạm không truy cập được website?", message: "Cần kiểm tra DNS.",
    sources: [{ title: "DNS troubleshooting", url: "https://learn.microsoft.com/en-us/windows-server/networking/dns/troubleshoot/troubleshoot-dns-server" }],
    trace: [{
      tool: "inspect_service", input: { service: "dns" }, output: { installed: true, running: false },
      summary: "DNS Stopped", revision, startedAt: "2026-10-28T00:00:00.001Z", durationMs: 1, status: "ok", origin: "local",
    }],
  };
}

const apiRequest = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/simulation", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});

test("Web evidence preserves authoritative before/after configuration and fresh DNS diagnostics", () => {
  let now = Date.parse("2026-10-28T00:00:00.000Z");
  const store = createSessionStore({ now: () => now });
  const initial = store.create("dns-stopped");
  const before = store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test");
  now += 1000;
  store.action(initial.sessionId, 0, { type: "service.toggle", service: "dns", running: true });
  const after = store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test");
  const exported = store.exportEvidence(initial.sessionId);
  assert.equal(exported.session.createdAt, "2026-10-28T00:00:00.000Z");
  assert.equal(exported.exportedAt, "2026-10-28T00:00:01.000Z");
  assert.equal(exported.session.initialState.dns.running, false);
  assert.equal(exported.session.currentState.dns.running, true);
  assert.deepEqual(exported.journal.entries.map(({ kind, revision }) => [kind, revision]), [["diagnostic", 0], ["action", 1], ["diagnostic", 1]]);
  assert.deepEqual(exported.journal.entries[0].data, { device: "client", command: "nslookup portal.lab.test", result: before });
  const action = exported.journal.entries[1].data as { action: unknown; beforeState: typeof initial.state; afterState: typeof initial.state };
  assert.deepEqual(action.action, { type: "service.toggle", service: "dns", running: true });
  assert.equal(action.beforeState.dns.running, false);
  assert.equal(action.afterState.dns.running, true);
  assert.equal(before.dnsTrace?.outcome, "timeout");
  assert.equal(after.dnsTrace?.outcome, "answer");
  assert.equal(after.dnsTrace?.revision, 1);
  assert.equal(exported.journal.truncated, false);
  assert.equal(exported.journal.droppedEntries, 0);
});

test("Agent evidence stores full tool I/O and cannot mutate earlier observations", () => {
  const store = createSessionStore();
  const initial = store.create("dns-stopped");
  const run = agentRun();
  assert.deepEqual(store.recordAgent(initial.sessionId, run), { runId: "run-0", stale: false });
  (run.trace[0].output as { running: boolean }).running = true;
  run.question = "Changed by caller";
  const exported = store.exportEvidence(initial.sessionId);
  const data = exported.journal.entries[0].data as { evidence: AgentRunEvidence; stale: boolean };
  assert.deepEqual(data.evidence.trace[0].input, { service: "dns" });
  assert.deepEqual(data.evidence.trace[0].output, { installed: true, running: false });
  assert.equal(data.evidence.trace[0].origin, "local");
  assert.notEqual(data.evidence.question, run.question);
  assert.equal(data.stale, false);
  exported.session.initialState.dns.running = true;
  exported.session.currentState.dns.running = true;
  data.evidence.trace.length = 0;
  assert.equal(store.exportEvidence(initial.sessionId).session.initialState.dns.running, false);
  assert.equal(store.get(initial.sessionId).state.dns.running, false);
  const again = store.exportEvidence(initial.sessionId).journal.entries[0].data as { evidence: AgentRunEvidence };
  assert.equal(again.evidence.trace.length, 1);
});

test("Reset records preserve the initial state and mark in-flight Agent observations stale", () => {
  const store = createSessionStore();
  const initial = store.create("dns-stopped");
  store.reset(initial.sessionId, "healthy");
  const recorded = store.recordAgent(initial.sessionId, agentRun(0));
  assert.equal(recorded.stale, true);
  const exported = store.exportEvidence(initial.sessionId);
  assert.equal(exported.session.initialState.dns.running, false);
  assert.equal(exported.session.currentState.revision, 1);
  const reset = exported.journal.entries[0].data as { beforeState: typeof initial.state; afterState: typeof initial.state };
  assert.equal(reset.beforeState.revision, 0);
  assert.equal(reset.afterState.revision, 1);
  assert.equal(reset.beforeState.dns.running, false);
  assert.equal(reset.afterState.dns.running, true);
  assert.equal((exported.journal.entries[1].data as { stale: boolean }).stale, true);
  assert.deepEqual(store.recordAgent(initial.sessionId, agentRun(1)), { runId: "run-1", stale: false });
  assert.ok(!JSON.stringify(exported).includes(initial.sessionId), "bearer session capability must not appear in the downloaded file");
  assert.ok(!JSON.stringify(exported).includes("dns-stopped"), "preset identity is not an observation");
});

test("Failed actions do not create misleading successful-action journal entries", () => {
  const store = createSessionStore();
  const initial = store.create("healthy");
  assert.throws(() => store.action(initial.sessionId, 0, { type: "file.delete", id: "business-data" }));
  assert.equal(store.exportEvidence(initial.sessionId).journal.entries.length, 0);
  store.action(initial.sessionId, 0, { type: "client.link", connected: false });
  assert.throws(() => store.action(initial.sessionId, 0, { type: "client.link", connected: true }), (error) => error instanceof SimulationSessionError && error.status === 409);
  assert.equal(store.exportEvidence(initial.sessionId).journal.entries.length, 1);
});

test("Count-bounded journals expose dropped records and keep monotonic sequence numbers", () => {
  const store = createSessionStore({ journalMaxEntries: 3 });
  const initial = store.create();
  for (let revision = 0; revision < 6; revision++) store.action(initial.sessionId, revision, { type: "client.link", connected: revision % 2 === 0 });
  const exported = store.exportEvidence(initial.sessionId);
  assert.equal(exported.journal.truncated, true);
  assert.equal(exported.journal.droppedEntries, 3);
  assert.deepEqual(exported.journal.entries.map(({ sequence }) => sequence), [4, 5, 6]);
  assert.equal(exported.session.initialState.revision, 0);
  assert.equal(exported.session.currentState.revision, 6);
});

test("Byte-bounded journals disclose omissions and remain valid bounded JSON", () => {
  const store = createSessionStore({ journalMaxBytes: 1024 });
  const initial = store.create();
  for (let index = 0; index < 10; index++) store.diagnose(initial.sessionId, "client", "ipconfig /all");
  const run = agentRun();
  run.message = "Mô phỏng ".repeat(50_000);
  store.recordAgent(initial.sessionId, run);
  const exported = store.exportEvidence(initial.sessionId);
  assert.equal(exported.journal.truncated, true);
  assert.ok(exported.journal.droppedEntries > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(exported.journal.entries), "utf8") <= exported.limits.maxBytes);
  assert.equal(exported.journal.entries.at(-1)?.truncated, true);
  const omitted = exported.journal.entries.at(-1)?.data as { omitted: boolean; reason: string };
  assert.equal(omitted.omitted, true);
  assert.equal(omitted.reason, "entry-too-large");
});

test("Unknown tool data cannot break serialization or expose accidental credential fields", () => {
  const store = createSessionStore();
  const initial = store.create();
  const run = agentRun();
  const output: Record<string, unknown> = { apiKey: "do-not-export", authorization: "Bearer do-not-export", status: "ok" };
  output.self = output;
  Object.defineProperty(output, "dangerous", { enumerable: true, get() { throw new Error("must not call getters"); } });
  run.trace[0].output = output;
  store.recordAgent(initial.sessionId, run);
  const exported = store.exportEvidence(initial.sessionId);
  assert.equal(exported.journal.truncated, true);
  const serialized = JSON.stringify(exported);
  assert.ok(!serialized.includes("do-not-export"));
  assert.match(serialized, /Sensitive field omitted/);
  assert.match(serialized, /Circular value omitted/);
  assert.match(serialized, /Accessor omitted/);
});

test("Expired sessions cannot export or append Agent records", () => {
  let now = 0;
  const store = createSessionStore({ ttlMs: 100, now: () => now });
  const initial = store.create();
  now = 101;
  assert.throws(() => store.exportEvidence(initial.sessionId), (error) => error instanceof SimulationSessionError && error.status === 404);
  assert.throws(() => store.recordAgent(initial.sessionId, agentRun()), (error) => error instanceof SimulationSessionError && error.status === 404);
});

test("Export API requires the valid session capability, rejects extra data and has no-store caching", async () => {
  const initial = systemSessions.create("dns-record");
  const valid = await simulationPost(apiRequest({ operation: "export", sessionId: initial.sessionId }));
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("Cache-Control"), "no-store");
  const body = await valid.json();
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.kind, "supportlab-web-session");
  assert.equal(body.session.initialState.dns.record, "192.168.10.99");
  assert.equal(body.sessionId, undefined);
  assert.deepEqual(body.limitations, ["simulated-not-windows", "in-memory-until-expiry-or-restart", "not-model-quality-evaluation"]);
  assert.equal((await simulationPost(apiRequest({ operation: "export" }))).status, 400);
  assert.equal((await simulationPost(apiRequest({ operation: "export", sessionId: "guessed" }))).status, 400);
  assert.equal((await simulationPost(apiRequest({ operation: "export", sessionId: "a".repeat(43) }))).status, 404);
  assert.equal((await simulationPost(apiRequest({ operation: "export", sessionId: initial.sessionId, state: {} }))).status, 400);
  assert.equal((await simulationPost(apiRequest({ operation: "export", sessionId: initial.sessionId }, { origin: "https://other.example" }))).status, 403);
});
