import assert from "node:assert/strict";
import test from "node:test";
import { createSessionStore, readBoundedJson, SimulationSessionError, systemSessions } from "../src/lib/system-session";
import { searchSystemKnowledge } from "../src/lib/system-knowledge";
import { POST as simulationPost } from "../src/app/api/simulation/route";
import { POST as agentPost } from "../src/app/api/system-agent/route";

const request = (path: string, body: unknown) => new Request(`http://localhost:3000/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("session IDs are opaque capabilities and snapshots cannot mutate server state", () => {
  const store = createSessionStore();
  const a = store.create("healthy");
  const b = store.create("healthy");
  assert.match(a.sessionId, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.sessionId, b.sessionId);
  a.state.client.ip = "1.2.3.4";
  assert.equal(store.get(a.sessionId).state.client.ip, "192.168.10.100");
  assert.throws(() => store.get("guessed-id"), (error) => error instanceof SimulationSessionError && error.status === 404);
});

test("actions reject stale revisions with a current snapshot", () => {
  const store = createSessionStore();
  const initial = store.create();
  const updated = store.action(initial.sessionId, 0, { type: "client.link", connected: false });
  assert.equal(updated.state.revision, 1);
  assert.equal(updated.state.client.link, false);
  assert.throws(() => store.action(initial.sessionId, 0, { type: "client.link", connected: true }), (error) => {
    assert.ok(error instanceof SimulationSessionError);
    assert.equal(error.status, 409);
    assert.equal(error.snapshot?.state.revision, 1);
    return true;
  });
  assert.equal(store.get(initial.sessionId).state.client.link, false);
});

test("reset revisions are monotonic and reject actions prepared before reset", () => {
  const store = createSessionStore();
  const initial = store.create();
  store.action(initial.sessionId, 0, { type: "client.link", connected: false });
  const reset = store.reset(initial.sessionId, "dns-stopped");
  assert.equal(reset.state.revision, 2);
  assert.equal(reset.state.client.link, true);
  assert.equal(reset.state.dns.running, false);
  assert.throws(() => store.action(initial.sessionId, 1, { type: "client.link", connected: true }), (error) => error instanceof SimulationSessionError && error.status === 409);
});

test("diagnostics are read only and operate on authoritative state", () => {
  const store = createSessionStore();
  const initial = store.create("dns-stopped");
  const result = store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test");
  assert.equal(result.revision, 0);
  assert.match(result.output, /timed out|DNS|không/i);
  assert.deepEqual(store.get(initial.sessionId).state, initial.state);
});

test("session DNS traces are bound to the same authoritative snapshot as terminal output", () => {
  const store = createSessionStore();
  const initial = store.create("dns-stopped");
  const before = store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test");
  assert.equal(before.revision, 0);
  assert.equal(before.dnsTrace?.revision, 0);
  assert.equal(before.dnsTrace?.outcome, "timeout");
  assert.equal(before.dnsTrace?.reachability, "reachable");
  assert.match(before.output, /timed out/);
  assert.deepEqual(store.get(initial.sessionId).state, initial.state);

  const repaired = store.action(initial.sessionId, 0, { type: "service.toggle", service: "dns", running: true });
  const after = store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test");
  assert.equal(after.revision, repaired.state.revision);
  assert.equal(after.dnsTrace?.revision, repaired.state.revision);
  assert.equal(after.dnsTrace?.outcome, "answer");
  assert.equal(after.dnsTrace?.answerIp, "192.168.10.10");
  assert.match(after.output, /Address: 192\.168\.10\.10/);
  assert.equal(before.dnsTrace?.outcome, "timeout", "old traces remain unchanged after a repair");
  assert.deepEqual(store.get(initial.sessionId).state, repaired.state);
  if (after.dnsTrace) after.dnsTrace.answerIp = "1.2.3.4";
  assert.equal(store.diagnose(initial.sessionId, "client", "nslookup portal.lab.test").dnsTrace?.answerIp, "192.168.10.10");
  assert.equal(store.diagnose(initial.sessionId, "server", "Get-Service DNS").dnsTrace, undefined);
});

test("simulation API returns structured DNS trace only for explicit valid queries", async () => {
  const initial = systemSessions.create("dns-record");
  const diagnose = (command: string) => simulationPost(request("simulation", { operation: "diagnose", sessionId: initial.sessionId, device: "client", command }));
  const response = await diagnose("nslookup portal.lab.test");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.revision, 0);
  assert.equal(result.dnsTrace.revision, result.revision);
  assert.equal(result.dnsTrace.outcome, "answer");
  assert.equal(result.dnsTrace.answerIp, "192.168.10.99");
  assert.match(result.output, /Address: 192\.168\.10\.99/);
  const other = await (await diagnose("ping portal.lab.test")).json();
  assert.equal(other.dnsTrace, undefined);
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
});

test("bounded session memory reclaims idle sessions and refreshes valid access", () => {
  let now = 0;
  const store = createSessionStore({ ttlMs: 100, maxSessions: 1, now: () => now });
  const initial = store.create();
  assert.throws(() => store.create(), (error) => error instanceof SimulationSessionError && error.status === 503);
  now = 90;
  store.get(initial.sessionId);
  now = 150;
  assert.equal(store.get(initial.sessionId).sessionId, initial.sessionId);
  now = 251;
  assert.throws(() => store.get(initial.sessionId), (error) => error instanceof SimulationSessionError && error.status === 404);
  assert.ok(store.create().sessionId);
});

test("invalid presets do not allocate sessions", () => {
  const store = createSessionStore({ maxSessions: 1 });
  assert.throws(() => store.create("unknown"), (error) => error instanceof SimulationSessionError && error.status === 400);
  assert.ok(store.create("healthy"));
});

test("invalid domain actions return 400 and preserve the previous state", async () => {
  const initial = systemSessions.create("healthy");
  const response = await simulationPost(request("simulation", { operation: "action", sessionId: initial.sessionId, expectedRevision: 0, action: { type: "worker.configure", config: { startup: "Disabled", running: true } } }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.error);
  assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
});

test("JSON parser rejects oversized, malformed and cross-origin requests", async () => {
  await assert.rejects(readBoundedJson(new Request("http://localhost/api", { method: "POST", body: "{}".repeat(20) }), 10), (error) => error instanceof SimulationSessionError && error.status === 413);
  await assert.rejects(readBoundedJson(new Request("http://localhost/api", { method: "POST", body: "{" })), (error) => error instanceof SimulationSessionError && error.status === 400);
  await assert.rejects(readBoundedJson(new Request("http://localhost/api", { method: "POST", headers: { origin: "https://other.example" }, body: "{}" })), (error) => error instanceof SimulationSessionError && error.status === 403);
  assert.deepEqual(await readBoundedJson(new Request("http://localhost:3100/api", { method: "POST", headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" }, body: "{}" })), {});
  await assert.rejects(readBoundedJson(new Request("http://localhost:3100/api", { method: "POST", headers: { host: "127.0.0.1:3100", origin: "https://evil.example" }, body: "{}" })), (error) => error instanceof SimulationSessionError && error.status === 403);
});

test("simulation route validates actions and returns conflict snapshots", async () => {
  const initialResponse = await simulationPost(request("simulation", { operation: "create", presetId: "healthy" }));
  assert.equal(initialResponse.status, 201);
  const initial = await initialResponse.json();
  const updated = await simulationPost(request("simulation", { operation: "action", sessionId: initial.sessionId, expectedRevision: 0, action: { type: "client.link", connected: false } }));
  assert.equal(updated.status, 200);
  const conflict = await simulationPost(request("simulation", { operation: "action", sessionId: initial.sessionId, expectedRevision: 0, action: { type: "client.link", connected: true } }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).state.revision, 1);
  const invalid = await simulationPost(request("simulation", { operation: "action", sessionId: initial.sessionId, expectedRevision: 1, action: { type: "shell", command: "anything" } }));
  assert.equal(invalid.status, 400);
});

test("knowledge retrieval has grounded sources and no unrelated default results", () => {
  assert.equal(searchSystemKnowledge("nslookup dns bản ghi")[0].id, "dns");
  assert.equal(searchSystemKnowledge("ntfs share quyền")[0].id, "permissions");
  assert.equal(searchSystemKnowledge("zzzzzzzz").length, 0);
  assert.ok(searchSystemKnowledge("dhcp").every((entry) => entry.url.startsWith("https://learn.microsoft.com/")));
});

test("local assistant reports rule-based mode with diagnostic evidence and retrieval", async () => {
  const old = process.env.SUPPORTLAB_AI_ENABLED;
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  try {
    const initial = systemSessions.create("dhcp-stopped");
    const response = await agentPost(request("system-agent", { sessionId: initial.sessionId, device: "client", history: [{ role: "user", content: "Kiểm tra mạng giúp mình" }] }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, "local");
    assert.match(result.message, /quy tắc/);
    assert.match(result.message, /DHCP.*dừng/);
    assert.ok(result.trace.some((entry: { tool: string }) => entry.tool === "run_diagnostic"));
    assert.ok(result.trace.some((entry: { tool: string }) => entry.tool === "search_knowledge"));
    assert.ok(result.sources.length > 0);
    assert.equal(systemSessions.get(initial.sessionId).state.revision, 0);
    const forged = await agentPost(request("system-agent", { sessionId: initial.sessionId, device: "client", state: initial.state, history: [{ role: "user", content: "hello" }] }));
    assert.equal(forged.status, 400);
  } finally { if (old === undefined) delete process.env.SUPPORTLAB_AI_ENABLED; else process.env.SUPPORTLAB_AI_ENABLED = old; }
});

test("local assistant uses reported system symptoms even for a generic help request", async () => {
  const old = process.env.SUPPORTLAB_AI_ENABLED;
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  try {
    const initial = systemSessions.create("share-ntfs");
    const response = await agentPost(request("system-agent", { sessionId: initial.sessionId, device: "client", history: [{ role: "user", content: "Kiểm tra giúp mình" }] }));
    const result = await response.json();
    assert.equal(result.source, "local");
    assert.match(result.message, /thiếu quyền đọc NTFS/);
    assert.ok(result.trace.some((entry: { tool: string; summary: string }) => entry.tool === "inspect_system" && entry.summary.startsWith("permissions:")));
  } finally { if (old === undefined) delete process.env.SUPPORTLAB_AI_ENABLED; else process.env.SUPPORTLAB_AI_ENABLED = old; }
});

test("local assistant checks DHCP Router options and renews without forcing a static address", async () => {
  const old = process.env.SUPPORTLAB_AI_ENABLED;
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  try {
    const initial = systemSessions.create("network-gateway");
    const ask = () => agentPost(request("system-agent", { sessionId: initial.sessionId, device: "client", history: [{ role: "user", content: "Kiểm tra gateway giúp mình" }] }));
    const response = await ask();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.message, /Tùy chọn Router đã đúng; giữ DHCP.*Gia hạn DHCP/);
    assert.match(result.message, /Không chuyển sang IP tĩnh trong dải cấp DHCP/);
    assert.ok(result.trace.some((entry: { tool: string; summary: string }) => entry.tool === "run_diagnostic" && entry.summary.includes("server > Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0")));
    assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);

    const { start, end, dns, active } = initial.state.dhcp;
    const updated = systemSessions.action(initial.sessionId, 0, { type: "dhcp.configure", config: { start, end, gateway: "192.168.10.254", dns, active } });
    const wrongOption = await (await ask()).json();
    assert.match(wrongOption.message, /Tùy chọn Router hiện là 192\.168\.10\.254; sửa thành 192\.168\.10\.1 trong scope trước, rồi gia hạn DHCP/);
    assert.deepEqual(systemSessions.get(initial.sessionId).state, updated.state);
  } finally { if (old === undefined) delete process.env.SUPPORTLAB_AI_ENABLED; else process.env.SUPPORTLAB_AI_ENABLED = old; }
});

test("local storage advice separates volume evidence from authorized cache cleanup", async () => {
  const old = process.env.SUPPORTLAB_AI_ENABLED;
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  try {
    const initial = systemSessions.create("disk-full");
    const response = await agentPost(request("system-agent", { sessionId: initial.sessionId, device: "server", history: [{ role: "user", content: "Kiểm tra ổ đĩa giúp mình" }] }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.message, /Chỉ xác nhận dọn Cache-tam-lab\.tmp/);
    assert.match(result.message, /Get-Volume chỉ báo dung lượng; xem danh sách tệp riêng/);
    assert.match(result.message, /Cờ protected là rào chắn mô phỏng/);
    assert.match(result.message, /không có nghĩa.*\.tmp đều an toàn để xóa/);
    const volume = result.trace.find((entry: { tool: string; summary: string }) => entry.tool === "run_diagnostic" && entry.summary.startsWith("server > Get-Volume"));
    assert.ok(volume);
    assert.match(volume.summary, /SizeRemaining: 4 MB/);
    assert.doesNotMatch(volume.summary, /Cache-tam-lab|protected|temporary/);
    assert.ok(result.trace.some((entry: { tool: string; summary: string }) => entry.tool === "inspect_system" && entry.summary.startsWith("storage:") && entry.summary.includes("Cache-tam-lab.tmp")));
    assert.deepEqual(systemSessions.get(initial.sessionId).state, initial.state);
  } finally { if (old === undefined) delete process.env.SUPPORTLAB_AI_ENABLED; else process.env.SUPPORTLAB_AI_ENABLED = old; }
});

test("agent rejects expired or invented sessions instead of accepting client state", async () => {
  const response = await agentPost(request("system-agent", { sessionId: "A".repeat(43), device: "client", history: [{ role: "user", content: "Kiểm tra giúp mình" }] }));
  assert.equal(response.status, 404);
});

test("Responses tool loop uses server-side observations and does not send preset labels", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["SUPPORTLAB_AI_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL"] as const;
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { SUPPORTLAB_AI_ENABLED: "true", OPENAI_API_KEY: "test-not-a-real-key", OPENAI_MODEL: "test-model", OPENAI_BASE_URL: "http://mock.invalid/v1" });
  const bodies: string[] = [];
  let round = 0;
  globalThis.fetch = async (_input, init) => {
    bodies.push(String(init?.body));
    round++;
    const output = round === 1 ? [{ type: "function_call", call_id: "call-1", name: "inspect_service", arguments: JSON.stringify({ service: "dhcp" }) }]
      : round === 2 ? [{ type: "function_call", call_id: "call-2", name: "search_knowledge", arguments: JSON.stringify({ query: "dhcp service" }) }]
        : [{ type: "message", content: [{ type: "output_text", text: "DHCP đang dừng. Bật dịch vụ, gia hạn IP và kiểm tra lại." }] }];
    return new Response(JSON.stringify({ output }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const initial = systemSessions.create("dhcp-stopped");
    const response = await agentPost(request("system-agent", { sessionId: initial.sessionId, device: "client", history: [{ role: "user", content: "Vì sao không nhận được IP?" }] }));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.source, "openai");
    assert.equal(round, 3);
    assert.equal(result.trace.length, 2);
    assert.ok(result.sources.length > 0);
    const firstRequest = JSON.parse(bodies[0]);
    assert.match(firstRequest.tools.find((tool: { name: string }) => tool.name === "run_diagnostic").description, /Get-DhcpServerv4OptionValue -ScopeId 192\.168\.10\.0/);
    assert.match(firstRequest.tools.find((tool: { name: string }) => tool.name === "inspect_system").description, /protected flag is a simulator deletion safeguard/);
    for (const body of bodies) {
      assert.equal(body.includes("dhcp-stopped"), false);
      assert.equal(body.includes("presetId"), false);
      assert.equal(body.includes("Máy trạm chưa nhận địa chỉ"), false);
      assert.equal(body.includes(initial.sessionId), false);
    }
    assert.equal(systemSessions.get(initial.sessionId).state.revision, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});
