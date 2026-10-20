"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, CircleAlert, Cpu, Download, EthernetPort, Globe, HardDrive, Monitor, Network, Play, Power, Router, Settings2, ShieldCheck, Terminal, Usb } from "lucide-react";
import { diskVisible, hasDNS, hasInternet, hasLAN, installConditions, validIPv4 } from "@/lib/engine";
import { useLab } from "@/lib/store";
import { Dialog } from "./dialog";
import type { GuideTarget } from "@/lib/install-guide";
import type { NetworkGuideTarget } from "@/lib/network-guide";
import { StorageDriverDialog } from "./driver-media";
import { storageDriverFirmwareNotice } from "@/lib/storage-driver-guide";

function Toggle({ label, checked, disabled, onChange, guideTarget, highlighted }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; guideTarget?: GuideTarget | NetworkGuideTarget; highlighted?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} data-guide-target={guideTarget} className={`switch ${checked ? "checked" : ""}${highlighted ? " guide-highlight" : ""}`} onClick={() => onChange(!checked)}><span /></button>;
}

export function DesktopPanel() {
  const s = useLab();
  if (s.pc.power !== "desktop") return <div className="virtual-display inactive"><Monitor size={44} strokeWidth={1} /><strong>{s.pc.power === "off" ? "Máy đang tắt" : s.pc.power === "bios" ? "UEFI Firmware Settings" : "Windows Setup"}</strong>{s.pc.power === "off" ? <button className="button subtle" onClick={s.reboot}><Power size={16} />Bật máy</button> : <button className="button subtle" onClick={() => s.setTab(s.pc.power === "bios" ? "bios" : "installer")}><Play size={15} />Mở cửa sổ hiện tại</button>}</div>;
  return <div className="virtual-display"><div className="desktop-apps"><button onClick={() => s.setTab("network")} title="Network & Internet"><Network size={30} /><span>Network</span></button><button onClick={() => s.setTab("terminal")} title="Command Prompt"><Terminal size={30} /><span>Command Prompt</span></button><button onClick={() => s.setTab("installer")} title="Ổ đĩa và bộ cài"><HardDrive size={30} /><span>This PC</span></button></div><div className="desktop-identity"><Monitor size={48} strokeWidth={1} /><strong>Windows 11</strong><span>PC-01 · Virtual Desktop</span></div><div className="desktop-taskbar"><span className="windows-mark" aria-label="Windows"><i /><i /><i /><i /></span><button className="icon-button" title="Cấu hình mạng" onClick={() => s.setTab("network")}><Network size={18} /></button><button className="icon-button" title="Command Prompt" onClick={() => s.setTab("terminal")}><Terminal size={18} /></button><span className="desktop-network">{hasInternet(s.pc.network) ? "Internet" : "No Internet"}</span><button className="icon-button" title="Tắt máy" onClick={s.powerOff}><Power size={17} /></button></div></div>;
}

