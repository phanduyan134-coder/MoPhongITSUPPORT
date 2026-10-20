import test from "node:test";
import assert from "node:assert/strict";
import { boot, initialPC, windowsPartitions, type VirtualPC } from "../src/lib/engine";
import { getInstallGuideStep, type GuideContext } from "../src/lib/install-guide";

const fresh: GuideContext = { reinstallAccepted: false, installedDuringGuide: false };
const installed: GuideContext = { reinstallAccepted: false, installedDuringGuide: true };

function readyInstaller(): VirtualPC {
  const pc = initialPC("blank");
  return { ...pc, power: "installer", media: { ...pc.media, usbConnected: true },
    bios: { ...pc.bios, secureBoot: true, tpmEnabled: true },
    disk: { ...pc.disk, storageDriverLoaded: true, diskTable: "GPT", partitions: windowsPartitions() } };
}

test("blank PC guidance follows actual installation, SSD boot and USB removal", () => {
  let pc = initialPC("blank");
  assert.equal(getInstallGuideStep(pc, fresh).id, "connect-usb");
  pc = { ...pc, media: { ...pc.media, usbConnected: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "enter-bios");
  pc = { ...pc, power: "bios" };
  assert.equal(getInstallGuideStep(pc, fresh).id, "secure-boot");
  pc = { ...pc, bios: { ...pc.bios, secureBoot: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "tpm");
  pc = { ...pc, bios: { ...pc.bios, tpmEnabled: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "boot-usb");
  pc = boot(pc, "USB Drive").pc;
  assert.equal(getInstallGuideStep(pc, fresh).id, "storage-driver");
  pc = { ...pc, disk: { ...pc.disk, storageDriverLoaded: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "prepare-disk");
  pc = { ...pc, disk: { ...pc.disk, diskTable: "GPT", partitions: windowsPartitions() } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "install-windows");
  pc = { ...pc, disk: { ...pc.disk, osInstalled: true, installedStorageDriver: true } };
  assert.equal(getInstallGuideStep(pc, installed).id, "boot-windows");
  pc = boot(pc, "NVMe SSD").pc;
  assert.equal(getInstallGuideStep(pc, installed).id, "disconnect-usb");
  pc = { ...pc, media: { ...pc.media, usbConnected: false } };
  assert.equal(getInstallGuideStep(pc, installed).id, "complete");
});

test("storage guidance requires the correct USB package before pointing to Load driver", () => {
  const ready = readyInstaller();
  const pc: VirtualPC = { ...ready, disk: { ...ready.disk, storageDriverLoaded: false } };
  const original = structuredClone(pc);
  const missing = getInstallGuideStep(pc, fresh);
  assert.equal(missing.id, "storage-driver");
  assert.equal(missing.target, "prepare-driver");
  const wrong = getInstallGuideStep({ ...pc, media: { ...pc.media, driverPackages: ["ethernet-x64"] } }, fresh);
  assert.equal(wrong.id, "storage-driver");
  assert.equal(wrong.target, "prepare-driver");
  const copied: VirtualPC = { ...pc, media: { ...pc.media, driverPackages: ["ethernet-x64", "intel-vmd-x64"] } };
  const prepared = getInstallGuideStep(copied, fresh);
  assert.equal(prepared.id, "storage-driver");
  assert.equal(prepared.target, "load-driver");
  assert.match(prepared.instruction, /Browse/);
  assert.equal(getInstallGuideStep({ ...copied, disk: { ...copied.disk, storageDriverLoaded: true } }, fresh).id, "install-windows");
  assert.deepEqual(pc, original);
});

test("USB preparation and boot guidance show conditional driver advice before opening Setup", () => {
  const blank = initialPC("blank");
  const connect = getInstallGuideStep(blank, fresh);
  assert.equal(connect.id, "connect-usb");
  assert.match(connect.warning || "", /không phải mọi máy đều cần/);
  assert.match(connect.warning || "", /đúng model/);
  assert.match(connect.warning || "", /tải, giải nén và chép driver vào USB/);
  assert.match(connect.warning || "", /nạp driver là thao tác Load driver/);
  const bootable: VirtualPC = { ...blank, media: { ...blank.media, usbConnected: true },
    bios: { ...blank.bios, secureBoot: true, tpmEnabled: true } };
  const bootStep = getInstallGuideStep(bootable, fresh);
  assert.equal(bootStep.id, "boot-usb");
  assert.match(bootStep.warning || "", /không phải mọi máy đều cần/);
  assert.match(bootStep.warning || "", /trước khi cắm sang máy cần cài/);
  assert.equal(blank.media.driverPackages.length, 0);
  assert.equal(blank.disk.storageDriverLoaded, false);
});

test("existing Windows requires an explicit reinstall choice and cannot skip disk reset", () => {
  let pc = initialPC();
  const choice = getInstallGuideStep(pc, fresh);
  assert.equal(choice.id, "existing-windows");
  assert.equal(choice.target, null);
  assert.match(choice.warning || "", /xóa Windows và dữ liệu/);
  const accepted: GuideContext = { reinstallAccepted: true, installedDuringGuide: false };
  assert.equal(getInstallGuideStep(pc, accepted).id, "connect-usb");
  pc = { ...pc, media: { ...pc.media, usbConnected: true } };
  assert.equal(getInstallGuideStep(pc, accepted).id, "boot-usb");
  pc = boot(pc, "USB Drive").pc;
  assert.equal(getInstallGuideStep(pc, accepted).id, "prepare-disk");
  pc = { ...pc, disk: { ...pc.disk, osInstalled: false } };
  assert.equal(getInstallGuideStep(pc, accepted).id, "install-windows");
});

test("blank PC firmware guidance does not imply BitLocker already exists", () => {
  const blank = initialPC("blank");
  const pc = { ...blank, media: { ...blank.media, usbConnected: true } };
  const firmware = getInstallGuideStep(pc, fresh);
  assert.equal(firmware.id, "enter-bios");
  assert.doesNotMatch(firmware.warning || "", /BitLocker|Device Encryption/);
  const secureBoot = getInstallGuideStep({ ...pc, power: "bios" }, fresh);
  assert.equal(secureBoot.id, "secure-boot");
  assert.equal(secureBoot.warning, undefined);
});

test("existing Windows encryption advice remains conditional rather than asserting encryption", () => {
  const existing = initialPC();
  const choice = getInstallGuideStep(existing, fresh);
  assert.match(choice.warning || "", /nếu ổ đĩa đang bật BitLocker hoặc Device Encryption/);
  const pc: VirtualPC = { ...existing, media: { ...existing.media, usbConnected: true }, bios: { ...existing.bios, secureBoot: false } };
  const accepted = { reinstallAccepted: true, installedDuringGuide: false };
  const firmware = getInstallGuideStep(pc, accepted);
  assert.equal(firmware.id, "enter-bios");
  assert.match(firmware.warning || "", /nếu ổ đĩa đang bật BitLocker hoặc Device Encryption/);
  const secureBoot = getInstallGuideStep({ ...pc, power: "bios" }, accepted);
  assert.equal(secureBoot.id, "secure-boot");
  assert.match(secureBoot.warning || "", /nếu ổ đĩa đang bật BitLocker hoặc Device Encryption/);
});

test("firmware changes return to the relevant setting instead of advancing or completing", () => {
  let pc = readyInstaller();
  pc = { ...pc, bios: { ...pc.bios, bootMode: "LEGACY", secureBoot: false, tpmEnabled: false } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "enter-bios");
  pc = { ...pc, power: "bios" };
  assert.equal(getInstallGuideStep(pc, fresh).id, "uefi");
  pc = { ...pc, bios: { ...pc.bios, bootMode: "UEFI" } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "secure-boot");
  pc = { ...pc, bios: { ...pc.bios, secureBoot: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "tpm");
  const running = initialPC();
  assert.equal(getInstallGuideStep({ ...running, bios: { ...running.bios, secureBoot: false } }, installed).id, "enter-bios");
  assert.equal(getInstallGuideStep({ ...running, power: "bios", bios: { ...running.bios, bootMode: "LEGACY" } }, installed).id, "uefi");
});

test("restarting Setup requires its temporary VMD driver but not repartitioning", () => {
  let pc = readyInstaller();
  assert.equal(getInstallGuideStep(pc, fresh).id, "install-windows");
  pc = boot(pc, "USB Drive").pc;
  assert.equal(getInstallGuideStep(pc, fresh).id, "storage-driver");
  pc = { ...pc, disk: { ...pc.disk, storageDriverLoaded: true } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "install-windows");
  pc = { ...pc, disk: { ...pc.disk, osInstalled: true, installedStorageDriver: true } };
  pc = boot(pc, "USB Drive").pc;
  assert.equal(pc.disk.storageDriverLoaded, false);
  assert.equal(getInstallGuideStep(pc, installed).id, "boot-windows");
});

test("an already disabled VMD controller needs no Intel driver step", () => {
  const blank = initialPC("blank");
  const pc: VirtualPC = { ...blank, power: "installer", media: { ...blank.media, usbConnected: true },
    bios: { ...blank.bios, secureBoot: true, tpmEnabled: true, vmdController: false } };
  assert.equal(getInstallGuideStep(pc, fresh).id, "prepare-disk");
  const ready = { ...pc, disk: { ...pc.disk, diskTable: "GPT" as const, partitions: windowsPartitions() } };
  assert.equal(getInstallGuideStep(ready, fresh).id, "install-windows");
});

test("changing media, partitions or installed driver invalidates the matching guidance state", () => {
  const ready = readyInstaller();
  assert.equal(getInstallGuideStep({ ...ready, media: { ...ready.media, usbConnected: false } }, fresh).id, "connect-usb");
  assert.equal(getInstallGuideStep({ ...ready, disk: { ...ready.disk, partitions: [] } }, fresh).id, "prepare-disk");
  const noInstalledDriver = { ...ready, disk: { ...ready.disk, osInstalled: true, installedStorageDriver: false } };
  assert.equal(getInstallGuideStep(noInstalledDriver, installed).id, "prepare-disk");
  const noSetupDriver = { ...noInstalledDriver, disk: { ...noInstalledDriver.disk, storageDriverLoaded: false } };
  assert.equal(getInstallGuideStep(noSetupDriver, installed).id, "storage-driver");
  assert.equal(getInstallGuideStep({ ...noSetupDriver, power: "off" }, installed).id, "boot-usb");
});

test("guidance accepts out-of-order valid state without changing the machine or context", () => {
  const pc = readyInstaller();
  const original = structuredClone(pc);
  const context = { ...fresh };
  const step = getInstallGuideStep(pc, context);
  assert.equal(step.id, "install-windows");
  assert.equal(step.target, "install");
  assert.equal(step.view, "installer");
  assert.deepEqual(pc, original);
  assert.deepEqual(context, fresh);
  const completed = initialPC();
  assert.equal(getInstallGuideStep(completed, installed).id, "complete");
  assert.equal(getInstallGuideStep({ ...completed, power: "off" }, installed).id, "boot-windows");
});
