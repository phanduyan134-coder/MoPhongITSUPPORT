"use client";

import { useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AppWindow, CheckCircle2, ChevronRight, FileClock, Globe, HardDrive, LayoutGrid, Maximize2, Minus, Monitor, Network, Play, Server, Settings, ShieldCheck, Square, Terminal, X } from "lucide-react";
import { allowedDesktopApps, createDesktopState, reduceDesktopState, type DesktopWindow, type DeviceDesktopApp } from "@/lib/device-desktop";
import { useSystemLab } from "@/lib/system-store";
import type { DeviceId } from "@/lib/system-simulator";
import { dnsGuideCopy, type DnsGuideStep } from "@/lib/system-guide-machine";
import { DnsGuideTarget } from "./system-guide-ui";
import { DhcpManager, EventViewer, FileExplorer, IisManager, WorkerProperties } from "./desktop-system-apps";
import { Dialog } from "./dialog";

const machineNames = { server: "SRV-01", client: "CLIENT-01" };
const appInfo = {
  "server-manager": { title: "Server Manager", icon: Server },
  services: { title: "Services", icon: Settings },
  "dns-manager": { title: "DNS Manager", icon: Network },
  "dhcp-manager": { title: "DHCP Manager", icon: Network },
  "iis-manager": { title: "IIS Manager", icon: Globe },
  files: { title: "File Explorer", icon: HardDrive },
  worker: { title: "LabWorker", icon: Settings },
  events: { title: "Event Viewer", icon: FileClock },
  terminal: { title: "PowerShell", icon: Terminal },
  network: { title: "Cấu hình mạng", icon: Monitor },
  browser: { title: "Trình duyệt", icon: Globe },
};
type GuidedDiagnostic = (device: DeviceId, command: string, output: string, revision: number) => void;
type AppProps = { device: DeviceId; window: DesktopWindow; setDraft: (key: string, value: string) => void; open: (app: DeviceDesktopApp) => void; guideStep: DnsGuideStep; feedback: string; guideTarget?: string; guideNote?: ReactNode; guideApp?: DeviceDesktopApp; focusRequest?: number; onDiagnostic?: GuidedDiagnostic };

function ServiceManager({ window, setDraft, guideStep, feedback }: AppProps) {
  const { state, busy, act } = useSystemLab();
  const s = state!;
  const service = window.draft.service === "dhcp" ? "dhcp" : "dns";
  const running = s[service].running && s.roles[service];
  return <>
    <div className="wd-app-menu">Services (Local) <ChevronRight size={13} /> {machineNames.server}</div>
    <div className="wd-manager"><aside className="wd-tree"><strong><Settings size={16} /> Services (Local)</strong><p>Quản lý dịch vụ trên máy chủ đang chọn.</p></aside><div className="wd-content">
      <div className="wd-toolbar"><strong>{service === "dns" ? "DNS Server" : "DHCP Server"}</strong><span className={"wd-status " + (!running ? "is-stopped" : "")}>{s.roles[service] ? running ? "Running" : "Stopped" : "Not installed"}</span></div>
      <div className="wd-table"><table><thead><tr><th>Name</th><th>Status</th><th>Startup Type</th></tr></thead><tbody>{(["dns", "dhcp"] as const).map((name) => <tr key={name} aria-selected={name === service}><td><button onClick={() => setDraft("service", name)}>{name.toUpperCase()} Server</button></td><td>{!s.roles[name] ? "Not installed" : s[name].running ? "Running" : "Stopped"}</td><td>Automatic</td></tr>)}</tbody></table></div>
      <p>{service === "dns" ? "DNS Server trả lời yêu cầu phân giải tên từ máy trạm. Dừng dịch vụ này không làm mất kết nối IP với máy chủ." : "DHCP Server cấp địa chỉ và các tùy chọn mạng cho máy trạm. Máy trạm cần gia hạn để nhận cấu hình mới."}</p>
      {guideStep === "repairingDns" && service === "dns" && <DnsGuideTarget step={guideStep} feedback={feedback} desktop />}
      <div className="wd-toolbar"><button data-desktop-guide={guideStep === "repairingDns" && service === "dns" ? "target" : undefined} aria-describedby={guideStep === "repairingDns" ? "dns-guide-target" : undefined} className={guideStep === "repairingDns" && service === "dns" ? "sl-guide-focus" : ""} disabled={busy || !s.roles[service] || running} onClick={() => void act({ type: "service.toggle", service, running: true })}><Play size={14} />Start</button><button disabled={busy || !s.roles[service] || !running} onClick={() => void act({ type: "service.toggle", service, running: false })}><Square size={13} />Stop</button></div>
      {!s.roles[service] && <p className="wd-hint">Cài role tương ứng trong Server Manager trước khi khởi động dịch vụ.</p>}
    </div></div>
  </>;
}

