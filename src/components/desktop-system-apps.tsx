"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, File, FolderOpen, Globe, HardDrive, Network, Play, RotateCcw, Settings, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useSystemLab } from "@/lib/system-store";
import { freeSpaceMB } from "@/lib/system-simulator";
import { Dialog } from "./dialog";

export type DesktopSystemAppProps = {
  draft: Record<string, string>;
  setDraft: (key: string, value: string) => void;
  guideTarget?: string;
  focusRequest?: number;
  guideNote?: ReactNode;
};

function useGuideFocus<T extends HTMLElement>(enabled: boolean, request = 0) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const target = ref.current;
    if (!enabled || !target || target.closest("[hidden]") || target.matches(":disabled")) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [enabled, request]);
  return ref;
}

function Status({ running, unavailable = false }: { running: boolean; unavailable?: boolean }) {
  return <span className={"wd-status " + (!running || unavailable ? "is-stopped" : "")}>{unavailable ? "Not installed" : running ? "Running" : "Stopped"}</span>;
}

export function DhcpManager({ draft, setDraft, guideTarget, focusRequest = 0, guideNote }: DesktopSystemAppProps) {
  const { state, busy, act } = useSystemLab();
  const s = state!;
  const tab = draft.tab ?? "scope";
  const guided = guideTarget === "dhcp-running";
  const start = useGuideFocus<HTMLButtonElement>(guided && !s.dhcp.running, focusRequest);
  const fields = [
    { key: "start", label: "Start IP address", help: "Đầu dải cấp phát" },
    { key: "end", label: "End IP address", help: "Cuối dải cấp phát" },
    { key: "gateway", label: "003 Router", help: "Default gateway" },
    { key: "dns", label: "006 DNS Servers", help: "DNS cấp cho máy trạm" },
  ] as const;
  function save(event: FormEvent) {
    event.preventDefault();
    void act({ type: "dhcp.configure", config: {
      start: draft.start ?? s.dhcp.start,
      end: draft.end ?? s.dhcp.end,
      gateway: draft.gateway ?? s.dhcp.gateway,
      dns: draft.dns ?? s.dhcp.dns,
      active: (draft.active ?? String(s.dhcp.active)) === "true",
    } });
  }
  return <>
    <div className="wd-app-menu">DHCP <ChevronRight size={13} /> SRV-01 <ChevronRight size={13} /> IPv4</div>
    <div className="wd-manager">
      <aside className="wd-tree">
        <strong><Network size={16} /> DHCP</strong><span>⌄ SRV-01</span><span>⌄ IPv4</span>
        <button aria-current={tab === "scope" ? "page" : undefined} onClick={() => setDraft("tab", "scope")}>Scope [192.168.10.0] LAN-10</button>
        <button aria-current={tab === "leases" ? "page" : undefined} onClick={() => setDraft("tab", "leases")}>Address Leases</button>
      </aside>
      <div className="wd-content">
        <div className="wd-toolbar"><h3>DHCP Server</h3><Status running={s.dhcp.running} unavailable={!s.roles.dhcp} /></div>
        {guided && guideNote}
        <div className="wd-toolbar">
          <button ref={start} className={guided ? "sl-guide-focus" : undefined} data-scenario-target={guided ? "target" : undefined} aria-describedby={guided ? "scenario-guide-target" : undefined} disabled={busy || !s.roles.dhcp || s.dhcp.running} onClick={() => void act({ type: "service.toggle", service: "dhcp", running: true })}><Play size={13} />Start DHCP</button>
          <button disabled={busy || !s.roles.dhcp || !s.dhcp.running} onClick={() => void act({ type: "service.toggle", service: "dhcp", running: false })}><Square size={12} />Stop DHCP</button>
        </div>
        {!s.roles.dhcp && <p className="wd-hint">Cài DHCP Server từ Server Manager trước khi quản lý dịch vụ và scope.</p>}
        {tab === "leases" ? <>
          <h3>Address Leases</h3><div className="wd-table"><table><thead><tr><th>IP Address</th><th>Name</th><th>Lease Expires</th></tr></thead><tbody>{s.dhcp.lease ? <tr><td>{s.dhcp.lease.ip}</td><td>CLIENT-01</td><td>{s.dhcp.lease.expiresAt > s.simulatedTime ? "Active" : "Expired"}</td></tr> : <tr><td colSpan={3}>Chưa có lease được cấp.</td></tr>}</tbody></table></div>
          <p>Khởi động dịch vụ chưa làm máy trạm nhận địa chỉ mới. Chuyển sang CLIENT-01 và Renew DHCP lease để gửi yêu cầu.</p>
        </> : <form className="wd-form" aria-label="DHCP Scope Properties" onSubmit={save}>
          <h3>Scope LAN-10 · Properties</h3>
          <fieldset disabled={busy || !s.roles.dhcp} className="wd-form">
            {fields.map(({ key, label, help }) => <label key={key}>{label}<input aria-label={label} value={draft[key] ?? s.dhcp[key]} maxLength={15} required spellCheck={false} onChange={(event) => setDraft(key, event.target.value)} /><small>{help}</small></label>)}
            <label><input type="checkbox" aria-label="Activate scope" checked={(draft.active ?? String(s.dhcp.active)) === "true"} onChange={(event) => setDraft("active", String(event.target.checked))} />Activate scope</label>
            <button type="submit">Apply DHCP scope</button>
          </fieldset>
          <small>Apply lưu scope và option. Lease hiện tại của máy trạm chỉ nhận lại các tùy chọn khi renew.</small>
        </form>}
      </div>
    </div>
  </>;
}

