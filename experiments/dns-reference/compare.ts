import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  applySimulationAction, createSimulation, runSimulationDiagnosticResult,
  type Simulation,
} from "../../src/lib/system-simulator";

export const REFERENCE_RUN = "D02-reference-20261102-01";
export const REFERENCE_MANIFEST_SHA256 = "854995681c850f51e3a9f5d156c621e02904e8e7d72549036b3b95278ac211f1";
export const REFERENCE_OBSERVATIONS = {
  "server/healthy": "1e828ac41f86ca90c01dfbaf32ba9f67fd5bf636a867aac2a27b287f47d035a3",
  "client/healthy": "56ffa5d41ef4607b890c2750e99bb0429c67a55b0e6faf7d60ecc67d08bc95de",
  "server/dns-stopped": "b45d8ef2c69e8a7dfac770b10029a1a9bd9167a2f4df98fd418f0296f3975914",
  "client/dns-stopped": "46fbb281a708746fe0b7de081f3d0f2c0308189f7e439ec31d3740fe8b9c7795",
  "server/restored": "96bb72f9f1b22089c74f5349bac8f241c08be9e41839ef848424d3eecc0e3ddf",
  "client/restored": "7653d43e9a1e7e1cb8d2da27cb8a1b5f0915a13bc2fb0080f19a95e3e0657ca6",
} as const;
export type Phase = "healthy" | "dns-stopped" | "restored";
export type RawCommand = {
  id: string; command: string; startedAt: string; durationMs: number;
  timedOut: boolean; launchError: string | null; exitCode: number | null;
  stdoutFile: string; stderrFile: string; stdoutSha256: string; stderrSha256: string;
};
export type Capture = {
  kind: string; protocolVersion: string; role: "server" | "client";
  runLabel: string; phaseLabel: string; startedAt: string; finishedAt: string;
  commands: RawCommand[];
};
type Probe = RawCommand & { stdout: string; stderr: string };
type CapturedPhase = { phase: Phase; server: Probe[]; client: Probe[] };
export type Outcomes = {
  pingIp: boolean; dnsServiceRunning: boolean; dnsAnswerMatches: boolean;
  httpByName: boolean; httpByIp: boolean;
};

export function sha256(bytes: Uint8Array | string) { return createHash("sha256").update(bytes).digest("hex"); }
export function assertHash(bytes: Uint8Array, expected: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(bytes) !== expected) throw new Error(`Hash mismatch: ${label}`);
}

// A timeout while looking up the resolver name does not erase a later valid A answer.
// The first Address line belongs to the resolver and must never count as the answer.
export function parseDnsObservation(stdout: string, stderr: string) {
  const answer = /^Name:\s*portal\.lab\.test\.?\s*\r?\nAddress(?:es)?:\s*(\d+\.\d+\.\d+\.\d+)\s*$/im.exec(stdout);
  if (answer) return { outcome: "answer" as const, address: answer[1] };
  if (/timed[ -]?out|timeout/i.test(`${stdout}\n${stderr}`)) return { outcome: "timeout" as const, address: null };
  if (/non-existent domain|NXDOMAIN/i.test(`${stdout}\n${stderr}`)) return { outcome: "nxdomain" as const, address: null };
  throw new Error("DNS output has no supported answer or failure observation");
}

export function validateCapture(capture: Capture, role: Capture["role"], phase: Phase) {
  const start = Date.parse(capture.startedAt), finish = Date.parse(capture.finishedAt);
  if (capture.kind !== "windows-reference-observation" || capture.protocolVersion !== "windows-dns-d02-capture-v2"
    || capture.runLabel !== REFERENCE_RUN || capture.role !== role || capture.phaseLabel !== phase
    || !Number.isFinite(start) || !Number.isFinite(finish) || start > finish)
    throw new Error("Unsupported capture identity or time range");
  const ids = new Set<string>();
  for (const command of capture.commands) {
    const at = Date.parse(command.startedAt);
    if (ids.has(command.id) || !Number.isFinite(at) || at < start || at > finish
      || !Number.isFinite(command.durationMs) || command.durationMs < 0)
      throw new Error(`Stale, duplicated or invalid command: ${command.id}`);
    ids.add(command.id);
    if (command.timedOut || command.launchError || command.exitCode === null)
      throw new Error(`Probe did not complete: ${command.id}`);
  }
}

function parseService(text: string) {
  const status = /Name\s*:\s*DNS\s*\r?\nStatus\s*:\s*(Running|Stopped)\b/i.exec(text)?.[1]
    ?? /^DNS\s+(Running|Stopped)\s/m.exec(text)?.[1];
  if (!status) throw new Error("Missing supported DNS service observation");
  return status.toLowerCase() === "running";
}
function parseHttp(stdout: string, stderr: string) {
  if (/^HTTP\/1\.[01] 200 OK\b/m.test(stdout)) return true;
  if (/^HTTP\/1\.[01] [45]\d\d\b/m.test(stdout) || /curl:.*(?:timed out|resolve host|failed to connect|connection refused)/i.test(`${stdout}\n${stderr}`)) return false;
  throw new Error("Missing supported HTTP observation");
}
function parsePing(stdout: string) {
  const counts = /Packets:\s*Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+),\s*Lost\s*=\s*(\d+)/i.exec(stdout);
  if (!counts) throw new Error("Missing ping statistics");
  return Number(counts[1]) > 0 && Number(counts[2]) === Number(counts[1]) && Number(counts[3]) === 0;
}
export function projectOutputs(input: { ping: string; service: string; dns: { stdout: string; stderr: string }; httpName: { stdout: string; stderr: string }; httpIp: { stdout: string; stderr: string } }) {
  const dns = parseDnsObservation(input.dns.stdout, input.dns.stderr);
  const outcomes: Outcomes = {
    pingIp: parsePing(input.ping), dnsServiceRunning: parseService(input.service),
    dnsAnswerMatches: dns.outcome === "answer" && dns.address === "192.168.10.10",
    httpByName: parseHttp(input.httpName.stdout, input.httpName.stderr),
    httpByIp: parseHttp(input.httpIp.stdout, input.httpIp.stderr),
  };
  return { outcomes, dns };
}

