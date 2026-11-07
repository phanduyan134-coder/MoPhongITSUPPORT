"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { File, FolderOpen, Globe, HardDrive, Play, Plus, RefreshCw, RotateCcw, Route, Save, Server, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import { freeSpaceMB, type DeviceId } from "@/lib/system-simulator";
import type { ScenarioGuideTarget } from "@/lib/scenario-guide-machine";
import { useSystemLab } from "@/lib/system-store";
import { Dialog } from "./dialog";

export function ToolHeading({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="sl-tool-heading"><span className="sl-tool-icon">{icon}</span><div><h2>{title}</h2><span>{subtitle}</span></div>{children}</div>;
}

export function Status({ on, yes = "Running", no = "Stopped" }: { on: boolean; yes?: string; no?: string }) {
  return <span className={"sl-status " + (on ? "is-up" : "is-down")}><i />{on ? yes : no}</span>;
}

export type ScenarioFocusProps = { guideTarget?: ScenarioGuideTarget; guideNote?: ReactNode; focusRequest?: number };

function focusGuideControl(control: HTMLElement | null) {
  if (!control) return;
  control?.focus({ preventScroll: true });
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  const descriptionId = control.getAttribute("aria-describedby");
  const note = descriptionId ? document.getElementById(descriptionId) : null;
  // Keep the explanation and its control together when both fit in the viewport.
  if (note && control.getBoundingClientRect().bottom - note.getBoundingClientRect().top <= window.innerHeight - 48) {
    note.scrollIntoView({ block: "start", behavior });
  } else control.scrollIntoView({ block: "center", behavior });
}

function ApplyButton({ children, describedBy }: { children: ReactNode; describedBy?: string }) { return <button type="submit" className="sl-button sl-primary" aria-describedby={describedBy}><Save size={15} />{children}</button>; }

export function NetworkTools({ guideTarget, guideNote, focusRequest = 0 }: ScenarioFocusProps = {}) {
  const { state, busy, act } = useSystemLab();
  const n = state!.client;
  const [draft, setDraft] = useState({ ip: n.ip, prefix: n.prefix, gateway: n.gateway, dns: n.dns, dhcp: n.dhcp });
  const dhcpToggle = useRef<HTMLInputElement>(null);
  const gatewayInput = useRef<HTMLInputElement>(null);
  const renewButton = useRef<HTMLButtonElement>(null);
  const guideGateway = guideTarget === "client-gateway";
  const guideRenew = guideTarget === "client-renew";
  useEffect(() => setDraft({ ip: n.ip, prefix: n.prefix, gateway: n.gateway, dns: n.dns, dhcp: n.dhcp }), [n.ip, n.prefix, n.gateway, n.dns, n.dhcp]);
  useEffect(() => {
    if (guideGateway) focusGuideControl(draft.dhcp ? dhcpToggle.current : gatewayInput.current);
    if (guideRenew) focusGuideControl(n.dhcp ? renewButton.current : dhcpToggle.current);
  }, [guideGateway, guideRenew, focusRequest, draft.dhcp, n.dhcp]);
  function apply(e: FormEvent) { e.preventDefault(); void act({ type: "client.configure", config: draft }); }
  return <section aria-label="Cấu hình mạng máy trạm">
    <ToolHeading icon={<Globe size={21} />} title="Ethernet · CLIENT-01" subtitle="IPv4 / Bộ điều hợp mạng"><Status on={n.link && n.enabled} yes="Link up" no="Link down" /></ToolHeading>
    <div className="sl-toggle-row"><label><input type="checkbox" aria-label="Kết nối cáp mạng" checked={n.link} disabled={busy} onChange={(e) => void act({ type: "client.link", connected: e.target.checked })} />Kết nối cáp mạng</label><label><input type="checkbox" aria-label="Bật bộ điều hợp" checked={n.enabled} disabled={busy} onChange={(e) => void act({ type: "client.enabled", enabled: e.target.checked })} />Bật bộ điều hợp</label></div>
    <form onSubmit={apply}><fieldset disabled={busy}>
      {guideGateway && draft.dhcp && guideNote}
      <label className={"sl-check sl-field-band " + (guideGateway && draft.dhcp ? "sl-guide-focus" : "")}><input ref={dhcpToggle} type="checkbox" aria-label="Nhận IP qua DHCP" aria-describedby={guideGateway || guideRenew ? "scenario-guide-target" : undefined} checked={draft.dhcp} onChange={(e) => setDraft({ ...draft, dhcp: e.target.checked })} />Nhận IP qua DHCP</label>
      <div className="sl-form-grid">
        <label>Địa chỉ IPv4<input aria-label="IPv4 máy trạm" required value={draft.ip} disabled={draft.dhcp} onChange={(e) => setDraft({ ...draft, ip: e.target.value })} /></label>
        <label>Prefix<input aria-label="Prefix máy trạm" type="number" min={1} max={30} required value={draft.prefix} disabled={draft.dhcp} onChange={(e) => setDraft({ ...draft, prefix: Number(e.target.value) })} /></label>
        {guideGateway && !draft.dhcp && <div className="sl-guide-grid-note">{guideNote}</div>}
        <label className={guideGateway && !draft.dhcp ? "sl-guide-focus" : undefined}>Default gateway<input ref={gatewayInput} aria-label="Gateway máy trạm" aria-describedby={guideGateway ? "scenario-guide-target" : undefined} required value={draft.gateway} disabled={draft.dhcp} onChange={(e) => setDraft({ ...draft, gateway: e.target.value })} /></label>
        <label>DNS server<input aria-label="DNS máy trạm" required value={draft.dns} disabled={draft.dhcp} onChange={(e) => setDraft({ ...draft, dns: e.target.value })} /></label>
      </div>
      {guideRenew && guideNote}
      <div className="sl-form-actions"><span className={guideGateway && !draft.dhcp ? "sl-guide-focus" : undefined}><ApplyButton describedBy={guideGateway ? "scenario-guide-target" : undefined}>Áp dụng mạng</ApplyButton></span><button ref={renewButton} type="button" className={"sl-button " + (guideRenew ? "sl-guide-focus" : "")} aria-describedby={guideRenew ? "scenario-guide-target" : undefined} disabled={!n.dhcp} onClick={() => void act({ type: "client.renew" })}><RefreshCw size={15} />Gia hạn DHCP</button></div>
    </fieldset></form>
    <div className="sl-detail-band"><h3>Cấu hình đang áp dụng</h3><dl><div><dt>IPv4</dt><dd>{n.ip}/{n.prefix}</dd></div><div><dt>Gateway</dt><dd>{n.gateway}</dd></div><div><dt>DNS</dt><dd>{n.dns}</dd></div></dl></div>
  </section>;
}

export function DnsDhcpTools({ focusDnsStart = false, focusRequest = 0, guideNote, guideTarget }: ScenarioFocusProps & { focusDnsStart?: boolean }) {
  const { state, busy, act } = useSystemLab();
  const s = state!;
  const dnsToggle = useRef<HTMLInputElement>(null);
  const dhcpToggle = useRef<HTMLInputElement>(null);
  const guideDhcp = guideTarget === "dhcp-running";
  const [address, setAddress] = useState(s.dns.record || "");
  const [scope, setScope] = useState({ start: s.dhcp.start, end: s.dhcp.end, gateway: s.dhcp.gateway, dns: s.dhcp.dns, active: s.dhcp.active });
  useEffect(() => { setAddress(s.dns.record || ""); }, [s.dns.record]);
  useEffect(() => { setScope({ start: s.dhcp.start, end: s.dhcp.end, gateway: s.dhcp.gateway, dns: s.dhcp.dns, active: s.dhcp.active }); }, [s.dhcp.start, s.dhcp.end, s.dhcp.gateway, s.dhcp.dns, s.dhcp.active]);
  useEffect(() => {
    if (!focusDnsStart || s.dns.running) return;
    dnsToggle.current?.focus({ preventScroll: true });
    dnsToggle.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [focusDnsStart, focusRequest, s.dns.running]);
  useEffect(() => {
    if (guideDhcp && !s.dhcp.running) focusGuideControl(dhcpToggle.current);
  }, [guideDhcp, focusRequest, s.dhcp.running]);
  return <section aria-label="DNS và DHCP Server">
    <ToolHeading icon={<Server size={21} />} title="DNS / DHCP Server" subtitle="SRV-01 · Windows Server 2022" />
    {!guideDhcp && guideNote}
    <div className="sl-role-list">{(["dns", "dhcp"] as const).map((role) => <Fragment key={role}>
      {role === "dhcp" && guideDhcp && guideNote}
      <div className={(role === "dns" && focusDnsStart && !s.dns.running) || (role === "dhcp" && guideDhcp && !s.dhcp.running) ? "sl-guide-focus" : ""}><div><strong>{role.toUpperCase()} Server</strong><span>{s.roles[role] ? "Role đã cài đặt" : "Chưa cài role"}</span></div>{s.roles[role] ? <label className="sl-check"><input ref={role === "dns" ? dnsToggle : dhcpToggle} type="checkbox" aria-label={role.toUpperCase() + " đang chạy"} aria-describedby={role === "dns" && focusDnsStart ? "dns-guide-target" : role === "dhcp" && guideDhcp ? "scenario-guide-target" : undefined} checked={s[role].running} disabled={busy} onChange={(e) => void act({ type: "service.toggle", service: role, running: e.target.checked })} /><Status on={s[role].running} /></label> : <button className="sl-button" disabled={busy} onClick={() => void act({ type: "role.install", role })}><Plus size={15} />Cài {role.toUpperCase()}</button>}</div>
    </Fragment>)}</div>
    <div className="sl-subsection"><h3>DNS Manager <span>Forward Lookup Zone · lab.test</span></h3>
      <form onSubmit={(e) => { e.preventDefault(); void act({ type: "dns.record", address }); }}><fieldset disabled={busy || !s.roles.dns}>
        <div className="sl-record-row"><div><strong>portal.lab.test</strong><span>Host (A)</span></div><label>Địa chỉ IPv4<input aria-label="Địa chỉ bản ghi A" required value={address} placeholder="192.168.10.10" onChange={(e) => setAddress(e.target.value)} /></label><button type="submit" className="sl-button" aria-label="Lưu bản ghi DNS"><Save size={15} />Lưu bản ghi</button></div>
      </fieldset></form>
    </div>
    <div className="sl-subsection"><h3>DHCP Manager <span>Scope · LAN-10</span></h3>
      <form onSubmit={(e) => { e.preventDefault(); void act({ type: "dhcp.configure", config: scope }); }}><fieldset disabled={busy || !s.roles.dhcp}>
        <div className="sl-form-grid"><label>Bắt đầu<input aria-label="DHCP bắt đầu" required value={scope.start} onChange={(e) => setScope({ ...scope, start: e.target.value })} /></label><label>Kết thúc<input aria-label="DHCP kết thúc" required value={scope.end} onChange={(e) => setScope({ ...scope, end: e.target.value })} /></label><label>003 · Router<input aria-label="DHCP gateway" required value={scope.gateway} onChange={(e) => setScope({ ...scope, gateway: e.target.value })} /></label><label>006 · DNS Servers<input aria-label="DHCP DNS" required value={scope.dns} onChange={(e) => setScope({ ...scope, dns: e.target.value })} /></label></div>
        <div className="sl-form-actions"><label className="sl-check"><input type="checkbox" aria-label="Kích hoạt scope" checked={scope.active} onChange={(e) => setScope({ ...scope, active: e.target.checked })} />Kích hoạt scope</label><ApplyButton>Áp dụng DHCP</ApplyButton></div>
      </fieldset></form>
      <div className="sl-lease"><span>Address Leases</span><strong>{s.dhcp.lease ? s.dhcp.lease.ip + " · CLIENT-01" : "Chưa có lease"}</strong></div>
    </div>
  </section>;
}

export function IisTools({ guideTarget, guideNote, focusRequest = 0 }: ScenarioFocusProps = {}) {
  const { state, busy, act, diagnose } = useSystemLab();
  const s = state!;
  const [config, setConfig] = useState(s.iis);
  const [url, setUrl] = useState("http://portal.lab.test");
  const [output, setOutput] = useState("");
  const [outputRevision, setOutputRevision] = useState<number | null>(null);
  const poolToggle = useRef<HTMLInputElement>(null);
  const guidePool = guideTarget === "iis-pool";
  useEffect(() => setConfig(s.iis), [s.iis]);
  useEffect(() => {
    if (guidePool) focusGuideControl(poolToggle.current);
  }, [guidePool, focusRequest]);
  async function visit(e: FormEvent) {
    e.preventDefault();
    const result = await diagnose("client", "curl " + url);
    if (result) { setOutput(result.output); setOutputRevision(result.revision); }
  }
  return <section aria-label="IIS Manager">
    <ToolHeading icon={<Globe size={21} />} title="IIS Manager" subtitle="SRV-01 / Sites / Support Portal"><Status on={s.roles.iis} yes="Role đã cài" no="Chưa cài role" /></ToolHeading>
    {!s.roles.iis && <button className="sl-button sl-primary" disabled={busy} onClick={() => void act({ type: "role.install", role: "iis" })}><Plus size={16} />Cài Web Server (IIS)</button>}
    {guidePool && guideNote}
    <form onSubmit={(e) => { e.preventDefault(); void act({ type: "iis.configure", config }); }}><fieldset disabled={busy || !s.roles.iis}>
      <div className="sl-subsection"><h3>Support Portal <span>HTTP binding</span></h3><div className="sl-form-grid"><label>Cổng HTTP<input aria-label="Cổng HTTP" type="number" min={1} max={65535} required value={config.port} onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })} /></label><div className="sl-readonly"><span>Host name</span><strong>portal.lab.test</strong></div></div>
        <div className="sl-toggle-row"><label><input type="checkbox" aria-label="Website đang chạy" checked={config.siteRunning} onChange={(e) => setConfig({ ...config, siteRunning: e.target.checked })} />Website đang chạy</label><label className={guidePool ? "sl-guide-focus" : undefined}><input ref={poolToggle} type="checkbox" aria-label="Application pool đang chạy" aria-describedby={guidePool ? "scenario-guide-target" : undefined} checked={config.poolRunning} onChange={(e) => setConfig({ ...config, poolRunning: e.target.checked })} />Application pool đang chạy</label></div>
        <div className="sl-form-actions"><span className={guidePool ? "sl-guide-focus" : undefined}><ApplyButton describedBy={guidePool ? "scenario-guide-target" : undefined}>Áp dụng IIS</ApplyButton></span></div>
      </div>
    </fieldset></form>
    <div className="sl-browser"><div className="sl-browser-chrome"><span /><span /><span /><strong>CLIENT-01 · HTTP</strong></div><form className="sl-address-bar" onSubmit={visit}><Globe size={16} /><input aria-label="Địa chỉ website" required value={url} onChange={(e) => setUrl(e.target.value)} /><button className="sl-icon" type="submit" aria-label="Truy cập website" title="Truy cập website" disabled={busy}><Play size={16} /></button></form><div className="sl-browser-result" data-testid="http-output">{output ? <><small>Revision {outputRevision}{outputRevision !== s.revision ? " · Kết quả trước khi cấu hình thay đổi" : ""}</small><pre>{output}</pre></> : <div className="sl-browser-empty"><Globe size={34} /><strong>Support Portal</strong><span>portal.lab.test</span></div>}</div></div>
  </section>;
}

