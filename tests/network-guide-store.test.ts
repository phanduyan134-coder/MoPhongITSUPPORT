import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Network } from "../src/lib/engine";
import { getNetworkGuideStep, networkCheckCommands } from "../src/lib/network-guide";
import { useLab } from "../src/lib/store";

beforeEach(() => {
  const s = useLab.getState();
  s.stopGuidance();
  s.setGuidanceMode("windows");
  s.newSession("installed");
});

function observeAll() {
  for (const command of networkCheckCommands) useLab.getState().command(command);
  assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands]);
}

function applyNetwork(patch: Partial<Pick<Network, "ipAddress" | "gateway" | "dns" | "dhcpEnabled">>) {
  const s = useLab.getState();
  const { ipAddress, gateway, dns, dhcpEnabled } = s.pc.network;
  s.applyNetwork({ ipAddress, gateway, dns, dhcpEnabled, ...patch });
}

function guideId() {
  const { pc, networkChecks } = useLab.getState();
  return getNetworkGuideStep(pc, networkChecks).id;
}

test("commands record normalized diagnostics with guidance off and ignore unsupported commands", () => {
  const s = useLab.getState();
  assert.equal(s.guidance.enabled, false);
  s.command("  IPCONFIG   /ALL  ");
  s.command("IPCONFIG /all");
  s.command("  PING  192.168.1.1 ");
  for (const value of ["ipconfig", "ping 1.1.1.1", "whoami", "ping 8.8.8.8 && whoami"]) s.command(value);
  assert.deepEqual(useLab.getState().networkChecks, ["ipconfig /all", "ping 192.168.1.1"]);
  assert.equal(useLab.getState().guidance.enabled, false);
  assert.equal(guideId(), "network-lan");
});

test("diagnostics cannot be recorded before Windows starts", () => {
  const s = useLab.getState();
  s.newSession("blank");
  s.command("ipconfig /all");
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.match(useLab.getState().terminal.at(-1)?.output || "", /chưa sẵn sàng/);
  s.enterBios();
  s.command("ping 192.168.1.1");
  assert.deepEqual(useLab.getState().networkChecks, []);
  s.setUSBConnected(true);
  s.bootFrom("USB Drive");
  s.command("nslookup example.com");
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.equal(guideId(), "network-no-windows");
});

test("IP, gateway, DNS and DHCP changes clear observations while identical applies retain them", () => {
  for (const patch of [
    { ipAddress: "192.168.1.60" },
    { gateway: "192.168.1.254" },
    { dns: "1.1.1.1" },
    { dhcpEnabled: true },
  ]) {
    useLab.getState().newSession("installed");
    observeAll();
    applyNetwork(patch);
    assert.deepEqual(useLab.getState().networkChecks, [], JSON.stringify(patch));
    assert.equal(guideId(), "network-inspect");
    observeAll();
    applyNetwork({});
    assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands]);
  }
  const s = useLab.getState();
  s.setDHCPServer(false);
  assert.deepEqual(useLab.getState().networkChecks, []);
  observeAll();
  s.setDHCPServer(false);
  assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands]);
  s.setDHCPServer(true);
  assert.deepEqual(useLab.getState().networkChecks, []);
});

test("returning from configuration B to A never revives evidence collected under A", () => {
  observeAll();
  assert.equal(guideId(), "network-complete");
  applyNetwork({ dns: "192.168.1.254" });
  assert.deepEqual(useLab.getState().networkChecks, []);
  useLab.getState().command("ipconfig /all");
  assert.equal(guideId(), "network-dns");
  applyNetwork({ dns: "192.168.1.1" });
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.equal(guideId(), "network-inspect");
  useLab.getState().command("ipconfig /all");
  assert.equal(guideId(), "network-router");
});

test("reboots and explicit SSD boots discard observations even when Windows stays the final power state", () => {
  const s = useLab.getState();
  observeAll();
  s.reboot();
  assert.equal(useLab.getState().pc.power, "desktop");
  assert.deepEqual(useLab.getState().networkChecks, []);
  observeAll();
  s.bootFrom("NVMe SSD");
  assert.equal(useLab.getState().pc.power, "desktop");
  assert.deepEqual(useLab.getState().networkChecks, []);
  observeAll();
  s.powerOff();
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.equal(guideId(), "network-start-windows");
});

test("view and guidance controls leave the machine unchanged and mode switches retain Windows intent", () => {
  const s = useLab.getState();
  observeAll();
  const before = useLab.getState();
  s.startGuidance();
  s.acceptGuidedReinstall();
  const accepted = useLab.getState().guidance;
  s.setGuidanceMode("network");
  s.setTab("terminal");
  s.setGuidanceMode("windows");
  assert.equal(useLab.getState().guidance, accepted);
  assert.equal(useLab.getState().guidance.reinstallAccepted, true);
  assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands]);
  s.stopGuidance();
  s.startGuidance();
  const after = useLab.getState();
  assert.equal(after.pc, before.pc);
  assert.equal(after.logs, before.logs);
  assert.equal(after.terminal, before.terminal);
  assert.equal(after.revision, before.revision);
  assert.equal(after.session, before.session);
  assert.deepEqual(after.networkChecks, before.networkChecks);
});

test("new sessions clear network observations but keep the selected guidance mode", () => {
  const s = useLab.getState();
  s.startGuidance();
  s.setGuidanceMode("network");
  observeAll();
  s.newSession("blank");
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.deepEqual(useLab.getState().terminal, []);
  assert.deepEqual(useLab.getState().logs, []);
  assert.equal(useLab.getState().guidanceMode, "network");
  assert.equal(useLab.getState().guidance.enabled, true);
  assert.equal(guideId(), "network-no-windows");
  s.newSession("installed");
  assert.equal(useLab.getState().guidanceMode, "network");
  assert.equal(guideId(), "network-inspect");
});

test("DHCP release and renew invalidate only observations from a changed network configuration", () => {
  const s = useLab.getState();
  applyNetwork({ dhcpEnabled: true });
  observeAll();
  s.command("ipconfig /renew");
  assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands], "renew with identical values keeps evidence");
  s.command("ipconfig /release");
  assert.equal(useLab.getState().pc.network.ipAddress, "0.0.0.0");
  assert.deepEqual(useLab.getState().networkChecks, []);
  s.command("ipconfig /all");
  assert.equal(guideId(), "network-renew");
  s.command("ipconfig /renew");
  assert.equal(useLab.getState().pc.network.ipAddress, "192.168.1.50");
  assert.deepEqual(useLab.getState().networkChecks, []);
  assert.equal(guideId(), "network-inspect");
});

test("clearing CMD output preserves observations for the unchanged current network", () => {
  const s = useLab.getState();
  observeAll();
  assert.ok(useLab.getState().terminal.length > 0);
  s.command("cls");
  assert.deepEqual(useLab.getState().terminal, []);
  assert.deepEqual(useLab.getState().networkChecks, [...networkCheckCommands]);
  assert.equal(guideId(), "network-complete");
});
