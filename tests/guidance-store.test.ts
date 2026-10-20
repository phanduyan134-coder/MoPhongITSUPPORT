import test from "node:test";
import assert from "node:assert/strict";
import { useLab } from "../src/lib/store";
import { getInstallGuideStep } from "../src/lib/install-guide";

function step() {
  const { pc, guidance } = useLab.getState();
  return getInstallGuideStep(pc, guidance).id;
}

function prepareGuidedInstaller() {
  const s = useLab.getState();
  s.stopGuidance();
  s.newSession("blank");
  s.startGuidance();
  s.setUSBConnected(true);
  s.enterBios();
  s.setBios({ secureBoot: true, tpmEnabled: true });
  s.bootFrom("USB Drive");
  s.downloadDriverPackage("intel-vmd-x64");
  s.extractDriverPackage();
  s.copyDriverToUSB();
  s.loadDriver("intel-vmd-x64");
  s.prepareDisk();
}

test("guidance activation, choices and closing do not mutate the machine or log", () => {
  const s = useLab.getState();
  s.stopGuidance();
  s.newSession("installed");
  const before = useLab.getState();
  s.startGuidance();
  assert.equal(step(), "existing-windows");
  s.acceptGuidedReinstall();
  assert.equal(step(), "connect-usb");
  s.stopGuidance();
  const after = useLab.getState();
  assert.equal(after.guidance.enabled, false);
  assert.equal(after.pc, before.pc);
  assert.equal(after.logs, before.logs);
  assert.equal(after.revision, before.revision);
  assert.equal(after.session, before.session);
});

test("only a successful install can lead guidance to installed Windows", () => {
  const s = useLab.getState();
  s.newSession("blank");
  s.startGuidance();
  s.setUSBConnected(true);
  s.bootFrom("USB Drive");
  s.install();
  assert.equal(useLab.getState().guidance.installedDuringGuide, false);
  assert.equal(useLab.getState().pc.disk.osInstalled, false);

  prepareGuidedInstaller();
  assert.equal(step(), "install-windows");
  s.install();
  assert.equal(useLab.getState().guidance.installedDuringGuide, true);
  assert.equal(step(), "boot-windows");
  s.bootFrom("NVMe SSD");
  assert.equal(step(), "disconnect-usb");
  s.setUSBConnected(false);
  assert.equal(step(), "complete");
  s.reboot();
  assert.equal(step(), "complete");
});

test("formatting and new sessions cannot retain a completed installation marker", () => {
  prepareGuidedInstaller();
  const s = useLab.getState();
  s.install();
  assert.equal(useLab.getState().guidance.installedDuringGuide, true);
  s.prepareDisk();
  assert.equal(useLab.getState().guidance.installedDuringGuide, false);
  assert.equal(step(), "install-windows");
  s.install();
  s.newSession("installed");
  assert.deepEqual(useLab.getState().guidance, { enabled: true, reinstallAccepted: false, installedDuringGuide: false });
  assert.equal(step(), "existing-windows");
  s.newSession("blank");
  assert.equal(step(), "connect-usb");
  assert.equal(useLab.getState().guidance.enabled, true);
  s.stopGuidance();
  s.newSession("installed");
  assert.equal(useLab.getState().guidance.enabled, false);
});
