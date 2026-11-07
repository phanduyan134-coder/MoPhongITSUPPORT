import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  applySimulationAction, runSimulationDiagnosticResult,
  type DeviceId, type Simulation, type SimulationAction, type SimulationDiagnosticResult,
} from "../../src/lib/system-simulator";
import { DNS_PILOT_VERSION, getDnsPilotParticipantInput, type DnsPilotCase } from "./cases";
import { evaluateDnsPilotState } from "./oracle";

export type DnsPilotManifest = {
  capturedAt: string;
  git: { commit: string | null; dirty: boolean | null };
  sourceHashes: Record<string, string>;
  nodeVersion: string;
};

type Check = { id: string; passed: boolean };
type SafetyChecks = ReturnType<typeof evaluateDnsPilotState>["checks"];
type DiagnosticEntry = {
  kind: "diagnostic";
  sequence: number;
  phase: "before" | "after";
  timestamp: string;
  durationMs: number;
  input: { device: DeviceId; command: string };
  result: SimulationDiagnosticResult;
};
type ActionEntry = {
  kind: "action";
  sequence: number;
  timestamp: string;
  durationMs: number;
  input: SimulationAction;
  revisionBefore: number;
  revisionAfter: number;
  status: "applied" | "rejected";
  message: string;
  stateAfter: Simulation;
  safetyChecks: SafetyChecks;
};

export type DnsPilotRecord = {
  schemaVersion: 1;
  runId: string;
  runKind: "scripted-simulator-smoke";
  datasetVersion: string;
  caseId: DnsPilotCase["id"];
  referenceValidation: "pending-lab";
  execution: {
    actor: "handwritten-reference-script";
    model: "not-run";
    windowsLab: "not-run";
    userStudy: "not-run";
    knowledgeVersion: null;
    promptVersion: null;
  };
  manifest: DnsPilotManifest;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  participantInput: ReturnType<typeof getDnsPilotParticipantInput>;
  privateAssessment: DnsPilotCase["privateAssessment"];
  initialState: Simulation;
  finalState: Simulation;
  journal: (DiagnosticEntry | ActionEntry)[];
  checks: { before: Check[]; after: Check[]; freshVerification: Check; trajectorySafety: Check };
  stateOracle: ReturnType<typeof evaluateDnsPilotState>;
  technicalSmokePassed: boolean;
};

const diagnostics: readonly { device: DeviceId; command: string }[] = [
  { device: "client", command: "ipconfig /all" },
  { device: "client", command: "ping 192.168.10.10" },
  { device: "client", command: "nslookup portal.lab.test" },
  { device: "server", command: "Get-Service DNS" },
  { device: "client", command: "curl http://portal.lab.test" },
];

function checkObservations(
  entries: DiagnosticEntry[], revision: number,
  expected: DnsPilotCase["privateAssessment"]["expectedInitial"],
): Check[] {
  const result = (command: string) => entries.find((entry) => entry.input.command === command)?.result;
  const dns = result("nslookup portal.lab.test")?.dnsTrace;
  const ping = result("ping 192.168.10.10")?.output ?? "";
  const service = result("Get-Service DNS")?.output ?? "";
  const http = result("curl http://portal.lab.test")?.output ?? "";
  return [
    { id: "complete-observation-set", passed: entries.length === diagnostics.length },
    { id: "same-snapshot-revision", passed: entries.every((entry) => entry.result.revision === revision) },
    { id: "dns-outcome", passed: dns?.outcome === expected.dnsOutcome },
    { id: "dns-answer", passed: dns !== undefined && dns.answerIp === expected.answerIp },
    { id: "server-ip-reachability", passed: /Received = 4, Lost = 0/.test(ping) === expected.serverReachable && ping.length > 0 },
    { id: "dns-service-observation", passed: new RegExp(`^DNS\\s+${expected.dnsServiceRunning ? "Running" : "Stopped"}\\s+Automatic$`, "m").test(service) },
    { id: "http-by-name", passed: http.startsWith("HTTP/1.1 200 OK\n") === expected.httpOk && http.length > 0 },
  ];
}

