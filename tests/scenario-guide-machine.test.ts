import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { getScenarioGuideStep, scenarioGuideMachine, scenarioGuides, type ScenarioGuideId } from "../src/lib/scenario-guide-machine";
import { applySimulationAction, createSimulation, runSimulationDiagnostic, type DeviceId, type Simulation } from "../src/lib/system-simulator";

function startGuide(guideId: ScenarioGuideId) {
  const actor = createActor(scenarioGuideMachine).start();
  actor.send({ type: "START", guideId });
  return actor;
}

type GuideActor = ReturnType<typeof startGuide>;

function diagnostic(actor: GuideActor, state: Simulation, command: string, device: DeviceId = "client") {
  actor.send({ type: "DIAGNOSTIC", device, command, output: runSimulationDiagnostic(state, device, command), state });
}

function changed(actor: GuideActor, state: Simulation) {
  actor.send({ type: "STATE_CHANGED", state });
}

function assertStep(actor: GuideActor, id: string) {
  assert.equal(actor.getSnapshot().value, "active");
  assert.equal(getScenarioGuideStep(actor.getSnapshot().context)?.id, id);
}

test("four guided scenarios expose distinct presets, explicit targets and beginner explanations", () => {
  const ids = new Set<string>();
  for (const guide of Object.values(scenarioGuides)) {
    const state = createSimulation(guide.presetId);
    guide.steps.forEach((step, index) => {
      assert.ok(!ids.has(step.id));
      ids.add(step.id);
      assert.ok(step.title.startsWith(`Bước ${index + 1}/${guide.steps.length}`));
      assert.ok(step.text && step.why && step.expected && step.label);
      assert.ok(Boolean(step.command) !== Boolean(step.target));
      if (step.command) {
        assert.ok(step.device);
        assert.doesNotMatch(runSimulationDiagnostic(state, step.device!, step.command), /Lệnh chưa được hỗ trợ/);
      }
    });
  }
});

test("DHCP guidance requires service restoration, client renew and fresh client verification", () => {
  const actor = startGuide("dhcp");
  let state = createSimulation("dhcp-stopped");
  diagnostic(actor, state, "ipconfig /all");
  assertStep(actor, "dhcp-inspect-service");
  diagnostic(actor, state, "Get-Service DHCPServer", "server");
  assertStep(actor, "dhcp-start-service");
  changed(actor, state);
  assertStep(actor, "dhcp-start-service");
  state = applySimulationAction(state, { type: "service.toggle", service: "dhcp", running: true }).state;
  changed(actor, state);
  assertStep(actor, "dhcp-renew-client");
  changed(actor, state);
  assertStep(actor, "dhcp-renew-client");
  state = applySimulationAction(state, { type: "client.renew" }).state;
  changed(actor, state);
  assertStep(actor, "dhcp-verify-ip");
  changed(actor, state);
  assertStep(actor, "dhcp-verify-ip");
  diagnostic(actor, state, "ipconfig /all");
  assertStep(actor, "dhcp-verify-dns");
  diagnostic(actor, state, "nslookup portal.lab.test");
  assert.equal(actor.getSnapshot().value, "complete");
  assert.equal(actor.getSnapshot().context.feedback, "");
  actor.stop();
});

test("DHCP rejects wrong-device observations and cannot treat static IPv4 as a renewed lease", () => {
  const actor = startGuide("dhcp");
  let state = createSimulation("dhcp-stopped");
  diagnostic(actor, state, "ipconfig /all", "server");
  assertStep(actor, "dhcp-inspect-ip");
  assert.match(actor.getSnapshot().context.feedback, /Chọn CLIENT-01/);
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "Get-Service DHCPServer");
  assertStep(actor, "dhcp-inspect-service");
  assert.match(actor.getSnapshot().context.feedback, /Chọn SRV-01/);
  diagnostic(actor, state, "Get-Service DHCPServer", "server");
  state = applySimulationAction(state, { type: "service.toggle", service: "dhcp", running: true }).state;
  changed(actor, state);
  state = applySimulationAction(state, { type: "client.configure", config: {
    ip: "192.168.10.100", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10", dhcp: false,
  } }).state;
  changed(actor, state);
  assertStep(actor, "dhcp-renew-client");
  diagnostic(actor, state, "ipconfig /all");
  assertStep(actor, "dhcp-renew-client");
  actor.stop();
});

