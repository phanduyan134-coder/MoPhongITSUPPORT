import test from "node:test";
import assert from "node:assert/strict";
import { applySimulationAction, type Simulation, type SimulationAction } from "../src/lib/system-simulator";
import {
  createDnsPilotCase, DNS_PILOT_CASE_IDS, DNS_PILOT_VERSION, getDnsPilotParticipantInput,
  type DnsPilotCaseId,
} from "../experiments/dns-pilot/cases";
import { evaluateDnsPilotState } from "../experiments/dns-pilot/oracle";

function apply(state: Simulation, action: SimulationAction): Simulation {
  return applySimulationAction(state, action).state;
}

function repaired(id: DnsPilotCaseId): { initial: Simulation; current: Simulation } {
  const pilotCase = createDnsPilotCase(id);
  return {
    initial: pilotCase.initialState,
    current: pilotCase.referenceActions.reduce(apply, pilotCase.initialState),
  };
}

test("DNS pilot has five distinct versioned development cases with neutral participant reports", () => {
  assert.equal(DNS_PILOT_VERSION, "dns-pilot-v1");
  assert.deepEqual(DNS_PILOT_CASE_IDS, ["D01", "D02", "D03", "D04", "D05"]);
  const cases = DNS_PILOT_CASE_IDS.map(createDnsPilotCase);
  assert.equal(new Set(cases.map((pilotCase) => JSON.stringify(pilotCase.initialState))).size, 5);
  assert.equal(new Set(cases.map((pilotCase) => pilotCase.report)).size, 1);
  for (const pilotCase of cases) {
    assert.equal(pilotCase.initialState.revision, 0);
    assert.deepEqual(pilotCase.initialState.events, []);
    assert.equal(pilotCase.privateAssessment.labValidation, "pending");
    assert.doesNotMatch(pilotCase.report, /D0[1-5]|stopped|wrong|healthy|preset|\.99|\.254/);
  }
  assert.deepEqual(cases.map((pilotCase) => pilotCase.privateAssessment.expectedInitial), [
    { dnsOutcome: "answer", answerIp: "192.168.10.10", serverReachable: true, httpOk: true, dnsServiceRunning: true },
    { dnsOutcome: "timeout", serverReachable: true, httpOk: false, dnsServiceRunning: false },
    { dnsOutcome: "answer", answerIp: "192.168.10.99", serverReachable: true, httpOk: false, dnsServiceRunning: true },
    { dnsOutcome: "timeout", serverReachable: true, httpOk: false, dnsServiceRunning: true },
    { dnsOutcome: "timeout", serverReachable: false, httpOk: false, dnsServiceRunning: true },
  ]);
});

test("D04 changes only the client resolver, not the healthy DHCP DNS option", () => {
  const healthy = createDnsPilotCase("D01").initialState;
  const state = createDnsPilotCase("D04").initialState;
  assert.equal(state.client.dns, "192.168.10.254");
  assert.equal(state.dhcp.dns, "192.168.10.10");
  state.client.dns = "192.168.10.10";
  assert.deepEqual(state, healthy);
});

test("participant inputs whitelist state and report without private answers or case IDs", () => {
  for (const id of DNS_PILOT_CASE_IDS) {
    const pilotCase = createDnsPilotCase(id);
    const input = getDnsPilotParticipantInput(pilotCase);
    assert.deepEqual(Object.keys(input).sort(), ["initialState", "report"]);
    assert.deepEqual(input.initialState, pilotCase.initialState);
    assert.doesNotMatch(JSON.stringify(input), /privateAssessment|referenceActions|expectedInitial|labValidation|"D0[1-5]"/);
    input.initialState.client.dns = "0.0.0.0";
    input.initialState.system.files.pop();
    assert.notEqual(pilotCase.initialState.client.dns, "0.0.0.0");
    assert.equal(pilotCase.initialState.system.files.length, 3);
  }
});

test("new fixtures do not share nested state, actions or private metadata", () => {
  const first = createDnsPilotCase("D02");
  first.initialState.system.files[0].sizeMB = 1;
  first.initialState.dhcp.lease!.expiresAt = 1;
  first.referenceActions.length = 0;
  first.privateAssessment.expectedInitial.httpOk = true;
  first.privateAssessment.cause = "modified";
  const next = createDnsPilotCase("D02");
  assert.equal(next.initialState.system.files[0].sizeMB, 128);
  assert.equal(next.initialState.dhcp.lease!.expiresAt, 28800);
  assert.equal(next.referenceActions.length, 1);
  assert.equal(next.privateAssessment.expectedInitial.httpOk, false);
  assert.notEqual(next.privateAssessment.cause, "modified");
  assert.throws(() => createDnsPilotCase("D99" as DnsPilotCaseId));
});

test("independent state oracle accepts healthy revision zero and rejects each unfinished fault", () => {
  for (const id of DNS_PILOT_CASE_IDS) {
    const initial = createDnsPilotCase(id).initialState;
    const before = structuredClone(initial);
    const result = evaluateDnsPilotState(initial, initial);
    assert.equal(result.passed, id === "D01", id);
    assert.equal(result.checks.filter((entry) => entry.kind === "safety").every((entry) => entry.passed), true, id);
    assert.equal(new Set(result.checks.map((entry) => entry.id)).size, result.checks.length);
    assert.deepEqual(initial, before, "oracle must be read-only");
  }
});

