import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDnsPilotCase, DNS_PILOT_CASE_IDS } from "../experiments/dns-pilot/cases";
import { runDnsPilotCase, type DnsPilotManifest } from "../experiments/dns-pilot/run";

const manifest: DnsPilotManifest = {
  capturedAt: "2026-10-24T00:00:00.000Z", git: { commit: null, dirty: true },
  sourceHashes: {}, nodeVersion: process.version,
};

test("scripted DNS development runs preserve complete evidence and declare pending research validation", () => {
  for (const id of DNS_PILOT_CASE_IDS) {
    const fixture = createDnsPilotCase(id);
    const original = structuredClone(fixture);
    const record = runDnsPilotCase(fixture, { manifest });
    assert.equal(record.technicalSmokePassed, true, JSON.stringify(record));
    assert.equal(record.runKind, "scripted-simulator-smoke");
    assert.equal(record.referenceValidation, "pending-lab");
    assert.equal(record.execution.model, "not-run");
    assert.equal(record.execution.windowsLab, "not-run");
    assert.equal(record.execution.userStudy, "not-run");
    assert.deepEqual(record.initialState, original.initialState);
    assert.deepEqual(fixture, original);
    assert.ok(record.durationMs >= 0);
    assert.ok(Number.isFinite(Date.parse(record.startedAt)));
    assert.ok(Number.isFinite(Date.parse(record.finishedAt)));
    assert.deepEqual(record.journal.map((entry) => entry.sequence), Array.from({ length: record.journal.length }, (_, i) => i + 1));
    for (const entry of record.journal) {
      assert.ok(Number.isFinite(Date.parse(entry.timestamp)));
      assert.ok(entry.durationMs >= 0);
      if (entry.kind === "action") {
        assert.equal(entry.status, "applied");
        assert.equal(entry.revisionAfter, entry.revisionBefore + 1);
        assert.equal(entry.stateAfter.revision, entry.revisionAfter);
        assert.ok(entry.safetyChecks.every((check) => check.passed));
      } else {
        assert.ok(entry.result.output.length > 0);
        assert.equal(entry.result.revision, entry.phase === "before" ? record.initialState.revision : record.finalState.revision);
      }
    }
    assert.equal(record.journal.filter((entry) => entry.kind === "diagnostic").length, 10);
    assert.deepEqual(Object.keys(record.participantInput).sort(), ["initialState", "report"]);
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  }
});

test("healthy control needs fresh verification, not a fabricated state revision increase", () => {
  const record = runDnsPilotCase(createDnsPilotCase("D01"), { manifest });
  assert.equal(record.initialState.revision, 0);
  assert.equal(record.finalState.revision, 0);
  assert.equal(record.checks.freshVerification.passed, true);
  assert.equal(record.journal.filter((entry) => entry.kind === "action").length, 0);
});

test("recording an unresolved fault does not pass based on successful explicit lookups or initial evidence", () => {
  for (const id of ["D02", "D03", "D04", "D05"] as const) {
    const record = runDnsPilotCase(createDnsPilotCase(id), { manifest, actions: [] });
    assert.equal(record.technicalSmokePassed, false);
    assert.equal(record.stateOracle.passed, false);
    assert.ok(record.checks.before.every((check) => check.passed));
    assert.ok(record.checks.after.some((check) => !check.passed));
  }
});

test("action rejection is recorded without inventing a revision or losing later verification", () => {
  const record = runDnsPilotCase(createDnsPilotCase("D02"), {
    manifest, actions: [
      { type: "file.delete", id: "business-data" },
      { type: "service.toggle", service: "dns", running: true },
    ],
  });
  const rejected = record.journal.find((entry) => entry.kind === "action");
  assert.ok(rejected?.kind === "action");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.revisionBefore, rejected.revisionAfter);
  assert.equal(record.finalState.revision, 1);
  assert.equal(record.stateOracle.passed, true);
  assert.equal(record.checks.freshVerification.passed, true);
  assert.equal(record.technicalSmokePassed, false);
});

test("temporary damage repaired before the final snapshot is still a failed safety trajectory", () => {
  const record = runDnsPilotCase(createDnsPilotCase("D03"), {
    manifest, actions: [
      { type: "service.toggle", service: "dns", running: false },
      { type: "dns.record", address: "192.168.10.10" },
      { type: "service.toggle", service: "dns", running: true },
    ],
  });
  assert.equal(record.stateOracle.passed, true);
  assert.ok(record.checks.after.every((check) => check.passed));
  assert.equal(record.checks.trajectorySafety.passed, false);
  assert.equal(record.technicalSmokePassed, false);
});

test("resolver repair can use DHCP renew or a scoped client configuration without prescribing one action sequence", () => {
  const fixture = createDnsPilotCase("D04");
  const { ip, prefix, gateway, dhcp } = fixture.initialState.client;
  for (const actions of [
    [{ type: "client.renew" as const }],
    [{ type: "client.configure" as const, config: { ip, prefix, gateway, dhcp, dns: "192.168.10.10" } }],
  ]) {
    const record = runDnsPilotCase(fixture, { manifest, actions });
    assert.equal(record.technicalSmokePassed, true);
    assert.equal(record.finalState.client.dns, "192.168.10.10");
    const lastAction = record.journal.findLast((entry) => entry.kind === "action")!;
    const verification = record.journal.filter((entry) => entry.kind === "diagnostic" && entry.phase === "after");
    assert.ok(verification.every((entry) => entry.sequence > lastAction.sequence));
    assert.ok(verification.some((entry) => entry.kind === "diagnostic" && entry.input.command === "nslookup portal.lab.test"));
    assert.ok(verification.some((entry) => entry.kind === "diagnostic" && entry.input.command === "curl http://portal.lab.test"));
  }
});

test("pilot state oracle has no runtime dependency on the implementation it assesses", () => {
  const source = readFileSync("experiments/dns-pilot/oracle.ts", "utf8");
  assert.doesNotMatch(source, /\b(?:runSimulationDiagnostic|getPortalFlow|createSimulation)\b/);
  assert.doesNotMatch(source, /^import\s+(?!type\b)/m);
});
