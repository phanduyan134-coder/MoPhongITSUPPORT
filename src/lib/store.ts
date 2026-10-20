"use client";

import { create } from "zustand";
import { boot, initialPC, installConditions, runCommand, storageDriverCompatible, syncNetwork, windowsPartitions,
  type Bios, type BootDevice, type Network, type PCPreset, type Tab, type VirtualPC } from "./engine";
import type { GuideContext } from "./install-guide";
import { recordNetworkCheck } from "./network-guide";
import { driverPackages, type DriverPackageId, type DriverWorkspace } from "./driver-media";

export type LogEntry = { id: number; time: string; text: string };
export type TerminalEntry = { command: string; output: string };
export type GuidanceMode = "windows" | "network";
type LabState = {
  pc: VirtualPC; tab: Tab; preset: PCPreset;
  logs: LogEntry[]; terminal: TerminalEntry[]; notice: string; revision: number; session: number;
  guidance: GuideContext & { enabled: boolean };
  guidanceMode: GuidanceMode; networkChecks: string[];
  driverWorkspace: DriverWorkspace;
  downloadDriverPackage: (id: DriverPackageId) => void; extractDriverPackage: () => void;
  copyDriverToUSB: () => void; removeDriverFromUSB: (id: DriverPackageId) => void;
  setGuidanceMode: (mode: GuidanceMode) => void;
  startGuidance: () => void; stopGuidance: () => void; acceptGuidedReinstall: () => void;
  newSession: (preset: PCPreset) => void;
  setTab: (tab: Tab) => void;
  setBios: (patch: Partial<Bios>) => void;
  applyNetwork: (patch: Pick<Network, "ipAddress" | "gateway" | "dns" | "dhcpEnabled">) => void;
  setDHCPServer: (available: boolean) => void;
  reboot: () => void; bootFrom: (device: BootDevice) => void; powerOff: () => void;
  setUSBConnected: (connected: boolean) => void; enterBios: () => void; loadDriver: (id: DriverPackageId) => boolean;
  prepareDisk: () => void; install: () => void;
  command: (input: string) => void; clearNotice: () => void;
};
let logId = 0;
function networkStateKey(pc: VirtualPC): string {
  const n = pc.network;
  return JSON.stringify([pc.power, n.ipAddress, n.gateway, n.dns, n.dhcpEnabled, n.dhcpAvailable]);
}
export const useLab = create<LabState>((set, get) => {
  const commit = (pc: VirtualPC, text: string, extra: Partial<LabState> = {}) => set((s) => ({
    pc: syncNetwork(pc),
    logs: [...s.logs, { id: ++logId, time: new Date().toLocaleTimeString("vi-VN", { hour12: false }), text }].slice(-150),
    notice: text, revision: s.revision + 1, ...extra,
    networkChecks: networkStateKey(s.pc) === networkStateKey(pc) ? (extra.networkChecks ?? s.networkChecks) : [],
  }));
  return {
    pc: initialPC(), tab: "desktop", preset: "installed",
    logs: [], terminal: [], notice: "", revision: 0, session: 0,
    guidance: { enabled: false, reinstallAccepted: false, installedDuringGuide: false },
    guidanceMode: "windows", networkChecks: [],
    driverWorkspace: { packageId: null, stage: "empty" },
    setGuidanceMode: (guidanceMode) => set({ guidanceMode }),
    startGuidance: () => set({ guidance: { enabled: true, reinstallAccepted: !get().pc.disk.osInstalled, installedDuringGuide: false } }),
    stopGuidance: () => set({ guidance: { enabled: false, reinstallAccepted: false, installedDuringGuide: false } }),
    acceptGuidedReinstall: () => set((s) => ({ guidance: { ...s.guidance, reinstallAccepted: true } })),
    newSession: (preset) => set((s) => ({ pc: initialPC(preset), preset, tab: "desktop",
      logs: [], terminal: [], networkChecks: [], notice: "", revision: s.revision + 1, session: s.session + 1,
      driverWorkspace: { packageId: null, stage: "empty" },
      guidance: { enabled: s.guidance.enabled, reinstallAccepted: preset === "blank", installedDuringGuide: false } })),
    setTab: (tab) => set({ tab, notice: "" }),
    clearNotice: () => set({ notice: "" }),
    setBios: (patch) => {
      const { pc } = get();
      if (pc.power !== "bios") return;
      commit({ ...pc, bios: { ...pc.bios, ...patch } }, "Đã cập nhật firmware; khởi động lại để áp dụng.");
    },
    applyNetwork: (patch) => {
      const { pc } = get();
      if (pc.power !== "desktop") return;
      const n = { ...pc.network, ...patch };
      if (patch.dhcpEnabled) {
        n.ipAddress = n.dhcpAvailable ? "192.168.1.50" : "169.254.12.8";
        n.gateway = n.dhcpAvailable ? "192.168.1.1" : "0.0.0.0";
        n.dns = n.dhcpAvailable ? "192.168.1.1" : "0.0.0.0";
      }
      commit({ ...pc, network: n }, "Đã áp dụng cấu hình bộ điều hợp Ethernet.");
    },
    setDHCPServer: (available) => commit({ ...get().pc, network: { ...get().pc.network, dhcpAvailable: available } },
      `Dịch vụ DHCP trên router: ${available ? "đang chạy" : "đã dừng"}.`),
    reboot: () => {
      const result = boot(get().pc);
      commit(result.pc, result.message, { tab: result.pc.power === "installer" ? "installer" : "desktop", networkChecks: [] });
    },
    bootFrom: (device) => {
      const result = boot(get().pc, device);
      commit(result.pc, result.message, { tab: result.pc.power === "installer" ? "installer" : "desktop", networkChecks: [] });
    },
    powerOff: () => commit({ ...get().pc, power: "off", disk: { ...get().pc.disk, storageDriverLoaded: false } }, "Máy đã tắt.", { tab: "desktop" }),
    setUSBConnected: (usbConnected) => {
      const pc = get().pc;
      commit({ ...pc, media: { ...pc.media, usbConnected }, ...(pc.power === "installer" && !usbConnected ? { power: "off" as const, disk: { ...pc.disk, storageDriverLoaded: false } } : {}) }, usbConnected ? "Đã cắm USB cài Windows." : "Đã rút USB cài Windows.");
    },
    enterBios: () => commit({ ...get().pc, power: "bios", disk: { ...get().pc.disk, storageDriverLoaded: false } }, "Đã khởi động vào BIOS Setup.", { tab: "bios" }),
    downloadDriverPackage: (id) => {
      if (!driverPackages[id]) return;
      commit(get().pc, `Máy hỗ trợ: đã tải ${driverPackages[id].name} mô phỏng.`, { driverWorkspace: { packageId: id, stage: "downloaded" } });
    },
    extractDriverPackage: () => {
      const { pc, driverWorkspace } = get();
      if (!driverWorkspace.packageId || driverWorkspace.stage !== "downloaded") return;
      commit(pc, "Máy hỗ trợ: đã giải nén gói driver mô phỏng (.inf, .sys, .cat).", { driverWorkspace: { ...driverWorkspace, stage: "extracted" } });
    },
    copyDriverToUSB: () => {
      const { pc, driverWorkspace } = get();
      if (!pc.media.usbConnected || driverWorkspace.stage !== "extracted" || !driverWorkspace.packageId) return;
      const id = driverWorkspace.packageId;
      if (pc.media.driverPackages.includes(id)) return;
      commit({ ...pc, media: { ...pc.media, driverPackages: [...pc.media.driverPackages, id] } }, `Đã chép ${driverPackages[id].name} vào USB: Drivers/Storage.`);
    },
    removeDriverFromUSB: (id) => {
      const pc = get().pc;
      if (!pc.media.usbConnected || !pc.media.driverPackages.includes(id)) return;
      commit({ ...pc, media: { ...pc.media, driverPackages: pc.media.driverPackages.filter((item) => item !== id) } }, "Đã xóa gói driver khỏi USB; driver đã nạp trong phiên Setup không bị gỡ.");
    },
    loadDriver: (id) => {
      const { pc } = get();
      if (!storageDriverCompatible(pc, id)) {
        set({ notice: "Không thể nạp: cần USB đang kết nối, gói Intel VMD x64 đã giải nén và chép vào USB, cùng bộ điều khiển tương thích trong Windows Setup." });
        return false;
      }
      commit({ ...pc, disk: { ...pc.disk, storageDriverLoaded: true } }, "Đã nạp driver Intel VMD từ USB.");
      return true;
    },
    prepareDisk: () => {
      const { pc } = get();
      if (pc.power !== "installer" || (pc.bios.vmdController && !pc.disk.storageDriverLoaded)) return;
      commit({ ...pc, disk: { ...pc.disk, diskTable: "GPT", partitions: windowsPartitions(), osInstalled: false, installedStorageDriver: false } }, "Đã xóa dữ liệu ổ mô phỏng, chuyển GPT và tạo phân vùng Windows.",
        { guidance: { ...get().guidance, installedDuringGuide: false } });
    },
    install: () => {
      const { pc } = get(); if (pc.power !== "installer") return;
      const unmet = installConditions(pc).filter((c) => !c.met);
      if (unmet.length) { set({ notice: `Chưa thể cài đặt: ${unmet.map((c) => c.label).join("; ")}.` }); return; }
      commit({ ...pc, disk: { ...pc.disk, osInstalled: true, installedStorageDriver: pc.bios.vmdController && pc.disk.storageDriverLoaded } }, "Cài đặt Windows hoàn tất. Có thể khởi động từ NVMe SSD bằng menu boot.",
        { guidance: { ...get().guidance, installedDuringGuide: get().guidance.enabled } });
    },
    command: (input) => {
      const { pc, terminal, networkChecks } = get();
      const result = runCommand(pc, input.slice(0, 256));
      commit(result.pc, `CMD: ${input.slice(0, 256)}`, {
        terminal: result.clear ? [] : [...terminal, { command: input.slice(0, 256), output: result.output }].slice(-100), notice: "",
        networkChecks: recordNetworkCheck(pc, networkChecks, input.slice(0, 256)),
      });
    },
  };
});