test("DHCP final verification rejects stale leases and a new DNS fault", () => {
  const actor = startGuide("dhcp");
  const state = createSimulation();
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "Get-Service DHCPServer", "server");
  changed(actor, state);
  changed(actor, state);
  assertStep(actor, "dhcp-verify-ip");
  const expired = structuredClone(state);
  expired.simulatedTime = expired.dhcp.lease!.expiresAt;
  diagnostic(actor, expired, "ipconfig /all");
  assertStep(actor, "dhcp-verify-ip");
  diagnostic(actor, state, "ipconfig /all");
  const brokenDns = applySimulationAction(state, { type: "service.toggle", service: "dns", running: false }).state;
  diagnostic(actor, brokenDns, "nslookup portal.lab.test");
  assertStep(actor, "dhcp-verify-dns");
  diagnostic(actor, state, "nslookup portal.lab.test");
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("IIS guidance observes HTTP 503 and requires applied pool state then HTTP 200", () => {
  const actor = startGuide("iis");
  let state = createSimulation("iis-pool");
  diagnostic(actor, state, "nslookup portal.lab.test");
  diagnostic(actor, state, "curl http://portal.lab.test");
  assertStep(actor, "iis-start-pool");
  changed(actor, state);
  assertStep(actor, "iis-start-pool");
  state = applySimulationAction(state, { type: "iis.configure", config: { ...state.iis, poolRunning: true } }).state;
  changed(actor, state);
  assertStep(actor, "iis-verify-http");
  diagnostic(actor, createSimulation("iis-pool"), "curl http://portal.lab.test");
  diagnostic(actor, state, "curl http://portal.lab.test", "server");
  assertStep(actor, "iis-verify-http");
  diagnostic(actor, state, "curl http://portal.lab.test");
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("IIS does not classify DNS failure or a refused connection as the expected pool fault", () => {
  const actor = startGuide("iis");
  diagnostic(actor, createSimulation("dns-stopped"), "nslookup portal.lab.test");
  assertStep(actor, "iis-inspect-dns");
  diagnostic(actor, createSimulation("iis-pool"), "nslookup portal.lab.test");
  diagnostic(actor, createSimulation("iis-site"), "curl http://portal.lab.test");
  assertStep(actor, "iis-inspect-http");
  actor.stop();
});

test("gateway guidance checks DHCP options, renews without static IP and rechecks from CLIENT-01", () => {
  const actor = startGuide("gateway");
  let state = createSimulation("network-gateway");
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "ping 192.168.10.10");
  assertStep(actor, "gateway-check-route");
  diagnostic(actor, state, "ping 192.168.20.10");
  assertStep(actor, "gateway-inspect-options");
  diagnostic(actor, state, "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0", "server");
  assertStep(actor, "gateway-repair");
  assert.equal(getScenarioGuideStep(actor.getSnapshot().context)?.target, "client-renew");
  changed(actor, state);
  assertStep(actor, "gateway-repair");
  state = applySimulationAction(state, { type: "client.renew" }).state;
  changed(actor, state);
  assertStep(actor, "gateway-verify-ip");
  assert.equal(state.client.dhcp, true);
  assert.equal(state.client.gateway, "192.168.10.1");
  diagnostic(actor, createSimulation("network-gateway"), "ipconfig /all");
  assertStep(actor, "gateway-verify-ip");
  diagnostic(actor, state, "ipconfig /all");
  assertStep(actor, "gateway-verify-route");
  diagnostic(actor, createSimulation("network-gateway"), "ping 192.168.20.10");
  diagnostic(actor, state, "ping 192.168.20.10", "server");
  assertStep(actor, "gateway-verify-route");
  diagnostic(actor, state, "ping 192.168.20.10");
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("gateway options check rejects wrong devices, wrong DHCP options and a static client", () => {
  const actor = startGuide("gateway");
  const state = createSimulation("network-gateway");
  const command = "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0";
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "ping 192.168.10.10");
  diagnostic(actor, state, "ping 192.168.20.10");
  diagnostic(actor, state, command);
  assertStep(actor, "gateway-inspect-options");
  assert.match(actor.getSnapshot().context.feedback, /Chọn SRV-01/);
  for (const patch of [
    { gateway: "192.168.10.254" },
    { dns: "192.168.10.254" },
    { running: false },
    { active: false },
    { start: "192.168.20.100", end: "192.168.20.120" },
  ]) {
    const broken = structuredClone(state);
    Object.assign(broken.dhcp, patch);
    diagnostic(actor, broken, command, "server");
    assertStep(actor, "gateway-inspect-options");
  }
  const staticClient = applySimulationAction(state, { type: "client.configure", config: {
    ip: "192.168.10.100", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10", dhcp: false,
  } }).state;
  diagnostic(actor, staticClient, command, "server");
  assertStep(actor, "gateway-inspect-options");
  diagnostic(actor, state, command, "server");
  assertStep(actor, "gateway-repair");
  changed(actor, staticClient);
  assertStep(actor, "gateway-repair");
  actor.stop();
});

test("gateway final verification requires a live DHCP lease and does not skip fresh commands", () => {
  const actor = startGuide("gateway");
  const state = createSimulation();
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "ping 192.168.10.10");
  diagnostic(actor, state, "ping 192.168.20.10");
  diagnostic(actor, state, "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0", "server");
  changed(actor, state);
  assertStep(actor, "gateway-verify-ip");
  changed(actor, state);
  assertStep(actor, "gateway-verify-ip");
  const expired = structuredClone(state);
  expired.simulatedTime = expired.dhcp.lease!.expiresAt;
  diagnostic(actor, expired, "ipconfig /all");
  assertStep(actor, "gateway-verify-ip");
  diagnostic(actor, state, "ipconfig /all");
  const disconnected = applySimulationAction(state, { type: "client.link", connected: false }).state;
  diagnostic(actor, disconnected, "ping 192.168.20.10");
  assertStep(actor, "gateway-verify-route");
  diagnostic(actor, state, "ping 192.168.20.10");
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("failed LAN connectivity never advances to gateway fault analysis", () => {
  const actor = startGuide("gateway");
  diagnostic(actor, createSimulation("network-gateway"), "ipconfig /all");
  for (const preset of ["network-link", "network-disabled", "network-subnet"]) {
    diagnostic(actor, createSimulation(preset), "ping 192.168.10.10");
    assertStep(actor, "gateway-check-lan");
  }
  actor.stop();
});

test("a new link fault cannot be mistaken for a gateway fault after an earlier successful LAN ping", () => {
  const actor = startGuide("gateway");
  const state = createSimulation("network-gateway");
  diagnostic(actor, state, "ipconfig /all");
  diagnostic(actor, state, "ping 192.168.10.10");
  const disconnected = applySimulationAction(state, { type: "client.link", connected: false }).state;
  diagnostic(actor, disconnected, "ping 192.168.20.10");
  assertStep(actor, "gateway-check-route");
  diagnostic(actor, state, "ping 192.168.20.10");
  assertStep(actor, "gateway-inspect-options");
  actor.stop();
});

test("disk guidance requires confirmed temporary deletion and a successful manual write probe", () => {
  const actor = startGuide("disk");
  let state = createSimulation("disk-full");
  diagnostic(actor, state, "Get-Volume", "client");
  assertStep(actor, "disk-inspect-volume");
  diagnostic(actor, state, "Get-Volume", "server");
  assertStep(actor, "disk-clean-temp");
  changed(actor, state);
  assertStep(actor, "disk-clean-temp");
  state = applySimulationAction(state, { type: "file.delete", id: "temp-cache" }).state;
  changed(actor, state);
  assertStep(actor, "disk-verify-write");
  changed(actor, state);
  assertStep(actor, "disk-verify-write");
  state = applySimulationAction(state, { type: "file.write" }).state;
  changed(actor, state);
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("a failed disk write or missing protected data cannot complete the disk walkthrough", () => {
  const actor = startGuide("disk");
  const original = createSimulation("disk-full");
  diagnostic(actor, original, "Get-Volume", "server");
  const failedWrite = applySimulationAction(original, { type: "file.write" }).state;
  changed(actor, failedWrite);
  assertStep(actor, "disk-clean-temp");
  const cleaned = applySimulationAction(original, { type: "file.delete", id: "temp-cache" }).state;
  const damaged = structuredClone(cleaned);
  damaged.system.files = damaged.system.files.filter((file) => file.id !== "business-data");
  changed(actor, damaged);
  assertStep(actor, "disk-clean-temp");
  changed(actor, cleaned);
  assertStep(actor, "disk-verify-write");
  const onlyMarker = structuredClone(cleaned);
  onlyMarker.system.files.push({ id: "write-probe", name: "Kiem-tra-ghi.dat", sizeMB: 10, protected: true });
  changed(actor, onlyMarker);
  assertStep(actor, "disk-verify-write");
  changed(actor, applySimulationAction(cleaned, { type: "file.write" }).state);
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("guide accepts already repaired state without skipping manual verification commands", () => {
  const actor = startGuide("iis");
  const state = createSimulation();
  changed(actor, state);
  assertStep(actor, "iis-inspect-dns");
  diagnostic(actor, state, "nslookup portal.lab.test");
  diagnostic(actor, state, "curl http://portal.lab.test");
  changed(actor, state);
  assertStep(actor, "iis-verify-http");
  changed(actor, state);
  assertStep(actor, "iis-verify-http");
  diagnostic(actor, state, "curl http://portal.lab.test");
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("unrelated commands and mismatched output do not advance; stop and restart clear progress", () => {
  const actor = startGuide("gateway");
  const state = createSimulation("network-gateway");
  diagnostic(actor, state, "help");
  assertStep(actor, "gateway-inspect-ip");
  actor.send({ type: "DIAGNOSTIC", device: "client", command: "ipconfig /all", output: runSimulationDiagnostic(createSimulation(), "client", "ipconfig /all"), state });
  assertStep(actor, "gateway-inspect-ip");
  assert.match(actor.getSnapshot().context.feedback, /khớp trạng thái/);
  diagnostic(actor, state, "  IPCONFIG   /ALL  ");
  assertStep(actor, "gateway-check-lan");
  actor.send({ type: "START", guideId: "disk" });
  assertStep(actor, "disk-inspect-volume");
  assert.equal(actor.getSnapshot().context.feedback, "");
  actor.send({ type: "STOP" });
  assert.equal(actor.getSnapshot().value, "idle");
  assert.deepEqual(actor.getSnapshot().context, { guideId: null, stepIndex: 0, feedback: "" });
  actor.send({ type: "START", guideId: "dhcp" });
  assertStep(actor, "dhcp-inspect-ip");
  actor.stop();
});