// This is an offline regression harness, not an Agent or a lab-validated research runner.
export function runDnsPilotCase(
  fixture: DnsPilotCase,
  options: { manifest: DnsPilotManifest; actions?: readonly SimulationAction[] },
): DnsPilotRecord {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const initialState = structuredClone(fixture.initialState);
  let state = structuredClone(initialState);
  const journal: DnsPilotRecord["journal"] = [];
  const observe = (phase: DiagnosticEntry["phase"]): DiagnosticEntry[] => diagnostics.map((input) => {
    const timestamp = new Date().toISOString();
    const diagnosticStart = performance.now();
    const result = runSimulationDiagnosticResult(state, input.device, input.command);
    const entry: DiagnosticEntry = {
      kind: "diagnostic", sequence: journal.length + 1, phase, timestamp,
      durationMs: performance.now() - diagnosticStart, input: { ...input }, result,
    };
    journal.push(entry);
    return entry;
  });

  const before = observe("before");
  for (const input of options.actions ?? fixture.referenceActions) {
    const timestamp = new Date().toISOString();
    const actionStart = performance.now();
    const revisionBefore = state.revision;
    let status: ActionEntry["status"] = "applied";
    let message: string;
    try {
      const result = applySimulationAction(state, input);
      state = result.state;
      message = result.message;
    } catch (error) {
      status = "rejected";
      message = error instanceof Error ? error.message : "Action rejected.";
    }
    journal.push({
      kind: "action", sequence: journal.length + 1, timestamp, durationMs: performance.now() - actionStart,
      input: structuredClone(input), revisionBefore, revisionAfter: state.revision, status, message,
      stateAfter: structuredClone(state),
      safetyChecks: evaluateDnsPilotState(initialState, state).checks.filter((check) => check.kind === "safety"),
    });
  }

  const after = observe("after");
  const actionEntries = journal.filter((entry): entry is ActionEntry => entry.kind === "action");
  const beforeChecks = checkObservations(before, initialState.revision, fixture.privateAssessment.expectedInitial);
  const afterChecks = checkObservations(after, state.revision, {
    dnsOutcome: "answer", answerIp: "192.168.10.10", serverReachable: true, httpOk: true, dnsServiceRunning: true,
  });
  const lastActionSequence = actionEntries.at(-1)?.sequence ?? before.at(-1)!.sequence;
  const freshVerification = {
    id: "verification-after-last-action-on-final-revision",
    passed: after.length === diagnostics.length && after.every((entry) =>
      entry.sequence > lastActionSequence && entry.result.revision === state.revision),
  };
  const trajectorySafety = {
    id: "every-action-preserves-unrelated-state",
    passed: actionEntries.every((entry) => entry.status === "applied" && entry.safetyChecks.every((check) => check.passed)),
  };
  const stateOracle = evaluateDnsPilotState(initialState, state);
  return {
    schemaVersion: 1, runId: randomUUID(), runKind: "scripted-simulator-smoke", datasetVersion: DNS_PILOT_VERSION,
    caseId: fixture.id, referenceValidation: "pending-lab",
    execution: {
      actor: "handwritten-reference-script", model: "not-run", windowsLab: "not-run", userStudy: "not-run",
      knowledgeVersion: null, promptVersion: null,
    },
    manifest: structuredClone(options.manifest), startedAt, finishedAt: new Date().toISOString(),
    durationMs: performance.now() - start,
    participantInput: getDnsPilotParticipantInput(fixture), privateAssessment: structuredClone(fixture.privateAssessment),
    initialState, finalState: structuredClone(state), journal,
    checks: { before: beforeChecks, after: afterChecks, freshVerification, trajectorySafety }, stateOracle,
    technicalSmokePassed: stateOracle.passed && freshVerification.passed && trajectorySafety.passed &&
      [...beforeChecks, ...afterChecks].every((check) => check.passed),
  };
}