export function WindowsTools({ guideTarget, guideNote, focusRequest = 0 }: ScenarioFocusProps = {}) {
  const { state, busy, act, diagnose } = useSystemLab();
  const s = state!;
  const [permissions, setPermissions] = useState({ shareRead: s.system.shareRead, ntfsRead: s.system.ntfsRead });
  const [worker, setWorker] = useState({ startup: s.system.startup, running: s.system.workerRunning });
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [reboot, setReboot] = useState(false);
  const [check, setCheck] = useState("");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const cleanupButton = useRef<HTMLButtonElement>(null);
  const writeButton = useRef<HTMLButtonElement>(null);
  const guideCleanup = guideTarget === "disk-cleanup";
  const guideWrite = guideTarget === "disk-write";
  const temporaryFileId = s.system.files.find((file) => file.id === "temp-cache" && !file.protected)?.id;
  useEffect(() => {
    if (confirm) return;
    if (guideCleanup) focusGuideControl(cleanupButton.current);
    if (guideWrite) focusGuideControl(writeButton.current);
  }, [guideCleanup, guideWrite, focusRequest, temporaryFileId, confirm]);
  useEffect(() => setPermissions({ shareRead: s.system.shareRead, ntfsRead: s.system.ntfsRead }), [s.system.shareRead, s.system.ntfsRead]);
  useEffect(() => setWorker({ startup: s.system.startup, running: s.system.workerRunning }), [s.system.startup, s.system.workerRunning]);
  const free = freeSpaceMB(s);
  async function shareCheck() {
    const result = await diagnose("client", "Test-Share tech");
    if (result) { setCheck(result.output); setCheckedAt(result.revision); }
  }
  return <section aria-label="Quản lý Windows Server">
    <ToolHeading icon={<HardDrive size={21} />} title="Windows Server" subtitle="SRV-01 · Tài nguyên & dịch vụ"><button className="sl-button" disabled={busy} onClick={() => setReboot(true)}><RotateCcw size={15} />Khởi động lại máy chủ</button></ToolHeading>
    <div className="sl-subsection"><h3><HardDrive size={16} />Data (D:)<span>{free} MB trống / {s.system.capacityMB} MB</span></h3><meter min={0} max={s.system.capacityMB} value={s.system.capacityMB - free} aria-label="Dung lượng ổ D đã dùng" className={free < 20 ? "is-full" : ""} />
      {guideCleanup && guideNote}
      <div className="sl-file-list">{s.system.files.map((file) => <div key={file.id} className={guideCleanup && file.id === temporaryFileId ? "sl-guide-focus" : undefined}><File size={16} /><span><strong>{file.name}</strong><small>{file.protected ? "Bảo vệ trong mô phỏng" : file.id === "temp-cache" ? "Cache được phép dọn trong tình huống mẫu" : "Chưa xác nhận được phép dọn"}</small></span><code>{file.sizeMB} MB</code><button ref={file.id === temporaryFileId ? cleanupButton : undefined} className="sl-icon" title={"Xóa " + file.name} aria-label={"Xóa " + file.name} aria-describedby={guideCleanup && file.id === temporaryFileId ? "scenario-guide-target" : undefined} disabled={busy || file.protected} onClick={() => setConfirm({ id: file.id, name: file.name })}><Trash2 size={16} /></button></div>)}</div>
      {guideWrite && guideNote}
      <button ref={writeButton} className={"sl-button " + (guideWrite ? "sl-guide-focus" : "")} aria-describedby={guideWrite ? "scenario-guide-target" : undefined} disabled={busy} onClick={() => void act({ type: "file.write" })}><Plus size={15} />Ghi tệp kiểm tra 10 MB</button>
    </div>
    <div className="sl-subsection"><h3><FolderOpen size={16} />SupportShare<span>SRV-01 · Tài khoản local: tech</span></h3>
      <form onSubmit={(e) => { e.preventDefault(); void act({ type: "share.configure", config: permissions }); }}><fieldset disabled={busy}><div className="sl-toggle-row"><label><input type="checkbox" aria-label="Quyền Share: Read" checked={permissions.shareRead} onChange={(e) => setPermissions({ ...permissions, shareRead: e.target.checked })} />Quyền Share: Read</label><label><input type="checkbox" aria-label="Quyền NTFS: Read" checked={permissions.ntfsRead} onChange={(e) => setPermissions({ ...permissions, ntfsRead: e.target.checked })} />Quyền NTFS: Read</label></div><div className="sl-form-actions"><ApplyButton>Áp dụng quyền</ApplyButton><button className="sl-button" type="button" onClick={() => void shareCheck()}><ShieldCheck size={15} />Kiểm tra truy cập</button></div></fieldset></form>
      {check && <div className="sl-output"><small>CLIENT-01 · Revision {checkedAt}{checkedAt !== s.revision ? " · Kết quả cũ" : ""}</small><pre>{check}</pre></div>}
    </div>
    <div className="sl-subsection"><h3>Services <span>LabWorker · Dịch vụ mẫu</span><Status on={s.system.workerRunning} /></h3><form onSubmit={(e) => { e.preventDefault(); void act({ type: "worker.configure", config: worker }); }}><fieldset disabled={busy}><div className="sl-form-grid"><label>Startup Type<select aria-label="Startup Type" value={worker.startup} onChange={(e) => setWorker({ ...worker, startup: e.target.value as typeof worker.startup })}><option>Automatic</option><option>Manual</option><option>Disabled</option></select></label><label className="sl-check sl-align-bottom"><input type="checkbox" aria-label="LabWorker đang chạy" checked={worker.running} onChange={(e) => setWorker({ ...worker, running: e.target.checked })} />LabWorker đang chạy</label></div><div className="sl-form-actions"><ApplyButton>Áp dụng dịch vụ</ApplyButton></div></fieldset></form></div>
    {confirm && <Dialog labelId="delete-file-title" onClose={() => setConfirm(null)}><h2 id="delete-file-title">Xóa tệp mô phỏng?</h2><p className="sl-dialog-copy">{confirm.name}</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setConfirm(null)}>Hủy</button><button className="sl-button sl-danger" disabled={busy} onClick={() => { void act({ type: "file.delete", id: confirm.id }); setConfirm(null); }}><Trash2 size={15} />Xóa tệp</button></div></Dialog>}
    {reboot && <Dialog labelId="reboot-server-title" onClose={() => setReboot(false)}><h2 id="reboot-server-title">Khởi động lại SRV-01?</h2><p className="sl-dialog-copy">Dịch vụ mẫu sẽ khởi động theo Startup Type đã lưu.</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setReboot(false)}>Hủy</button><button className="sl-button sl-primary" disabled={busy} onClick={() => { void act({ type: "server.reboot" }); setReboot(false); }}><RotateCcw size={15} />Khởi động lại</button></div></Dialog>}
  </section>;
}

