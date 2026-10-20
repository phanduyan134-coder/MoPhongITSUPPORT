import { diskVisible, installConditions, type Tab, type VirtualPC } from "./engine";
import { storageDriverFirmwareNotice, storageDriverPreparationNotice } from "./storage-driver-guide";

export type GuideContext = { reinstallAccepted: boolean; installedDuringGuide: boolean };
export type GuideTarget = "usb" | "enter-bios" | "boot-menu" | "secure-boot" | "tpm" | "uefi" | "prepare-driver" | "load-driver" | "prepare-disk" | "install" | "boot-usb" | "boot-ssd" | null;
export type InstallGuideStep = {
  id: string;
  title: string;
  instruction: string;
  explanation: string;
  warning?: string;
  target: GuideTarget;
  view?: Tab;
};

export function getInstallGuideStep(pc: VirtualPC, context: GuideContext): InstallGuideStep {
  const bitLockerWarning = pc.disk.osInstalled
    ? "Trên máy thật, nếu ổ đĩa đang bật BitLocker hoặc Device Encryption, hãy lưu khóa khôi phục ở nơi truy cập được trước khi thay đổi thiết lập bảo mật hoặc firmware."
    : undefined;
  if (pc.disk.osInstalled && !context.reinstallAccepted && !context.installedDuringGuide) return {
    id: "existing-windows", title: "Máy đã có Windows",
    instruction: "Chỉ chọn cài lại khi bạn muốn thay thế Windows hiện có; có thể dừng hướng dẫn để tiếp tục dùng máy.",
    explanation: "Windows có sẵn trước khi bật hướng dẫn không được xem là kết quả của lần cài này. Hướng dẫn chưa thay đổi ổ đĩa.",
    warning: "Cài mới bằng cách tạo lại phân vùng sẽ xóa Windows và dữ liệu trên ổ mô phỏng. Trên máy thật, sao lưu dữ liệu trước khi tiếp tục; nếu ổ đĩa đang bật BitLocker hoặc Device Encryption, lưu cả khóa khôi phục ở nơi truy cập được.",
    target: null,
  };

  const diskReady = installConditions(pc).filter((condition) => condition.id === "gpt" || condition.id === "partition").every((condition) => condition.met);
  const installedDriverReady = !pc.bios.vmdController || pc.disk.installedStorageDriver;
  const installedHere = pc.disk.osInstalled && context.installedDuringGuide;
  const windowsReady = installedHere && diskReady && installedDriverReady;

  if (!windowsReady && !pc.media.usbConnected) return {
    id: "connect-usb", title: "Cắm USB cài Windows",
    instruction: "Bật công tắc USB cài Windows để kết nối bộ cài với máy mô phỏng.",
    explanation: "USB cung cấp bộ cài trong mô hình. Thao tác này không tạo USB thật; khi làm thực tế cần chuẩn bị bộ cài chính hãng đúng kiến trúc thiết bị.",
    warning: storageDriverPreparationNotice,
    target: "usb",
  };

  const firmwareReady = pc.bios.bootMode === "UEFI" && pc.bios.secureBoot && pc.bios.tpmEnabled;
  if (!firmwareReady && pc.power !== "bios") return {
    id: "enter-bios", title: "Mở thiết lập firmware",
    instruction: "Chọn Vào BIOS để kiểm tra chế độ UEFI, Secure Boot và TPM 2.0.",
    explanation: "Một thiết lập firmware hiện chưa phù hợp với cấu hình Windows 11 mà mô hình yêu cầu. Các tùy chọn chỉ chỉnh được khi máy đang ở BIOS.",
    warning: "BIOS mô phỏng là giao diện chung. Trên máy thật, tra tài liệu đúng model trước khi đổi firmware." + (bitLockerWarning ? ` ${bitLockerWarning}` : ""),
    target: "enter-bios", view: "bios",
  };
  if (pc.bios.bootMode !== "UEFI") return {
    id: "uefi", title: "Chọn chế độ UEFI",
    instruction: "Trong Boot Mode, chọn UEFI.",
    explanation: "Bộ cài Windows 11 và bố cục GPT trong mô hình sử dụng khởi động UEFI. Đổi chế độ không tự chuyển bảng phân vùng hay cài lại hệ điều hành.",
    warning: "Trên máy thật, đổi Legacy/UEFI khi chưa kiểm tra ổ đĩa và hệ điều hành có thể khiến Windows không khởi động.",
    target: "uefi", view: "bios",
  };
  if (!pc.bios.secureBoot) return {
    id: "secure-boot", title: "Bật Secure Boot",
    instruction: "Bật Secure Boot trong thiết lập firmware mô phỏng.",
    explanation: "Mô hình dùng Secure Boot đã bật làm điều kiện cài Windows 11. Vị trí và các điều kiện bật trên máy thật phụ thuộc firmware của từng model.",
    warning: bitLockerWarning,
    target: "secure-boot", view: "bios",
  };
  if (!pc.bios.tpmEnabled) return {
    id: "tpm", title: "Bật TPM 2.0",
    instruction: "Bật TPM 2.0 trong thiết lập firmware mô phỏng.",
    explanation: "TPM 2.0 là một điều kiện cài đặt của mô hình Windows 11. Máy thật có thể đặt tên tùy chọn là Intel PTT hoặc AMD fTPM.",
    warning: "Bật TPM không đồng nghĩa với xóa TPM. Không chọn Clear TPM trên máy thật khi chưa đánh giá dữ liệu và khóa mã hóa.",
    target: "tpm", view: "bios",
  };

  if (windowsReady) {
    if (pc.power !== "desktop") return {
      id: "boot-windows", title: "Khởi động Windows từ SSD",
      instruction: "Mở Menu boot và chọn NVMe SSD.",
      explanation: "Windows đã được cài trong phiên hướng dẫn. Chọn SSD trong Menu boot chỉ áp dụng cho lần khởi động này và không thay đổi thứ tự khởi động BIOS.",
      target: "boot-ssd", view: "desktop",
    };
    if (pc.media.usbConnected) return {
      id: "disconnect-usb", title: "Rút USB cài đặt",
      instruction: "Tắt công tắc USB cài Windows sau khi Windows đã vào màn hình chính.",
      explanation: "Rút USB tránh quay lại bộ cài khi USB còn đứng trước SSD trong thứ tự khởi động. Hệ điều hành trên SSD được giữ lại.",
      target: "usb", view: "desktop",
    };
    return {
      id: "complete", title: "Windows đang chạy từ SSD",
      instruction: "USB đã rút và Windows đang chạy. Bạn có thể tiếp tục kiểm tra cấu hình hoặc khởi động lại máy.",
      explanation: "Đây là kết quả trong mô hình: cài đặt diễn ra tức thì. Máy thật vẫn cần hoàn tất thiết lập Windows, cài driver theo model, cập nhật và kiểm tra thiết bị.",
      target: null, view: "desktop",
    };
  }

  if (pc.power !== "installer") return {
    id: "boot-usb", title: "Khởi động bộ cài từ USB",
    instruction: "Mở Menu boot và chọn USB Drive.",
    explanation: "Cắm USB chưa làm máy tự vào bộ cài. Menu boot cho phép chọn USB một lần mà không cần đổi thứ tự khởi động trong BIOS.",
    warning: storageDriverPreparationNotice,
    target: "boot-usb", view: "installer",
  };
  if (!diskVisible(pc)) return {
    id: "storage-driver", title: "Nạp driver để nhận SSD",
    instruction: pc.media.driverPackages.includes("intel-vmd-x64")
      ? "Chọn Nạp driver Intel VMD, bấm Browse, chọn Drivers/Storage trên USB rồi chọn Intel VMD Controller (x64) và nạp."
      : "Mở Chuẩn bị driver để xem cách tải từ hãng. Trên máy hỗ trợ mô phỏng, tải gói Intel VMD x64, giải nén rồi chép vào USB. Sau đó chọn Nạp driver Intel VMD và Browse đến Drivers/Storage.",
    explanation: "VMD đang bật nên bộ cài cần driver bộ điều khiển lưu trữ, không phải mọi SSD đều cần tải driver riêng. Máy chưa có Windows có thể dùng máy khác để tải. USB chỉ chứa các tệp đã giải nén .inf, .sys, .cat; không phải cài driver lên USB. Driver nạp trong Setup là tạm thời; khởi động lại bộ cài sẽ cần nạp lại từ USB.",
    warning: `Trên máy thật, dùng driver phù hợp CPU, bộ điều khiển và model từ hãng. Không tắt VMD/RAID tùy tiện trên máy đã có Windows. ${storageDriverFirmwareNotice}`,
    target: pc.media.driverPackages.includes("intel-vmd-x64") ? "load-driver" : "prepare-driver", view: "installer",
  };
  if (!diskReady || pc.disk.osInstalled) return {
    id: "prepare-disk", title: "Chuẩn bị ổ đĩa cài Windows",
    instruction: "Chọn Chuẩn bị GPT & phân vùng, đọc cảnh báo rồi xác nhận nếu muốn cài mới.",
    explanation: pc.disk.osInstalled && installedHere && !installedDriverReady
      ? "Windows hiện có chưa có driver cho cấu hình VMD này. Mô hình chưa hỗ trợ chèn driver vào Windows đã cài; cần khôi phục cấu hình bộ điều khiển trước đó hoặc chủ động cài lại."
      : "Bộ cài cần bảng GPT và các phân vùng EFI, Windows hợp lệ. Khi cài lại, phải xóa Windows cũ trong mô hình trước khi nút cài đặt có thể dùng.",
    warning: "Thao tác này xóa toàn bộ phân vùng và Windows trên ổ mô phỏng. Trên máy thật, sao lưu và xác định đúng ổ đĩa; không xóa mọi phân vùng theo hướng dẫn chung.",
    target: "prepare-disk", view: "installer",
  };
  return {
    id: "install-windows", title: "Cài Windows lên SSD",
    instruction: "Chọn Cài đặt Windows trong trình cài mô phỏng.",
    explanation: "Firmware, khả năng nhận SSD và phân vùng hiện đáp ứng điều kiện của mô hình. Cài đặt cập nhật trạng thái ổ đĩa ngay, không sao chép tệp hay chạy bộ cài Windows thật.",
    target: "install", view: "installer",
  };
}
