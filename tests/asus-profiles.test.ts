import test from "node:test";
import assert from "node:assert/strict";
import { applyAsusContext, asusModels, findAsusModel, searchAsusModels } from "../src/lib/asus-profiles";
import { installationSteps } from "../src/lib/install-handbook";

test("model lookup accepts case and whitespace, never matches a different suffix or group", () => {
  assert.equal(findAsusModel(" x515ea ", "laptop")?.model, "X515EA");
  assert.equal(findAsusModel("X515EA", "desktop"), undefined);
  assert.equal(findAsusModel("X515E", "laptop"), undefined);
  assert.equal(findAsusModel("PRIME B760M-A WIFI", "motherboard"), undefined);
  assert.equal(findAsusModel("PRIME   B760M-A WIFI D4", "motherboard")?.model, "PRIME B760M-A WIFI D4");
  assert.equal(searchAsusModels("tuf", "laptop")[0]?.model, "FA506NC");
});
test("catalog distinguishes source-page checks from procedure validation", () => {
  assert.equal(new Set(asusModels.map((p) => p.model)).size, asusModels.length);
  for (const p of asusModels) {
    assert.ok(p.sources.length);
    assert.ok(p.sources.every((s) => new URL(s.url).hostname === "www.asus.com"));
    if (p.verification !== "general") assert.ok(p.procedureEvidence?.firmware && p.procedureEvidence.windowsVersion && p.procedureEvidence.scope);
    if (p.procedureEvidence === null) assert.equal(p.verification, "general");
  }
  assert.equal(findAsusModel("X515EA", "laptop")?.verification, "general");
});
test("CPU-specific guidance does not infer VMD from a catalog model", () => {
  const base = installationSteps("asus", "clean");
  const amd = applyAsusContext(base, "laptop", "FA506NC", "amd");
  assert.match(amd.find((s) => s.id === "storage")!.actions.join(" "), /không nạp driver Intel/);
  const intel = applyAsusContext(base, "laptop", "X515EA", "intel");
  assert.match(intel.find((s) => s.id === "storage")!.actions.join(" "), /một số nền tảng mới/);
  const unknown = applyAsusContext(base, "desktop", "UNKNOWN", "unknown");
  assert.match(unknown.find((s) => s.id === "storage")!.actions.join(" "), /Chưa xác định CPU/);
  assert.doesNotMatch(unknown.find((s) => s.id === "boot")!.actions.join(" "), /giữ F2/);
  const arm = applyAsusContext(base, "laptop", "UNKNOWN", "arm");
  assert.match(arm.find((s) => s.id === "usb")!.actions.join(" "), /ARM64/);
  assert.doesNotMatch(arm.find((s) => s.id === "usb")!.actions.join(" "), /Dùng Media Creation Tool/);
});
test("ASUS context leaves clean and preserve workflows separate without mutating common steps", () => {
  const base = installationSteps("asus", "preserve");
  const before = structuredClone(base);
  const result = applyAsusContext(base, "motherboard", "PRIME B760M-A WIFI D4", "intel");
  assert.equal(result.some((s) => ["usb", "partition", "boot"].includes(s.id)), false);
  assert.match(result.find((s) => s.id === "drivers")!.actions.join(" "), /revision mainboard/);
  assert.deepEqual(base, before);
});
