import { randomBytes } from "node:crypto";
import {
  applySimulationAction,
  createSimulation,
  runSimulationDiagnosticResult,
  simulationPresets,
  type DeviceId,
  type Simulation,
  type SimulationAction,
} from "./system-simulator";
import type { AgentRunEvidence, WebEvidenceEntry, WebSessionEvidence } from "./system-evidence";

export type SessionSnapshot = { sessionId: string; state: Simulation; report: string };
type Session = SessionSnapshot & {
  expiresAt: number;
  createdAt: string;
  initialState: Simulation;
  journal: WebEvidenceEntry[];
  journalBytes: number;
  nextSequence: number;
  droppedEntries: number;
  truncated: boolean;
};

// The journal belongs to the in-memory session. Downloading an export is the
// caller's responsibility; it is not a database or a completed research record.
const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024;

function boundedEvidence(value: unknown, maxCharacters: number) {
  let truncated = false;
  let nodes = 0;
  let charactersLeft = maxCharacters;
  const active = new WeakSet<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > 5000 || depth > 12) { truncated = true; return "[Evidence limit reached]"; }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string") {
      const limit = Math.min(32_768, Math.max(0, charactersLeft));
      charactersLeft -= Math.min(item.length, limit);
      if (item.length <= limit) return item;
      truncated = true;
      return item.slice(0, limit) + "[Truncated]";
    }
    if (typeof item !== "object") { truncated = true; return "[Unsupported value omitted]"; }
    if (active.has(item)) { truncated = true; return "[Circular value omitted]"; }
    active.add(item);
    try {
      if (Array.isArray(item)) {
        if (item.length > 256) truncated = true;
        return item.slice(0, 256).map((entry) => visit(entry, depth + 1));
      }
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Object.keys(descriptors);
      if (keys.length > 100) truncated = true;
      const output: Record<string, unknown> = Object.create(null);
      for (const key of keys.slice(0, 100)) {
        const descriptor = descriptors[key];
        if (/^(?:authorization|api[_-]?key|access[_-]?token|secret|password|sessionId)$/i.test(key)) {
          truncated = true;
          output[key] = "[Sensitive field omitted]";
        } else if (!("value" in descriptor)) {
          truncated = true;
          output[key] = "[Accessor omitted]";
        } else output[key.slice(0, 120)] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally { active.delete(item); }
  };
  try { return { value: visit(value, 0), truncated }; }
  catch { return { value: { omitted: true, reason: "unserializable-evidence" }, truncated: true }; }
}

export class SimulationSessionError extends Error {
  constructor(public status: number, message: string, public snapshot?: SessionSnapshot) {
    super(message);
    this.name = "SimulationSessionError";
  }
}

