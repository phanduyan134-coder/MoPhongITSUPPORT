"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, BookOpen, ChevronRight, CircleHelp, Cpu, FolderDown, HardDrive, Menu, Monitor, Network, Play, Power, RotateCcw, ShieldCheck, Terminal, Usb, X } from "lucide-react";
import { bootDevices, hasDNS, hasInternet, type PCPreset, type Tab } from "@/lib/engine";
import { useLab } from "@/lib/store";
import { BiosPanel, DesktopPanel, InstallerPanel, NetworkPanel, TerminalPanel } from "./panels";
import { AgentPanel } from "./support-agent";
import { Dialog } from "./dialog";
import { GuidancePanel } from "./guidance-panel";
import { getInstallGuideStep, type GuideTarget } from "@/lib/install-guide";
import { getNetworkGuideStep, type NetworkGuideTarget } from "@/lib/network-guide";
import { DriverPreparationDialog } from "./driver-media";

type GuidanceTarget = GuideTarget | NetworkGuideTarget;

const views: { id: Tab; name: string; icon: typeof Cpu }[] = [
  { id: "desktop", name: "Màn hình", icon: Monitor },
  { id: "bios", name: "BIOS / UEFI", icon: Cpu },
  { id: "installer", name: "Cài đặt Windows", icon: HardDrive },
  { id: "network", name: "Cấu hình mạng", icon: Network },
  { id: "terminal", name: "Command Prompt", icon: Terminal },
];
const powerLabels = { off: "Đã tắt", bios: "BIOS Setup", installer: "Windows Setup", desktop: "Windows đang chạy" };