export function IisManager({ draft, setDraft, guideTarget, focusRequest = 0, guideNote }: DesktopSystemAppProps) {
  const { state, busy, act } = useSystemLab();
  const s = state!;
  const tab = draft.tab ?? "sites";
  const guided = guideTarget === "iis-pool";
  const startPool = useGuideFocus<HTMLButtonElement>(guided && tab === "pools" && !s.iis.poolRunning, focusRequest);
  useEffect(() => { if (guided) setDraft("tab", "pools"); }, [guided, focusRequest]);
  function bind(event: FormEvent) {
    event.preventDefault();
    void act({ type: "iis.configure", config: { ...s.iis, port: Number(draft.port ?? s.iis.port) } });
  }
  return <>
    <div className="wd-app-menu">Internet Information Services (IIS) Manager <ChevronRight size={13} /> SRV-01</div>
    <div className="wd-manager">
      <aside className="wd-tree">
        <strong><Globe size={16} />Connections</strong><span>⌄ SRV-01</span>
        <button aria-current={tab === "pools" ? "page" : undefined} onClick={() => setDraft("tab", "pools")}>Application Pools</button>
        <button aria-current={tab === "sites" ? "page" : undefined} onClick={() => setDraft("tab", "sites")}>Sites · Support Portal</button>
        <button aria-current={tab === "bindings" ? "page" : undefined} onClick={() => setDraft("tab", "bindings")}>Bindings…</button>
      </aside>
      <div className="wd-content">
        {!s.roles.iis && <p className="wd-hint">Cài Web Server (IIS) từ Server Manager để quản lý website.</p>}
        {tab === "pools" ? <>
          <h3>Application Pools</h3>
          <div className="wd-table"><table><thead><tr><th>Name</th><th>Status</th><th>Application</th></tr></thead><tbody><tr aria-selected="true"><td>SupportPortalPool</td><td><Status running={s.iis.poolRunning} unavailable={!s.roles.iis} /></td><td>Support Portal</td></tr></tbody></table></div>
          {guided && guideNote}
          <div className="wd-toolbar"><button ref={startPool} data-scenario-target={guided ? "target" : undefined} aria-describedby={guided ? "scenario-guide-target" : undefined} className={guided ? "sl-guide-focus" : undefined} disabled={busy || !s.roles.iis || s.iis.poolRunning} onClick={() => void act({ type: "iis.configure", config: { ...s.iis, poolRunning: true } })}><Play size={13} />Start application pool</button><button disabled={busy || !s.roles.iis || !s.iis.poolRunning} onClick={() => void act({ type: "iis.configure", config: { ...s.iis, poolRunning: false } })}><Square size={12} />Stop application pool</button></div>
          <p>Application pool chạy ứng dụng của website. Website có thể đang Started nhưng trả HTTP 503 khi pool chưa hoạt động.</p>
        </> : tab === "bindings" ? <>
          <h3>Site Bindings · Support Portal</h3><form className="wd-form" aria-label="Site Bindings" onSubmit={bind}><label>Type<input value="http" readOnly /></label><label>Host name<input value="portal.lab.test" readOnly /></label><label>Port<input aria-label="HTTP binding port" type="number" min={1} max={65535} required disabled={!s.roles.iis} value={draft.port ?? String(s.iis.port)} onChange={(event) => setDraft("port", event.target.value)} /></label><button type="submit" disabled={busy || !s.roles.iis}>Apply binding</button></form><p>URL trên máy trạm phải sử dụng cổng đã lưu. Cổng mặc định của HTTP là 80.</p>
        </> : <>
          <h3>Sites</h3><div className="wd-table"><table><thead><tr><th>Name</th><th>Status</th><th>Binding</th></tr></thead><tbody><tr aria-selected="true"><td>Support Portal</td><td><Status running={s.iis.siteRunning} unavailable={!s.roles.iis} /></td><td>http · *:{s.iis.port}</td></tr></tbody></table></div>
          <div className="wd-toolbar"><button disabled={busy || !s.roles.iis || s.iis.siteRunning} onClick={() => void act({ type: "iis.configure", config: { ...s.iis, siteRunning: true } })}><Play size={13} />Start website</button><button disabled={busy || !s.roles.iis || !s.iis.siteRunning} onClick={() => void act({ type: "iis.configure", config: { ...s.iis, siteRunning: false } })}><Square size={12} />Stop website</button><button onClick={() => setDraft("tab", "bindings")}>Bindings…</button></div>
          <p>Để xác nhận website hoạt động, chuyển sang CLIENT-01 và thử truy cập bằng tên miền hoặc địa chỉ IP.</p>
        </>}
      </div>
    </div>
  </>;
}