export function createSessionStore(options: { ttlMs?: number; maxSessions?: number; now?: () => number; journalMaxEntries?: number; journalMaxBytes?: number } = {}) {
  const sessions = new Map<string, Session>();
  const ttlMs = options.ttlMs ?? 2 * 60 * 60_000;
  const maxSessions = options.maxSessions ?? 200;
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, Math.floor(options.journalMaxEntries ?? DEFAULT_MAX_ENTRIES));
  const maxBytes = Math.max(1024, Math.floor(options.journalMaxBytes ?? DEFAULT_MAX_BYTES));
  const maxEntryBytes = Math.min(DEFAULT_MAX_ENTRY_BYTES, maxBytes);
  const copy = (session: Session): SessionSnapshot => structuredClone({ sessionId: session.sessionId, state: session.state, report: session.report });
  const append = (session: Session, kind: WebEvidenceEntry["kind"], revision: number, data: unknown) => {
    const bounded = boundedEvidence(data, maxEntryBytes);
    const entry: WebEvidenceEntry = {
      sequence: session.nextSequence++, at: new Date(now()).toISOString(), revision, kind,
      data: bounded.value, ...(bounded.truncated ? { truncated: true } : {}),
    };
    let bytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
    if (bytes > maxEntryBytes) {
      entry.data = { omitted: true, reason: "entry-too-large", originalBytes: bytes };
      entry.truncated = true;
      bytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
    }
    if (entry.truncated) session.truncated = true;
    session.journalBytes += bytes + (session.journal.length ? 1 : 0);
    session.journal.push(entry);
    while (session.journal.length > maxEntries || session.journalBytes > maxBytes) {
      const removed = session.journal.shift()!;
      session.journalBytes -= Buffer.byteLength(JSON.stringify(removed), "utf8") + (session.journal.length ? 1 : 0);
      session.droppedEntries++;
      session.truncated = true;
    }
  };
  const prune = () => {
    for (const [id, session] of sessions) if (session.expiresAt <= now()) sessions.delete(id);
  };
  const find = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt <= now()) {
      sessions.delete(sessionId);
      throw new SimulationSessionError(404, "Phiên mô phỏng không tồn tại hoặc đã hết hạn. Hãy tạo phiên mới.");
    }
    session.expiresAt = now() + ttlMs;
    return session;
  };
  const initial = (presetId?: string) => {
    const preset = simulationPresets.find((item) => item.id === (presetId ?? simulationPresets[0]?.id));
    if (!preset) throw new SimulationSessionError(400, "Cấu hình khởi tạo không hợp lệ.");
    return { state: createSimulation(preset.id), report: preset.report };
  };
  return {
    create(presetId?: string): SessionSnapshot {
      prune();
      if (sessions.size >= maxSessions) throw new SimulationSessionError(503, "Đã đạt giới hạn phiên mô phỏng. Vui lòng thử lại sau.");
      const data = initial(presetId);
      const session: Session = {
        ...data, sessionId: randomBytes(32).toString("base64url"), expiresAt: now() + ttlMs,
        createdAt: new Date(now()).toISOString(), initialState: structuredClone(data.state),
        journal: [], journalBytes: 2, nextSequence: 1, droppedEntries: 0, truncated: false,
      };
      sessions.set(session.sessionId, session);
      return copy(session);
    },
    get(sessionId: string): SessionSnapshot { return copy(find(sessionId)); },
    action(sessionId: string, expectedRevision: number, action: SimulationAction) {
      const session = find(sessionId);
      if (session.state.revision !== expectedRevision)
        throw new SimulationSessionError(409, "Trạng thái đã thay đổi. Đã đồng bộ lại; vui lòng kiểm tra trước khi thao tác tiếp.", copy(session));
      let result: ReturnType<typeof applySimulationAction>;
      try { result = applySimulationAction(structuredClone(session.state), action); }
      catch (error) {
        throw new SimulationSessionError(400, error instanceof Error ? error.message : "Thao tác không phù hợp với trạng thái hiện tại.");
      }
      append(session, "action", result.state.revision, { action, beforeState: session.state, afterState: result.state, message: result.message });
      session.state = result.state;
      return { ...copy(session), message: result.message };
    },
    diagnose(sessionId: string, device: DeviceId, command: string) {
      const session = find(sessionId);
      const result = runSimulationDiagnosticResult(session.state, device, command);
      append(session, "diagnostic", session.state.revision, { device, command, result });
      return structuredClone(result);
    },
    reset(sessionId: string, presetId?: string): SessionSnapshot {
      const session = find(sessionId);
      const data = initial(presetId);
      // Revisions remain monotonic so requests prepared before a reset cannot overwrite it.
      data.state.revision = session.state.revision + 1;
      append(session, "reset", data.state.revision, { beforeState: session.state, afterState: data.state });
      session.state = data.state;
      session.report = data.report;
      return copy(session);
    },
    recordAgent(sessionId: string, evidence: AgentRunEvidence) {
      const session = find(sessionId);
      const stale = evidence.revision !== session.state.revision;
      append(session, "agent", evidence.revision, { evidence, stale });
      return { runId: evidence.id, stale };
    },
    exportEvidence(sessionId: string): WebSessionEvidence {
      const session = find(sessionId);
      return structuredClone({
        schemaVersion: 1, kind: "supportlab-web-session",
        session: { createdAt: session.createdAt, initialState: session.initialState, currentState: session.state },
        journal: { entries: session.journal, droppedEntries: session.droppedEntries, truncated: session.truncated },
        limits: { maxEntries, maxBytes, maxEntryBytes },
        exportedAt: new Date(now()).toISOString(),
        limitations: ["simulated-not-windows", "in-memory-until-expiry-or-restart", "not-model-quality-evaluation"],
      });
    },
  };
}

// A new key prevents dev hot reload from reusing an older store without journals.
type GlobalSessions = typeof globalThis & { __supportLabSystemEvidenceSessions?: ReturnType<typeof createSessionStore> };
const globals = globalThis as GlobalSessions;
export const systemSessions = globals.__supportLabSystemEvidenceSessions ??= createSessionStore();

export async function readBoundedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next can reconstruct localhost internally while the browser uses 127.0.0.1.
  const host = request.headers.get("host");
  const expectedOrigin = host ? `${url.protocol}//${host}` : url.origin;
  if (origin && origin !== expectedOrigin) throw new SimulationSessionError(403, "Không chấp nhận yêu cầu từ nguồn khác.");
  const reader = request.body?.getReader();
  if (!reader) throw new SimulationSessionError(400, "Thiếu nội dung JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SimulationSessionError(413, "Nội dung yêu cầu quá lớn.");
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new SimulationSessionError(400, "Yêu cầu JSON không hợp lệ."); }
}
