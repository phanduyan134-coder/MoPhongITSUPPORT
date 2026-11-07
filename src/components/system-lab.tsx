"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMachine } from "@xstate/react";
import { motion, MotionConfig } from "motion/react";
import { Activity, ArrowLeft, ArrowRight, BookOpen, Cable, Check, ChevronRight, CircleHelp, Download, FileClock, Globe, HardDrive, Layers, LayoutDashboard, LoaderCircle, Menu, Monitor, Network, Plus, RefreshCw, Route, Server, ShieldCheck, Terminal, X } from "lucide-react";
import { freeSpaceMB, getPortalFlow, simulationPresets, type DeviceId } from "@/lib/system-simulator";
import { useSystemLab, type SystemView } from "@/lib/system-store";
import { DnsDhcpTools, EventTools, IisTools, NetworkTools, Status, TerminalTools, WindowsTools } from "./system-panels";
import { SystemAssistant } from "./system-assistant";
import { Dialog } from "./dialog";
import { dnsGuideCopy, dnsGuideMachine, getDnsGuideFeedback, type DnsGuideStep } from "@/lib/system-guide-machine";
import { DnsGuidePanel, DnsGuideTarget, ScenarioGuidePanel, ScenarioGuideTarget } from "./system-guide-ui";
import { scenarioGuideMachine, scenarioGuides, type ScenarioGuideId } from "@/lib/scenario-guide-machine";
import { DnsFlow } from "./dns-flow";
import { DeviceDesktop } from "./device-desktop";
import { ImmersiveWorkspace } from "./immersive-workspace";
import "@/app/dns-flow.css";

const views = [
  { id: "desktop", label: "Màn hình thiết bị", icon: Monitor, caption: "Desktop máy chủ & máy trạm" },
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard, caption: "Topology & thiết bị" },
  { id: "dns-dhcp", label: "DNS / DHCP", icon: Server, caption: "Dịch vụ mạng" },
  { id: "iis", label: "Web Server IIS", icon: Globe, caption: "Website & application pool" },
  { id: "network", label: "Kết nối mạng", icon: Network, caption: "IPv4 & chẩn đoán" },
  { id: "system", label: "Windows Server", icon: HardDrive, caption: "Ổ đĩa, quyền & dịch vụ" },
  { id: "terminal", label: "Terminal", icon: Terminal, caption: "CMD / PowerShell" },
  { id: "events", label: "Nhật ký sự kiện", icon: FileClock, caption: "Event Viewer" },
] as const;

function Topology() {
  const { state, setView } = useSystemLab();
  const s = state!;
  const link = s.client.link && s.client.enabled;
  return <div className="sl-topology" aria-label="Sơ đồ mạng mô phỏng">
    <button className="sl-device" onClick={() => setView("network")}><span className={"sl-device-art client " + (!link ? "offline" : "")}><Monitor size={35} /><i /></span><strong>CLIENT-01</strong><span>Windows Client</span><code>{s.client.ip}/{s.client.prefix}</code><Status on={link} yes="Ethernet up" no="Ethernet down" /></button>
    <div className={"sl-wire " + (link ? "connected" : "")}><span>Ethernet</span><i /><small>{link ? "Connected" : "Disconnected"}</small></div>
    <div className="sl-switch-node"><span><Network size={29} /><i /><i /><i /><i /></span><strong>SW-01</strong><small>LAN · 192.168.10.0/24</small></div>
    <div className="sl-wire connected"><span>Ethernet</span><i /><small>Connected</small></div>
    <button className="sl-device" onClick={() => setView("dns-dhcp")}><span className="sl-device-art server"><Server size={36} /><i /></span><strong>SRV-01</strong><span>Windows Server 2022</span><code>{s.server.ip}/{s.server.prefix}</code><Status on yes="Online" /></button>
    <div className="sl-gateway"><Cable size={15} /><strong>GW-01</strong><code>192.168.10.1</code><ChevronRight size={13} /><code>192.168.20.10</code><span>Mạng kiểm tra</span></div>
  </div>;
}