export function FileExplorer({ draft, setDraft, guideTarget, focusRequest = 0, guideNote }: DesktopSystemAppProps) {
  const { state, busy, act, diagnose } = useSystemLab();
  const s = state!;
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [access, setAccess] = useState<{ output: string; revision: number } | null>(null);
  const tab = draft.tab ?? "data";
  const selected = s.system.files.find((file) => file.id === draft.selected);
  const cleanup = guideTarget === "disk-cleanup";
  const write = guideTarget === "disk-write";
  const deleteButton = useGuideFocus<HTMLButtonElement>(cleanup && !confirm && selected?.id === "temp-cache", focusRequest);
  const writeButton = useGuideFocus<HTMLButtonElement>(write && tab === "data", focusRequest);
  useEffect(() => {
    if (cleanup) { setDraft("tab", "data"); setDraft("selected", "temp-cache"); }
    if (write) setDraft("tab", "data");
  }, [cleanup, write, focusRequest]);
  async function checkAccess() {
    const result = await diagnose("client", "Test-Share tech");
    if (result) setAccess(result);
  }
  const free = freeSpaceMB(s);
  return <>
    <div className="wd-app-menu"><FolderOpen size={14} />This PC <ChevronRight size={13} /> {tab === "data" ? "Data (D:)" : "SupportShare Properties"}</div>
    <div className="wd-manager">
      <aside className="wd-tree"><strong><MonitorIcon />This PC</strong><button aria-current={tab === "data" ? "page" : undefined} onClick={() => setDraft("tab", "data")}>Data (D:)</button><button aria-current={tab === "share" ? "page" : undefined} onClick={() => setDraft("tab", "share")}>SupportShare Properties</button></aside>
      <div className="wd-content">
        {tab === "data" ? <>
          <div className="wd-toolbar"><h3><HardDrive size={15} /> Data (D:)</h3><span>{free} MB free of {s.system.capacityMB} MB</span></div>
          <meter min={0} max={s.system.capacityMB} value={s.system.capacityMB - free} aria-label="Dung lượng ổ D đã dùng" style={{ width: "100%", margin: "10px 0" }} />
          <div className="wd-table"><table><thead><tr><th>Name</th><th>Size</th><th>Ghi chú tình huống</th></tr></thead><tbody>{s.system.files.map((file) => <tr key={file.id} aria-selected={selected?.id === file.id}><td><button aria-label={"Chọn tệp " + file.name} onClick={() => setDraft("selected", file.id)}><File size={13} /> {file.name}</button></td><td>{file.sizeMB} MB</td><td>{file.protected ? "Dữ liệu cần giữ" : file.id === "temp-cache" ? "Được phép dọn trong tình huống này" : "Chưa xác nhận được phép xóa"}</td></tr>)}</tbody></table></div>
          {(cleanup || write) && guideNote}
          <div className="wd-toolbar">
            <button ref={deleteButton} data-scenario-target={cleanup ? "target" : undefined} aria-describedby={cleanup ? "scenario-guide-target" : undefined} className={cleanup ? "sl-guide-focus" : undefined} disabled={busy || !selected || selected.protected} onClick={() => selected && setConfirm({ id: selected.id, name: selected.name })}><Trash2 size={14} />Delete selected file</button>
            <button ref={writeButton} data-scenario-target={write ? "target" : undefined} aria-describedby={write ? "scenario-guide-target" : undefined} className={write ? "sl-guide-focus" : undefined} disabled={busy} onClick={() => void act({ type: "file.write" })}>Ghi tệp kiểm tra 10 MB</button>
          </div>
          <p>Nhãn dữ liệu cần giữ là thông tin an toàn của tình huống mô phỏng. Trên máy thật, cần xác nhận nội dung và quyền xóa, không quyết định chỉ từ tên hoặc đuôi tệp.</p>
        </> : <>
          <h3>SupportShare Properties · SRV-01</h3><p>Tài khoản local: tech. Đọc thư mục qua mạng cần quyền Read ở cả lớp Share và NTFS.</p>
          <form className="wd-form" aria-label="SupportShare permissions" onSubmit={(event) => { event.preventDefault(); void act({ type: "share.configure", config: { shareRead: (draft.shareRead ?? String(s.system.shareRead)) === "true", ntfsRead: (draft.ntfsRead ?? String(s.system.ntfsRead)) === "true" } }); }}>
            <h4>Sharing / Security</h4><label><input type="checkbox" aria-label="Share permission Read" checked={(draft.shareRead ?? String(s.system.shareRead)) === "true"} onChange={(event) => setDraft("shareRead", String(event.target.checked))} />Share · tech · Read</label>
            <label><input type="checkbox" aria-label="NTFS permission Read" checked={(draft.ntfsRead ?? String(s.system.ntfsRead)) === "true"} onChange={(event) => setDraft("ntfsRead", String(event.target.checked))} />Security (NTFS) · tech · Read</label>
            <div className="wd-toolbar"><button type="submit" disabled={busy}>Apply permissions</button><button type="button" disabled={busy} onClick={() => void checkAccess()}><ShieldCheck size={14} />Test access from CLIENT-01</button></div>
          </form>
          {access && <div className="wd-hint"><small>CLIENT-01 · r{access.revision}{access.revision !== s.revision ? " · Kết quả cũ, cần kiểm tra lại" : ""}</small><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{access.output}</pre></div>}
        </>}
      </div>
    </div>
    {confirm && <Dialog labelId="desktop-delete-file-title" onClose={() => setConfirm(null)}><h2 id="desktop-delete-file-title">Xóa tệp mô phỏng?</h2><p className="sl-dialog-copy">{confirm.name}</p><p className="sl-dialog-copy">Chỉ xác nhận nếu đây là tệp được phép dọn trong tình huống.</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setConfirm(null)}>Hủy</button><button className="sl-button sl-danger" disabled={busy} onClick={() => { void act({ type: "file.delete", id: confirm.id }); setConfirm(null); }}>Xóa tệp</button></div></Dialog>}
  </>;
}

