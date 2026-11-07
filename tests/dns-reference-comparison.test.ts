import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHash, compareWithSimulator, parseDnsObservation, projectOutputs, REFERENCE_RUN,
  sha256, unrelatedStatePreserved, validateCapture, type Capture,
} from "../experiments/dns-reference/compare";
import { applySimulationAction, createSimulation } from "../src/lib/system-simulator";

test("DNS reference parser ignores resolver address and nslookup exit-zero timeout", () => {
  const timeout = "DNS request timed out.\nServer: UnKnown\nAddress: 192.168.10.10\n";
  assert.deepEqual(parseDnsObservation(timeout, "*** Request to UnKnown timed-out"), { outcome: "timeout", address: null });
  assert.deepEqual(parseDnsObservation(timeout + "\nName: portal.lab.test\nAddress: 192.168.10.10\n", ""), { outcome: "answer", address: "192.168.10.10" });
  assert.deepEqual(parseDnsObservation("Server: 192.168.10.10\nName: portal.lab.test\nAddress: 192.168.10.99", ""), { outcome: "answer", address: "192.168.10.99" });
  assert.throws(() => parseDnsObservation("Server: UnKnown\nAddress: 192.168.10.10", ""), /no supported answer/);
});

test("reference integrity rejects changed raw bytes and malformed expected hashes", () => {
  const original = Buffer.from("Actual stdout\r\n");
  assertHash(original, sha256(original), "stdout");
  assert.throws(() => assertHash(Buffer.from("Edited stdout\r\n"), sha256(original), "stdout"), /Hash mismatch/);
  assert.throws(() => assertHash(original, "not-a-hash", "stdout"), /Hash mismatch/);
});

test("capture validation refuses stale command timestamps, incomplete probes and wrong run identity", () => {
  const capture: Capture = {
    kind: "windows-reference-observation", protocolVersion: "windows-dns-d02-capture-v2", role: "client",
    runLabel: REFERENCE_RUN, phaseLabel: "healthy", startedAt: "2026-11-02T14:00:00Z", finishedAt: "2026-11-02T14:01:00Z",
    commands: [{ id: "query", command: "nslookup portal.lab.test", startedAt: "2026-11-02T14:00:01Z", durationMs: 100,
      timedOut: false, launchError: null, exitCode: 0, stdoutFile: "query.stdout.txt", stderrFile: "query.stderr.txt",
      stdoutSha256: sha256(""), stderrSha256: sha256("") }],
  };
  validateCapture(capture, "client", "healthy");
  assert.throws(() => validateCapture({ ...capture, commands: [{ ...capture.commands[0], startedAt: "2026-11-02T13:59:00Z" }] }, "client", "healthy"), /Stale/);
  assert.throws(() => validateCapture({ ...capture, commands: [{ ...capture.commands[0], timedOut: true }] }, "client", "healthy"), /did not complete/);
  assert.throws(() => validateCapture({ ...capture, runLabel: "different-run" }, "client", "healthy"), /identity/);
  assert.throws(() => validateCapture({ ...capture, commands: [...capture.commands, capture.commands[0]] }, "client", "healthy"), /duplicated/);
});

test("five observed lab outcomes separate DNS timeout from a working website by IP", () => {
  const projected = projectOutputs({
    ping: "Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)",
    service: "Name : DNS\nStatus : Stopped\nStartType : Automatic",
    dns: { stdout: "DNS request timed out.\nServer: UnKnown\nAddress: 192.168.10.10", stderr: "*** Request timed-out" },
    httpName: { stdout: "", stderr: "curl: (28) Resolving timed out after 5000 milliseconds" },
    httpIp: { stdout: "HTTP/1.1 200 OK\r\nContent-Type: text/html", stderr: "" },
  });
  assert.deepEqual(projected.outcomes, { pingIp: true, dnsServiceRunning: false, dnsAnswerMatches: false, httpByName: false, httpByIp: true });
  assert.equal(projected.dns.outcome, "timeout");
  assert.throws(() => projectOutputs({ ping: "no response captured", service: "", dns: { stdout: "", stderr: "" }, httpName: { stdout: "", stderr: "" }, httpIp: { stdout: "", stderr: "" } }), /no supported answer/);
});

test("reference regression preservation permits DNS transitions but detects unrelated damage", () => {
  const initial = createSimulation("healthy");
  const stopped = applySimulationAction(initial, { type: "service.toggle", service: "dns", running: false }).state;
  assert.equal(unrelatedStatePreserved(initial, stopped), true);
  const damaged = applySimulationAction(stopped, { type: "iis.configure", config: { port: 80, poolRunning: false, siteRunning: true } }).state;
  assert.equal(unrelatedStatePreserved(initial, damaged), false);
  const wrongRecord = applySimulationAction(stopped, { type: "dns.record", address: "192.168.10.99" }).state;
  assert.equal(unrelatedStatePreserved(initial, wrongRecord), false);
  assert.throws(() => compareWithSimulator([]), /complete and in captured order/);
});

test("three-phase regression uses observed outputs and reports a mismatching HTTP control", () => {
  const phases: Parameters<typeof compareWithSimulator>[0] = (["healthy", "dns-stopped", "restored"] as const).map((phase) => {
    const stopped = phase === "dns-stopped";
    const probe = (id: string, stdout: string, stderr = "") => ({
      id, command: id, startedAt: "2026-11-02T14:00:01Z", durationMs: 100,
      timedOut: false, launchError: null, exitCode: 0, stdoutFile: id + ".stdout.txt", stderrFile: id + ".stderr.txt",
      stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), stdout, stderr,
    });
    return { phase,
      server: [probe("02-dns-service", `Name : DNS\nStatus : ${stopped ? "Stopped" : "Running"}\nStartType : Automatic`)],
      client: [
        probe("02-ping-server", "Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)"),
        probe("03-dns-default", stopped ? "DNS request timed out.\nServer: UnKnown\nAddress: 192.168.10.10" : "Name: portal.lab.test\nAddress: 192.168.10.10"),
        probe("06-http-by-name", stopped ? "" : "HTTP/1.1 200 OK", stopped ? "curl: (28) Resolving timed out after 5000 milliseconds" : ""),
        probe("07-http-by-ip", "HTTP/1.1 200 OK"),
      ],
    };
  });
  const matched = compareWithSimulator(phases);
  assert.ok(matched.every((entry) => entry.passed && entry.dnsSemanticsMatched && entry.statePreserved));
  assert.deepEqual(matched.map((entry) => entry.revision), [0, 1, 2]);
  assert.ok(matched.every((entry) => entry.diagnostics.length === 5));
  phases[1].client.find((entry) => entry.id === "07-http-by-ip")!.stdout = "HTTP/1.1 503 Service Unavailable";
  const mismatch = compareWithSimulator(phases);
  assert.equal(mismatch[1].passed, false);
  assert.equal(mismatch[1].checks.find((entry) => entry.id === "httpByIp")?.passed, false);
  assert.equal(mismatch[0].passed, true);
  assert.throws(() => compareWithSimulator([...phases].reverse()), /captured order/);
});