export function TerminalTools({ guideCommand, guideDevice = "client", guideActive = false, focusRequest = 0, guideNote, guideDescriptionId = "dns-guide-target", onGuidedDiagnostic }: { guideCommand?: string; guideDevice?: DeviceId; guideActive?: boolean; focusRequest?: number; guideNote?: ReactNode; guideDescriptionId?: string; onGuidedDiagnostic?: (device: DeviceId, command: string, output: string, revision: number) => void }) {
  const { state, terminal, busy, diagnose, clearTerminal, dnsObservation } = useSystemLab();
  const [device, setDevice] = useState<DeviceId>("client");
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [terminal.length]);
  useEffect(() => {
    if (!guideCommand) return;
    setDevice(guideDevice);
    setInput(guideCommand);
    requestAnimationFrame(() => {
      commandInput.current?.focus({ preventScroll: true });
      commandInput.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }, [guideCommand, guideDevice, focusRequest]);
  async function run(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const command = input;
    setInput("");
    const result = await diagnose(device, command);
    if (result) onGuidedDiagnostic?.(device, command, result.output, result.revision);
  }
  function locateDnsFlow() {
    const target = document.getElementById("dns-flow");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <section aria-label="Terminal mô phỏng"><ToolHeading icon={<Terminal size={21} />} title="Terminal" subtitle="CMD / PowerShell mô phỏng"><div className="sl-dns-terminal-actions">{dnsObservation && <button type="button" className="sl-icon" aria-label="Đến luồng DNS" title="Đến luồng DNS" onClick={locateDnsFlow}><Route size={16} /></button>}<button className="sl-icon" aria-label="Xóa lịch sử terminal" title="Xóa lịch sử terminal" onClick={clearTerminal}><Trash2 size={16} /></button></div></ToolHeading>
    <div className={"sl-terminal " + (guideActive ? "is-guided" : "")}><div className="sl-terminal-toolbar"><span><i />{device === "server" ? "SRV-01" : "CLIENT-01"}</span><select aria-label="Thiết bị terminal" value={device} onChange={(e) => setDevice(e.target.value as DeviceId)}><option value="client">CLIENT-01</option><option value="server">SRV-01</option></select></div>
      <div className="sl-terminal-output" role="log" aria-label="Kết quả terminal" data-testid="terminal-output">{!terminal.length && <pre>SupportLab Terminal{`\n`}Windows network & system diagnostics{`\n\n`}&gt; help</pre>}{terminal.map((row) => <div className="sl-terminal-entry" key={row.id}><small>{row.device === "client" ? "CLIENT-01" : "SRV-01"} · r{row.revision}{row.revision !== state!.revision ? " · Kết quả trước thay đổi" : ""}</small><pre><b>&gt; {row.command}</b>{"\n"}{row.output}</pre></div>)}<div ref={end} /></div>
      {guideNote}
      <form onSubmit={run} className={"sl-terminal-form " + (guideActive ? "sl-guide-focus" : "")}><span>&gt;</span><input ref={commandInput} aria-label="Lệnh mô phỏng" aria-describedby={guideActive ? guideDescriptionId : undefined} autoComplete="off" spellCheck={false} maxLength={240} value={input} onChange={(e) => setInput(e.target.value)} /><button type="submit" className="sl-icon" aria-label="Chạy lệnh" title="Chạy lệnh" disabled={busy || !input.trim()}><Play size={16} /></button></form>
    </div>
    <div className="sl-command-list">{["ipconfig /all", "nslookup portal.lab.test", "ping 192.168.10.10", "curl http://portal.lab.test", ...(device === "server" ? ["Get-Service", "Get-Volume", "Get-WinEvent"] : ["Test-Share tech"])].map((command) => <button key={command} title={command} onClick={() => setInput(command)}><Terminal size={13} /><code>{command}</code></button>)}</div>
  </section>;
}

export function EventTools() {
  const { state } = useSystemLab();
  return <section aria-label="Event Viewer"><ToolHeading icon={<File size={21} />} title="Event Viewer" subtitle="Nhật ký thao tác mô phỏng · SRV-01 / CLIENT-01" /><div className="sl-events"><div className="sl-event-header"><span>Revision</span><span>Sự kiện</span></div>{!state!.events.length && <p className="sl-empty">Chưa có sự kiện.</p>}{[...state!.events].reverse().map((event) => <div className="sl-event-row" key={event.id}><code>r{event.revision}</code><span>{event.message}</span></div>)}</div></section>;
}