function MonitorIcon() { return <FolderOpen size={15} />; }

export function WorkerProperties({ draft, setDraft }: DesktopSystemAppProps) {
  const { state, busy, act } = useSystemLab();
  const s = state!;
  const [reboot, setReboot] = useState(false);
  const startup = draft.startup ?? s.system.startup;
  return <div className="wd-content"><h3>LabWorker Properties (Local Computer)</h3><p>Service name: LabWorker · Dịch vụ mẫu của hệ thống mô phỏng.</p><form className="wd-form" onSubmit={(event) => { event.preventDefault(); void act({ type: "worker.configure", config: { startup: startup as typeof s.system.startup, running: (draft.running ?? String(s.system.workerRunning)) === "true" } }); }}>
    <label>Startup type<select aria-label="Startup type LabWorker" value={startup} onChange={(event) => setDraft("startup", event.target.value)}><option>Automatic</option><option>Manual</option><option>Disabled</option></select></label>
    <label><input type="checkbox" aria-label="LabWorker running" checked={(draft.running ?? String(s.system.workerRunning)) === "true"} onChange={(event) => setDraft("running", String(event.target.checked))} />Service running</label>
    <span>Service status: <Status running={s.system.workerRunning} /></span><button type="submit" disabled={busy}>Apply service properties</button>
    <small>Chạy thủ công chưa xác nhận dịch vụ sẽ tự chạy sau khởi động. Kiểm tra Startup type rồi reboot máy chủ để xác minh.</small>
  </form><div className="wd-toolbar"><button disabled={busy} onClick={() => setReboot(true)}><RotateCcw size={14} />Restart SRV-01</button></div>
    {reboot && <Dialog labelId="desktop-reboot-title" onClose={() => setReboot(false)}><h2 id="desktop-reboot-title">Khởi động lại SRV-01?</h2><p className="sl-dialog-copy">Máy chủ mô phỏng khởi động lại. LabWorker sẽ chạy theo Startup type đã lưu.</p><div className="modal-actions"><button className="sl-button" autoFocus onClick={() => setReboot(false)}>Hủy</button><button className="sl-button sl-primary" disabled={busy} onClick={() => { void act({ type: "server.reboot" }); setReboot(false); }}>Khởi động lại</button></div></Dialog>}
  </div>;
}

export function EventViewer() {
  const { state } = useSystemLab();
  return <><div className="wd-app-menu">Event Viewer (Local) <ChevronRight size={13} /> SupportLab</div><div className="wd-manager"><aside className="wd-tree"><strong><Settings size={15} />Event Viewer</strong><span>⌄ Windows Logs</span><button aria-current="page">Simulation Events</button></aside><div className="wd-content"><h3>Simulation Events</h3><p>Sự kiện thao tác của phiên mô phỏng; chưa tái hiện đầy đủ các Windows Event ID.</p><div className="wd-table"><table><thead><tr><th>Revision</th><th>Event</th></tr></thead><tbody>{state!.events.length ? [...state!.events].reverse().map((event) => <tr key={event.id}><td>r{event.revision}</td><td>{event.message}</td></tr>) : <tr><td colSpan={2}>Chưa có sự kiện.</td></tr>}</tbody></table></div></div></div></>;
}