function PortalFlowDiagram({ onStartDnsGuide }: { onStartDnsGuide: () => void }) {
  const { state, setView } = useSystemLab();
  const flow = getPortalFlow(state!);
  const stages = [
    { id: "network", label: "Kết nối IP", detail: "CLIENT-01 đến SRV-01", view: "network" as const, on: flow.network },
    { id: "dns", label: "Tra DNS", detail: "portal.lab.test", view: "dns-dhcp" as const, on: flow.dns },
    { id: "record", label: "Bản ghi A", detail: state!.dns.record || "Chưa có bản ghi", view: "dns-dhcp" as const, on: flow.record },
    { id: "iis", label: "Website IIS", detail: "HTTP :80", view: "iis" as const, on: flow.iis },
  ];
  const firstFailed = stages.findIndex((stage) => !stage.on);
  return <section className="sl-flow" aria-label="Luồng truy cập website mô phỏng" data-testid="portal-flow">
    <div className="sl-flow-heading"><div><span>MINH HỌA TRẠNG THÁI</span><h3>Luồng truy cập portal.lab.test</h3></div><Status on={flow.iis} yes="HTTP sẵn sàng" no="Đang bị chặn" /></div>
    <div className="sl-flow-stages">
      {stages.map((stage, index) => <motion.div layout transition={{ duration: 0.22 }} className="sl-flow-group" key={stage.id}>
        <button className={"sl-flow-stage " + (stage.on ? "is-ready" : "is-blocked")} onClick={() => setView(stage.view)}>
          <span className="sl-flow-stage-number">{index + 1}</span><strong>{stage.label}</strong><small>{stage.detail}</small>
        </button>
        {index < stages.length - 1 && <span className={"sl-flow-link " + (stage.on && stages[index + 1].on ? "is-active" : "")}>{stage.on && stages[index + 1].on && <i aria-hidden="true" />}</span>}
      </motion.div>)}
    </div>
    <div className={"sl-flow-result " + (flow.iis ? "is-ready" : "is-blocked")}><span>{flow.iis ? "✓" : "!"}</span><p>{flow.message}</p>{!flow.dns && flow.network && state!.roles.dns && !state!.dns.running ? <button onClick={onStartDnsGuide}>Dẫn xử lý từng bước <ArrowRight size={14} /></button> : firstFailed >= 0 && <button onClick={() => setView(stages[firstFailed].view)}>Mở nơi cần kiểm tra <ArrowRight size={14} /></button>}</div>
  </section>;
}

function Overview({ onStartDnsGuide }: { onStartDnsGuide: () => void }) {
  const { state, setView } = useSystemLab();
  const s = state!;
  const rows: { label: string; detail: string; on: boolean; view: SystemView }[] = [
    { label: "DNS Server", detail: "lab.test · Primary zone", on: s.roles.dns && s.dns.running, view: "dns-dhcp" },
    { label: "DHCP Server", detail: s.dhcp.start + " — " + s.dhcp.end, on: s.roles.dhcp && s.dhcp.running && s.dhcp.active, view: "dns-dhcp" },
    { label: "IIS · Support Portal", detail: "HTTP · Port " + s.iis.port, on: s.roles.iis && s.iis.siteRunning && s.iis.poolRunning, view: "iis" },
    { label: "LabWorker", detail: s.system.startup + " startup", on: s.system.workerRunning, view: "system" },
  ];
  return <><div className="sl-section-head"><h2><Network size={17} />Sơ đồ kết nối</h2><span>01 server <i />01 client</span></div><Topology /><PortalFlowDiagram onStartDnsGuide={onStartDnsGuide} />
    <div className="sl-section-head sl-divider"><h2><Server size={17} />Dịch vụ trên SRV-01</h2><span>Windows Server 2022 · Workgroup</span></div>
    <div className="sl-service-table"><div className="sl-table-head"><span>Dịch vụ</span><span>Cấu hình</span><span>Trạng thái</span><span /></div>{rows.map((row) => <button key={row.label} className="sl-service-row" onClick={() => setView(row.view)}><strong>{row.label}</strong><span>{row.detail}</span><Status on={row.on} /><ChevronRight size={16} /></button>)}</div>
    <div className="sl-overview-foot"><div><HardDrive size={18} /><span>Ổ dữ liệu D:<strong>{freeSpaceMB(s)} / {s.system.capacityMB} MB trống</strong></span></div><button className="sl-button" onClick={() => setView("system")}>Quản lý tài nguyên<ArrowRight size={15} /></button></div>
  </>;
}

