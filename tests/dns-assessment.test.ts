import assert from "node:assert/strict";
import test from "node:test";
import {
  applySimulationAction,
  createSimulation,
  runSimulationDiagnosticResult,
  type Simulation,
} from "../src/lib/system-simulator";
import { describeDnsVerification, verifyDnsPortal } from "../src/lib/system-verification";

function verify(state: Simulation) {
  return verifyDnsPortal(state.revision, state.server.ip,
    (device, command) => runSimulationDiagnosticResult(state, device, command));
}
function check(result: ReturnType<typeof verify>, id: string) {
  const observation = result.checks.find((entry) => entry.id === id);
  assert.ok(observation, `Missing ${id} observation`);
  return observation;
}

test("DNS stop leaves IP HTTP available and is diagnosed using server and client evidence", () => {
  const state = createSimulation("dns-stopped");
  const before = structuredClone(state);
  const result = verify(state);
  assert.equal(check(result, "network").passed, true);
  assert.equal(check(result, "dns-service").passed, false);
  assert.equal(check(result, "dns-answer").passed, false);
  assert.equal(check(result, "http").passed, false);
  assert.equal(check(result, "http-ip").passed, true);
  assert.equal(result.assessment.code, "dns-service");
  assert.match(result.assessment.summary, /website qua IP vẫn hoạt động/);
  assert.match(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS/);
  assert.equal(result.status, "failed");
  assert.deepEqual(state, before, "assessment must not silently repair the service");
});

test("a working explicit resolver does not conceal an incorrect default client resolver", () => {
  const initial = createSimulation("healthy");
  const { ip, prefix, gateway, dhcp } = initial.client;
  const state = applySimulationAction(initial, {
    type: "client.configure", config: { ip, prefix, gateway, dhcp, dns: "192.168.10.254" },
  }).state;
  const explicit = runSimulationDiagnosticResult(state, "client", `nslookup portal.lab.test ${state.server.ip}`);
  assert.equal(explicit.dnsTrace?.answerIp, state.server.ip);
  const result = verify(state);
  assert.equal(result.assessment.code, "dns-resolution");
  assert.equal(check(result, "dns-service").passed, true);
  assert.equal(check(result, "dns-answer").passed, false);
  assert.equal(check(result, "http-ip").passed, true);
  assert.match(result.assessment.nextSteps.join(" "), /192\.168\.10\.254/);
  assert.match(result.assessment.nextSteps.join(" "), /option DNS/);
  assert.doesNotMatch(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS/);
  assert.equal(result.status, "failed");
});

test("wrong A records remain distinguishable from stopped DNS and include the observed wrong destination", () => {
  const state = applySimulationAction(createSimulation("healthy"), {
    type: "dns.record", address: "192.168.10.99",
  }).state;
  const result = verify(state);
  assert.equal(check(result, "dns-service").passed, true);
  assert.equal(check(result, "http-ip").passed, true);
  assert.equal(result.assessment.code, "dns-resolution");
  assert.match(result.assessment.nextSteps.join(" "), /192\.168\.10\.99/);
  assert.match(result.assessment.nextSteps.join(" "), /192\.168\.10\.10/);
  assert.doesNotMatch(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS/);
});

test("NXDOMAIN is an answered query and directs the user to the missing record instead of restarting DNS", () => {
  const state = createSimulation("healthy");
  state.dns.record = null;
  const result = verify(state);
  assert.equal(check(result, "dns-service").passed, true);
  assert.equal(check(result, "http-ip").passed, true);
  assert.equal(result.assessment.code, "dns-resolution");
  assert.match(result.assessment.nextSteps.join(" "), /NXDOMAIN.*bản ghi A portal/);
  assert.doesNotMatch(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS|option DNS/);
  assert.equal(result.status, "failed");
});

test("site, pool and binding failures are assigned to HTTP while DNS observations still pass", () => {
  for (const preset of ["iis-site", "iis-pool", "iis-port"]) {
    const state = createSimulation(preset);
    const result = verify(state);
    assert.equal(check(result, "network").passed, true, preset);
    assert.equal(check(result, "dns-service").passed, true, preset);
    assert.equal(check(result, "dns-answer").passed, true, preset);
    assert.equal(check(result, "http").passed, false, preset);
    assert.equal(check(result, "http-ip").passed, false, preset);
    assert.equal(result.assessment.code, "http-service", preset);
    assert.match(result.assessment.nextSteps.join(" "), /IIS/, preset);
    assert.doesNotMatch(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS/, preset);
    if (preset === "iis-port") {
      assert.match(runSimulationDiagnosticResult(state, "client", "curl http://192.168.10.10:8080").output, /200 OK/);
      assert.equal(result.status, "failed", "nonstandard-port success cannot pass the HTTP 80 contract");
    }
  }
});

