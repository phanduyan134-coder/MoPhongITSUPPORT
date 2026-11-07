import type { DeviceId, Simulation } from "./system-simulator";

export type AgentToolEvidence = {
  tool: string;
  input: unknown;
  output: unknown;
  summary: string;
  revision: number;
  startedAt: string;
  durationMs: number;
  status: "ok" | "error";
  origin?: "agent" | "verification" | "local";
  callId?: string;
};

export type DnsVerification = {
  target: "dns-portal";
  protocol: "dns-portal-v2";
  revision: number;
  status: "passed" | "failed";
  assessment: {
    code: "healthy" | "network" | "dns-service" | "dns-resolution" | "http-service" | "multiple" | "inconclusive";
    summary: string;
    nextSteps: string[];
  };
  checks: {
    id: "network" | "dns-service" | "dns-answer" | "http" | "http-ip";
    label: string;
    passed: boolean;
    observed: boolean;
    revision: number;
    device: DeviceId;
    command: string;
    output: string;
  }[];
};

export type AgentRunEvidence = {
  id: string;
  purpose: "diagnose" | "verify-dns";
  source: "local" | "openai";
  fallback: boolean;
  fallbackReason?: string;
  model: string | null;
  startedAt: string;
  durationMs: number;
  revision: number;
  question: string;
  message: string;
  sources: { title: string; url: string }[];
  trace: AgentToolEvidence[];
  verification?: DnsVerification;
  failedAttempt?: { model: string; reason: string; trace: AgentToolEvidence[] };
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
};

export type WebEvidenceEntry = {
  sequence: number;
  at: string;
  revision: number;
  kind: "action" | "diagnostic" | "reset" | "agent";
  data: unknown;
  truncated?: boolean;
};

export type WebSessionEvidence = {
  schemaVersion: 1;
  kind: "supportlab-web-session";
  session: { createdAt: string; initialState: Simulation; currentState: Simulation };
  journal: { entries: WebEvidenceEntry[]; droppedEntries: number; truncated: boolean };
  limits: { maxEntries: number; maxBytes: number; maxEntryBytes: number };
  exportedAt: string;
  limitations: string[];
};