export function BiosPanel({ guideTarget = null }: { guideTarget?: GuideTarget }) {
  const s = useLab(); const editable = s.pc.power === "bios";
  return <div className="bios-panel">
    <div className="panel-heading"><div className="panel-heading-icon"><Cpu size={21} /></div><div><h2>UEFI Firmware Settings</h2><p>VirtualBoard <span className="text-divider">/</span> Firmware tổng quát</p></div><span className="outline-badge">{s.pc.bios.bootMode}</span></div>
    {!editable && <div className="inline-message"><CircleAlert size={16} /><span>Cần vào BIOS để chỉnh sửa firmware.</span><button className="text-button" onClick={s.enterBios}>Vào BIOS<ArrowUp size={13} /></button></div>}
    <div className="subheading"><ShieldCheck size={14} />BẢO MẬT & BỘ ĐIỀU KHIỂN</div>
    <div className="setting-row"><div><strong>Secure Boot</strong><p>Xác thực phần mềm khởi động</p></div><span className="setting-value">{s.pc.bios.secureBoot ? "Enabled" : "Disabled"}</span><Toggle label="Secure Boot" checked={s.pc.bios.secureBoot} disabled={!editable} guideTarget="secure-boot" highlighted={guideTarget === "secure-boot"} onChange={(secureBoot) => s.setBios({ secureBoot })} /></div>
    <div className="setting-row"><div><strong>TPM 2.0</strong><p>Trusted Platform Module</p></div><span className="setting-value">{s.pc.bios.tpmEnabled ? "Enabled" : "Disabled"}</span><Toggle label="TPM 2.0" checked={s.pc.bios.tpmEnabled} disabled={!editable} guideTarget="tpm" highlighted={guideTarget === "tpm"} onChange={(tpmEnabled) => s.setBios({ tpmEnabled })} /></div>
    <div className="setting-row"><div><strong>Intel VMD Controller</strong><p>Bộ điều khiển lưu trữ NVMe</p></div><span className="setting-value">{s.pc.bios.vmdController ? "Enabled" : "Disabled"}</span><Toggle label="Intel VMD Controller" checked={s.pc.bios.vmdController} disabled={!editable} onChange={(vmdController) => s.setBios({ vmdController })} /></div>
    <div className="setting-row"><div><strong>Boot Mode</strong><p>Chuẩn khởi động hệ thống</p></div><div className="segmented" aria-label="Boot Mode">{(["UEFI", "LEGACY"] as const).map((mode) => <button key={mode} disabled={!editable} aria-pressed={s.pc.bios.bootMode === mode} data-guide-target={mode === "UEFI" ? "uefi" : undefined} className={(s.pc.bios.bootMode === mode ? "active" : "") + (mode === "UEFI" && guideTarget === "uefi" ? " guide-highlight" : "")} onClick={() => s.setBios({ bootMode: mode })}>{mode}</button>)}</div></div>
    <div className="subheading boot-heading"><Settings2 size={14} />THỨ TỰ KHỞI ĐỘNG</div>
    <ol className="boot-list">{s.pc.bios.bootOrder.map((device, index) => {
      const Icon = device === "USB Drive" ? Usb : device === "NVMe SSD" ? HardDrive : Network;
      const move = (direction: number) => { const order = [...s.pc.bios.bootOrder]; [order[index], order[index + direction]] = [order[index + direction], order[index]]; s.setBios({ bootOrder: order }); };
      return <li key={device}><span className="boot-index">{index + 1}</span><Icon size={18} /><strong>{device}</strong>{index === 0 && <span className="priority">Ưu tiên</span>}<div className="boot-arrows"><button className="icon-button" title={`Đưa ${device} lên`} aria-label={`Đưa ${device} lên`} disabled={!editable || index === 0} onClick={() => move(-1)}><ArrowUp size={15} /></button><button className="icon-button" title={`Đưa ${device} xuống`} aria-label={`Đưa ${device} xuống`} disabled={!editable || index === 2} onClick={() => move(1)}><ArrowDown size={15} /></button></div></li>;
    })}</ol>
    <div className="panel-actions"><span>Firmware lưu trong phiên hiện tại</span><button className="button primary" disabled={!editable} onClick={s.reboot}><Play size={15} />Lưu & khởi động</button></div>
  </div>;
}