test("repairing DNS alone cannot pass a combined DNS and IIS failure", () => {
  let state = applySimulationAction(createSimulation("dns-stopped"), {
    type: "iis.configure", config: { siteRunning: false, poolRunning: true, port: 80 },
  }).state;
  const combined = verify(state);
  assert.equal(combined.assessment.code, "multiple");
  assert.equal(combined.status, "failed");
  assert.match(combined.assessment.nextSteps.join(" "), /DNS/);
  assert.match(combined.assessment.nextSteps.join(" "), /IIS/);
  state = applySimulationAction(state, { type: "service.toggle", service: "dns", running: true }).state;
  const onlyDnsRepaired = verify(state);
  assert.equal(onlyDnsRepaired.assessment.code, "http-service");
  assert.equal(onlyDnsRepaired.status, "failed");
  assert.equal(check(onlyDnsRepaired, "dns-answer").passed, true);
  assert.equal(check(onlyDnsRepaired, "http-ip").passed, false);
  assert.equal(state.iis.siteRunning, false);
  state = applySimulationAction(state, {
    type: "iis.configure", config: { siteRunning: true, poolRunning: true, port: 80 },
  }).state;
  const repaired = verify(state);
  assert.equal(repaired.status, "passed");
  assert.equal(repaired.assessment.code, "healthy");
  assert.ok(repaired.revision > onlyDnsRepaired.revision);
  assert.equal(combined.status, "failed", "old observations remain snapshots after later repairs");
});

test("lost IP connectivity is not mislabeled as a DNS outage; an independent stopped service is still reported", () => {
  let state = createSimulation("network-link");
  const network = verify(state);
  assert.equal(network.assessment.code, "network");
  assert.equal(check(network, "dns-service").passed, true);
  assert.doesNotMatch(network.assessment.nextSteps.join(" "), /bật dịch vụ DNS/);
  state = applySimulationAction(state, { type: "service.toggle", service: "dns", running: false }).state;
  const both = verify(state);
  assert.equal(both.assessment.code, "multiple");
  assert.equal(check(both, "network").passed, false);
  assert.equal(check(both, "dns-service").passed, false);
});

test("healthy verification includes five fresh same-revision observations without modifying state", () => {
  const state = createSimulation("healthy");
  const before = structuredClone(state);
  const result = verify(state);
  assert.equal(result.protocol, "dns-portal-v2");
  assert.equal(result.status, "passed");
  assert.equal(result.assessment.code, "healthy");
  assert.equal(result.checks.length, 5);
  assert.ok(result.checks.every((entry) => entry.observed && entry.passed && entry.revision === state.revision));
  assert.equal(check(result, "http-ip").command, `curl http://${state.server.ip}`);
  assert.deepEqual(state, before);
});

test("a stale or unavailable observation prevents a positive result or definitive cause assignment", () => {
  const state = createSimulation("healthy");
  for (const mode of ["stale", "unavailable", "missing-dns-trace"] as const) {
    const result = verifyDnsPortal(state.revision, state.server.ip, (device, command) => {
      const observation = runSimulationDiagnosticResult(state, device, command);
      if (mode === "stale" && command.startsWith("curl http://192.")) return { ...observation, revision: state.revision + 1 };
      if (mode === "unavailable" && command === "Get-Service DNS") return { ...observation, observed: false };
      if (mode === "missing-dns-trace" && command.startsWith("nslookup")) return { ...observation, dnsTrace: undefined };
      return observation;
    });
    assert.equal(result.status, "failed", mode);
    assert.equal(result.assessment.code, "inconclusive", mode);
    assert.doesNotMatch(result.assessment.nextSteps.join(" "), /bật dịch vụ DNS/, mode);
  }
});

test("DNS success is scoped and does not certify an unrelated Windows service", () => {
  const state = createSimulation("worker-disabled");
  const result = verify(state);
  assert.equal(state.system.workerRunning, false);
  assert.equal(result.status, "passed");
  assert.equal(result.assessment.code, "healthy");
  assert.match(describeDnsVerification(result), /chưa xác nhận toàn bộ hệ thống/);
  assert.match(result.assessment.nextSteps.join(" "), /chỉ áp dụng cho luồng DNS\/website/);
});
