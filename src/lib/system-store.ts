"use client";

import { create } from "zustand";
import type { DeviceId, DnsTrace, Simulation, SimulationAction } from "./system-simulator";

export type SystemView = "overview" | "desktop" | "dns-dhcp" | "iis" | "network" | "system" | "terminal" | "events";
type SessionResponse = { sessionId: string; state: Simulation; report: string; message?: string; error?: string; output?: string; revision?: number; dnsTrace?: DnsTrace };
type TerminalRecord = { id: number; device: DeviceId; command: string; output: string; revision: number };
type DiagnosticObservation = { output: string; revision: number };
export type DnsObservation = { id: number; command: string; trace: DnsTrace };
type SystemStore = {
  sessionId: string | null; state: Simulation | null; report: string; view: SystemView;
  busy: boolean; initializing: boolean; error: string; notice: string;
  terminal: TerminalRecord[]; dnsObservation: DnsObservation | null; generation: number; launchId: string | null;
  initialize: (presetId?: string, launchId?: string) => Promise<void>; setView: (view: SystemView) => void;
  reset: (presetId: string) => Promise<boolean>; act: (action: SimulationAction) => Promise<void>;
  diagnose: (device: DeviceId, command: string) => Promise<DiagnosticObservation | null>;
  clearTerminal: () => void; dismiss: () => void;
};

async function request(body: unknown): Promise<{ response: Response; data: SessionResponse }> {
  const response = await fetch("/api/simulation", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  return { response, data };
}

let recordId = 0;
let initializationRequest = 0;
let pendingLaunchId: string | undefined;
export const useSystemLab = create<SystemStore>((set, get) => ({
  sessionId: null, state: null, report: "", view: "overview", busy: false, initializing: false,
  error: "", notice: "", terminal: [], dnsObservation: null, generation: 0, launchId: null,
  setView: (view) => set({ view }),
  dismiss: () => set({ error: "", notice: "" }),
  clearTerminal: () => set({ terminal: [], dnsObservation: null }),
  initialize: async (presetId = "healthy", launchId) => {
    const current = get();
    if (current.state && (!launchId || current.launchId === launchId)) return;
    if (current.initializing && (!launchId || pendingLaunchId === launchId)) return;
    const requestId = ++initializationRequest;
    pendingLaunchId = launchId;
    // A new homepage selection owns a new session, including when a prior entry is still loading.
    set({ initializing: true, error: "", notice: "", state: null, sessionId: null,
      launchId: null, terminal: [], dnsObservation: null, view: "overview", busy: false, generation: current.generation + 1 });
    try {
      const { response, data } = await request({ operation: "create", presetId });
      if (requestId !== initializationRequest) return;
      if (!response.ok) throw new Error(data.error || "Không thể mở phiên mô phỏng.");
      set({ state: data.state, sessionId: data.sessionId, report: data.report, launchId: launchId ?? null });
    } catch (error) {
      if (requestId !== initializationRequest) return;
      set({ error: error instanceof Error ? error.message : "Không thể kết nối tới phiên mô phỏng." });
    } finally { if (requestId === initializationRequest) set({ initializing: false }); }
  },
  reset: async (presetId) => {
    if (get().busy) return false;
    const generation = get().generation;
    set({ busy: true, error: "" });
    try {
      let { response, data } = await request({ operation: "reset", sessionId: get().sessionId, presetId });
      if (get().generation !== generation) return false;
      if (response.status === 404) ({ response, data } = await request({ operation: "create", presetId }));
      if (get().generation !== generation) return false;
      if (!response.ok) throw new Error(data.error || "Không thể tạo lại phiên.");
      set((s) => ({ state: data.state, sessionId: data.sessionId, report: data.report, terminal: [], dnsObservation: null,
        notice: "Đã tạo phiên mới.", generation: s.generation + 1, busy: false }));
      return true;
    } catch (error) {
      if (get().generation !== generation) return false;
      set({ error: error instanceof Error ? error.message : "Không thể tạo lại phiên." });
      return false;
    } finally { if (get().generation === generation) set({ busy: false }); }
  },
  act: async (action) => {
    const { sessionId, state, busy, generation } = get();
    if (!sessionId || !state || busy) return;
    set({ busy: true, error: "", notice: "" });
    try {
      const { response, data } = await request({ operation: "action", sessionId, expectedRevision: state.revision, action });
      if (get().generation !== generation) return;
      if (response.status === 409 && data.state) set({ state: data.state, report: data.report });
      if (!response.ok) throw new Error(data.error || "Không thể thực hiện thao tác.");
      set({ state: data.state, report: data.report, notice: data.message || "Đã cập nhật cấu hình." });
    } catch (error) {
      if (get().generation !== generation) return;
      set({ error: error instanceof Error ? error.message : "Không thể thực hiện thao tác." });
    } finally { if (get().generation === generation) set({ busy: false }); }
  },
  diagnose: async (device, command) => {
    const { sessionId, generation, busy } = get();
    if (!sessionId || busy || !command.trim()) return null;
    set({ busy: true, error: "" });
    try {
      const { response, data } = await request({ operation: "diagnose", sessionId, device, command });
      if (get().generation !== generation) return null;
      if (!response.ok) throw new Error(data.error || "Không thể thực hiện kiểm tra.");
      const output = data.output || "Không có kết quả.";
      const revision = data.revision ?? get().state!.revision;
      const id = ++recordId;
      const trace = data.dnsTrace;
      if (get().generation === generation) set((s) => ({ terminal: [...s.terminal, {
        id, device, command, output, revision,
      }].slice(-60), dnsObservation: trace?.revision === revision && trace.device === device
        ? { id, command, trace: structuredClone(trace) } : s.dnsObservation }));
      return { output, revision };
    } catch (error) {
      if (get().generation !== generation) return null;
      const message = error instanceof Error ? error.message : "Không thể thực hiện kiểm tra.";
      set({ error: message });
      return null;
    } finally { if (get().generation === generation) set({ busy: false }); }
  },
}));
