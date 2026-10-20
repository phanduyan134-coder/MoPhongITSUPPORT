"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, File, FolderOpen, PackageOpen, Trash2, Usb } from "lucide-react";
import { driverPackageIds, driverPackages, type DriverPackageId } from "@/lib/driver-media";
import { storageDriverCompatible } from "@/lib/engine";
import { storageDriverNotes, storageDriverPreparationNotice, storageDriverPreparationSteps, storageDriverSources } from "@/lib/storage-driver-guide";
import { useLab } from "@/lib/store";
import { Dialog } from "./dialog";

export function DriverPreparationDialog({ onClose }: { onClose: () => void }) {
  const s = useLab();
  const [packageId, setPackageId] = useState<DriverPackageId>(s.driverWorkspace.packageId ?? "intel-vmd-x64");
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = storageDriverSources[sourceIndex];
  const workspace = s.driverWorkspace;
  const currentPackage = workspace.packageId ? driverPackages[workspace.packageId] : null;
  const activePackage = workspace.packageId === packageId;
  const copied = !!workspace.packageId && s.pc.media.driverPackages.includes(workspace.packageId);
  return <Dialog labelId="driver-preparation-title" onClose={onClose}>
    <div className="driver-dialog-content">
      <h2 id="driver-preparation-title">Chuẩn bị driver lưu trữ</h2>
      <p className="driver-preparation-notice" aria-label="Lưu ý chuẩn bị driver">{storageDriverPreparationNotice}</p>
      <details className="driver-real-guide" open>
        <summary>Tải và chuẩn bị driver trên máy thật</summary>
        <ol>{storageDriverPreparationSteps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.detail}</p></li>)}</ol>
        <div className="driver-source">
          <label>Trang hỗ trợ hãng<select aria-label="Trang hỗ trợ hãng" value={sourceIndex} onChange={(e) => setSourceIndex(Number(e.target.value))}>{storageDriverSources.map((item, index) => <option value={index} key={item.name}>{item.name}</option>)}</select></label>
          <a className="button subtle" href={source.url} target="_blank" rel="noreferrer">Mở trang {source.name}<ExternalLink size={14} /></a>
          <p>{source.hint}</p>
        </div>
      </details>
      <section className="driver-workspace" aria-label="Máy hỗ trợ mô phỏng">
        <h3><PackageOpen size={16} />Máy hỗ trợ · gói mô phỏng</h3>
        <p className="driver-caption">Gói và tên tệp chỉ là mẫu cho PC Intel VMD x64 đang mô phỏng, không phải driver đã xác minh cho model thật. Ứng dụng không tải hoặc chạy tệp thật.</p>
        <label className="driver-package-select">Gói driver mô phỏng<select aria-label="Gói driver mô phỏng" value={packageId} onChange={(e) => setPackageId(e.target.value as DriverPackageId)}>{driverPackageIds.map((id) => <option value={id} key={id}>{driverPackages[id].name}</option>)}</select></label>
        <div className="driver-workspace-actions">
          <button className="button subtle" onClick={() => s.downloadDriverPackage(packageId)}><Download size={15} />Tải gói mô phỏng</button>
          <button className="button subtle" disabled={!activePackage || workspace.stage !== "downloaded"} onClick={s.extractDriverPackage}><PackageOpen size={15} />Giải nén gói</button>
          <button className="button primary" disabled={!activePackage || workspace.stage !== "extracted" || !s.pc.media.usbConnected || copied} onClick={s.copyDriverToUSB}><Copy size={15} />Chép vào USB</button>
        </div>
        <div className="driver-workspace-status" role="status">
          {!currentPackage ? "Chưa có gói driver trên máy hỗ trợ." : <><strong>{currentPackage.name}</strong><span>{workspace.stage === "downloaded" ? "Gói tải về · chưa giải nén, chưa có INF để nạp" : "Đã giải nén · có INF, SYS và CAT"}</span>{workspace.stage === "extracted" && <code>{currentPackage.files.join(" · ")}</code>}</>}
        </div>
      </section>
      <section className="driver-usb-files" aria-label="Tệp driver trên USB">
        <div className="driver-usb-heading"><h3><Usb size={16} />USB Drive · Drivers/Storage</h3><label className="usb-control"><input type="checkbox" aria-label="Cắm USB cài Windows" checked={s.pc.media.usbConnected} onChange={(e) => s.setUSBConnected(e.target.checked)} />{s.pc.media.usbConnected ? "Đã cắm" : "Chưa cắm"}</label></div>
        {!s.pc.media.usbConnected && <p className="driver-caption">Kết nối USB để chép hoặc xóa tệp. Các gói đã chép vẫn còn trên USB sau khi rút.</p>}
        {!s.pc.media.driverPackages.length ? <p className="driver-caption">Chưa có tệp driver trên USB.</p> : <ul>{s.pc.media.driverPackages.map((id) => <li key={id}><FolderOpen size={16} /><div><strong>{driverPackages[id].name}</strong><code>{driverPackages[id].files.join(" · ")}</code></div><button className="icon-button" disabled={!s.pc.media.usbConnected} title={`Xóa ${driverPackages[id].name} khỏi USB`} aria-label={`Xóa ${driverPackages[id].name} khỏi USB`} onClick={() => s.removeDriverFromUSB(id)}><Trash2 size={15} /></button></li>)}</ul>}
      </section>
      <details className="driver-notes"><summary>Lưu ý áp dụng thực tế</summary><ul>{storageDriverNotes.map((note) => <li key={note}>{note}</li>)}</ul></details>
      <div className="modal-actions"><button className="button subtle" onClick={onClose}>Đóng</button></div>
    </div>
  </Dialog>;
}