export function InstallerPanel({ guideTarget = null }: { guideTarget?: GuideTarget }) {
  const s = useLab(); const visible = diskVisible(s.pc); const ready = s.pc.power === "installer";
  const [confirm, setConfirm] = useState(false);
  const [showDriver, setShowDriver] = useState(false);
  const conditions = installConditions(s.pc);
  return <div className="installer-panel">
    <div className="panel-heading"><div className="windows-mark" aria-hidden="true"><i /><i /><i /><i /></div><div><h2>Windows 11 Setup</h2><p>Chuẩn bị thiết bị và ổ đĩa cài đặt</p></div><span className="outline-badge">64-bit</span></div>
    {!ready && <div className="inline-message"><CircleAlert size={16} /><span>Cắm USB cài Windows và chọn USB Drive trong Menu boot để mở trình cài.</span></div>}
    <div className="installer-steps"><span className="active">01 <strong>Kiểm tra thiết bị</strong></span><span className={visible && s.pc.disk.partitions.length ? "active" : ""}>02 <strong>Ổ đĩa</strong></span><span className={s.pc.disk.osInstalled ? "active" : ""}>03 <strong>Cài đặt</strong></span></div>
    <div className="subheading">YÊU CẦU HỆ THỐNG</div><div className="requirements-grid">{conditions.slice(0, 4).map((c) => <div key={c.id} className={c.met ? "requirement met" : "requirement"}>{c.met ? <Check size={15} /> : <CircleAlert size={15} />}<span>{c.label}</span></div>)}</div>
    <div className="disk-heading"><h3><HardDrive size={16} />Ổ đĩa cài đặt</h3><span>{visible ? `Disk 0 · 512 GB · ${s.pc.disk.diskTable}` : "Không tìm thấy ổ đĩa"}</span></div>
    {ready && <aside className="storage-driver-notice" aria-label="Lưu ý driver lưu trữ">
      <p>{visible ? "Bộ cài đã nhận SSD. Không cần nạp thêm driver lưu trữ cho bước chọn ổ đĩa này; kiểm tra đúng ổ đích trước khi tiếp tục." : "Nếu BIOS nhận SSD nhưng Windows Setup chưa nhận, kiểm tra driver lưu trữ theo đúng model; chỉ dùng Load driver khi cần gói tương thích."}</p>
      {!visible && <p className="storage-driver-caution">{storageDriverFirmwareNotice}</p>}
    </aside>}
    {!visible ? <div className="no-disk"><HardDrive size={34} strokeWidth={1.4} /><strong>Không tìm thấy ổ đĩa lưu trữ</strong><p>Trình cài chưa có driver cho bộ điều khiển hiện tại.</p><button data-guide-target="load-driver" className={"button subtle" + (guideTarget === "load-driver" ? " guide-highlight" : "")} disabled={!ready} onClick={() => setShowDriver(true)}><Download size={15} />Nạp driver Intel VMD</button></div> : <div className="disk-view"><div className="disk-map" role="img" aria-label="Sơ đồ phân vùng ổ đĩa 512 GB">{s.pc.disk.partitions.length ? s.pc.disk.partitions.map((p) => <div key={p.id} className={`partition-block ${p.type.toLowerCase()}`} style={{ flex: p.sizeGB, minWidth: p.type === "PRIMARY" ? 0 : 28 }} title={`${p.name}: ${p.sizeGB} GB`}><span>{p.type === "PRIMARY" ? `${p.name} · ${p.sizeGB.toFixed(1)} GB` : p.type}</span></div>) : <div className="unallocated">512 GB · Unallocated space</div>}</div><div className="partition-table"><div className="partition-table-head"><span>Phân vùng</span><span>Định dạng</span><span>Dung lượng</span></div>{s.pc.disk.partitions.length ? s.pc.disk.partitions.map((p) => <div key={p.id}><span><HardDrive size={13} />{p.name} <small>{p.type}</small></span><span>{p.type === "MSR" ? "—" : p.format}</span><span>{p.sizeGB < 1 ? `${Math.round(p.sizeGB * 1000)} MB` : `${p.sizeGB.toFixed(1)} GB`}</span></div>) : <div><span>Chưa phân vùng</span><span>—</span><span>512 GB</span></div>}</div><button data-guide-target="prepare-disk" className={"button subtle disk-prepare" + (guideTarget === "prepare-disk" ? " guide-highlight" : "")} disabled={!ready} onClick={() => setConfirm(true)}><Settings2 size={15} />Chuẩn bị GPT & phân vùng</button></div>}
    {s.pc.disk.osInstalled && <div className="success-message"><Check size={16} />Windows đã có trên SSD. Có thể chọn NVMe SSD trong Menu boot.</div>}
    <div className="panel-actions"><span>{conditions.every((c) => c.met) ? "Thiết bị sẵn sàng" : "Kiểm tra cấu hình thiết bị"}</span><button data-guide-target="install" className={"button primary" + (guideTarget === "install" ? " guide-highlight" : "")} disabled={!ready || s.pc.disk.osInstalled} onClick={s.install}><Download size={15} />Cài đặt Windows</button></div>
    {showDriver && <StorageDriverDialog onClose={() => setShowDriver(false)} />}
    {confirm && <Dialog labelId="disk-confirm" onClose={() => setConfirm(false)}><h2 id="disk-confirm">Chuẩn bị lại ổ đĩa?</h2><p>Toàn bộ phân vùng và Windows trên ổ mô phỏng sẽ bị xóa. Hệ thống sẽ tạo bảng GPT cùng phân vùng EFI, MSR và Windows.</p><div className="modal-actions"><button autoFocus className="button subtle" onClick={() => setConfirm(false)}>Hủy</button><button className="button primary" onClick={() => { s.prepareDisk(); setConfirm(false); }}>Xóa & tạo phân vùng</button></div></Dialog>}
  </div>;
}

