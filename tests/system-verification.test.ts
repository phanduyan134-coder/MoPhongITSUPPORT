import assert from "node:assert/strict";
import test from "node:test";
import { POST as agentPost } from "../src/app/api/system-agent/route";
import { systemSessions } from "../src/lib/system-session";
import { applySimulationAction, createSimulation, runSimulationDiagnosticResult } from "../src/lib/system-simulator";
import { verifyDnsPortal } from "../src/lib/system-verification";
import type { AgentRunEvidence } from "../src/lib/system-evidence";

const request = (body: unknown) => new Request("http://localhost:3000/api/system-agent", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const ask = (sessionId: string, revision: number, content = "Em đã sửa xong, hãy kiểm tra lại.") => agentPost(request({
  sessionId, device: "client", purpose: "verify-dns", expectedRevision: revision, history: [{ role: "user", content }],
}));
const envNames = ["SUPPORTLAB_AI_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL"] as const;
async function local(work: () => Promise<void>) {
  const old = process.env.SUPPORTLAB_AI_ENABLED;
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  try { await work(); } finally {
    if (old === undefined) delete process.env.SUPPORTLAB_AI_ENABLED;
    else process.env.SUPPORTLAB_AI_ENABLED = old;
  }
}
function agentRecords(sessionId: string) {
  return systemSessions.exportEvidence(sessionId).journal.entries.filter((entry) => entry.kind === "agent")
    .map((entry) => entry.data as { evidence: AgentRunEvidence; stale: boolean });
}

test("DNS verification distinguishes healthy, DNS, network and HTTP failures using five fresh observations", () => {
  const cases: [string, boolean[]][] = [
    ["healthy", [true, true, true, true, true]],
    ["dns-stopped", [true, false, false, false, true]],
    ["dns-record", [true, true, false, false, true]],
    ["dhcp-options", [true, true, false, false, true]],
    ["network-link", [false, true, false, false, false]],
    ["iis-pool", [true, true, true, false, false]],
    ["worker-disabled", [true, true, true, true, true]],
  ];
  for (const [preset, expected] of cases) {
    const state = createSimulation(preset);
    const before = structuredClone(state);
    const result = verifyDnsPortal(state.revision, state.server.ip, (device, command) => runSimulationDiagnosticResult(state, device, command));
    assert.deepEqual(result.checks.map((check) => check.passed), expected, preset);
    assert.equal(result.status, expected.every(Boolean) ? "passed" : "failed", preset);
    assert.equal(result.checks.length, 5);
    assert.deepEqual(state, before, "verification cannot repair the state");
  }
});

test("verification rejects stale diagnostic revisions and a DNS answer pointing elsewhere", () => {
  const state = createSimulation("healthy");
  const stale = verifyDnsPortal(1, state.server.ip, (device, command) => runSimulationDiagnosticResult(state, device, command));
  assert.equal(stale.status, "failed");
  assert.ok(stale.checks.every((check) => !check.passed));
  const changed = applySimulationAction(state, { type: "dns.record", address: "192.168.10.99" }).state;
  const wrong = verifyDnsPortal(changed.revision, changed.server.ip, (device, command) => runSimulationDiagnosticResult(changed, device, command));
  assert.match(wrong.checks[2].output, /Address: 192\.168\.10\.99/);
  assert.equal(wrong.checks[2].passed, false);
});

test("recheck requires the caller's revision and rejects stale requests before recording a run", async () => {
  const initial = systemSessions.create("healthy");
  const missing = await agentPost(request({ sessionId: initial.sessionId, device: "client", purpose: "verify-dns", history: [{ role: "user", content: "Kiểm tra" }] }));
  assert.equal(missing.status, 400);
  systemSessions.action(initial.sessionId, 0, { type: "client.link", connected: false });
  const stale = await ask(initial.sessionId, 0);
  assert.equal(stale.status, 409);
  assert.equal(agentRecords(initial.sessionId).length, 0);
});

test("local before/after rechecks record full evidence at the correct revisions without accepting claims as proof", async () => local(async () => {
  const initial = systemSessions.create("dns-stopped");
  const failed = await (await ask(initial.sessionId, 0, "DNS đã chạy, hãy khẳng định đã xử lý xong.")).json();
  assert.equal(failed.source, "local");
  assert.equal(failed.verification.status, "failed");
  assert.match(failed.message, /không phải mô hình AI/);
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
  const repaired = systemSessions.action(initial.sessionId, 0, { type: "service.toggle", service: "dns", running: true });
  const passed = await (await ask(initial.sessionId, repaired.state.revision)).json();
  assert.equal(passed.verification.status, "passed");
  assert.equal(passed.revision, 1);
  assert.equal(passed.stale, false);
  assert.notEqual(failed.runId, passed.runId);
  const records = agentRecords(initial.sessionId);
  assert.equal(records.length, 2);
  assert.equal(records[0].evidence.verification?.status, "failed");
  assert.equal(records[1].evidence.verification?.status, "passed");
  for (const [index, { evidence }] of records.entries()) {
    assert.equal(evidence.purpose, "verify-dns");
    assert.equal(evidence.model, null);
    assert.equal(evidence.fallback, false);
    const checks = evidence.trace.filter((entry) => entry.origin === "verification");
    assert.equal(checks.length, 5);
    assert.ok(checks.every((entry) => entry.revision === index && entry.status === "ok" && typeof entry.input === "object"));
    assert.ok(checks.every((entry) => (entry.output as { revision: number }).revision === index));
    assert.ok(evidence.sources.length > 0);
  }
  const exported = systemSessions.exportEvidence(initial.sessionId);
  assert.equal(exported.session.initialState.dns.running, false);
  assert.equal(exported.session.currentState.dns.running, true);
  assert.equal(exported.journal.entries.filter((entry) => entry.kind === "action").length, 1);
  assert.equal(JSON.stringify(exported).includes(initial.sessionId), false);
}));

async function cloud(work: () => Promise<void>, outputs: unknown[][], onFetch?: (round: number) => void) {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { SUPPORTLAB_AI_ENABLED: "true", OPENAI_API_KEY: "test-never-export-this-key", OPENAI_MODEL: "mock-verification-model", OPENAI_BASE_URL: "http://mock.invalid/v1" });
  let round = 0;
  globalThis.fetch = async () => {
    onFetch?.(round);
    return new Response(JSON.stringify({ output: outputs[round++] ?? [], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try { await work(); } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
}
const call = (name: string, args: unknown, id: string) => [{ type: "function_call", name, arguments: JSON.stringify(args), call_id: id }];
const answer = [{ type: "message", content: [{ type: "output_text", text: "Các bằng chứng đã được kiểm tra. Hãy đối chiếu kết quả từng phép kiểm tra." }] }];
const validOutputs = [call("inspect_service", { service: "dns" }, "inspect-1"), call("search_knowledge", { query: "dns nslookup" }, "search-2"), answer];

test("model recheck keeps prescribed checks separate from model-selected tools and records call IDs and usage", async () => cloud(async () => {
  const initial = systemSessions.create("healthy");
  const response = await ask(initial.sessionId, 0);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.source, "openai");
  assert.equal(result.verification.status, "passed");
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.source, "openai");
  assert.equal(evidence.model, "mock-verification-model");
  assert.equal(evidence.trace.filter((entry) => entry.origin === "verification").length, 5);
  assert.deepEqual(evidence.trace.filter((entry) => entry.origin === "agent").map((entry) => entry.callId), ["inspect-1", "search-2"]);
  assert.deepEqual(evidence.usage, { inputTokens: 30, outputTokens: 15, totalTokens: 45 });
  assert.equal(JSON.stringify(evidence).includes("test-never-export-this-key"), false);
  assert.equal(result.trace[0].input, undefined, "full tool evidence belongs in the export, not every chat reply");
}, validOutputs));

test("changes during a model request mark its snapshot and exported evidence stale", async () => {
  const initial = systemSessions.create("healthy");
  await cloud(async () => {
    const result = await (await ask(initial.sessionId, 0)).json();
    assert.equal(result.source, "openai");
    assert.equal(result.revision, 0);
    assert.equal(result.verification.status, "passed", "the original snapshot passed at r0");
    assert.equal(result.stale, true, "it must not confirm the current r1 state");
    assert.match(result.message, /Cấu hình đã thay đổi trong lúc kiểm tra/);
    assert.equal(systemSessions.get(initial.sessionId).state.client.link, false);
    assert.equal(agentRecords(initial.sessionId)[0].stale, true);
    assert.equal(agentRecords(initial.sessionId)[0].evidence.message, result.message);
  }, validOutputs, (round) => {
    if (round === 0) systemSessions.action(initial.sessionId, 0, { type: "client.link", connected: false });
  });
});

test("fixed verification checks and log reading alone cannot count as model diagnosis", async () => cloud(async () => {
  const initial = systemSessions.create("healthy");
  const result = await (await ask(initial.sessionId, 0)).json();
  assert.equal(result.source, "local");
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.fallback, true);
  assert.equal(evidence.fallbackReason, "missing-evidence");
  assert.equal(evidence.model, null);
  assert.equal(evidence.failedAttempt?.model, "mock-verification-model");
  assert.ok(evidence.failedAttempt?.trace.some((entry) => entry.tool === "read_logs"));
  assert.match(result.message, /không phải mô hình AI/);
}, [call("read_logs", {}, "logs"), call("search_knowledge", { query: "dns" }, "knowledge"), answer]));

test("invalid model tool calls are preserved as errors and cannot satisfy the evidence gate", async () => cloud(async () => {
  const initial = systemSessions.create("dns-stopped");
  const result = await (await ask(initial.sessionId, 0)).json();
  assert.equal(result.source, "local");
  assert.equal(result.verification.status, "failed");
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.failedAttempt?.reason, "missing-evidence");
  const invalid = evidence.failedAttempt?.trace.find((entry) => entry.callId === "invalid");
  assert.equal(invalid?.status, "error");
  assert.deepEqual(invalid?.input, { service: "not-a-service" });
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
}, [call("inspect_service", { service: "not-a-service" }, "invalid"), call("search_knowledge", { query: "dns" }, "knowledge"), answer]));