function ServerManager({ open, guideApp }: AppProps) {
  const { state, busy, act } = useSystemLab();
  const [tools, setTools] = useState(false);
  const [manage, setManage] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const toolItems: { title: string; app: DeviceDesktopApp }[] = [
    { title: "DNS", app: "dns-manager" }, { title: "DHCP", app: "dhcp-manager" },
    { title: "Services", app: "services" }, { title: "Internet Information Services (IIS) Manager", app: "iis-manager" },
    { title: "Event Viewer", app: "events" }, { title: "Windows PowerShell", app: "terminal" },
  ];
  useEffect(() => {
    if (!tools) return;
    (menu.current?.querySelector<HTMLButtonElement>(`[data-os-app="${guideApp}"]`) ?? menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]'))?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && !toolsButton.current?.contains(event.target)) setTools(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [tools, guideApp]);
  return <><div className="wd-sm-header"><strong>Server Manager <span>› Dashboard</span></strong><div className="wd-sm-menus"><button aria-expanded={manage} onClick={() => { setManage(!manage); setTools(false); }}>Manage</button><button ref={toolsButton} data-os-control="tools" aria-haspopup="menu" aria-expanded={tools} onClick={() => { setTools(!tools); setManage(false); }}>Tools</button></div>
    {tools && <div ref={menu} className="wd-tools-menu" role="menu" aria-label="Server Manager Tools" onKeyDown={(event) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTools(false); toolsButton.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
      if (event.key === "Tab") setTools(false);
    }}>{toolItems.map(({ title, app }) => <button role="menuitem" key={app} data-os-app={app} onClick={() => { setTools(false); open(app); }}>{title}</button>)}</div>}
  </div><div className="wd-manager"><aside className="wd-tree"><strong>Server Manager</strong><button aria-current="page">Dashboard</button><span>Local Server</span><span>All Servers</span></aside><div className="wd-content"><h3>Welcome to Server Manager</h3><p>Máy chủ SRV-01 · Windows Server 2022 · Workgroup</p><div className="wd-toolbar"><button onClick={() => setManage(!manage)}>Add roles and features</button></div>{manage && <div className="wd-role-wizard"><h3>Add Roles and Features · Server Roles</h3><p>Chọn role cần cài trên SRV-01. Bản mô phỏng rút gọn các màn hình xác nhận của trình cài role.</p>{(["dns", "dhcp", "iis"] as const).map((role) => <div key={role}><span>{role === "iis" ? "Web Server (IIS)" : role.toUpperCase() + " Server"}</span><button disabled={busy || state!.roles[role]} onClick={() => void act({ type: "role.install", role })}>{state!.roles[role] ? "Installed" : "Add " + role.toUpperCase() + " role"}</button></div>)}</div>}<div className="wd-role-tiles">{(["dns", "dhcp", "iis"] as const).map((role) => <div key={role}><strong>{role === "iis" ? "IIS" : role.toUpperCase()}</strong><span>{state!.roles[role] ? "Installed" : "Not installed"}</span></div>)}</div><p className="wd-hint">Mở menu Tools ở góc phải để vào DNS, DHCP, Services hoặc IIS Manager. Cấu hình trên máy chủ sẽ tác động các phép kiểm từ CLIENT-01.</p></div></div></>;
}

function DnsManager({ window, setDraft }: AppProps) {
  const { state, act, busy } = useSystemLab();
  const s = state!;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(false);
  const level = Number(window.draft.level ?? 0);
  async function save(event: FormEvent) {
    event.preventDefault();
    await act({ type: "dns.record", address: window.draft.address ?? s.dns.record ?? "" });
  }
  function properties() { setDraft("address", s.dns.record ?? ""); setEditing(true); }
  return <><div className="wd-app-menu">File <span>Action</span><span>View</span><span>Help</span></div><div className="wd-manager"><aside className="wd-tree" aria-label="DNS console tree"><strong><Network size={16} />DNS</strong><button aria-label="SRV-01" aria-expanded={level >= 1} onClick={() => setDraft("level", level >= 1 ? "0" : "1")}>{level >= 1 ? "⌄" : "›"} SRV-01</button>{level >= 1 && <button aria-label="Forward Lookup Zones" aria-expanded={level >= 2} onClick={() => setDraft("level", level >= 2 ? "1" : "2")}>{level >= 2 ? "⌄" : "›"} Forward Lookup Zones</button>}{level >= 2 && <button aria-current={level >= 3 ? "page" : undefined} onClick={() => setDraft("level", "3")}>lab.test</button>}</aside><div className="wd-content"><div className="wd-toolbar"><h3>{level >= 3 ? "lab.test" : "DNS Manager"}</h3><span className={"wd-status " + (!s.dns.running || !s.roles.dns ? "is-stopped" : "")}>{!s.roles.dns ? "Role chưa cài" : s.dns.running ? "DNS Running" : "DNS Stopped"}</span></div>{level < 3 ? <p>Mở SRV-01 → Forward Lookup Zones → lab.test trong cây bên trái để xem bản ghi.</p> : <><div className="wd-table"><table><thead><tr><th>Name</th><th>Type</th><th>Data</th></tr></thead><tbody><tr aria-selected={selected} onDoubleClick={() => s.roles.dns && properties()}><td><button disabled={!s.roles.dns} onClick={() => setSelected(true)}>portal</button></td><td>Host (A)</td><td>{s.dns.record || "Chưa tạo"}</td></tr></tbody></table></div><div className="wd-toolbar"><button disabled={!selected || !s.roles.dns} onClick={properties}>Properties</button></div><p>Chọn portal rồi Properties, hoặc nhấp đúp dòng bản ghi để mở thuộc tính.</p></>}</div></div>{editing && <Dialog labelId="dns-record-properties-title" onClose={() => setEditing(false)}><form className="wd-form wd-properties-dialog" onSubmit={save}><h2 id="dns-record-properties-title">portal Properties</h2><span className="wd-properties-tab">Host (A)</span><label>Fully qualified domain name<input value="portal.lab.test" readOnly /></label><label>IPv4 address<input aria-label="IPv4 address" value={window.draft.address ?? ""} onChange={(event) => setDraft("address", event.target.value)} required maxLength={15} spellCheck={false} autoFocus /></label><p>Apply lưu bản ghi trên SRV-01. Sau đó chạy lại nslookup từ CLIENT-01.</p><div className="modal-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" disabled={busy || !s.roles.dns}>Apply</button><button type="button" disabled={busy || !s.roles.dns} onClick={async () => { await act({ type: "dns.record", address: window.draft.address ?? "" }); if (!useSystemLab.getState().error) setEditing(false); }}>OK</button></div></form></Dialog>}</>;
}

function NetworkProperties({ window, setDraft }: AppProps) {
  const { state, busy, act } = useSystemLab();
  const c = state!.client;
  const automatic = (window.draft.dhcp ?? String(c.dhcp)) === "true";
  const fields = [{ key: "ip", label: "IP address" }, { key: "prefix", label: "Subnet prefix length" }, { key: "gateway", label: "Default gateway" }, { key: "dns", label: "Preferred DNS server" }] as const;
  function apply(event: FormEvent) {
    event.preventDefault();
    void act({ type: "client.configure", config: automatic ? { ip: c.ip, prefix: c.prefix, gateway: c.gateway, dns: c.dns, dhcp: true } : { ip: window.draft.ip ?? c.ip, prefix: Number(window.draft.prefix ?? c.prefix), gateway: window.draft.gateway ?? c.gateway, dns: window.draft.dns ?? c.dns, dhcp: false } });
  }
  return <div className="wd-content"><h3>Ethernet · Internet Protocol Version 4 (TCP/IPv4)</h3><div className="wd-network-grid"><div><span className={"wd-status " + (!c.enabled || !c.link ? "is-down" : "")}>{c.enabled && c.link ? "Connected" : "Disconnected"}</span><p>CLIENT-01 · Ethernet0</p><dl><dt>IPv4 đang áp dụng</dt><dd>{c.ip}/{c.prefix}</dd><dt>DNS đang áp dụng</dt><dd>{c.dns || "Chưa có"}</dd></dl><div className="wd-toolbar"><button disabled={busy} onClick={() => void act({ type: "client.enabled", enabled: !c.enabled })}>{c.enabled ? "Disable adapter" : "Enable adapter"}</button><button disabled={busy} onClick={() => void act({ type: "client.link", connected: !c.link })}>{c.link ? "Rút cáp mô phỏng" : "Cắm cáp mô phỏng"}</button></div></div><form className="wd-form" onSubmit={apply}><label><input type="checkbox" checked={automatic} onChange={(event) => setDraft("dhcp", String(event.target.checked))} />Obtain configuration automatically (DHCP)</label>{fields.map(({ key, label }) => <label key={key}>{label}<input aria-label={label} value={automatic ? String(c[key]) : window.draft[key] ?? String(c[key])} onChange={(event) => setDraft(key, event.target.value)} disabled={automatic} required={key === "ip" || key === "prefix"} maxLength={key === "prefix" ? 2 : 15} /></label>)}<div className="wd-toolbar"><button disabled={busy} type="submit">Apply network settings</button><button disabled={busy || !c.dhcp} type="button" onClick={() => void act({ type: "client.renew" })}>Renew DHCP lease</button></div><small>Chọn DHCP rồi Apply để bật chế độ tự động; bấm Renew DHCP lease để nhận cấu hình từ máy chủ. DNS dùng để tra tên, gateway dùng khi đi tới mạng khác.</small></form></div></div>;
}

function DesktopTerminal({ device, window, setDraft, guideStep, feedback, guideNote, onDiagnostic }: AppProps) {
  const { state, terminal, busy, diagnose } = useSystemLab();
  const input = window.draft.command ?? "";
  const records = terminal.filter((record) => record.device === device);
  const last = records.at(-1);
  const guided = guideStep !== "idle" && guideStep !== "complete" && guideStep !== "repairingDns";
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [last?.id]);
  async function run(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const result = await diagnose(device, input.trim());
    if (result) onDiagnostic?.(device, input.trim(), result.output, result.revision);
  }
  return <div className="wd-terminal"><div className="wd-terminal-output" role="log" aria-label={"Kết quả PowerShell " + machineNames[device]} data-testid="desktop-terminal-output" data-status={last && last.revision !== state!.revision ? "stale" : "current"}><pre>Windows PowerShell · {machineNames[device]}{"\n"}Gõ help để xem các lệnh mô phỏng được hỗ trợ.</pre>{records.map((record) => <div key={record.id}><small>r{record.revision}{record.revision !== state!.revision ? " · Kết quả trước thay đổi, cần chạy lại" : ""}</small><pre><b>PS C:\Users\{device === "server" ? "Administrator" : "tech"}&gt; {record.command}</b>{"\n"}{record.output}</pre></div>)}<div ref={end} /></div>{guideNote}{guided && <DnsGuideTarget step={guideStep as Exclude<DnsGuideStep, "idle" | "complete" | "repairingDns">} feedback={feedback} desktop />}<form className={"wd-terminal-form " + (guided ? "sl-guide-focus" : "")} onSubmit={run}><span>PS &gt;</span><input aria-label={"Lệnh trên " + machineNames[device]} aria-describedby={guided ? "dns-guide-target" : undefined} data-desktop-guide={guided || !!guideNote ? "target" : undefined} value={input} maxLength={240} onChange={(event) => setDraft("command", event.target.value)} autoComplete="off" spellCheck={false} /><button disabled={busy || !input.trim()} type="submit"><Play size={14} />Chạy</button></form><div className="wd-command-list">{["ipconfig /all", "ping 192.168.10.10", "nslookup portal.lab.test", ...(device === "server" ? ["Get-Service DNS"] : ["curl http://portal.lab.test"])].map((command) => <button key={command} onClick={() => setDraft("command", command)}>{command}</button>)}</div></div>;
}

