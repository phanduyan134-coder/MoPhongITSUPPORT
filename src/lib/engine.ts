import { z } from "zod";
import { driverPackageIds, type DriverPackageId } from "./driver-media";

export const bootDevices = ["USB Drive", "NVMe SSD", "Network Boot"] as const;
export type BootDevice = (typeof bootDevices)[number];
export type PCPreset = "blank" | "installed";
export type Tab = "desktop" | "bios" | "installer" | "network" | "terminal";
export const pcSchema = z.object({
  bios: z.object({
    secureBoot: z.boolean(), tpmEnabled: z.boolean(), vmdController: z.boolean(),
    bootMode: z.enum(["UEFI", "LEGACY"]),
    bootOrder: z.array(z.enum(["USB Drive", "NVMe SSD", "Network Boot"])).length(3)
      .refine((v) => new Set(v).size === 3),
  }),
  disk: z.object({
    diskTable: z.enum(["MBR", "GPT"]),
    partitions: z.array(z.object({
      id: z.string().max(80), name: z.string().max(80),
      type: z.enum(["EFI", "MSR", "PRIMARY"]), format: z.enum(["FAT32", "NTFS"]),
      sizeGB: z.number().positive().max(512),
    })).max(16),
    storageDriverLoaded: z.boolean(), installedStorageDriver: z.boolean(), osInstalled: z.boolean(),
  }),
  network: z.object({
    ipAddress: z.string().max(40), gateway: z.string().max(40), dns: z.string().max(40),
    isInternetConnected: z.boolean(), dhcpEnabled: z.boolean(), dhcpAvailable: z.boolean(),
  }),
  power: z.enum(["off", "bios", "installer", "desktop"]),
  media: z.object({ usbConnected: z.boolean(), driverPackages: z.array(z.enum(driverPackageIds)).max(2).refine((ids) => new Set(ids).size === ids.length) }),
});
export type VirtualPC = z.infer<typeof pcSchema>;
export type Bios = VirtualPC["bios"];
export type Network = VirtualPC["network"];
export type Condition = { id: string; label: string; met: boolean };

