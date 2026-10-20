"use client";
import { ExternalLink, Search, Check } from "lucide-react";
import { asusGroups, asusModels, cpuPlatforms, findAsusModel, searchAsusModels, verificationLabels, type AsusGroup, type CpuPlatform } from "@/lib/asus-profiles";

type Props = {
  group: AsusGroup; platform: CpuPlatform; model: string;
  onGroupChange: (group: AsusGroup) => void;
  onPlatformChange: (platform: CpuPlatform) => void;
  onModelChange: (model: string) => void;
};
export function AsusCatalog({ group, platform, model, onGroupChange, onPlatformChange, onModelChange }: Props) {
  const found = findAsusModel(model, group);
  const results = searchAsusModels(model, group);
  return <section className="asus-catalog" aria-label="Hồ sơ thiết bị ASUS">
    <div className="section-title"><h2>Hồ sơ ASUS</h2><span>{asusModels.length} hồ sơ ban đầu</span></div>
    <div className="asus-filters"><label>Nhóm thiết bị ASUS<select aria-label="Nhóm thiết bị ASUS" value={group} onChange={(e) => onGroupChange(e.target.value as AsusGroup)}>{Object.entries(asusGroups).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></label><label>Nền tảng CPU trên máy<select aria-label="Nền tảng CPU trên máy" value={platform} onChange={(e) => onPlatformChange(e.target.value as CpuPlatform)}>{Object.entries(cpuPlatforms).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="asus-search"><span><Search size={13} />Tìm hoặc nhập model ASUS</span><input aria-label="Tìm model ASUS" maxLength={100} value={model} onChange={(e) => onModelChange(e.target.value)} placeholder={group === "motherboard" ? "Ví dụ PRIME B760M-A WIFI D4" : group === "desktop" ? "Ví dụ D500ME" : "Ví dụ X515EA, FA506NC"} autoComplete="off" /></label></div>
    <div className="asus-results" aria-label="Kết quả tìm model">{results.length ? results.map((p) => <button type="button" key={p.model} aria-pressed={p.model === found?.model} className={`asus-result ${p.model === found?.model ? "chosen" : ""}`} onClick={() => onModelChange(p.model)}><span><strong>{p.model}</strong><small>{p.family}</small></span><span className="verification-badge">{verificationLabels[p.verification]}</span>{p.model === found?.model ? <Check size={15} /> : <span className="select-model">Chọn</span>}</button>) : <p className="asus-empty" role="status">Chưa có hồ sơ khớp. Đang dùng quy trình chung của nhóm đã chọn; chưa xác minh BIOS, driver và tương thích cho model này.</p>}</div>
    <div className="asus-evidence" aria-live="polite"><div><strong>{found ? `${found.model} · ${verificationLabels[found.verification]}` : `${asusGroups[group].name} · Hướng dẫn chung`}</strong><p>{found?.procedureEvidence ? `Phạm vi: ${found.procedureEvidence.scope}. Firmware: ${found.procedureEvidence.firmware}. Windows: ${found.procedureEvidence.windowsVersion}. Ngày: ${found.procedureEvidence.checkedOn}.` : "Quy trình riêng theo model chưa được xác minh. Chưa có bản BIOS/firmware đối chiếu hoặc biên bản thử trên máy thật. Chọn nền tảng CPU chỉ điều chỉnh hướng dẫn tham khảo."}</p></div>{found?.sources.map((source) => <div className="asus-source" key={source.url}><a target="_blank" rel="noreferrer" href={source.url}>{source.title}<ExternalLink size={12} /></a><small>{source.checkedOn ? `Trang hỗ trợ đã mở: ${source.checkedOn}` : "Chưa kiểm tra liên kết"}</small><p>{source.scope}</p></div>)}</div>
  </section>;
}
