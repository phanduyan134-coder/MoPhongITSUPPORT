import test from "node:test";
import assert from "node:assert/strict";
import { boot, diskVisible, hasDNS, hasInternet, initialPC, installConditions, localSupport, pcSchema, runCommand, syncNetwork, validIPv4, windowsPartitions } from "../src/lib/engine";

test("sessions start with healthy Windows or an empty powered-off PC without USB", () => {
  const pc = initialPC();
  assert.equal(pc.power, "desktop");
  assert.equal(pc.disk.osInstalled, true);
  assert.equal(pc.disk.diskTable, "GPT");
  assert.equal(hasInternet(pc.network), true);
  assert.equal(hasDNS(pc.network), true);
  assert.equal(pc.media.usbConnected, false);
  assert.equal(pcSchema.safeParse(pc).success, true);
  const blank = initialPC("blank");
  assert.equal(blank.power, "off");
  assert.equal(blank.disk.osInstalled, false);
  assert.deepEqual(blank.disk.partitions, []);
  assert.equal(blank.media.usbConnected, false);
  assert.equal(boot(blank).pc.power, "off");
  assert.match(runCommand(blank, "ipconfig").output, /chưa sẵn sàng/);
  assert.equal(pcSchema.safeParse({ ...blank, media: undefined }).success, false);
});

test("boot skips detached USB and one-time choices preserve order and input state", () => {
  const pc = initialPC();
  pc.bios.bootOrder = ["USB Drive", "NVMe SSD", "Network Boot"];
  const original = structuredClone(pc);
  assert.equal(boot(pc).pc.power, "desktop");
  assert.equal(boot(pc, "USB Drive").pc.power, "off", "unavailable one-time choices do not fall back");
  const attached = { ...pc, media: { ...pc.media, usbConnected: true } };
  assert.equal(boot(attached).pc.power, "installer");
  const once = boot(attached, "NVMe SSD");
  assert.equal(once.pc.power, "desktop");
  assert.deepEqual(once.pc.bios.bootOrder, pc.bios.bootOrder);
  assert.equal(boot(once.pc).pc.power, "installer", "next automatic boot still follows USB priority");
  assert.match(boot(attached, "Network Boot").message, /PXE/);
  assert.deepEqual(pc, original);
  assert.equal(attached.power, "desktop");
});

test("installation readiness follows firmware, VMD visibility, GPT and partitions", () => {
  let pc = initialPC("blank");
  assert.equal(diskVisible(pc), false);
  assert.equal(installConditions(pc).every((c) => c.met), false);
  assert.equal(diskVisible({ ...pc, bios: { ...pc.bios, vmdController: false } }), true);
  assert.equal(diskVisible({ ...pc, disk: { ...pc.disk, storageDriverLoaded: true } }), true);
  pc = { ...pc, bios: { ...pc.bios, secureBoot: true, tpmEnabled: true },
    disk: { ...pc.disk, storageDriverLoaded: true, diskTable: "GPT", partitions: windowsPartitions() },
    media: { ...pc.media, usbConnected: true } };
  assert.equal(installConditions(pc).every((c) => c.met), true);
  assert.equal(boot(pc, "NVMe SSD").pc.power, "off");
  pc = { ...pc, disk: { ...pc.disk, osInstalled: true, installedStorageDriver: true } };
  assert.equal(boot(pc, "NVMe SSD").pc.power, "desktop");
  assert.equal(boot({ ...pc, bios: { ...pc.bios, bootMode: "LEGACY" } }, "NVMe SSD").pc.power, "off");
  assert.equal(boot({ ...pc, disk: { ...pc.disk, installedStorageDriver: false } }, "NVMe SSD").pc.power, "off");
  const restartedSetup = boot(pc, "USB Drive").pc;
  assert.equal(restartedSetup.disk.storageDriverLoaded, false, "a new installer session must reload its temporary driver");
  assert.equal(restartedSetup.disk.installedStorageDriver, true, "the installed Windows driver persists separately");
  assert.equal(diskVisible(restartedSetup), false);
  assert.equal(boot(restartedSetup, "NVMe SSD").pc.power, "desktop");
});