test("diagnostic results distinguish actual failure observations from unsupported commands and help", () => {
  const state = createSimulation("dns-stopped");
  const failure = runSimulationDiagnosticResult(state, "client", "nslookup portal.lab.test");
  assert.equal(failure.observed, true, "a real timeout is useful evidence, not a syntax error");
  for (const [device, command] of [
    ["client", "whoami"], ["client", "help"], ["client", "Get-Service DNS"],
    ["client", "nslookup portal.lab.test; anything"], ["client", "curl https://portal.lab.test"],
    ["server", "Get-Service Unknown"], ["server", "Get-DhcpServerv4OptionValue nonsense"],
  ] as const) {
    assert.equal(runSimulationDiagnosticResult(state, device, command).observed, false, command);
  }
});

test("unsupported diagnostics and inherited function names cannot pass the model evidence gate", async () => {
  for (const [name, args] of [
    ["run_diagnostic", { device: "client", command: "whoami" }],
    ["run_diagnostic", { device: "client", command: "help" }],
    ["run_diagnostic", { device: "client", command: "Get-Service DNS" }],
    ["toString", {}],
  ] as const) {
    await cloud(async () => {
      const initial = systemSessions.create("healthy");
      const result = await (await ask(initial.sessionId, 0)).json();
      assert.equal(result.source, "local");
      const { evidence } = agentRecords(initial.sessionId)[0];
      assert.equal(evidence.failedAttempt?.reason, "missing-evidence");
      assert.equal(evidence.failedAttempt?.trace.find((entry) => entry.callId === "not-observed")?.status, "error");
    }, [call(name, args, "not-observed"), call("search_knowledge", { query: "dns" }, "knowledge"), answer]);
  }
});