function DesktopBrowser({ window, setDraft, device, onDiagnostic }: AppProps) {
  const { state, busy, diagnose } = useSystemLab();
  const [result, setResult] = useState<{ output: string; revision: number; url: string } | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const url = window.draft.url ?? "http://portal.lab.test";
  async function visit(event: FormEvent) {
    event.preventDefault();
    const address = url.trim();
    if (!address || busy) return;
    setError("");
    let parsed: URL;
    try { parsed = new URL(address); } catch { setError("Nhập URL đầy đủ, ví dụ http://portal.lab.test."); return; }
    if (parsed.protocol !== "http:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || /\s/.test(address)) { setError("Mô phỏng hỗ trợ HTTP ở đường dẫn /, ví dụ http://portal.lab.test hoặc http://192.168.10.10."); return; }
    const generation = useSystemLab.getState().generation;
    const observation = await diagnose(device, "curl " + address);
    if (!observation || !mounted.current || generation !== useSystemLab.getState().generation) return;
    setResult({ ...observation, url: address });
    onDiagnostic?.(device, "curl " + address, observation.output, observation.revision);
  }
  const success = result?.output.startsWith("HTTP/1.1 200 OK");
  const stale = !!result && result.revision !== state!.revision;
  return <><form className="wd-browser-bar" onSubmit={visit}><Globe size={16} /><input aria-label="Địa chỉ website mô phỏng" value={url} onChange={(event) => setDraft("url", event.target.value)} maxLength={200} spellCheck={false} autoComplete="off" /><button type="submit" disabled={busy || !url.trim()}>Đi</button></form>{error && <p className="wd-hint" role="alert">{error}</p>}<div className={"wd-browser-page " + (success ? "is-success" : "")} data-testid="desktop-browser-output" data-status={stale ? "stale" : "current"}>{!result ? <div className="wd-empty"><Globe size={36} /><h3>Kiểm tra website từ CLIENT-01</h3><p>Nhập tên miền hoặc IP rồi bấm Đi. Yêu cầu sẽ đi qua cấu hình mạng, DNS và IIS của phiên mô phỏng.</p></div> : <>{stale && <p className="wd-hint is-stale" role="status">Cấu hình đã thay đổi. Bấm Đi để kiểm tra lại; trang bên dưới là kết quả cũ.</p>}<span className="wd-address">{result.url} · r{result.revision}</span>{success ? <><CheckCircle2 size={32} /><h2>Support Portal</h2><p>Website nội bộ đã phản hồi thành công từ SRV-01.</p><span className="wd-status">HTTP 200 OK</span></> : <><Globe size={32} /><h3>Không thể mở website</h3><p>Đọc kết quả bên dưới để phân biệt lỗi mạng, DNS và dịch vụ web.</p></>}<details open={!success}><summary>Kết quả HTTP mô phỏng</summary><pre>{result.output}</pre></details></>}</div></>;
}

export function DeviceDesktop({ active, guideStep = "idle", focusRequest = 0, feedback = "", scenarioTarget, scenarioNote, scenarioCommand, scenarioDevice, scenarioApp, onDiagnostic }: { active: boolean; guideStep?: DnsGuideStep; focusRequest?: number; feedback?: string; scenarioTarget?: string; scenarioNote?: ReactNode; scenarioCommand?: string; scenarioDevice?: DeviceId; scenarioApp?: DeviceDesktopApp; onDiagnostic?: GuidedDiagnostic }) {
  const { state, busy } = useSystemLab();
  const [desktop, dispatch] = useReducer(reduceDesktopState, undefined, () => createDesktopState());
  const [start, setStart] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const previousGuide = useRef("");
  const desktopRef = useRef<HTMLDivElement>(null);
  const device = desktop.selectedDevice;
  const current = desktop.devices[device];
  const s = state!;
  function open(app: DeviceDesktopApp) { dispatch({ type: "open", device, app }); setStart(false); }
  useEffect(() => {
    const scenarioActive = Boolean(scenarioApp && scenarioDevice);
    if (!active || (!scenarioActive && (guideStep === "idle" || guideStep === "complete"))) return;
    // Include the complete scenario target in the signature. Several guided
    // steps share the same app and have no target (for example consecutive
    // PowerShell checks); those steps still need to switch device and preload
    // their command when the guide advances.
    const signature = [guideStep, scenarioTarget ?? "", scenarioCommand ?? "", scenarioDevice ?? "", scenarioApp ?? "", focusRequest].join(":");
    if (signature === previousGuide.current) return;
    previousGuide.current = signature;
    const copy = guideStep !== "idle" && guideStep !== "complete" ? dnsGuideCopy[guideStep] : undefined;
    const targetDevice = scenarioDevice ?? (guideStep === "repairingDns" ? "server" : copy?.device ?? "client");
    const app = scenarioApp ?? (guideStep === "repairingDns" ? "services" : "terminal");
    dispatch({ type: "select-device", device: targetDevice });
    dispatch({ type: "open", device: targetDevice, app });
    const command = scenarioCommand ?? copy?.command;
    if (command) dispatch({ type: "set-draft", device: targetDevice, app, key: "command", value: command });
    if (app === "services") dispatch({ type: "set-draft", device: targetDevice, app, key: "service", value: "dns" });
    setStart(false);
  }, [active, guideStep, focusRequest, scenarioApp, scenarioCommand, scenarioDevice, scenarioTarget]);
  useEffect(() => {
    const scenarioActive = Boolean(scenarioApp && scenarioDevice);
    if (!active || (!scenarioActive && (guideStep === "idle" || guideStep === "complete"))) { previousGuide.current = ""; return; }
    const target = shell.current?.querySelector<HTMLElement>('[data-desktop-guide="target"]:not([disabled]), [data-scenario-target="target"]:not([disabled])');
    if (target && !target.closest("[hidden]")) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [active, guideStep, focusRequest, device, current.activeApp, scenarioApp, scenarioDevice, scenarioTarget]);
  useEffect(() => {
    if (!active || (guideStep !== "idle" && guideStep !== "complete")) return;
    const target = shell.current?.querySelector<HTMLElement>(".wd-window:not([hidden])") ?? desktopRef.current;
    target?.focus({ preventScroll: true });
  }, [active, device, current.activeApp, guideStep]);
  const link = s.client.link && s.client.enabled;
  const dnsGuided = guideStep !== "idle" && guideStep !== "complete";
  return <div ref={shell} className="wd-shell" data-testid="device-desktop" hidden={!active}>
    <div className="wd-topology" aria-label="Sơ đồ máy chủ và máy trạm"><button className={"wd-device " + (device === "client" ? "is-selected" : "")} aria-label="Chọn máy trạm CLIENT-01" aria-pressed={device === "client"} onClick={() => { dispatch({ type: "select-device", device: "client" }); setStart(false); }}><Monitor size={23} /><span><strong>CLIENT-01</strong><small>Máy trạm · {s.client.ip}</small></span></button><span className={"wd-link " + (!link ? "is-down" : "")} aria-label={link ? "Ethernet kết nối" : "Ethernet ngắt"} /><span className="wd-switch"><Network size={20} /><small>SW-01</small></span><span className="wd-link" /><button className={"wd-device " + (device === "server" ? "is-selected" : "")} aria-label="Chọn máy chủ SRV-01" aria-pressed={device === "server"} onClick={() => { dispatch({ type: "select-device", device: "server" }); setStart(false); }}><Server size={23} /><span><strong>SRV-01</strong><small>Máy chủ · {s.server.ip}</small></span></button></div>
    <div className="wd-guidance"><Monitor size={16} /><p>Chọn máy ở sơ đồ, sau đó mở ứng dụng trên desktop. Thao tác trên SRV-01 ảnh hưởng kết quả truy cập từ CLIENT-01.</p><span className="wd-status">{busy ? "Đang xử lý…" : "r" + s.revision}</span></div>
    <div className={"wd-desktop " + (device === "server" ? "is-server" : "is-client")} ref={desktopRef} tabIndex={-1} aria-label={"Desktop " + machineNames[device]}>
      <div className="wd-desktop-header"><strong>{machineNames[device]}</strong><span>{device === "server" ? "Windows Server 2022" : "Windows Client"} · Mô phỏng</span></div>
      <div className="wd-desktop-icons">{allowedDesktopApps(device).map((app) => { const { title, icon: Icon } = appInfo[app]; return <button className="wd-shortcut" key={app} aria-label={"Mở " + title} onClick={() => open(app)}><Icon size={27} /><span>{title}</span></button>; })}</div>
      {(["server", "client"] as const).flatMap((machine) => desktop.devices[machine].windows.map((window) => {
        const { title, icon: Icon } = appInfo[window.app];
        const visible = machine === device && !window.minimized && desktop.devices[machine].activeApp === window.app;
        const props: AppProps = { device: machine, window, setDraft: (key, value) => dispatch({ type: "set-draft", device: machine, app: window.app, key, value }), open: (app) => dispatch({ type: "open", device: machine, app }), guideStep: visible && active && dnsGuided ? guideStep : "idle", feedback, guideTarget: visible && active ? scenarioTarget : undefined, guideNote: visible && active ? scenarioNote : undefined, guideApp: visible && active ? scenarioApp : undefined, focusRequest, onDiagnostic };
        return <section role="region" tabIndex={-1} aria-label={title + " · " + machineNames[machine]} className={"wd-window is-active " + (window.maximized ? "is-maximized" : "")} key={machine + window.app} hidden={!visible}>
          <header className="wd-titlebar"><span><Icon size={15} />{title} <small>· {machineNames[machine]}</small></span><div className="wd-window-actions"><button aria-label={"Thu nhỏ " + title} onClick={() => dispatch({ type: "minimize", device: machine, app: window.app })}><Minus size={15} /></button><button aria-label={(window.maximized ? "Khôi phục " : "Phóng to ") + title} onClick={() => dispatch({ type: "toggle-maximize", device: machine, app: window.app })}>{window.maximized ? <AppWindow size={14} /> : <Maximize2 size={13} />}</button><button aria-label={"Đóng " + title} onClick={() => dispatch({ type: "close", device: machine, app: window.app })}><X size={16} /></button></div></header>
          <div className="wd-window-body">{window.app === "services" ? <ServiceManager {...props} /> : window.app === "server-manager" ? <ServerManager {...props} /> : window.app === "dns-manager" ? <DnsManager {...props} /> : window.app === "dhcp-manager" ? <DhcpManager draft={window.draft} setDraft={props.setDraft} guideTarget={props.guideTarget} focusRequest={focusRequest} guideNote={props.guideNote} /> : window.app === "iis-manager" ? <IisManager draft={window.draft} setDraft={props.setDraft} guideTarget={props.guideTarget} focusRequest={focusRequest} guideNote={props.guideNote} /> : window.app === "files" ? <FileExplorer draft={window.draft} setDraft={props.setDraft} guideTarget={props.guideTarget} focusRequest={focusRequest} guideNote={props.guideNote} /> : window.app === "worker" ? <WorkerProperties draft={window.draft} setDraft={props.setDraft} /> : window.app === "events" ? <EventViewer /> : window.app === "network" ? <NetworkProperties {...props} /> : window.app === "terminal" ? <DesktopTerminal {...props} /> : <DesktopBrowser {...props} />}</div>
        </section>;
      }))}
      {!current.activeApp && <div className="wd-desktop-welcome" aria-hidden="true"><div className="wd-windows-mark"><i /><i /><i /><i /></div><span>{device === "server" ? "Windows Server" : "Windows"}</span></div>}
      {start && <div className="wd-start-menu" aria-label="Ứng dụng mô phỏng"><strong>{machineNames[device]} · Ứng dụng</strong>{allowedDesktopApps(device).map((app) => { const { title, icon: Icon } = appInfo[app]; return <button key={app} onClick={() => open(app)}><Icon size={18} />{title}</button>; })}</div>}
      <div className="wd-taskbar"><button className="wd-start" aria-label="Start menu" aria-expanded={start} onClick={() => setStart(!start)}><LayoutGrid size={22} /></button>{current.windows.map((window) => { const { title, icon: Icon } = appInfo[window.app]; return <button key={window.app} className={"wd-task " + (current.activeApp === window.app ? "is-active" : "")} aria-label={"Khôi phục cửa sổ " + title} aria-pressed={current.activeApp === window.app} onClick={() => dispatch({ type: "restore", device, app: window.app })}><Icon size={18} /><span>{title}</span></button>; })}<div className="wd-taskbar-tray"><Network size={15} /><span>{machineNames[device]}</span><ShieldCheck size={15} /></div></div>
    </div>
    <p className="wd-hint">Desktop tái hiện một số công cụ quản trị. Các cửa sổ cùng dùng trạng thái của phiên, kết quả lệnh và lịch sử mà AI Agent đang đọc.</p>
  </div>;
}