export function unrelatedStatePreserved(initial: Simulation, current: Simulation) {
  const project = ({ revision: _revision, simulatedTime: _time, events: _events, dns, ...other }: Simulation) => ({ ...other, dnsRecord: dns.record });
  return JSON.stringify(project(initial)) === JSON.stringify(project(current));
}

async function checkedRead(root: string, path: string, expected?: string) {
  const file = await realpath(resolve(root, path));
  const fromRoot = relative(root, file);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("Evidence path escapes run folder");
  const bytes = await readFile(file);
  if (expected) assertHash(bytes, expected, path);
  return bytes;
}
const decode = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "");

export async function loadReferenceEvidence(directory: string) {
  const root = await realpath(directory);
  const manifest = JSON.parse(decode(await checkedRead(root, "manifest.json", REFERENCE_MANIFEST_SHA256)));
  if (manifest.kind !== "windows-dns-reference-run" || manifest.runLabel !== REFERENCE_RUN || !manifest.dnsRestorationConfirmed || manifest.errors?.length)
    throw new Error("Reference manifest did not record a completed, restored run");
  let rawFilesChecked = 0;
  const observations: { file: string; sha256: string; startedAt: string; finishedAt: string }[] = [];
  const phases: CapturedPhase[] = [];
  for (const phase of ["healthy", "dns-stopped", "restored"] as const) {
    const result: CapturedPhase = { phase, server: [], client: [] };
    for (const role of ["server", "client"] as const) {
      const folder = `${role}/${phase}` as keyof typeof REFERENCE_OBSERVATIONS;
      const file = `${folder}/observation.json`;
      const capture: Capture = JSON.parse(decode(await checkedRead(root, file, REFERENCE_OBSERVATIONS[folder])));
      validateCapture(capture, role, phase);
      observations.push({ file, sha256: REFERENCE_OBSERVATIONS[folder], startedAt: capture.startedAt, finishedAt: capture.finishedAt });
      for (const command of capture.commands) {
        if (![command.stdoutFile, command.stderrFile].every((name) => /^[A-Za-z0-9._-]+$/.test(name))) throw new Error("Invalid output filename");
        const stdout = decode(await checkedRead(root, `${folder}/${command.stdoutFile}`, command.stdoutSha256));
        const stderr = decode(await checkedRead(root, `${folder}/${command.stderrFile}`, command.stderrSha256));
        rawFilesChecked += 2;
        result[role].push({ ...command, stdout, stderr });
      }
    }
    phases.push(result);
  }
  return { root, rawFilesChecked, observations, phases };
}

export function compareWithSimulator(phases: CapturedPhase[]) {
  if (phases.length !== 3 || phases.some((entry, index) => entry.phase !== ["healthy", "dns-stopped", "restored"][index]))
    throw new Error("Reference phases must be complete and in captured order");
  const initial = createSimulation("healthy");
  let state = structuredClone(initial);
  return phases.map(({ phase, server, client }) => {
    // Revision 0 is baseline; subsequent measurements are produced by real actions.
    if (phase === "dns-stopped") state = applySimulationAction(state, { type: "service.toggle", service: "dns", running: false }).state;
    if (phase === "restored") state = applySimulationAction(state, { type: "service.toggle", service: "dns", running: true }).state;
    const required = (list: Probe[], id: string) => {
      const probe = list.find((entry) => entry.id === id);
      if (!probe) throw new Error(`Missing reference probe: ${phase}/${id}`);
      return probe;
    };
    const reference = projectOutputs({
      ping: required(client, "02-ping-server").stdout,
      service: required(server, "02-dns-service").stdout,
      dns: required(client, "03-dns-default"),
      httpName: required(client, "06-http-by-name"), httpIp: required(client, "07-http-by-ip"),
    });
    const commands = [
      ["client", "ping 192.168.10.10"], ["server", "Get-Service DNS"],
      ["client", "nslookup portal.lab.test"], ["client", "curl http://portal.lab.test"],
      ["client", "curl http://192.168.10.10"],
    ] as const;
    const diagnostics = commands.map(([device, command]) => ({ device, command, result: runSimulationDiagnosticResult(state, device, command) }));
    if (!diagnostics.every(({ result }) => result.observed && result.revision === state.revision)) throw new Error("Simulator diagnostics missing or stale");
    const outputs = diagnostics.map(({ result }) => ({ stdout: result.output, stderr: "" }));
    const simulated = projectOutputs({ ping: outputs[0].stdout, service: outputs[1].stdout, dns: outputs[2], httpName: outputs[3], httpIp: outputs[4] });
    const checks = (Object.keys(reference.outcomes) as (keyof Outcomes)[]).map((id) => ({ id, reference: reference.outcomes[id], simulated: simulated.outcomes[id], passed: reference.outcomes[id] === simulated.outcomes[id] }));
    const dnsSemanticsMatched = reference.dns.outcome === simulated.dns.outcome && reference.dns.address === simulated.dns.address;
    const statePreserved = unrelatedStatePreserved(initial, state);
    return { phase, revision: state.revision, reference, simulated, diagnostics, checks, dnsSemanticsMatched, statePreserved,
      passed: checks.every((entry) => entry.passed) && dnsSemanticsMatched && statePreserved, state: structuredClone(state) };
  });
}
