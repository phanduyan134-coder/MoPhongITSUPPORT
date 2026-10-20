import test from "node:test";
import assert from "node:assert/strict";
import { initialPC, runCommand, type VirtualPC } from "../src/lib/engine";
import { getNetworkGuideStep, networkCheckCommands, normalizeNetworkCommand, recordNetworkCheck } from "../src/lib/network-guide";

test("healthy guidance progresses only after the corresponding commands are observed", () => {
  const pc = initialPC();
  let checks: string[] = [];
  const ids = ["network-inspect", "network-router", "network-lan", "network-internet", "network-name"];
  for (const [index, command] of networkCheckCommands.entries()) {
    const step = getNetworkGuideStep(pc, checks);
    assert.equal(step.id, ids[index]);
    assert.equal(step.target, "cmd-input");
    assert.equal(step.view, "terminal");
    assert.equal(step.command, command);
    assert.equal(getNetworkGuideStep(pc, checks).id, step.id);
    checks = recordNetworkCheck(pc, checks, command);
  }
  const complete = getNetworkGuideStep(pc, checks);
  assert.equal(complete.id, "network-complete");
  assert.equal(complete.target, null);
  assert.match(complete.warning || "", /không gửi lưu lượng thật/);
});

test("inspection precedes fault diagnosis and actual faults override completed checks", () => {
  const healthy = initialPC();
  const pc: VirtualPC = { ...healthy, network: { ...healthy.network, ipAddress: "10.0.0.50", gateway: "192.168.1.254", dns: "192.168.1.254" } };
  assert.equal(getNetworkGuideStep(pc, []).id, "network-inspect");
  assert.equal(getNetworkGuideStep(pc, networkCheckCommands).id, "network-ip");
  const lan = { ...pc, network: { ...pc.network, ipAddress: "192.168.1.50" } };
  assert.equal(getNetworkGuideStep(lan, networkCheckCommands).id, "network-gateway");
  const internet = { ...lan, network: { ...lan.network, gateway: "192.168.1.1" } };
  assert.equal(getNetworkGuideStep(internet, networkCheckCommands).id, "network-dns");
  const dns = { ...internet, network: { ...internet.network, dns: "1.1.1.1" } };
  assert.equal(getNetworkGuideStep(dns, ["ipconfig /all"]).id, "network-router");
});

test("DHCP failure guidance distinguishes disabled service from a lease needing renewal", () => {
  const healthy = initialPC();
  let pc: VirtualPC = { ...healthy, network: { ...healthy.network,
    dhcpEnabled: true, dhcpAvailable: false, ipAddress: "169.254.12.8", gateway: "0.0.0.0", dns: "0.0.0.0" } };
  const server = getNetworkGuideStep(pc, ["ipconfig /all"]);
  assert.equal(server.id, "network-dhcp-server");
  assert.equal(server.target, "router-dhcp");
  pc = { ...pc, network: { ...pc.network, dhcpAvailable: true } };
  const renew = getNetworkGuideStep(pc, ["ipconfig /all"]);
  assert.equal(renew.id, "network-renew");
  assert.equal(renew.command, "ipconfig /renew");
  pc = runCommand(pc, "ipconfig /renew").pc;
  assert.equal(getNetworkGuideStep(pc, []).id, "network-inspect");
  assert.equal(getNetworkGuideStep(pc, ["ipconfig /all"]).id, "network-router");
});

test("an existing valid DHCP lease keeps working while the DHCP service is stopped", () => {
  const healthy = initialPC();
  const pc = { ...healthy, network: { ...healthy.network, dhcpEnabled: true, dhcpAvailable: false } };
  const router = getNetworkGuideStep(pc, ["ipconfig /all"]);
  assert.equal(router.id, "network-router");
  assert.match(router.explanation, /địa chỉ đã cấp vẫn dùng được/);
  assert.match(router.explanation, /không cần release/);
  const complete = getNetworkGuideStep(pc, networkCheckCommands);
  assert.equal(complete.id, "network-complete");
  assert.match(complete.explanation, /DHCP trên router đang dừng/);
  assert.equal(pc.network.ipAddress, "192.168.1.50");
});

test("power gates network checks and distinguishes missing Windows from an unbooted OS", () => {
  const blank = initialPC("blank");
  const missing = getNetworkGuideStep(blank, networkCheckCommands);
  assert.equal(missing.id, "network-no-windows");
  assert.equal(missing.target, null);
  for (const power of ["off", "bios", "installer"] as const) {
    const pc = { ...initialPC(), power };
    assert.equal(getNetworkGuideStep(pc, networkCheckCommands).id, "network-start-windows");
    assert.equal(getNetworkGuideStep(pc, []).target, "boot-ssd");
    assert.deepEqual(recordNetworkCheck(pc, [], "ipconfig /all"), []);
  }
});

test("command normalization records only supported diagnostics once and never runs them", () => {
  const pc = initialPC();
  assert.equal(normalizeNetworkCommand(" \tIPCONFIG   /ALL \n"), "ipconfig /all");
  const checks = recordNetworkCheck(pc, [], " \tIPCONFIG   /ALL \n");
  assert.deepEqual(checks, ["ipconfig /all"]);
  assert.deepEqual(recordNetworkCheck(pc, checks, "IPCONFIG /ALL"), checks);
  for (const command of ["ipconfig", "ipconfig /renew", "ipconfig /release", "ping 1.1.1.1", "ping 8.8.8.8 && whoami"]) {
    assert.deepEqual(recordNetworkCheck(pc, checks, command), checks);
  }
  assert.equal(getNetworkGuideStep(pc, ["IPCONFIG   /ALL", "PING 192.168.1.1"]).id, "network-lan");
});

test("out-of-order observations skip only those commands and guidance does not mutate input", () => {
  const pc = initialPC();
  const checks = Object.freeze(["ipconfig /all", "ping 8.8.8.8"]);
  const original = structuredClone(pc);
  assert.equal(getNetworkGuideStep(pc, checks).id, "network-router");
  const next = recordNetworkCheck(pc, checks, "ping 192.168.1.1");
  assert.equal(getNetworkGuideStep(pc, next).id, "network-lan");
  const afterLAN = recordNetworkCheck(pc, next, "ping 192.168.1.10");
  assert.equal(getNetworkGuideStep(pc, afterLAN).id, "network-name");
  assert.deepEqual(checks, ["ipconfig /all", "ping 8.8.8.8"]);
  assert.deepEqual(pc, original);
  assert.notEqual(next, checks);
});