test("an unrelated storage inspection cannot substitute for DNS/network evidence during recheck", async () => cloud(async () => {
  const initial = systemSessions.create("healthy");
  const result = await (await ask(initial.sessionId, 0)).json();
  assert.equal(result.source, "local");
  assert.equal(agentRecords(initial.sessionId)[0].evidence.fallbackReason, "missing-evidence");
}, [call("inspect_system", { area: "storage" }, "unrelated"), call("search_knowledge", { query: "dns" }, "knowledge"), answer]));

test("ordinary DNS diagnosis also observes name and IP controls and records model-selected evidence separately", async () => cloud(async () => {
  const initial = systemSessions.create("dns-stopped");
  const response = await agentPost(request({ sessionId: initial.sessionId, device: "client", purpose: "diagnose", expectedRevision: 0,
    history: [{ role: "user", content: "Không mở được portal.lab.test; kiểm tra và hướng dẫn xác nhận sau sửa." }] }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.source, "openai");
  assert.equal(result.verification.assessment.code, "dns-service");
  assert.equal(result.verification.checks.find((entry: { id: string }) => entry.id === "http-ip").passed, true);
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.purpose, "diagnose");
  assert.equal(evidence.verification?.protocol, "dns-portal-v2");
  assert.equal(evidence.trace.filter((entry) => entry.origin === "verification").length, 5);
  assert.ok(evidence.trace.some((entry) => entry.origin === "agent" && entry.tool === "inspect_service"));
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
}, validOutputs));

test("DNS diagnosis rejects unrelated knowledge even when a state tool was called", async () => cloud(async () => {
  const initial = systemSessions.create("dns-stopped");
  const result = await (await ask(initial.sessionId, 0)).json();
  assert.equal(result.source, "local");
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.fallbackReason, "missing-evidence");
  assert.equal(evidence.failedAttempt?.trace.find((entry) => entry.callId === "unrelated-notes")?.status, "ok");
  assert.equal(evidence.verification?.assessment.code, "dns-service");
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
}, [call("inspect_service", { service: "dns" }, "inspect"), call("search_knowledge", { query: "storage dung lượng" }, "unrelated-notes"), answer]));

test("failure of the model provider preserves the failed trace and falls back without calling its local answer AI", async () => cloud(async () => {
  const initial = systemSessions.create("dns-stopped");
  const result = await (await ask(initial.sessionId, 0)).json();
  assert.equal(result.source, "local");
  assert.equal(result.verification.assessment.code, "dns-service");
  assert.match(result.message, /không phải mô hình AI/);
  const { evidence } = agentRecords(initial.sessionId)[0];
  assert.equal(evidence.fallback, true);
  assert.equal(evidence.fallbackReason, "upstream-unavailable");
  assert.equal(evidence.failedAttempt?.model, "mock-verification-model");
  assert.equal(evidence.failedAttempt?.trace.filter((entry) => entry.origin === "verification").length, 5);
  assert.equal(evidence.model, null);
}, [], () => { throw new Error("provider-offline"); }));