export function validIPv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}
export function hasLAN(n: Network): boolean {
  const parts = n.ipAddress.split(".");
  return validIPv4(n.ipAddress) && parts.slice(0, 3).join(".") === "192.168.1"
    && Number(parts[3]) >= 2 && Number(parts[3]) <= 253 && Number(parts[3]) !== 10;
}
export function hasInternet(n: Network): boolean { return hasLAN(n) && n.gateway === "192.168.1.1"; }
export function hasDNS(n: Network): boolean {
  return hasInternet(n) && ["192.168.1.1", "1.1.1.1", "8.8.8.8"].includes(n.dns);
}
export function syncNetwork(pc: VirtualPC): VirtualPC {
  return { ...pc, network: { ...pc.network, isInternetConnected: hasInternet(pc.network) } };
}
export function initialPC(preset: PCPreset = "installed"): VirtualPC {
  const installed = preset === "installed";
  return syncNetwork({
    bios: { secureBoot: installed, tpmEnabled: installed, vmdController: !installed,
      bootMode: "UEFI", bootOrder: installed ? ["NVMe SSD", "USB Drive", "Network Boot"] : ["USB Drive", "NVMe SSD", "Network Boot"] },
    disk: { diskTable: installed ? "GPT" : "MBR", partitions: installed ? windowsPartitions() : [],
      storageDriverLoaded: false, installedStorageDriver: installed, osInstalled: installed },
    network: { ipAddress: "192.168.1.50", gateway: "192.168.1.1", dns: "192.168.1.1",
      dhcpEnabled: false, dhcpAvailable: true, isInternetConnected: false },
    power: installed ? "desktop" : "off", media: { usbConnected: false, driverPackages: [] },
  });
}
export function windowsPartitions(): VirtualPC["disk"]["partitions"] {
  return [
    { id: "efi", name: "System", type: "EFI", format: "FAT32", sizeGB: 0.1 },
    { id: "msr", name: "Reserved", type: "MSR", format: "NTFS", sizeGB: 0.016 },
    { id: "windows", name: "Windows", type: "PRIMARY", format: "NTFS", sizeGB: 511.884 },
  ];
}
// MSR has no real filesystem; NTFS is a placeholder imposed by the requested schema.
export function diskVisible(pc: VirtualPC): boolean { return !pc.bios.vmdController || pc.disk.storageDriverLoaded; }
export function storageDriverCompatible(pc: VirtualPC, packageId: DriverPackageId): boolean {
  return pc.power === "installer" && pc.media.usbConnected && pc.bios.vmdController
    && packageId === "intel-vmd-x64" && pc.media.driverPackages.includes(packageId);
}
export function installConditions(pc: VirtualPC): Condition[] {
  return [
    { id: "uefi", label: "Chế độ khởi động UEFI", met: pc.bios.bootMode === "UEFI" },
    { id: "secure", label: "Secure Boot đã bật", met: pc.bios.secureBoot },
    { id: "tpm", label: "TPM 2.0 đã bật", met: pc.bios.tpmEnabled },
    { id: "storage", label: "Trình cài nhận diện SSD", met: diskVisible(pc) },
    { id: "gpt", label: "Ổ đĩa sử dụng GPT", met: pc.disk.diskTable === "GPT" },
    { id: "partition", label: "Phân vùng EFI và Windows hợp lệ", met:
      pc.disk.partitions.some((p) => p.type === "EFI" && p.format === "FAT32" && p.sizeGB >= 0.1)
      && pc.disk.partitions.some((p) => p.type === "PRIMARY" && p.format === "NTFS" && p.sizeGB >= 64)
      && pc.disk.partitions.reduce((sum, p) => sum + p.sizeGB, 0) <= 512.001 },
  ];
}
export function boot(pc: VirtualPC, once?: BootDevice): { pc: VirtualPC; message: string } {
  pc = { ...pc, disk: { ...pc.disk, storageDriverLoaded: false } };
  const devices = once ? [once] : pc.bios.bootOrder;
  for (const device of devices) {
    if (device === "USB Drive" && pc.media.usbConnected)
      return { pc: { ...pc, power: "installer" }, message: "Khởi động USB cài đặt Windows." };
    if (device === "NVMe SSD" && pc.disk.osInstalled && (!pc.bios.vmdController || pc.disk.installedStorageDriver) && pc.bios.bootMode === "UEFI" && pc.disk.diskTable === "GPT")
      return { pc: { ...pc, power: "desktop" }, message: "Windows khởi động thành công từ NVMe SSD." };
  }
  return { pc: { ...pc, power: "off" }, message: once === "Network Boot" ? "PXE: Không tìm thấy máy chủ khởi động mạng." : "No bootable device. Kiểm tra thiết bị khởi động, USB và cấu hình lưu trữ." };
}
export type CommandResult = { pc: VirtualPC; output: string; clear?: boolean };
export function runCommand(pc: VirtualPC, raw: string): CommandResult {
  const cmd = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const n = pc.network;
  const result = (output: string, next = pc): CommandResult => ({ pc: next, output });
  if (cmd === "help") return result("Các lệnh mô phỏng:\n  ipconfig [/all | /release | /renew | /flushdns]\n  ping <IPv4 hoặc tên miền>\n  nslookup <tên miền>\n  cls\n\nMạng lab: 192.168.1.0/24; router 192.168.1.1; máy chủ 192.168.1.10.\nTên miền có trong lab: example.com, uit.edu.vn. Không thực thi lệnh trên máy thật.");
  if (cmd === "cls") return { pc, output: "", clear: true };
  if (pc.power !== "desktop") return result("CMD chưa sẵn sàng. Hãy khởi động vào Windows trước.");
  if (cmd === "ipconfig" || cmd === "ipconfig /all") return result(`Windows IP Configuration\n\nEthernet adapter Ethernet:\n   IPv4 Address . . . . . : ${n.ipAddress}\n   Subnet Mask  . . . . . : 255.255.255.0\n   Default Gateway . . . : ${n.gateway}${cmd.endsWith("/all") ? `\n   DNS Servers . . . . . : ${n.dns}\n   DHCP Enabled . . . . : ${n.dhcpEnabled ? "Yes" : "No"}` : ""}`);
  if (cmd === "ipconfig /flushdns") return result("Successfully flushed the DNS Resolver Cache.\nKhông có bộ nhớ đệm DNS trong mô hình hiện tại; cấu hình DNS được giữ nguyên.");
  if (cmd === "ipconfig /release") {
    if (!n.dhcpEnabled) return result("Không thể release: bộ điều hợp đang dùng IP tĩnh.");
    return result("Đã giải phóng địa chỉ DHCP.", syncNetwork({ ...pc, network: { ...n, ipAddress: "0.0.0.0", gateway: "0.0.0.0", dns: "0.0.0.0" } }));
  }
  if (cmd === "ipconfig /renew") {
    if (!n.dhcpEnabled) return result("Không thể renew: bộ điều hợp đang dùng IP tĩnh.");
    const next = syncNetwork({ ...pc, network: { ...n,
      ipAddress: n.dhcpAvailable ? "192.168.1.50" : "169.254.12.8",
      gateway: n.dhcpAvailable ? "192.168.1.1" : "0.0.0.0", dns: n.dhcpAvailable ? "192.168.1.1" : "0.0.0.0" } });
    return result(n.dhcpAvailable ? "DHCP lease renewed. IPv4: 192.168.1.50" : "Unable to contact your DHCP server. Request has timed out.\nAutoconfiguration IPv4: 169.254.12.8", next);
  }
  const [verb, host, ...extra] = cmd.split(" ");
  if ((verb === "ping" || verb === "nslookup") && host && !extra.length) {
    const records: Record<string, string> = { "example.com": "93.184.215.14", "uit.edu.vn": "203.113.137.126" };
    const ip = validIPv4(host);
    if (verb === "nslookup") {
      if (!hasDNS(n)) return result(`Server: ${n.dns}\nDNS request timed out. Không nhận được phản hồi từ DNS.`);
      return result(records[host] ? `Server: ${n.dns}\nName: ${host}\nAddress: ${records[host]}` : `Server: ${n.dns}\nNon-existent domain: ${host}`);
    }
    if (!ip && (!hasDNS(n) || !records[host])) return result(`Ping request could not find host ${host}.`);
    const address = ip ? host : records[host];
    const reachable = address === "127.0.0.1" || (address === n.ipAddress && address !== "0.0.0.0")
      || (["192.168.1.1", "192.168.1.10"].includes(address) && hasLAN(n))
      || (["1.1.1.1", "8.8.8.8", ...Object.values(records)].includes(address) && hasInternet(n));
    return result(`Pinging ${host} [${address}] with 32 bytes of data:\n${Array.from({ length: 4 }, () => reachable ? `Reply from ${address}: bytes=32 time<1ms TTL=64` : "Request timed out.").join("\n")}\n\nPackets: Sent = 4, Received = ${reachable ? 4 : 0}, Lost = ${reachable ? 0 : 4} (${reachable ? 0 : 100}% loss)`);
  }
  return result(`'${raw.trim()}' không phải lệnh được hỗ trợ trong lab. Nhập help để xem danh sách.`);
}
export function localSupport(pc: VirtualPC, question: string): string {
  const q = question.toLowerCase();
  const networkQuestion = /dns|dhcp|gateway|mạng|ping|ipconfig/.test(q);
  if (networkQuestion && pc.power !== "desktop") return "Windows chưa chạy nên CMD và cấu hình Ethernet chưa hoạt động. Cấu hình IP vẫn được giữ; khởi động Windows để quan sát kết nối và thực hiện các lệnh mạng.";
  if (networkQuestion || pc.power === "desktop") {
    if (!hasLAN(pc.network)) return `Máy đang có IP ${pc.network.ipAddress}. Trong mạng mô phỏng 192.168.1.0/24, địa chỉ này chưa dùng được cho máy khách. Kiểm tra ipconfig /all; nếu dùng DHCP, kiểm tra dịch vụ trên router rồi ipconfig /renew.`;
    if (!hasInternet(pc.network)) return `IP ${pc.network.ipAddress} có thể liên lạc trong LAN nhưng gateway ${pc.network.gateway} không phải router 192.168.1.1. So sánh ping 192.168.1.10 và ping 8.8.8.8 để xem ảnh hưởng.`;
    if (!hasDNS(pc.network)) return `Kết nối IP ra ngoài đang hoạt động nhưng DNS ${pc.network.dns} không phản hồi trong mô hình. ping 8.8.8.8 và nslookup example.com sẽ cho kết quả khác nhau. DNS được mô hình hỗ trợ: 192.168.1.1, 1.1.1.1, 8.8.8.8.`;
    if (networkQuestion || !/cài|windows|usb|boot|bios|tpm|vmd/.test(q)) return `Windows đang chạy. IP ${pc.network.ipAddress}, gateway ${pc.network.gateway}, DNS ${pc.network.dns}; kết nối IP và phân giải tên đều hoạt động trong mô hình. Bạn có thể đổi cấu hình rồi quan sát CMD.`;
  }
  if (/usb|boot/.test(q) || pc.power === "off") return `Máy ${pc.power === "off" ? "đang tắt" : "đang bật"}; USB cài Windows ${pc.media.usbConnected ? "đã cắm" : "chưa cắm"}. SSD ${pc.disk.osInstalled ? "đã có Windows" : "chưa có Windows"}. Menu boot chọn thiết bị cho một lần khởi động, không đổi thứ tự BIOS. Cắm USB trước khi boot bộ cài.`;
  if (!diskVisible(pc)) return "VMD đang bật và phiên cài đặt chưa nạp driver lưu trữ, nên Windows Setup chưa hiển thị SSD. Mở Chuẩn bị driver để tra nguồn hãng, tải gói mẫu trên máy hỗ trợ, giải nén rồi chép vào USB. Trong Nạp driver, chọn Browse và thư mục Drivers/Storage, sau đó chọn Intel VMD Controller (x64). Trên máy thật phải dùng gói đúng model, kiến trúc và bộ điều khiển; không đổi RAID/VMD tùy tiện.";
  const unmet = installConditions(pc).filter((c) => !c.met);
  if (unmet.length) return `Trình cài hiện chưa đáp ứng: ${unmet.map((c) => c.label).join(", ")}. Thay đổi cấu hình sẽ làm trạng thái trình cài thay đổi.`;
  return "Cấu hình hiện cho phép cài Windows trong mô hình. Cài đặt thay đổi trạng thái ổ đĩa; sau đó có thể chọn NVMe SSD trong menu boot. Hướng dẫn theo thiết bị nằm ở sổ tay; giao diện BIOS mô phỏng vẫn là bản chung.";
}
