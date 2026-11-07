import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { dnsGuideCopy, dnsGuideMachine, getDnsGuideFeedback, type DnsGuideEvent, type DnsGuideStep } from "../src/lib/system-guide-machine";
import { applySimulationAction, createSimulation, runSimulationDiagnostic, type DeviceId, type Simulation } from "../src/lib/system-simulator";

function diagnostic(state: Simulation, command: string, device: DeviceId = "client"): DnsGuideEvent {
  return { type: "DIAGNOSTIC", device, command, output: runSimulationDiagnostic(state, device, command) };
}

test("DNS guidance state machine only advances after the learner performs the expected checks", () => {
  const actor = createActor(dnsGuideMachine).start();
  let state = createSimulation("dns-stopped");
  assert.equal(actor.getSnapshot().value, "idle");
  actor.send({ type: "START" });
  assert.equal(actor.getSnapshot().value, "checkingIp");
  actor.send(diagnostic(state, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingIp");
  actor.send(diagnostic(state, "ping 192.168.10.10"));
  assert.equal(actor.getSnapshot().value, "checkingDns");
  actor.send(diagnostic(state, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingService");
  actor.send({ type: "DNS_STARTED" });
  assert.equal(actor.getSnapshot().value, "checkingService");
  actor.send(diagnostic(state, "Get-Service DNS", "server"));
  assert.equal(actor.getSnapshot().value, "repairingDns");
  state = applySimulationAction(state, { type: "service.toggle", service: "dns", running: true }).state;
  actor.send({ type: "DNS_STARTED" });
  assert.equal(actor.getSnapshot().value, "verifyingDns");
  actor.send(diagnostic(state, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingHttp");
  actor.send(diagnostic(createSimulation("iis-site"), "curl http://portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingHttp");
  actor.send(diagnostic(state, "curl http://portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "complete");
  actor.send({ type: "STOP" });
  assert.equal(actor.getSnapshot().value, "idle");
  actor.stop();
});

test("failed connectivity checks do not move the guide into DNS repair", () => {
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  for (const preset of ["network-link", "network-disabled", "network-subnet", "dhcp-stopped"]) {
    const event = diagnostic(createSimulation(preset), "ping 192.168.10.10");
    actor.send(event);
    assert.equal(actor.getSnapshot().value, "checkingIp");
    assert.match(getDnsGuideFeedback("checkingIp", event) ?? "", /Ping chưa thành công/);
  }
  actor.send(diagnostic(createSimulation("dns-stopped"), "  PING   192.168.10.10  "));
  assert.equal(actor.getSnapshot().value, "checkingDns");
  actor.stop();
});

test("the guide does not diagnose a stopped service from a wrong DNS server or bad record", () => {
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  actor.send(diagnostic(createSimulation(), "ping 192.168.10.10"));
  const wrongServer = diagnostic(createSimulation("dhcp-options"), "nslookup portal.lab.test");
  actor.send(wrongServer);
  assert.equal(actor.getSnapshot().value, "checkingDns");
  assert.notEqual(getDnsGuideFeedback("checkingDns", wrongServer), null);

  const wrongRecord = diagnostic(createSimulation("dns-record"), "nslookup portal.lab.test");
  actor.send(wrongRecord);
  assert.equal(actor.getSnapshot().value, "checkingDns");

  const missingRecord = createSimulation();
  missingRecord.dns.record = null;
  actor.send(diagnostic(missingRecord, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingDns");
  actor.stop();
});

test("DNS checks that are already healthy skip unnecessary service changes", () => {
  const state = createSimulation();
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  actor.send(diagnostic(state, "ping 192.168.10.10"));
  actor.send(diagnostic(state, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingHttp");
  actor.stop();
});

test("a DNS timeout requires service evidence from SRV-01 before repair", () => {
  const state = createSimulation("dns-stopped");
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  actor.send(diagnostic(state, "ping 192.168.10.10"));
  actor.send(diagnostic(state, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingService");
  const wrongDevice = diagnostic(state, "Get-Service DNS");
  actor.send(wrongDevice);
  assert.equal(actor.getSnapshot().value, "checkingService");
  assert.match(getDnsGuideFeedback("checkingService", wrongDevice) ?? "", /Chọn SRV-01/);
  const wrongCommand = diagnostic(state, "Get-Service DHCPServer", "server");
  actor.send(wrongCommand);
  assert.equal(actor.getSnapshot().value, "checkingService");
  assert.match(getDnsGuideFeedback("checkingService", wrongCommand) ?? "", /Get-Service DNS trên SRV-01/);
  for (const output of [
    "Stopped",
    "Name          Status       Startup Type\nDHCPServer    Stopped  Automatic",
    "Name          Status       Startup Type\nDNS           Starting  Automatic",
    "Name          Status       Startup Type\nDNS           Not installed  —",
  ]) {
    const event: DnsGuideEvent = { type: "DIAGNOSTIC", device: "server", command: "Get-Service DNS", output };
    actor.send(event);
    assert.equal(actor.getSnapshot().value, "checkingService");
    assert.match(getDnsGuideFeedback("checkingService", event) ?? "", /Chưa xác nhận được trạng thái DNS/);
  }
  const accepted = diagnostic(state, "  GET-SERVICE   DNS  ", "server");
  assert.equal(getDnsGuideFeedback("checkingService", accepted), null);
  actor.send(accepted);
  assert.equal(actor.getSnapshot().value, "repairingDns");
  actor.stop();
});

test("a running DNS service skips repair and requires fresh client verification", () => {
  const stopped = createSimulation("dns-stopped");
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  actor.send(diagnostic(stopped, "ping 192.168.10.10"));
  actor.send(diagnostic(stopped, "nslookup portal.lab.test"));
  const running = diagnostic(createSimulation(), "Get-Service DNS", "server");
  assert.equal(getDnsGuideFeedback("checkingService", running), null);
  actor.send(running);
  assert.equal(actor.getSnapshot().value, "verifyingDns");
  actor.send(diagnostic(stopped, "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "verifyingDns");
  actor.send(diagnostic(createSimulation(), "nslookup portal.lab.test", "server"));
  assert.equal(actor.getSnapshot().value, "verifyingDns");
  actor.send(diagnostic(createSimulation(), "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingHttp");
  assert.match(dnsGuideCopy.verifyingDns.text, /Không kết luận dịch vụ dừng chỉ từ timeout/);
  actor.stop();
});

test("DNS command metadata selects the device that supplies the required evidence", () => {
  assert.equal(dnsGuideCopy.checkingService.command, "Get-Service DNS");
  assert.equal(dnsGuideCopy.checkingService.device, "server");
  for (const step of ["checkingIp", "checkingDns", "verifyingDns", "checkingHttp"] as const) {
    assert.equal(dnsGuideCopy[step].device, "client");
  }
});

test("DNS verification requires the expected name and correct address before HTTP", () => {
  const stopped = createSimulation("dns-stopped");
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  actor.send(diagnostic(stopped, "ping 192.168.10.10"));
  actor.send(diagnostic(stopped, "nslookup portal.lab.test"));
  actor.send(diagnostic(stopped, "Get-Service DNS", "server"));
  actor.send({ type: "DNS_STARTED" });
  for (const state of [stopped, createSimulation("dns-record"), createSimulation("dhcp-options")]) {
    const event = diagnostic(state, "nslookup portal.lab.test");
    actor.send(event);
    assert.equal(actor.getSnapshot().value, "verifyingDns");
    assert.notEqual(getDnsGuideFeedback("verifyingDns", event), null);
  }
  actor.send({ type: "DIAGNOSTIC", device: "client", command: "nslookup portal.lab.test", output: "Server: 192.168.10.10\nAddress: 192.168.10.10" });
  assert.equal(actor.getSnapshot().value, "verifyingDns");
  actor.send(diagnostic(createSimulation(), "nslookup portal.lab.test"));
  assert.equal(actor.getSnapshot().value, "checkingHttp");
  actor.stop();
});

test("server diagnostics cannot replace client-side evidence at any command step", () => {
  const state = createSimulation("dns-stopped");
  const actor = createActor(dnsGuideMachine).start();
  actor.send({ type: "START" });
  const steps: Array<{ step: DnsGuideStep; state: Simulation; command: string }> = [
    { step: "checkingIp", state, command: "ping 192.168.10.10" },
    { step: "checkingDns", state, command: "nslookup portal.lab.test" },
    { step: "verifyingDns", state: createSimulation(), command: "nslookup portal.lab.test" },
    { step: "checkingHttp", state: createSimulation(), command: "curl http://portal.lab.test" },
  ];
  for (const entry of steps) {
    assert.equal(actor.getSnapshot().value, entry.step);
    const event = diagnostic(entry.state, entry.command, "server");
    actor.send(event);
    assert.equal(actor.getSnapshot().value, entry.step);
    assert.match(getDnsGuideFeedback(entry.step, event) ?? "", /Chọn CLIENT-01/);
    const accepted = diagnostic(entry.state, entry.command);
    assert.equal(getDnsGuideFeedback(entry.step, accepted), null);
    actor.send(accepted);
    if (actor.getSnapshot().value === "checkingService") {
      actor.send(diagnostic(state, "Get-Service DNS", "server"));
      actor.send({ type: "DNS_STARTED" });
    }
  }
  assert.equal(actor.getSnapshot().value, "complete");
  actor.stop();
});

test("guide feedback explains unrelated commands and unsuccessful HTTP checks", () => {
  const state = createSimulation();
  assert.match(getDnsGuideFeedback("checkingIp", diagnostic(state, "ipconfig")) ?? "", /Bước này cần chạy ping/);
  assert.match(getDnsGuideFeedback("checkingHttp", diagnostic(createSimulation("iis-pool"), "curl http://portal.lab.test")) ?? "", /HTTP 200 OK/);
  assert.equal(getDnsGuideFeedback("idle", diagnostic(state, "ipconfig")), null);
  assert.equal(getDnsGuideFeedback("complete", diagnostic(state, "ipconfig")), null);
});