export function Lab() {
  const s = useLab();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [preset, setPreset] = useState<PCPreset>("installed");
  const [showBoot, setShowBoot] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showDriverPreparation, setShowDriverPreparation] = useState(false);
  const [locateTarget, setLocateTarget] = useState<GuidanceTarget>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  const windowsStep = s.guidance.enabled && s.guidanceMode === "windows" ? getInstallGuideStep(s.pc, s.guidance) : null;
  const networkStep = s.guidance.enabled && s.guidanceMode === "network" ? getNetworkGuideStep(s.pc, s.networkChecks) : null;
  const guideStep = windowsStep ?? networkStep;
  const guideTarget = guideStep?.target ?? null;
  const highlight = (target: GuidanceTarget) => guideTarget === target ? " guide-highlight" : "";
  const bootTarget = guideTarget === "boot-usb" || guideTarget === "boot-ssd";
  useEffect(() => {
    if (!locateTarget) return;
    const frame = requestAnimationFrame(() => {
      const control = document.querySelector<HTMLElement>(`[data-guide-target="${locateTarget}"]`);
      control?.focus({ preventScroll: true });
      control?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      setLocateTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [locateTarget, s.tab, showBoot]);
  function closeGuidance() {
    s.stopGuidance();
    guideButton.current?.focus();
  }
  function locateGuidance() {
    if (!guideStep?.target) return;
    if (guideStep.view) s.setTab(guideStep.view);
    if (bootTarget || guideTarget === "boot-menu") setShowBoot(true);
    setLocateTarget(guideStep.target);
  }
  const currentView = views.find((view) => view.id === s.tab)!;
  const desktop = s.pc.power === "desktop";
  return <div className="app-shell simulator-shell">
    <aside className={"sidebar " + (sidebarOpen ? "is-open" : "")}>
      <a href="/" className="brand"><span className="brand-symbol"><Monitor size={22} /></span><span>Support<span className="brand-accent">Lab</span><small>IT SYSTEM SIMULATOR</small></span></a>
      <button className="icon-button sidebar-close" aria-label="Đóng công cụ" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
      <div className="sidebar-heading">THIẾT BỊ</div>
      <div className="workspace-label"><span className="status-dot" />Virtual PC<span className="badge">PC-01</span></div>
      <div className="sidebar-heading second">CÔNG CỤ</div>
      <nav aria-label="Công cụ mô phỏng">{views.map(({ id, name, icon: Icon }) => <button key={id} aria-current={s.tab === id ? "page" : undefined} className={"scenario-button " + (s.tab === id ? "active" : "")} onClick={() => { s.setTab(id); setSidebarOpen(false); }}><Icon size={17} /><span><strong>{name}</strong></span><ChevronRight size={14} /></button>)}</nav>
      <Link href="/handbook" className="handbook-link"><BookOpen size={17} /><span>Sổ tay cài Windows<small>Dell · ASUS · HP · PC tự ráp</small></span><ChevronRight size={14} /></Link>
      <div className="sidebar-footer"><ShieldCheck size={18} /><div><strong>Phiên mô phỏng cục bộ</strong><small>PC-01 · Firmware tổng quát</small></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Đóng công cụ" onClick={() => setSidebarOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" title="Công cụ mô phỏng" aria-label="Mở công cụ" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span>Mô phỏng</span><ChevronRight size={14} /><strong>{currentView.name}</strong></div><div className="topbar-actions"><button ref={guideButton} className={"button subtle guidance-toggle " + (s.guidance.enabled ? "is-active" : "")} aria-label="Hướng dẫn làm cùng" aria-expanded={s.guidance.enabled} aria-controls="simulation-guidance" onClick={s.guidance.enabled ? closeGuidance : s.startGuidance}><BookOpen size={16} /><span>Hướng dẫn</span></button><button className="icon-button" title="Thông tin mô phỏng" aria-label="Thông tin mô phỏng" onClick={() => setShowHelp(true)}><CircleHelp size={19} /></button></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span />IT SUPPORT & OS INSTALLATION</div><h1>Máy tính mô phỏng</h1><p>PC-01 <span className="text-divider">/</span> {powerLabels[s.pc.power]}</p></div><button className="button subtle" title="Tạo phiên mới" aria-label="Tạo phiên mới" onClick={() => { setPreset(s.preset); setShowSession(true); }}><RotateCcw size={16} /><span>Tạo phiên mới</span></button></div>
        {guideStep && <GuidancePanel step={guideStep} onLocate={locateGuidance} onBlank={() => { setPreset("blank"); setShowSession(true); }} onClose={closeGuidance} />}
        <section className="simulation-controls" aria-label="Điều khiển máy">
          <div className="power-controls"><button className="button primary" onClick={s.pc.power === "off" ? s.reboot : s.powerOff}><Power size={16} />{s.pc.power === "off" ? "Bật máy" : "Tắt máy"}</button><button className="button subtle" disabled={s.pc.power === "off"} onClick={s.reboot}><RotateCcw size={15} />Khởi động lại</button><button data-guide-target={!showBoot && bootTarget ? guideTarget : "boot-menu"} className={"button subtle" + (!showBoot && bootTarget ? " guide-highlight" : highlight("boot-menu"))} onClick={() => setShowBoot(true)}><Play size={15} />Menu boot</button><button data-guide-target="enter-bios" className={"button subtle" + highlight("enter-bios")} onClick={s.enterBios}><Cpu size={15} />Vào BIOS</button></div>
          <div className="usb-tools"><button data-guide-target="prepare-driver" className={"button subtle" + highlight("prepare-driver")} onClick={() => setShowDriverPreparation(true)}><FolderDown size={15} />Chuẩn bị driver</button><label className="usb-control"><Usb size={17} /><span>USB cài Windows</span><input type="checkbox" data-guide-target="usb" className={highlight("usb").trim()} aria-label="Cắm USB cài Windows" checked={s.pc.media.usbConnected} onChange={(e) => s.setUSBConnected(e.target.checked)} /><strong>{s.pc.media.usbConnected ? "Đã cắm" : "Chưa cắm"}</strong></label></div>
        </section>
        <div className="lab-grid">
          <div className="workbench">
            <section className="machine-section" aria-label="Máy tính mô phỏng">
              <div className="machine-toolbar"><div><Monitor size={17} /><strong>Virtual PC</strong><span className="machine-id">PC-01</span></div><span className={"power-state " + (s.pc.power === "off" ? "off" : "")}><span className="status-dot" />{powerLabels[s.pc.power]}</span></div>
              <div className="tabs" role="tablist" aria-label="Công cụ máy tính">{views.map(({ id, name, icon: Icon }) => <button role="tab" id={"tab-" + id} aria-controls={"panel-" + id} aria-selected={s.tab === id} key={id} className={s.tab === id ? "selected" : ""} onClick={() => s.setTab(id)}><Icon size={16} /><span>{name}</span></button>)}</div>
              <div role="tabpanel" id={"panel-" + s.tab} aria-labelledby={"tab-" + s.tab} className="panel-content">
                {s.tab === "desktop" && <DesktopPanel />}
                {s.tab === "bios" && <BiosPanel guideTarget={windowsStep?.target} />}
                {s.tab === "installer" && <InstallerPanel guideTarget={windowsStep?.target} />}
                {s.tab === "network" && <NetworkPanel guideTarget={networkStep?.target} guideStepId={networkStep?.id} />}
                {s.tab === "terminal" && <TerminalPanel guideActive={networkStep?.target === "cmd-input"} />}
              </div>
              <div className="machine-bottom"><span><Cpu size={14} />4 vCPU<span className="text-divider">·</span>8 GB RAM<span className="text-divider">·</span>512 GB NVMe</span><span>Firmware tổng quát</span></div>
            </section>
            {s.notice && <div className="notice" role="status"><Activity size={16} /><span>{s.notice}</span><button className="icon-button" title="Đóng thông báo" onClick={s.clearNotice}><X size={15} /></button></div>}
            <section className="activity-section"><div className="section-title"><h2><Activity size={16} />Nhật ký hệ thống</h2><span>{s.logs.length} sự kiện</span></div><div className="activity-list">{s.logs.length === 0 ? <p className="empty-log">Chưa có thao tác trong phiên này.</p> : [...s.logs].reverse().slice(0, 12).map((log) => <div className="log-row" key={log.id}><time>{log.time}</time><span>{log.text}</span></div>)}</div></section>
          </div>
          <aside className="right-column">
            <section className="machine-state" aria-label="Trạng thái máy"><div className="section-title"><h2><Activity size={16} />Trạng thái máy</h2><span>PC-01</span></div><dl>
              <div><dt>Nguồn / hệ thống</dt><dd>{powerLabels[s.pc.power]}</dd></div>
              <div><dt>Hệ điều hành trên SSD</dt><dd>{s.pc.disk.osInstalled ? "Windows 11" : "Chưa cài đặt"}</dd></div>
              <div><dt>Bảng phân vùng</dt><dd>{s.pc.disk.diskTable} · {s.pc.disk.partitions.length} phân vùng</dd></div>
              <div><dt>USB cài Windows</dt><dd>{s.pc.media.usbConnected ? "Đã cắm" : "Chưa cắm"}</dd></div>
              <div><dt>Địa chỉ IPv4</dt><dd>{desktop ? s.pc.network.ipAddress : "Bộ điều hợp chưa hoạt động"}</dd></div>
              <div><dt>Internet / DNS</dt><dd>{desktop ? (hasInternet(s.pc.network) ? "Có Internet" : "Mất Internet") + " / " + (hasDNS(s.pc.network) ? "DNS hoạt động" : "DNS lỗi") : "Chưa hoạt động"}</dd></div>
              <div><dt>DHCP trên router</dt><dd>{s.pc.network.dhcpAvailable ? "Running" : "Stopped"}</dd></div>
            </dl></section>
            <AgentPanel key={s.session} />
          </aside>
        </div>
        <footer className="page-footer"><span>SupportLab <span className="text-divider">/</span> IT Support & OS Installation Simulator</span><span>Phiên bản nghiên cứu 0.1</span></footer>
      </main>
    </div>
    {showDriverPreparation && <DriverPreparationDialog onClose={() => setShowDriverPreparation(false)} />}
    {showSession && <Dialog labelId="session-title" onClose={() => setShowSession(false)}><h2 id="session-title">Tạo phiên mô phỏng</h2><label className="session-preset">Trạng thái khởi tạo<select aria-label="Trạng thái khởi tạo" value={preset} onChange={(e) => setPreset(e.target.value as PCPreset)}><option value="installed">Máy đã có Windows</option><option value="blank">Máy trống, chưa có hệ điều hành</option></select></label><p>Phiên hiện tại, lịch sử trò chuyện và nhật ký sẽ được đặt lại.</p><div className="modal-actions"><button autoFocus className="button subtle" onClick={() => setShowSession(false)}>Hủy</button><button className="button primary" onClick={() => { s.newSession(preset); setShowSession(false); }}>Tạo phiên</button></div></Dialog>}
    {showBoot && <Dialog labelId="boot-title" onClose={() => setShowBoot(false)}><h2 id="boot-title">Boot Menu</h2><p>Thiết bị được chọn chỉ dùng cho lần khởi động này.</p><div className="boot-device-menu">{bootDevices.map((device) => <button key={device} data-guide-target={device === "USB Drive" ? "boot-usb" : device === "NVMe SSD" ? "boot-ssd" : undefined} className={"button subtle" + (device === "USB Drive" ? highlight("boot-usb") : device === "NVMe SSD" ? highlight("boot-ssd") : "")} disabled={device === "USB Drive" && !s.pc.media.usbConnected} onClick={() => { s.bootFrom(device); setShowBoot(false); }}>{device === "USB Drive" ? <Usb size={17} /> : device === "NVMe SSD" ? <HardDrive size={17} /> : <Network size={17} />}<span>{device}</span>{device === "USB Drive" && !s.pc.media.usbConnected ? <small>Chưa cắm</small> : <ChevronRight size={15} />}</button>)}</div><div className="modal-actions"><button autoFocus className="button subtle" onClick={() => setShowBoot(false)}>Đóng</button></div></Dialog>}
    {showHelp && <Dialog labelId="help-title" onClose={() => setShowHelp(false)}><h2 id="help-title">Thông tin mô phỏng</h2><p>Máy tính, firmware, ổ đĩa và mạng đều là trạng thái giả lập. Đây chưa phải trình giả lập Windows đầy đủ hoặc BIOS chính xác theo model. Dữ liệu phiên mất khi tải lại trang.</p><p>CMD hỗ trợ một số lệnh trong mạng mô phỏng 192.168.1.0/24. Trợ lý hiển thị nguồn phản hồi cục bộ hoặc OpenAI. Sổ tay theo hãng nằm ở mục riêng.</p><div className="modal-actions"><button autoFocus className="button primary" onClick={() => setShowHelp(false)}>Đóng</button></div></Dialog>}
  </div>;
}
