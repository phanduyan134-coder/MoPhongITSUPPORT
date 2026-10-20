import test from "node:test";
import assert from "node:assert/strict";
import { diskVisible, initialPC, pcSchema, storageDriverCompatible } from "../src/lib/engine";
import { driverPackages, type DriverPackageId } from "../src/lib/driver-media";
import { useLab } from "../src/lib/store";

function installer() {
  const s = useLab.getState();
  s.stopGuidance();
  s.newSession("blank");
  s.setUSBConnected(true);
  s.enterBios();
  s.setBios({ secureBoot: true, tpmEnabled: true });
  s.bootFrom("USB Drive");
  return s;
}

function copyPackage(id: DriverPackageId) {
  const s = useLab.getState();
  s.downloadDriverPackage(id);
  s.extractDriverPackage();
  s.copyDriverToUSB();
}

test("storage compatibility requires an extracted package on connected installer media", () => {
  const pc = initialPC("blank");
  const prepared = { ...pc, power: "installer" as const,
    media: { ...pc.media, usbConnected: true, driverPackages: ["intel-vmd-x64" as const, "ethernet-x64" as const] } };
  assert.equal(storageDriverCompatible(prepared, "intel-vmd-x64"), true);
  assert.equal(storageDriverCompatible(prepared, "ethernet-x64"), false);
  assert.equal(storageDriverCompatible({ ...prepared, power: "bios" }, "intel-vmd-x64"), false);
  assert.equal(storageDriverCompatible({ ...prepared, media: { ...prepared.media, usbConnected: false } }, "intel-vmd-x64"), false);
  assert.equal(storageDriverCompatible({ ...prepared, media: { ...prepared.media, driverPackages: [] } }, "intel-vmd-x64"), false);
  assert.equal(storageDriverCompatible({ ...prepared, bios: { ...prepared.bios, vmdController: false } }, "intel-vmd-x64"), false);
  assert.equal(pcSchema.safeParse(prepared).success, true);
  assert.equal(pcSchema.safeParse({ ...prepared, media: { ...prepared.media, driverPackages: ["unknown-driver"] } }).success, false);
  assert.ok(driverPackages["intel-vmd-x64"].files.some((file) => file.toLowerCase().endsWith(".inf")));
});

test("download and extraction are separate preparation stages and copying requires connected USB", () => {
  const s = useLab.getState();
  s.newSession("blank");
  const untouched = structuredClone(useLab.getState().pc);
  assert.deepEqual(useLab.getState().driverWorkspace, { packageId: null, stage: "empty" });
  s.extractDriverPackage();
  s.copyDriverToUSB();
  assert.deepEqual(useLab.getState().driverWorkspace, { packageId: null, stage: "empty" });
  s.downloadDriverPackage("intel-vmd-x64");
  assert.deepEqual(useLab.getState().driverWorkspace, { packageId: "intel-vmd-x64", stage: "downloaded" });
  s.copyDriverToUSB();
  assert.deepEqual(useLab.getState().pc.media.driverPackages, []);
  s.extractDriverPackage();
  assert.equal(useLab.getState().driverWorkspace.stage, "extracted");
  s.copyDriverToUSB();
  assert.deepEqual(useLab.getState().pc, untouched);
  s.setUSBConnected(true);
  s.copyDriverToUSB();
  s.copyDriverToUSB();
  assert.deepEqual(useLab.getState().pc.media.driverPackages, ["intel-vmd-x64"]);
  assert.equal(useLab.getState().pc.disk.storageDriverLoaded, false);
  s.downloadDriverPackage("ethernet-x64");
  assert.deepEqual(useLab.getState().driverWorkspace, { packageId: "ethernet-x64", stage: "downloaded" });
  s.copyDriverToUSB();
  assert.deepEqual(useLab.getState().pc.media.driverPackages, ["intel-vmd-x64"]);
});

test("only explicitly loading a compatible copied driver reveals the installer SSD", () => {
  const s = installer();
  s.loadDriver("intel-vmd-x64");
  assert.equal(diskVisible(useLab.getState().pc), false);
  copyPackage("ethernet-x64");
  s.loadDriver("ethernet-x64");
  assert.equal(useLab.getState().pc.disk.storageDriverLoaded, false);
  copyPackage("intel-vmd-x64");
  assert.equal(diskVisible(useLab.getState().pc), false, "copying media is not loading a driver");
  s.loadDriver("intel-vmd-x64");
  assert.equal(useLab.getState().pc.disk.storageDriverLoaded, true);
  assert.equal(diskVisible(useLab.getState().pc), true);
});

test("USB files survive power and connection changes while Setup must reload its driver", () => {
  const s = installer();
  copyPackage("intel-vmd-x64");
  s.loadDriver("intel-vmd-x64");
  s.reboot();
  assert.equal(useLab.getState().pc.power, "installer");
  assert.deepEqual(useLab.getState().pc.media.driverPackages, ["intel-vmd-x64"]);
  assert.equal(diskVisible(useLab.getState().pc), false);
  s.loadDriver("intel-vmd-x64");
  s.setUSBConnected(false);
  assert.equal(useLab.getState().pc.power, "off");
  assert.deepEqual(useLab.getState().pc.media.driverPackages, ["intel-vmd-x64"]);
  s.setUSBConnected(true);
  s.bootFrom("USB Drive");
  assert.equal(diskVisible(useLab.getState().pc), false);
  s.loadDriver("intel-vmd-x64");
  assert.equal(diskVisible(useLab.getState().pc), true);
});

test("removing USB packages and starting a new session clear only their relevant state", () => {
  const s = installer();
  copyPackage("intel-vmd-x64");
  copyPackage("ethernet-x64");
  s.removeDriverFromUSB("ethernet-x64");
  assert.deepEqual(useLab.getState().pc.media.driverPackages, ["intel-vmd-x64"]);
  s.loadDriver("intel-vmd-x64");
  s.removeDriverFromUSB("intel-vmd-x64");
  assert.equal(useLab.getState().pc.disk.storageDriverLoaded, true, "a driver loaded in memory does not depend on keeping its USB files");
  s.reboot();
  s.loadDriver("intel-vmd-x64");
  assert.equal(diskVisible(useLab.getState().pc), false);
  s.newSession("installed");
  assert.deepEqual(useLab.getState().pc.media.driverPackages, []);
  assert.deepEqual(useLab.getState().driverWorkspace, { packageId: null, stage: "empty" });
});