function Guidance({ onClose }: { onClose: () => void }) {
  const { view, state } = useSystemLab();
  const content: Record<SystemView, { title: string; steps: string[] }> = {
    desktop: { title: "Thao tác trên desktop mô phỏng", steps: ["Chọn CLIENT-01 hoặc SRV-01 ở sơ đồ để chuyển màn hình thiết bị.", "Mở Services và DNS Manager trên máy chủ; dùng PowerShell, trình duyệt hoặc cấu hình mạng trên máy trạm.", "Sau khi đổi cấu hình trên máy chủ, quay về máy trạm và chạy lại phép kiểm tra. Bản desktop hiện ưu tiên luồng DNS."] },
    overview: { title: "Khảo sát hệ thống", steps: ["Xác định máy trạm, máy chủ và đích đang gặp sự cố.", "Kiểm tra IP và link trước; phân biệt kết nối IP, phân giải tên và truy cập dịch vụ.", "Sau mỗi thay đổi, chạy lại phép kiểm tra trên thiết bị ban đầu."] },
    "dns-dhcp": { title: "Cấu hình DNS / DHCP", steps: ["Cài role còn thiếu; kiểm tra dịch vụ đang chạy.", "Đặt bản ghi portal.lab.test về " + state!.server.ip + ". DHCP cần scope hợp lệ, đã kích hoạt và option DNS trỏ về máy chủ.", "Trên máy trạm: bật DHCP rồi gia hạn. Dùng ipconfig /all và nslookup portal.lab.test để kiểm tra."] },
    iis: { title: "Kiểm tra website IIS", steps: ["Kiểm tra role IIS, trạng thái website và application pool riêng biệt.", "So sánh cổng binding với URL đang truy cập. Đích mặc định dùng HTTP cổng 80.", "Thử địa chỉ IP và tên miền để phân biệt lỗi HTTP với lỗi DNS."] },
    network: { title: "Kiểm tra kết nối", steps: ["Xem trạng thái cáp và bộ điều hợp; kiểm tra IP/prefix, gateway và DNS đang áp dụng.", "Ping 192.168.10.10 để kiểm tra cùng LAN; ping 192.168.20.10 để kiểm tra qua gateway.", "Sai gateway có thể không ảnh hưởng LAN. Dùng nslookup để kiểm tra DNS riêng."] },
    system: { title: "Kiểm tra tài nguyên hệ thống", steps: ["Ổ đầy: kiểm tra dung lượng và chỉ dọn tệp tạm được phép, sau đó thử ghi lại.", "Share: tài khoản tech cần quyền Read ở cả Share và NTFS. Không cấp quyền rộng để né lỗi.", "Dịch vụ: chạy thủ công không chứng minh tự khởi động. Kiểm tra Startup Type rồi thử sau reboot."] },
    terminal: { title: "Chẩn đoán theo bằng chứng", steps: ["Chọn đúng thiết bị trước khi kiểm tra; dùng help để xem lệnh hỗ trợ.", "CLIENT-01: ipconfig /all, ping, nslookup và curl. SRV-01: Get-Service, Get-Volume, Get-WinEvent.", "Kết quả gắn revision; sau khi đổi cấu hình cần kiểm tra lại, không dùng kết quả cũ để xác nhận."] },
    events: { title: "Đọc nhật ký", steps: ["Đối chiếu sự kiện với revision của cấu hình.", "Dùng Get-WinEvent trên SRV-01 để kiểm tra các sự kiện được hỗ trợ.", "Nhật ký thao tác không thay thế kiểm tra khả năng hoạt động của dịch vụ."] },
  };
  const guide = content[view];
  return <section className="sl-guidance" aria-label="Hướng dẫn theo công cụ"><div><BookOpen size={17} /><h2>{guide.title}</h2><button className="sl-icon" aria-label="Đóng hướng dẫn" title="Đóng hướng dẫn" onClick={onClose}><X size={16} /></button></div><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>;
}