test("manual DNS changes break names while preserving IP connectivity", () => {
  let pc = initialPC();
  pc = syncNetwork({ ...pc, network: { ...pc.network, dns: "192.168.1.254" } });
  assert.equal(hasInternet(pc.network), true);
  assert.equal(hasDNS(pc.network), false);
  assert.match(runCommand(pc, "ping 8.8.8.8").output, /Received = 4/);
  assert.match(runCommand(pc, "ping example.com").output, /could not find/);
  assert.match(runCommand(pc, "nslookup example.com").output, /timed out/);
  pc = runCommand(pc, "ipconfig /flushdns").pc;
  assert.equal(hasDNS(pc.network), false);
  pc = syncNetwork({ ...pc, network: { ...pc.network, dns: "1.1.1.1" } });
  assert.equal(hasDNS(pc.network), true);
  assert.match(runCommand(pc, "nslookup example.com").output, /93.184.215.14/);
  assert.match(runCommand(pc, "ping nonexistent.invalid").output, /could not find/);
});

test("DHCP renew follows router availability and release synchronizes connectivity", () => {
  const healthy = initialPC();
  assert.match(runCommand(healthy, "ipconfig /renew").output, /IP tĩnh/);
  let pc = { ...healthy, network: { ...healthy.network, dhcpEnabled: true, dhcpAvailable: false } };
  pc = runCommand(pc, "ipconfig /renew").pc;
  assert.equal(pc.network.ipAddress, "169.254.12.8");
  assert.equal(pc.network.isInternetConnected, false);
  pc = { ...pc, network: { ...pc.network, dhcpAvailable: true } };
  assert.equal(pc.network.ipAddress, "169.254.12.8");
  pc = runCommand(pc, "ipconfig /renew").pc;
  assert.equal(pc.network.ipAddress, "192.168.1.50");
  assert.equal(pc.network.isInternetConnected, true);
  assert.equal(hasDNS(pc.network), true);
  pc = runCommand(pc, "ipconfig /release").pc;
  assert.equal(pc.network.ipAddress, "0.0.0.0");
  assert.equal(pc.network.isInternetConnected, false);
});

test("manual gateway changes preserve LAN and correction restores external access", () => {
  let pc = initialPC();
  pc = syncNetwork({ ...pc, network: { ...pc.network, gateway: "192.168.1.254" } });
  assert.match(runCommand(pc, "ping 192.168.1.10").output, /Received = 4/);
  assert.match(runCommand(pc, "ping 8.8.8.8").output, /100% loss/);
  assert.equal(pc.network.isInternetConnected, false);
  pc = syncNetwork({ ...pc, network: { ...pc.network, gateway: "192.168.1.1" } });
  assert.equal(pc.network.isInternetConnected, true);
  assert.match(runCommand(pc, "ping 8.8.8.8").output, /Received = 4/);
});

test("invalid, reserved and arbitrary addresses do not produce invented successes", () => {
  for (const ip of ["999.1.2.3", "1.2.3", "01.2.3.4", "1.2.3.-1", "1.2.3.4.5"]) assert.equal(validIPv4(ip), false);
  const pc = initialPC();
  for (const ip of ["192.168.1.1", "192.168.1.10", "192.168.1.255"]) assert.equal(hasInternet({ ...pc.network, ipAddress: ip }), false);
  assert.match(runCommand(pc, "ping 192.168.1.254").output, /100% loss/);
  assert.match(runCommand(pc, "ping 8.8.8.8 && whoami").output, /không phải lệnh/);
});

test("local support explains the observed network and boot state", () => {
  const pc = initialPC();
  assert.match(localSupport(pc, "Phân tích trạng thái máy"), /kết nối IP và phân giải tên đều hoạt động/);
  assert.match(localSupport({ ...pc, network: { ...pc.network, dns: "192.168.1.254" } }, "DNS"), /DNS 192\.168\.1\.254/);
  assert.match(localSupport({ ...pc, network: { ...pc.network, gateway: "192.168.1.254" } }, "gateway"), /gateway 192\.168\.1\.254/);
  assert.match(localSupport(initialPC("blank"), "boot"), /USB cài Windows chưa cắm/);
  assert.match(localSupport(initialPC("blank"), "ipconfig"), /Windows chưa chạy/);
});