export function NetworkPanel({ guideTarget = null, guideStepId }: { guideTarget?: NetworkGuideTarget; guideStepId?: string }) {
  const s = useLab(); const n = s.pc.network; const enabled = s.pc.power === "desktop";
  const lan = enabled && hasLAN(n); const internet = enabled && hasInternet(n); const dns = enabled && hasDNS(n);
  const [form, setForm] = useState({ ipAddress: n.ipAddress, gateway: n.gateway, dns: n.dns, dhcpEnabled: n.dhcpEnabled });
  const [error, setError] = useState("");
  const dirty = form.ipAddress !== n.ipAddress || form.gateway !== n.gateway || form.dns !== n.dns || form.dhcpEnabled !== n.dhcpEnabled;
  const repairField = guideStepId === "network-dns" ? "dns" : guideStepId === "network-gateway" ? "gateway" : "ipAddress";
  const repairTarget = guideTarget === "network-config" ? (dirty ? "apply" : form.dhcpEnabled ? "dhcp" : repairField) : null;
  useEffect(() => { setForm({ ipAddress: n.ipAddress, gateway: n.gateway, dns: n.dns, dhcpEnabled: n.dhcpEnabled }); setError(""); }, [n.ipAddress, n.gateway, n.dns, n.dhcpEnabled]);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.dhcpEnabled && ![form.ipAddress, form.gateway, form.dns].every(validIPv4)) { setError("Nhập địa chỉ IPv4 hợp lệ, ví dụ 192.168.1.50."); return; }
    setError(""); s.applyNetwork(form);
  }
  return <div className="network-panel"><div className="panel-heading"><div className="panel-heading-icon"><EthernetPort size={21} /></div><div><h2>Network & Internet</h2><p>Ethernet <span className="text-divider">/</span> Virtual Adapter</p></div><span className={`outline-badge ${internet ? "green" : "amber"}`}>{enabled ? internet ? "Internet" : "No Internet" : "Adapter inactive"}</span></div>
    {!enabled && <div className="inline-message"><CircleAlert size={16} /><span>Khởi động vào Windows để cấu hình bộ điều hợp mạng.</span></div>}
    <div className="network-topology" role="img" aria-label={`Máy khách ${n.ipAddress}, router 192.168.1.1, Internet ${internet ? "kết nối" : "mất kết nối"}`}><div><span className={lan ? "topology-node connected" : "topology-node"}><Monitor size={25} /></span><strong>PC-01</strong><small>{enabled ? n.ipAddress : "Chưa hoạt động"}</small></div><span className={`connection ${lan ? "connected" : ""}`} /><div><span className="topology-node connected"><Router size={25} /></span><strong>Router</strong><small>192.168.1.1</small></div><span className={`connection ${internet ? "connected" : ""}`} /><div><span className={internet ? "topology-node connected" : "topology-node"}><Globe size={25} /></span><strong>Internet</strong><small>{dns ? "DNS hoạt động" : "DNS chưa sẵn sàng"}</small></div></div>
    <form onSubmit={submit}><div className="subheading">CẤU HÌNH IPV4 <span>Subnet: 255.255.255.0</span></div><div className="setting-row"><div><strong>Nhận địa chỉ IP tự động</strong><p>DHCP trên bộ điều hợp Ethernet</p></div><Toggle label="Nhận IP tự động" checked={form.dhcpEnabled} disabled={!enabled} guideTarget={repairTarget === "dhcp" ? "network-config" : undefined} highlighted={repairTarget === "dhcp"} onChange={(dhcpEnabled) => setForm({ ...form, dhcpEnabled })} /></div><div className="network-fields">{([{ key: "ipAddress", label: "Địa chỉ IPv4" }, { key: "gateway", label: "Default Gateway" }, { key: "dns", label: "DNS Server" }] as const).map(({ key, label }) => <label key={key}>{label}<input aria-label={label} inputMode="decimal" maxLength={15} disabled={!enabled || form.dhcpEnabled} value={form[key]} data-guide-target={repairTarget === key ? "network-config" : undefined} className={repairTarget === key ? "guide-highlight" : undefined} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>{error && <p role="alert" className="field-error">{error}</p>}{dirty && <p className="network-pending">Chưa áp dụng thay đổi</p>}<div className="form-actions"><button data-guide-target={repairTarget === "apply" ? "network-config" : undefined} className={"button primary" + (repairTarget === "apply" ? " guide-highlight" : "")} type="submit" disabled={!enabled}><Check size={15} />Áp dụng cấu hình</button></div></form>
    <div className="router-section"><div className="subheading"><Router size={14} />THIẾT BỊ MẠNG · ROUTER</div><div className="setting-row"><div><strong>Dịch vụ DHCP</strong><p>Pool: 192.168.1.50 – 192.168.1.200</p></div><span className="setting-value">{n.dhcpAvailable ? "Running" : "Stopped"}</span><Toggle label="Dịch vụ DHCP trên router" checked={n.dhcpAvailable} guideTarget="router-dhcp" highlighted={guideTarget === "router-dhcp"} onChange={s.setDHCPServer} /></div></div>
  </div>;
}

export function TerminalPanel({ guideActive = false }: { guideActive?: boolean }) {
  const s = useLab(); const [input, setInput] = useState(""); const [cursor, setCursor] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => { outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight }); }, [s.terminal]);
  function submit(e: FormEvent) { e.preventDefault(); if (!input.trim()) return; s.command(input); setInput(""); setCursor(-1); }
  return <div className="terminal-panel"><div className="terminal-title"><Terminal size={15} /><strong>Command Prompt</strong><span>PC-01 · SIMULATED</span></div><div className="terminal-output" ref={outputRef} role="log" aria-label="Kết quả lệnh"><p>Microsoft Windows [Version 10.0.22631.0]<br />SupportLab Virtual Command Environment<br /><br />Nhập help để xem các lệnh khả dụng.</p>{s.terminal.map((entry, i) => <div className="terminal-entry" key={i}><p><span>C:\Users\Support&gt;</span> {entry.command}</p><pre>{entry.output}</pre></div>)}</div><form className="terminal-form" onSubmit={submit}><label htmlFor="cmd-input">C:\Users\Support&gt;</label><input id="cmd-input" aria-label="Lệnh CMD" value={input} data-guide-target="cmd-input" className={guideActive ? "guide-highlight" : undefined} autoComplete="off" spellCheck={false} maxLength={256} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); const next = e.key === "ArrowUp" ? Math.min(cursor + 1, s.terminal.length - 1) : Math.max(cursor - 1, -1); setCursor(next); setInput(next < 0 ? "" : s.terminal[s.terminal.length - 1 - next]?.command || ""); }} /><button type="submit" className="icon-button" title="Thực thi lệnh" aria-label="Thực thi lệnh"><Play size={16} /></button></form><div className="terminal-suggestions">{["ipconfig /all", "ping 8.8.8.8", "nslookup example.com"].map((cmd) => <button key={cmd} onClick={() => s.command(cmd)}><Terminal size={12} />{cmd}</button>)}</div></div>;
}