type DriverFolder = "root" | "drivers" | "storage";
const folderPaths: Record<DriverFolder, string> = { root: "E:\\", drivers: "E:\\Drivers", storage: "E:\\Drivers\\Storage" };

export function StorageDriverDialog({ onClose }: { onClose: () => void }) {
  const s = useLab();
  const [browse, setBrowse] = useState(false);
  const [folder, setFolder] = useState<DriverFolder>("root");
  const [searched, setSearched] = useState<DriverFolder | null>(null);
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [selected, setSelected] = useState<DriverPackageId | null>(null);
  const candidates = s.pc.media.usbConnected && searched === "storage" ? s.pc.media.driverPackages : [];
  const visible = candidates.filter((id) => !compatibleOnly || storageDriverCompatible(s.pc, id));
  const canLoad = selected !== null && visible.includes(selected) && storageDriverCompatible(s.pc, selected);
  return <Dialog labelId="load-driver-title" onClose={onClose}>
    <div className="driver-dialog-content">
      <h2 id="load-driver-title">Nạp driver lưu trữ</h2>
      <p className="driver-caption">Windows Setup · PC Intel VMD x64 mô phỏng. Chọn thư mục có INF của gói driver đã giải nén; không chọn bộ cài EXE.</p>
      <div className="driver-browse-path"><code>{searched ? folderPaths[searched] : "Chưa chọn thư mục"}</code><button className="button subtle" disabled={!s.pc.media.usbConnected} onClick={() => setBrowse(true)}><FolderOpen size={15} />Browse</button></div>
      {!s.pc.media.usbConnected && <p className="driver-inline-warning">USB chưa kết nối. Đóng hộp thoại và kết nối USB chứa driver.</p>}
      {browse && <div className="driver-folder-picker"><label>Thư mục driver<select aria-label="Thư mục driver" value={folder} onChange={(e) => setFolder(e.target.value as DriverFolder)}><option value="root">USB Drive (E:)</option><option value="drivers">E:\Drivers</option><option value="storage">E:\Drivers\Storage</option></select></label><button className="button subtle" onClick={() => { setSearched(folder); setSelected(null); setBrowse(false); }}><Check size={15} />Chọn thư mục</button></div>}
      <label className="driver-compatible-filter"><input type="checkbox" aria-label="Chỉ hiện driver tương thích" checked={compatibleOnly} onChange={(e) => { setCompatibleOnly(e.target.checked); setSelected(null); }} />Chỉ hiện driver tương thích</label>
      <fieldset className="driver-candidates" aria-label="Driver tìm thấy"><legend>Driver tìm thấy</legend>
        {!visible.length ? <p>{searched ? "Không tìm thấy driver tương thích trong thư mục đã chọn. Kiểm tra gói đã giải nén và đường dẫn chứa INF; bộ chọn mô phỏng không quét thư mục con." : "Chọn Browse để tìm thư mục driver trên USB."}</p>
          : visible.map((id) => <label key={id} className={selected === id ? "driver-candidate selected" : "driver-candidate"}><input type="radio" name="storage-driver" aria-label={driverPackages[id].controller} checked={selected === id} onChange={() => setSelected(id)} /><File size={16} /><span><strong>{driverPackages[id].controller}</strong><code>{driverPackages[id].files[0]}</code>{!storageDriverCompatible(s.pc, id) && <small>Không tương thích bộ điều khiển lưu trữ hiện tại</small>}</span></label>)}
      </fieldset>
      <p className="driver-caption">Tên tệp và bộ điều khiển ở đây là mẫu. Trên máy thật, chỉ nạp gói khớp model, kiến trúc và bộ điều khiển theo tài liệu hãng.</p>
      <div className="modal-actions"><button className="button subtle" onClick={onClose}>Hủy</button><button className="button primary" disabled={!canLoad} onClick={() => { if (selected && s.loadDriver(selected)) onClose(); }}><Download size={15} />Nạp driver</button></div>
    </div>
  </Dialog>;
}
