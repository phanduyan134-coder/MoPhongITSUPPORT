import type { GuideStep } from "./install-handbook";

export const asusGroups = {
  laptop: { name: "Laptop ASUS", bios: "F2 (nhóm laptop)", boot: "Esc (thường gặp)",
    entry: "Trên laptop ASUS, hướng dẫn chung của hãng là tắt máy hoàn toàn, giữ F2 rồi nhấn nguồn để vào BIOS. Esc thường mở menu boot lúc bật máy; đối chiếu manual theo model và phiên bản firmware để xác nhận.",
    identify: "Đọc model đầy đủ ở tem đáy máy, MyASUS hoặc System Model trong msinfo32; tên VivoBook, Zenbook, TUF hay ROG chỉ là dòng sản phẩm.",
  },
  desktop: { name: "Máy bàn ASUS nguyên bộ", bios: "Theo manual model", boot: "Theo manual model",
    entry: "Với máy bàn ASUS nguyên bộ, tra manual của đúng model để xác định phím vào UEFI và menu boot. Không mặc định dùng Esc/F2 của laptop hoặc F8 của mainboard bán lẻ.",
    identify: "Đọc model máy nguyên bộ ở tem vỏ máy và đối chiếu trang hỗ trợ; không thay bằng tên mainboard bên trong máy.",
  },
  motherboard: { name: "Mainboard ASUS / PC tự ráp", bios: "Del / F2 (thường gặp)", boot: "F8 (thường gặp)",
    entry: "Với mainboard ASUS bán lẻ, Del/F2 thường vào UEFI và F8 thường mở Boot Menu. Đối chiếu manual theo model và revision; không suy ra đường dẫn menu từ một bo mạch khác.",
    identify: "Đọc tên mainboard đầy đủ và revision in trên bo mạch hoặc từ tài liệu thiết bị. Giữ nguyên hậu tố như D4, WIFI, II; không coi các biến thể này là cùng model.",
  },
} as const;
export type AsusGroup = keyof typeof asusGroups;
export const cpuPlatforms = { unknown: "Chưa xác định", intel: "Intel", amd: "AMD", arm: "Qualcomm / ARM" } as const;
export type CpuPlatform = keyof typeof cpuPlatforms;
export type VerificationLevel = "general" | "documented" | "tested";
export const verificationLabels: Record<VerificationLevel, string> = {
  general: "Hướng dẫn chung", documented: "Đã đối chiếu tài liệu", tested: "Đã thử trên máy thật",
};
export type ModelSource = { title: string; url: string; checkedOn: string | null; scope: string };
export type AsusModelProfile = {
  model: string; family: string; group: AsusGroup;
  verification: VerificationLevel;
  // Only mark a procedure documented/tested when its specific evidence is recorded here.
  procedureEvidence: { firmware: string; windowsVersion: string; checkedOn: string; scope: string } | null;
  sources: ModelSource[];
};
export const asusModels: AsusModelProfile[] = [
  { model: "X515EA", family: "ASUS Laptop", group: "laptop", verification: "general", procedureEvidence: null,
    sources: [{ title: "X515EA · Tài liệu ASUS", url: "https://www.asus.com/supportonly/x515ea/helpdesk_manual/", checkedOn: "2026-10-19", scope: "Đã mở trang hỗ trợ và xác nhận tên model. Chưa đối chiếu nội dung manual, BIOS hoặc cấu hình lưu trữ." }] },
  { model: "FA506NC", family: "TUF Gaming", group: "laptop", verification: "general", procedureEvidence: null,
    sources: [{ title: "FA506NC · Tài liệu ASUS", url: "https://www.asus.com/supportonly/fa506nc/helpdesk_manual/", checkedOn: "2026-10-19", scope: "Đã mở trang hỗ trợ và xác nhận tên model. Chưa đối chiếu nội dung manual, BIOS hoặc cấu hình lưu trữ." }] },
  { model: "X1504VA", family: "Vivobook", group: "laptop", verification: "general", procedureEvidence: null,
    sources: [{ title: "X1504VA · Tra hỗ trợ ASUS", url: "https://www.asus.com/supportonly/x1504va/helpdesk_manual/", checkedOn: null, scope: "Liên kết tra cứu theo model; chưa kiểm tra trang và quy trình." }] },
  { model: "UX3405MA", family: "Zenbook", group: "laptop", verification: "general", procedureEvidence: null,
    sources: [{ title: "UX3405MA · Tra hỗ trợ ASUS", url: "https://www.asus.com/supportonly/ux3405ma/helpdesk_manual/", checkedOn: null, scope: "Liên kết tra cứu theo model; chưa kiểm tra trang và quy trình." }] },
  { model: "D500ME", family: "ExpertCenter", group: "desktop", verification: "general", procedureEvidence: null,
    sources: [{ title: "D500ME · Tra hỗ trợ ASUS", url: "https://www.asus.com/supportonly/d500me/helpdesk_manual/", checkedOn: null, scope: "Liên kết tra cứu theo model; chưa kiểm tra trang và quy trình." }] },
  { model: "PRIME B760M-A WIFI D4", family: "PRIME", group: "motherboard", verification: "general", procedureEvidence: null,
    sources: [{ title: "PRIME B760M-A WIFI D4 · Tra hỗ trợ ASUS", url: "https://www.asus.com/supportonly/prime%20b760m-a%20wifi%20d4/helpdesk_manual/", checkedOn: null, scope: "Liên kết tra cứu theo model; chưa kiểm tra trang và quy trình." }] },
];
export const asusGeneralSources: ModelSource[] = [
  { title: "ASUS · Vào BIOS", url: "https://www.asus.com/support/faq/1008829/", checkedOn: "2026-10-19", scope: "Đã đối chiếu hướng dẫn chung giữ F2 khi bật laptop; không xác minh từng model." },
  { title: "ASUS · Không thấy ổ đĩa khi cài Windows", url: "https://www.asus.com/support/faq/1044458/", checkedOn: "2026-10-19", scope: "Đã đọc hướng dẫn chung IRST và điều kiện nền tảng; cần kiểm tra CPU, bộ điều khiển, bản Windows và driver theo thiết bị." },
];
export function normalizeModel(value: string): string { return value.trim().replace(/\s+/g, " ").toUpperCase(); }
export function findAsusModel(model: string, group: AsusGroup): AsusModelProfile | undefined {
  return asusModels.find((p) => p.group === group && normalizeModel(p.model) === normalizeModel(model));
}
export function searchAsusModels(query: string, group: AsusGroup): AsusModelProfile[] {
  const value = normalizeModel(query);
  return asusModels.filter((p) => p.group === group && normalizeModel(`${p.model} ${p.family}`).includes(value));
}
export function asusStorageAdvice(platform: CpuPlatform): string {
  switch (platform) {
    case "intel": return "Với Intel, xác định CPU, bộ điều khiển lưu trữ và bản Windows trước. Chỉ nạp IRST/VMD khi tài liệu model và gói driver xác nhận phù hợp; một số nền tảng mới dùng driver tích hợp trong bản Windows được ASUS yêu cầu. Không mặc định mọi CPU Intel đều cần IRST.";
    case "amd": return "Đây là nền tảng AMD: không nạp driver Intel IRST/VMD. Nếu có AMD RAID, chỉ dùng driver AMD RAID tương ứng được hãng hỗ trợ; nếu không, kiểm tra chế độ bộ điều khiển, bộ cài và SSD theo model.";
    case "arm": return "Với Qualcomm/ARM, xác minh Windows on ARM, bộ cài ARM64 và driver ARM64 được hỗ trợ. Không dùng bộ cài x64 hoặc driver Intel IRST; ưu tiên quy trình khôi phục/cài đặt chính thức của model.";
    default: return "Chưa xác định CPU và bộ điều khiển: kiểm tra model/CPU và tài liệu hỗ trợ trước khi chọn driver. Không tự suy ra Intel VMD, AMD RAID hoặc khả năng tương thích Windows từ tên dòng máy.";
  }
}
export function applyAsusContext(steps: GuideStep[], group: AsusGroup, model: string, platform: CpuPlatform): GuideStep[] {
  const device = asusGroups[group];
  return steps.map((step) => {
    if (step.id === "identify") return { ...step, actions: [device.identify, ...step.actions,
      `Nền tảng ghi nhận: ${cpuPlatforms[platform]}. Model ghi nhận: ${model.trim() || "chưa xác định"}. Tự xác nhận trên thiết bị; hồ sơ không tự phát hiện phần cứng hoặc chứng nhận tương thích.`] };
    if (step.id === "usb" && platform === "arm") return { ...step, actions: [
      "Kiểm tra quy trình cài đặt/khôi phục dành cho model ARM cụ thể trước khi tạo USB. Dùng bộ cài Windows 11 ARM64 và driver đúng kiến trúc từ nguồn chính thức.",
      "Không dùng mặc định Media Creation Tool/bộ cài x64 của PC Intel/AMD. Xác minh cách tạo và khởi động USB ARM64 theo Microsoft và ASUS cho model này.",
      "Chuẩn bị driver mạng và lưu trữ ARM64 theo hướng dẫn hãng. Chưa xác minh được phương thức cài cho model thì dừng và tra tài liệu.",
    ], verify: "Có bộ cài ARM64 và quy trình boot/driver đã xác nhận cho thiết bị cụ thể." };
    if (step.id === "boot") return { ...step, title: `Mở menu khởi động · ${device.name}`, actions: [device.entry, ...step.actions.slice(1)] };
    if (step.id === "storage") return { ...step, actions: [step.actions[0], asusStorageAdvice(platform), step.actions[2]] };
    if (step.id === "drivers") return { ...step, actions: [
      `Tra đúng ${group === "motherboard" ? "model và revision mainboard" : "model thiết bị"}${model.trim() ? ` (${model.trim()})` : ""} tại ASUS Support. Chọn đúng phiên bản Windows và kiến trúc; không dùng driver từ model gần giống.`,
      group === "laptop" ? "Kiểm tra chipset, mạng, đồ họa, âm thanh, touchpad và ASUS System Control Interface nếu được cung cấp cho model. Kiểm tra MyASUS theo hỗ trợ của thiết bị." : group === "desktop" ? "Đối chiếu driver cho máy nguyên bộ và các tùy chọn phần cứng thực tế; không mặc định driver của mainboard bán lẻ thay thế được gói của máy." : "Lấy chipset, LAN/Wi-Fi và âm thanh theo mainboard; GPU rời dùng driver chính thức theo card. BIOS của model/revision khác không dùng thay thế.",
      ...step.actions.slice(1),
    ] };
    return step;
  });
}