export function SystemLab({ initialPreset = "healthy", initialGuide = "", initialDesktop = false, initialLaunchId }: { initialPreset?: string; initialGuide?: string; initialDesktop?: boolean; initialLaunchId?: string }) {
  const s = useSystemLab();
  const [menu, setMenu] = useState(false);
  const [guide, setGuide] = useState(false);
  const [reset, setReset] = useState(false);
  const [presetId, setPresetId] = useState("healthy");
  const [info, setInfo] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [guideFeedback, setGuideFeedback] = useState("");
  const [sessionPreset, setSessionPreset] = useState(initialPreset);
  const [desktopGuide, setDesktopGuide] = useState(initialDesktop);
  const guideRun = useRef(0);
  const guideRunId = guideRun.current;
  const [dnsGuide, sendDnsGuide] = useMachine(dnsGuideMachine);
  const [scenarioGuide, sendScenarioGuide] = useMachine(scenarioGuideMachine);
  const guidedStep = dnsGuide.value as DnsGuideStep;
  const activeGuide = guidedStep === "idle" ? null : dnsGuideCopy[guidedStep];
  const scenarioId = scenarioGuide.context.guideId;
  const scenarioStep = scenarioId && scenarioGuide.matches("active") ? scenarioGuides[scenarioId].steps[scenarioGuide.context.stepIndex] : null;
  const scenarioOpen = scenarioId !== null && !scenarioGuide.matches("idle");
  const hasGuide = guidedStep !== "idle" || scenarioOpen;
  const availableScenario = (Object.keys(scenarioGuides) as ScenarioGuideId[]).find((id) => scenarioGuides[id].presetId === sessionPreset);
  const scenarioNote = scenarioStep && (scenarioStep.view === s.view || desktopGuide) ? <ScenarioGuideTarget step={scenarioStep} feedback={guideFeedback || scenarioGuide.context.feedback} /> : undefined;
  const terminalGuided = guidedStep !== "idle" && guidedStep !== "repairingDns" && guidedStep !== "complete";
  const launchPreset = simulationPresets.some((preset) => preset.id === initialPreset) ? initialPreset : "healthy";
  const launchGuideStarted = useRef(false);
  const desktopOpened = useRef(false);
  useEffect(() => { void s.initialize(launchPreset, initialLaunchId); }, [launchPreset, initialLaunchId, s.initialize]);
  useEffect(() => {
    if (!initialDesktop || desktopOpened.current || s.initializing || !s.state || (initialLaunchId && s.launchId !== initialLaunchId)) return;
    desktopOpened.current = true;
    s.setView("desktop");
  }, [initialDesktop, initialLaunchId, s.initializing, s.state, s.launchId, s.setView]);
  useEffect(() => {
    if (launchGuideStarted.current || s.initializing || (initialLaunchId && s.launchId !== initialLaunchId) || !s.state) return;
    if (initialGuide === "dns" && s.state.roles.dns && !s.state.dns.running) {
      launchGuideStarted.current = true;
      startDnsGuide();
      return;
    }
    const id = (Object.keys(scenarioGuides) as ScenarioGuideId[]).find((key) => key === initialGuide && scenarioGuides[key].presetId === launchPreset);
    if (!id) return;
    launchGuideStarted.current = true;
    startScenarioGuide(id);
  }, [initialGuide, initialLaunchId, launchPreset, s.launchId, s.initializing, s.state]);
  useEffect(() => {
    if (guidedStep === "repairingDns" && s.state?.dns.running) {
      sendDnsGuide({ type: "DNS_STARTED" });
      s.setView(desktopGuide ? "desktop" : "terminal");
    }
  }, [guidedStep, s.state?.dns.running, s.setView, sendDnsGuide, desktopGuide]);
  useEffect(() => {
    if (guidedStep === "repairingDns") s.setView(desktopGuide ? "desktop" : "dns-dhcp");
  }, [guidedStep, s.setView, desktopGuide]);
  useEffect(() => { setGuideFeedback(""); }, [guidedStep]);
  useEffect(() => {
    if (s.state && scenarioGuide.matches("active")) sendScenarioGuide({ type: "STATE_CHANGED", state: s.state });
  }, [s.state, scenarioGuide.value, scenarioId, scenarioGuide.context.stepIndex, sendScenarioGuide]);
  useEffect(() => {
    if (!scenarioStep) return;
    s.setView(desktopGuide ? "desktop" : scenarioStep.view);
    setMenu(false);
    setGuideFeedback("");
  }, [scenarioId, scenarioStep?.id, s.setView, desktopGuide]);
  const current = views.find((item) => item.id === s.view)!;
  function navigate(view: SystemView) { s.setView(view); setMenu(false); }
  function startDnsGuide() { const desktop = s.view === "desktop" || initialDesktop; setDesktopGuide(desktop); guideRun.current += 1; setGuide(false); setMenu(false); setGuideFeedback(""); sendScenarioGuide({ type: "STOP" }); s.setView(desktop ? "desktop" : "terminal"); sendDnsGuide({ type: "START" }); }
  function startScenarioGuide(guideId: ScenarioGuideId) {
    guideRun.current += 1;
    const immersive = initialDesktop || s.view === "desktop";
    setDesktopGuide(immersive);
    setGuide(false); setMenu(false); setGuideFeedback("");
    sendDnsGuide({ type: "STOP" });
    sendScenarioGuide({ type: "START", guideId });
    s.setView(immersive ? "desktop" : scenarioGuides[guideId].steps[0].view);
  }
  function stopGuide() { guideRun.current += 1; setGuideFeedback(""); sendDnsGuide({ type: "STOP" }); sendScenarioGuide({ type: "STOP" }); }
  function focusGuideTarget() {
    s.setView(desktopGuide ? "desktop" : scenarioOpen ? scenarioStep?.view || "overview" : guidedStep === "complete" ? "overview" : guidedStep === "repairingDns" ? "dns-dhcp" : "terminal");
    setMenu(false);
    setFocusRequest((value) => value + 1);
  }
  function finishGuidedCommand(device: DeviceId, command: string, output: string, revision: number) {
    if (guideRunId !== guideRun.current) return;
    const latest = useSystemLab.getState();
    if (!latest.state || latest.sessionId !== s.sessionId || latest.generation !== s.generation || latest.state.revision !== revision) {
      setGuideFeedback("Cấu hình đã thay đổi sau phép kiểm tra. Hãy kiểm tra lại ở trạng thái hiện tại.");
      return;
    }
    const event = { type: "DIAGNOSTIC" as const, device, command, output };
    if (scenarioOpen) {
      setGuideFeedback("");
      sendScenarioGuide({ ...event, state: latest.state });
    } else {
      setGuideFeedback(getDnsGuideFeedback(guidedStep, event) || "");
      sendDnsGuide(event);
    }
  }
  function download() {
    if (!s.state) return;
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, state: s.state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "supportlab-session.json"; a.click(); URL.revokeObjectURL(url);
  }
  const immersiveScenarioApp = scenarioStep?.target === "dhcp-running" ? "dhcp-manager" as const
    : scenarioStep?.target === "iis-pool" ? "iis-manager" as const
      : scenarioStep?.target === "disk-cleanup" || scenarioStep?.target === "disk-write" ? "files" as const
        : scenarioStep?.view === "network" ? "network" as const
          : scenarioStep?.view === "terminal" ? "terminal" as const : undefined;
  const immersiveScenarioDevice: DeviceId | undefined = scenarioStep
    ? scenarioStep.device ?? (scenarioStep.view === "network" ? "client" : "server") : undefined;
  const immersiveGuide = scenarioOpen && scenarioId
    ? <ScenarioGuidePanel guideId={scenarioId} stepIndex={scenarioGuide.context.stepIndex} complete={scenarioGuide.matches("complete")} onFocus={focusGuideTarget} onStop={stopGuide} />
    : guidedStep !== "idle" ? <DnsGuidePanel step={guidedStep} onFocus={focusGuideTarget} onStop={stopGuide} desktop /> : null;
  if (initialDesktop && !s.state) return <main className="iw-loading" aria-label="Đang mở mô phỏng"><Link href="/">← Trang chủ</Link><div role="status">{s.initializing ? <><LoaderCircle className="sl-spin" size={26} />Đang mở desktop mô phỏng…</> : <><p role="alert">{s.error || "Chưa mở được phiên."}</p><button className="sl-button" onClick={() => void s.initialize(launchPreset, initialLaunchId)}>Thử lại</button></>}</div></main>;
  if (initialDesktop && s.state) {
    return <MotionConfig reducedMotion="user"><ImmersiveWorkspace
      assistant={<SystemAssistant key={s.generation} />}
      guide={immersiveGuide}
      report={s.report}
      busy={s.busy}
      revision={s.state.revision}
      notice={s.notice}
      error={s.error}
      onDismiss={s.dismiss}
      onReset={() => setReset(true)}
      onExport={download}
      onStartGuide={!hasGuide ? (availableScenario ? () => startScenarioGuide(availableScenario) : s.state.roles.dns && !s.state.dns.running ? startDnsGuide : undefined) : undefined}
      guideActive={hasGuide}
      onLocateGuide={focusGuideTarget}
    >
      <DeviceDesktop key={s.generation} active guideStep={desktopGuide ? guidedStep : "idle"} focusRequest={focusRequest} feedback={guideFeedback}
        scenarioTarget={scenarioStep?.target} scenarioNote={scenarioNote} scenarioCommand={scenarioStep?.command}
        scenarioDevice={immersiveScenarioDevice} scenarioApp={immersiveScenarioApp} onDiagnostic={finishGuidedCommand} />
    </ImmersiveWorkspace>{reset && <Dialog labelId="immersive-session-title" onClose={() => setReset(false)}><h2 id="immersive-session-title">Tạo phiên hệ thống</h2><label className="sl-session-select">Trạng thái ban đầu<select aria-label="Trạng thái ban đầu" value={presetId} onChange={(e) => setPresetId(e.target.value)}>{simulationPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><p className="sl-dialog-copy">Cấu hình hiện tại, kết quả kiểm tra và các cửa sổ sẽ được đặt lại.</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setReset(false)}>Hủy</button><button className="sl-button sl-primary" disabled={s.busy} onClick={async () => { if (await s.reset(presetId)) { stopGuide(); setSessionPreset(presetId); setReset(false); } }}><RefreshCw size={15} />Tạo phiên</button></div></Dialog>}</MotionConfig>;
  }
  return <MotionConfig reducedMotion="user"><div className="sl-app">
    <aside className={"sl-sidebar " + (menu ? "is-open" : "")}><Link className="sl-brand" href="/"><span><Layers size={24} /></span><strong>SupportLab<small>SYSTEMS WORKSPACE</small></strong></Link><button className="sl-icon sl-menu-close" title="Đóng điều hướng" aria-label="Đóng điều hướng" onClick={() => setMenu(false)}><X size={20} /></button>
      <div className="sl-workspace-name"><span className="sl-live-dot" /><div><strong>Phòng hệ thống</strong><small>WORKSPACE / LOCAL</small></div><ShieldCheck size={17} /></div>
      <span className="sl-nav-label">KHÔNG GIAN LÀM VIỆC</span><nav aria-label="Không gian hệ thống">{views.map(({ id, label, icon: Icon }) => <button key={id} aria-current={s.view === id ? "page" : undefined} className={s.view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{s.view === id && <i />}</button>)}</nav>
      <div className="sl-sidebar-bottom"><span className="sl-nav-label">MÔ-ĐUN KHÁC</span><Link href="/handbook"><BookOpen size={18} /><span>Sổ tay cài Windows</span><ArrowRight size={15} /></Link><div className="sl-environment"><span>WINDOWS SERVER 2022</span><strong>Standalone / Workgroup</strong><small>Web state simulation · 0.2</small></div></div>
    </aside>
    {menu && <button className="sl-scrim" aria-label="Đóng menu" onClick={() => setMenu(false)} />}
    <div className="sl-main"><header className="sl-topbar"><div><button className="sl-icon sl-menu-open" aria-label="Mở điều hướng" title="Mở điều hướng" onClick={() => setMenu(true)}><Menu size={21} /></button><Link className="sl-home-link" href="/" title="Chọn mô phỏng"><ArrowLeft size={15} /><span>Chọn mô phỏng</span></Link><ChevronRight size={14} /><strong>{current.label}</strong></div><div><span className="sl-local-tag"><span className="sl-live-dot" />Mô phỏng Web</span><button className="sl-icon" title="Thông tin phiên bản" aria-label="Thông tin phiên bản" onClick={() => setInfo(true)}><CircleHelp size={18} /></button></div></header>
      <main className="sl-content"><div className="sl-page-title"><div><div className="sl-eyebrow">SUPPORTLAB / SYSTEM SIMULATOR</div><h1>Phòng mô phỏng hệ thống</h1><span>Windows Server <i />DNS · DHCP · IIS · System</span></div><div className="sl-page-actions"><button className="sl-icon" aria-label="Xuất trạng thái phiên" title="Xuất trạng thái phiên" disabled={!s.state || s.busy} onClick={download}><Download size={18} /></button><button className="sl-button" disabled={!s.state || s.busy} onClick={() => setReset(true)}><Plus size={16} />Tạo phiên mới</button></div></div>
        {!s.state ? <div className="sl-loading" role="status">{s.initializing ? <><LoaderCircle className="sl-spin" size={22} />Đang mở phòng mô phỏng…</> : <><p role="alert">{s.error || "Chưa mở được phiên."}</p><button className="sl-button" onClick={() => void s.initialize(launchPreset, initialLaunchId)}><RefreshCw size={16} />Thử lại</button></>}</div> : <div data-testid="system-ready">
          <div className="sl-workspace-strip"><span><Server size={16} /><strong>SRV-01</strong><code>{s.state.server.ip}</code></span><span><Monitor size={16} /><strong>CLIENT-01</strong><code>{s.state.client.ip}</code></span><span className="sl-revision-strip">{s.busy ? <LoaderCircle className="sl-spin" size={13} /> : <Check size={13} />}r{s.state.revision}</span></div>
          <div className="sl-session-report"><span className="sl-report-label">GHI NHẬN PHIÊN</span><p>{s.report}</p></div>
          {(s.error || s.notice) && <div className={"sl-notice " + (s.error ? "error" : "")} role={s.error ? "alert" : "status"}><Activity size={16} /><span>{s.error || s.notice}</span><button className="sl-icon" title="Đóng thông báo" aria-label="Đóng thông báo" onClick={s.dismiss}><X size={15} /></button></div>}
          <div className="sl-workspace-grid"><div className="sl-workbench"><div className="sl-workbench-bar"><div><current.icon size={18} /><h2>{current.label}</h2></div><div className="sl-workbench-actions">{!hasGuide && availableScenario ? <button className="sl-button sl-guide-start" onClick={() => startScenarioGuide(availableScenario)}><Route size={15} />Dẫn thao tác {scenarioGuides[availableScenario].label}</button> : !hasGuide && s.state.roles.dns && !s.state.dns.running && getPortalFlow(s.state).network && <button className="sl-button sl-guide-start" onClick={startDnsGuide}><Route size={15} />Dẫn thao tác DNS</button>}<button className={"sl-button sl-guide-button " + (guide ? "active" : "")} aria-expanded={guide} onClick={() => setGuide(!guide)}><BookOpen size={15} />Ghi chú công cụ</button></div></div>
            {guide && <Guidance onClose={() => setGuide(false)} />}
            {guidedStep !== "idle" && <DnsGuidePanel step={guidedStep} onFocus={focusGuideTarget} onStop={stopGuide} desktop={desktopGuide} />}
            {scenarioOpen && scenarioId && <ScenarioGuidePanel guideId={scenarioId} stepIndex={scenarioGuide.context.stepIndex} complete={scenarioGuide.matches("complete")} onFocus={focusGuideTarget} onStop={stopGuide} />}
            {s.view !== "desktop" && (s.dnsObservation || guidedStep !== "idle" || ["overview", "dns-dhcp", "terminal"].includes(s.view)) && <DnsFlow observation={s.dnsObservation} revision={s.state.revision} />}
            <DeviceDesktop key={s.generation} active={s.view === "desktop"} guideStep={desktopGuide ? guidedStep : "idle"} focusRequest={focusRequest} feedback={guideFeedback} onDiagnostic={finishGuidedCommand} />
            <div className="sl-tool-content" hidden={s.view === "desktop"} key={s.generation + ":" + s.view}>
              {s.view === "overview" && <Overview onStartDnsGuide={startDnsGuide} />}
              {s.view === "dns-dhcp" && <DnsDhcpTools focusDnsStart={guidedStep === "repairingDns"} guideTarget={scenarioStep?.target} focusRequest={focusRequest} guideNote={guidedStep === "repairingDns" ? <DnsGuideTarget step={guidedStep} feedback={guideFeedback} /> : scenarioNote} />}
              {s.view === "iis" && <IisTools guideTarget={scenarioStep?.target} focusRequest={focusRequest} guideNote={scenarioNote} />}
              {s.view === "network" && <NetworkTools guideTarget={scenarioStep?.target} focusRequest={focusRequest} guideNote={scenarioNote} />}
              {s.view === "system" && <WindowsTools guideTarget={scenarioStep?.target} focusRequest={focusRequest} guideNote={scenarioNote} />}
              {s.view === "terminal" && <TerminalTools guideCommand={scenarioStep?.command || activeGuide?.command} guideDevice={scenarioStep?.device || activeGuide?.device} focusRequest={focusRequest} guideDescriptionId={scenarioOpen ? "scenario-guide-target" : "dns-guide-target"} guideActive={terminalGuided || !!scenarioStep?.command} guideNote={terminalGuided ? <DnsGuideTarget step={guidedStep as Exclude<DnsGuideStep, "idle" | "repairingDns" | "complete">} feedback={guideFeedback} /> : scenarioNote} onGuidedDiagnostic={finishGuidedCommand} />}
              {s.view === "events" && <EventTools />}
            </div>
          </div><SystemAssistant key={s.generation} /></div>
          <footer className="sl-footer"><span><ShieldCheck size={13} />Không truy cập thiết bị hoặc mạng thật</span><span>Nguyên mẫu nghiên cứu · Chưa kiểm chứng đầy đủ với máy thật</span></footer>
        </div>}
      </main>
    </div>
    {reset && <Dialog labelId="system-session-title" onClose={() => setReset(false)}><h2 id="system-session-title">Tạo phiên hệ thống</h2><label className="sl-session-select">Trạng thái ban đầu<select aria-label="Trạng thái ban đầu" value={presetId} onChange={(e) => setPresetId(e.target.value)}>{simulationPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><p className="sl-dialog-copy">Cấu hình hiện tại, kết quả kiểm tra và hội thoại sẽ được đặt lại.</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setReset(false)}>Hủy</button><button className="sl-button sl-primary" disabled={s.busy} onClick={async () => { if (await s.reset(presetId)) { stopGuide(); setSessionPreset(presetId); setReset(false); } }}><RefreshCw size={15} />Tạo phiên</button></div></Dialog>}
    {info && <Dialog labelId="system-info-title" onClose={() => setInfo(false)}><h2 id="system-info-title">SupportLab · Nguyên mẫu 0.2</h2><div className="sl-dialog-copy"><p>Mô phỏng theo trạng thái, không phải máy ảo Windows Server. Chỉ hỗ trợ tập thao tác và lệnh giới hạn.</p><p>Phiên nằm trong bộ nhớ máy chủ ứng dụng; tải lại trang tạo phiên mới. Tệp xuất chỉ phục vụ tham khảo, chưa hỗ trợ nhập lại.</p><p>Trợ lý dùng quy tắc cục bộ khi chưa cấu hình API. Chế độ AI cần model và API key riêng; kết quả chưa thay thế kiểm chứng kỹ thuật.</p></div><div className="modal-actions"><button className="sl-button" onClick={() => setInfo(false)}>Đóng</button></div></Dialog>}
  </div></MotionConfig>;
}