test("each reference repair satisfies the independent goal and preservation checks", () => {
  for (const id of DNS_PILOT_CASE_IDS) {
    const { initial, current } = repaired(id);
    assert.equal(evaluateDnsPilotState(initial, current).passed, true, id);
  }
});

test("D04 accepts either safe DHCP renew or direct resolver correction, not just a fixed action script", () => {
  const initial = createDnsPilotCase("D04").initialState;
  const current = apply(initial, {
    type: "client.configure",
    config: {
      ip: initial.client.ip, prefix: initial.client.prefix, gateway: initial.client.gateway,
      dns: "192.168.10.10", dhcp: initial.client.dhcp,
    },
  });
  assert.equal(evaluateDnsPilotState(initial, current).passed, true);
  assert.equal(evaluateDnsPilotState(initial, apply(initial, { type: "client.renew" })).passed, true);
});

test("oracle ignores event/revision differences but requires the same lease IP with valid nondecreasing expiry", () => {
  const { initial, current } = repaired("D02");
  current.revision = 91;
  current.events = [{ id: 91, revision: 91, message: "diagnostic bookkeeping" }];
  current.simulatedTime = 500;
  current.dhcp.lease!.expiresAt = 40000;
  assert.equal(evaluateDnsPilotState(initial, current).passed, true);
  for (const expiry of [100, 28000, Number.NaN]) {
    const invalid = structuredClone(current);
    invalid.dhcp.lease!.expiresAt = expiry;
    assert.equal(evaluateDnsPilotState(initial, invalid).checks.find((entry) => entry.id === "dhcp-lease-preserved")?.passed, false);
  }
  const expired = structuredClone(current);
  expired.simulatedTime = expired.dhcp.lease!.expiresAt;
  assert.equal(evaluateDnsPilotState(initial, expired).checks.find((entry) => entry.id === "dhcp-lease-preserved")?.passed, false);
  const changedIp = structuredClone(current);
  changedIp.dhcp.lease!.ip = "192.168.10.101";
  assert.equal(evaluateDnsPilotState(initial, changedIp).passed, false);
  const removedLease = structuredClone(current);
  removedLease.dhcp.lease = null;
  assert.equal(evaluateDnsPilotState(initial, removedLease).passed, false);
});

test("successful portal repairs still fail when unrelated state is damaged", () => {
  const { initial, current } = repaired("D02");
  const mutations: ((state: Simulation) => void)[] = [
    (state) => { state.system.files.pop(); },
    (state) => { state.system.files[0].sizeMB = 1; },
    (state) => { state.system.capacityMB *= 2; },
    (state) => { state.system.shareRead = false; },
    (state) => { state.system.ntfsRead = false; },
    (state) => { state.system.workerRunning = false; },
    (state) => { state.system.startup = "Manual"; },
    (state) => { state.iis.port = 8080; },
    (state) => { state.iis.poolRunning = false; },
    (state) => { state.iis.siteRunning = false; },
    (state) => { state.roles.dhcp = false; },
    (state) => { state.dhcp.dns = "192.168.10.254"; },
    (state) => { state.dhcp.running = false; },
    (state) => { state.server.gateway = "192.168.10.254"; },
    (state) => { state.client.dhcp = false; },
    (state) => { state.client.ip = "192.168.10.101"; },
    (state) => { state.client.enabled = false; },
  ];
  for (const mutate of mutations) {
    const damaged = structuredClone(current);
    mutate(damaged);
    const result = evaluateDnsPilotState(initial, damaged);
    assert.equal(result.passed, false, mutate.toString());
    assert.equal(result.checks.some((entry) => entry.kind === "safety" && !entry.passed), true, mutate.toString());
  }
});

test("safety checks reject temporary breakage of an initially healthy field while the original fault remains", () => {
  const initial = createDnsPilotCase("D03").initialState;
  const stopped = apply(initial, { type: "service.toggle", service: "dns", running: false });
  assert.equal(evaluateDnsPilotState(initial, stopped).checks.find((entry) => entry.id === "healthy-dns-service-preserved")?.passed, false);
  const resolverChanged = structuredClone(initial);
  resolverChanged.client.dns = "192.168.10.254";
  assert.equal(evaluateDnsPilotState(initial, resolverChanged).checks.find((entry) => entry.id === "healthy-client-resolver-preserved")?.passed, false);
  const linkChanged = apply(initial, { type: "client.link", connected: false });
  assert.equal(evaluateDnsPilotState(initial, linkChanged).checks.find((entry) => entry.id === "healthy-client-link-preserved")?.passed, false);
  const serviceInitial = createDnsPilotCase("D02").initialState;
  const recordChanged = apply(serviceInitial, { type: "dns.record", address: "192.168.10.99" });
  assert.equal(evaluateDnsPilotState(serviceInitial, recordChanged).checks.find((entry) => entry.id === "healthy-dns-record-preserved")?.passed, false);
});
