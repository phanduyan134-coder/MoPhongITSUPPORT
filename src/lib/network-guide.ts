import { hasDNS, hasInternet, hasLAN, type Tab, type VirtualPC } from "./engine";

export type NetworkGuideTarget = "boot-ssd" | "network-config" | "router-dhcp" | "cmd-input" | null;
export type NetworkGuideStep = {
  id: string;
  title: string;
  instruction: string;
  explanation: string;
  warning?: string;
  target: NetworkGuideTarget;
  view?: Tab;
  command?: string;
};

export const networkCheckCommands = [
  "ipconfig /all",
  "ping 192.168.1.1",
  "ping 192.168.1.10",
  "ping 8.8.8.8",
  "nslookup example.com",
] as const;

export function normalizeNetworkCommand(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function recordNetworkCheck(pc: VirtualPC, checks: readonly string[], raw: string): string[] {
  const command = normalizeNetworkCommand(raw);
  const next = [...checks];
  if (pc.power === "desktop" && networkCheckCommands.some((known) => known === command)
    && !checks.some((check) => normalizeNetworkCommand(check) === command)) next.push(command);
  return next;
}

export function getNetworkGuideStep(pc: VirtualPC, checks: readonly string[]): NetworkGuideStep {
  if (pc.power !== "desktop") {
    if (!pc.disk.osInstalled) return {
      id: "network-no-windows", title: "Máy chưa có Windows",
      instruction: "Chọn hướng dẫn cài Windows trước khi kiểm tra mạng bằng CMD.",
      explanation: "Bộ điều hợp Ethernet và CMD mô phỏng chỉ hoạt động khi Windows đang chạy. Hướng dẫn mạng không cài hệ điều hành hay thay đổi máy.",
      target: null,
    };
    return {
      id: "network-start-windows", title: "Khởi động Windows",
      instruction: "Mở Menu boot và chọn NVMe SSD để vào Windows.",
      explanation: "Ổ SSD đã có Windows nhưng máy hiện chưa ở màn hình Windows. Nếu SSD không khởi động được, kiểm tra chế độ UEFI, bảng GPT và cấu hình bộ điều khiển lưu trữ.",
      target: "boot-ssd", view: "desktop",
    };
  }

  const observed = new Set(checks.map(normalizeNetworkCommand));
  const n = pc.network;
  if (!observed.has("ipconfig /all")) return {
    id: "network-inspect", title: "Xem cấu hình mạng hiện tại",
    instruction: "Mở Command Prompt, nhập ipconfig /all rồi thực thi để xem IP, gateway, DNS và chế độ DHCP.",
    explanation: "Đọc cấu hình trước khi chọn cách xử lý. Các bước hướng dẫn dựa trên cấu hình hiện tại và các lệnh bạn đã chạy; không tự thay đổi hoặc thực thi lệnh.",
    warning: "Mạng mô phỏng cố định là 192.168.1.0/24. Không dùng các địa chỉ mẫu này cho mạng thật khi chưa xác định cấu hình của nơi làm việc.",
    target: "cmd-input", view: "terminal", command: "ipconfig /all",
  };

  if (!hasLAN(n)) {
    if (!n.dhcpEnabled) return {
      id: "network-ip", title: "Kiểm tra địa chỉ IP tĩnh",
      instruction: `IP hiện tại là ${n.ipAddress}. Mở Cấu hình mạng, đặt địa chỉ máy khách hợp lệ như 192.168.1.50 với subnet 255.255.255.0 rồi áp dụng, hoặc chọn nhận IP tự động.`,
      explanation: "Trong mô hình, máy khách cần địa chỉ thuộc 192.168.1.0/24; không dùng địa chỉ router .1, máy chủ .10, địa chỉ mạng .0 hoặc broadcast .255. Trên mạng thật phải chọn địa chỉ chưa được thiết bị khác sử dụng.",
      target: "network-config", view: "network",
    };
    if (!n.dhcpAvailable) return {
      id: "network-dhcp-server", title: "Kiểm tra dịch vụ DHCP",
      instruction: `Máy đang nhận IP tự động nhưng có địa chỉ ${n.ipAddress}. Mở Cấu hình mạng và bật Dịch vụ DHCP trên router.`,
      explanation: "Dịch vụ DHCP mô phỏng đang dừng nên máy chưa nhận được địa chỉ dùng trong LAN. Bật lại dịch vụ không tự cấp lại địa chỉ đang có; sau đó cần yêu cầu gia hạn bằng ipconfig /renew.",
      warning: "Trên mạng thật, kiểm tra kết nối, phạm vi cấp phát và quyền quản trị trước khi thay đổi dịch vụ DHCP của tổ chức.",
      target: "router-dhcp", view: "network",
    };
    return {
      id: "network-renew", title: "Yêu cầu cấp lại địa chỉ DHCP",
      instruction: "DHCP trên router đang hoạt động. Trong Command Prompt, nhập ipconfig /renew rồi thực thi để yêu cầu địa chỉ mới.",
      explanation: `Máy đang dùng DHCP nhưng địa chỉ ${n.ipAddress} chưa phù hợp với LAN. Trong mô hình, renew thành công cấp IP 192.168.1.50, gateway và DNS 192.168.1.1.`,
      target: "cmd-input", view: "terminal", command: "ipconfig /renew",
    };
  }
  if (!hasInternet(n)) return {
    id: "network-gateway", title: "Kiểm tra Default Gateway",
    instruction: `IP ${n.ipAddress} dùng được trong LAN, nhưng gateway ${n.gateway} chưa đúng. Mở Cấu hình mạng, đặt Default Gateway là 192.168.1.1 rồi áp dụng.`,
    explanation: "192.168.1.1 là router duy nhất trong mô hình. Gateway sai vẫn cho phép liên lạc với máy cùng subnet nhưng ngăn truy cập địa chỉ ngoài LAN.",
    target: "network-config", view: "network",
  };
  if (!hasDNS(n)) return {
    id: "network-dns", title: "Kiểm tra DNS Server",
    instruction: `Kết nối IP ra ngoài đang hoạt động nhưng DNS ${n.dns} chưa phản hồi. Mở Cấu hình mạng, chọn DNS 192.168.1.1, 1.1.1.1 hoặc 8.8.8.8 rồi áp dụng.`,
    explanation: "Mô hình chỉ hỗ trợ ba DNS này. DNS phân giải tên miền thành địa chỉ IP; thay DNS không sửa lỗi IP hoặc gateway. Trên mạng tổ chức, dùng DNS được quản trị viên chỉ định để giữ khả năng truy cập tên nội bộ.",
    target: "network-config", view: "network",
  };

  const leaseNote = n.dhcpEnabled && !n.dhcpAvailable
    ? " DHCP trên router đang dừng nhưng địa chỉ đã cấp vẫn dùng được trong mô hình; không cần release địa chỉ đang hoạt động."
    : "";
  if (!observed.has("ping 192.168.1.1")) return {
    id: "network-router", title: "Kiểm tra kết nối tới router",
    instruction: "Cấu hình IP, gateway và DNS hiện phù hợp với mạng mô phỏng. Nhập ping 192.168.1.1 trong Command Prompt rồi thực thi.",
    explanation: `Lệnh này kiểm tra phản hồi từ router trong cùng subnet.${leaseNote}`,
    warning: "Trên máy thật, ping hết thời gian không đủ để kết luận kết nối vật lý bị hỏng: thiết bị hoặc tường lửa có thể chặn ICMP.",
    target: "cmd-input", view: "terminal", command: "ping 192.168.1.1",
  };
  if (!observed.has("ping 192.168.1.10")) return {
    id: "network-lan", title: "Kiểm tra máy chủ trong LAN",
    instruction: "Router đã phản hồi trong mô hình. Tiếp tục nhập ping 192.168.1.10 để kiểm tra máy chủ nội bộ.",
    explanation: `Máy chủ 192.168.1.10 cùng subnet với máy khách, nên kết nối này không cần đi qua gateway.${leaseNote}`,
    target: "cmd-input", view: "terminal", command: "ping 192.168.1.10",
  };
  if (!observed.has("ping 8.8.8.8")) return {
    id: "network-internet", title: "Kiểm tra kết nối bằng IP ngoài LAN",
    instruction: "Máy chủ nội bộ đã phản hồi trong mô hình. Nhập ping 8.8.8.8 để kiểm tra đường đi qua gateway mà chưa cần phân giải tên.",
    explanation: `Địa chỉ 8.8.8.8 được mô phỏng là một điểm ngoài LAN. Phản hồi ở đây chưa xác nhận DNS hay truy cập website HTTPS.${leaseNote}`,
    target: "cmd-input", view: "terminal", command: "ping 8.8.8.8",
  };
  if (!observed.has("nslookup example.com")) return {
    id: "network-name", title: "Kiểm tra phân giải tên miền",
    instruction: "Địa chỉ IP ngoài LAN đã phản hồi trong mô hình. Nhập nslookup example.com để kiểm tra DNS riêng với kết nối IP.",
    explanation: `example.com có bản ghi minh họa cố định 93.184.215.14. Kết quả chỉ phản ánh DNS trong mô hình, không truy vấn Internet thật.${leaseNote}`,
    target: "cmd-input", view: "terminal", command: "nslookup example.com",
  };
  return {
    id: "network-complete", title: "Đã kiểm tra kết nối mạng mô phỏng",
    instruction: "DNS đã trả về bản ghi example.com trong mô hình. Bạn có thể tiếp tục dùng máy hoặc đổi cấu hình để quan sát kết quả mới.",
    explanation: `Các lệnh đã kiểm tra IP, router, máy chủ nội bộ, IP ngoài LAN và DNS với cấu hình hiện tại.${leaseNote}`,
    warning: "Mô hình dùng mạng và bản ghi cố định, không gửi lưu lượng thật. Máy thật còn cần kiểm tra Wi-Fi/cáp, driver, proxy, tường lửa và ứng dụng theo triệu chứng; ping timeout không tự chứng minh lỗi phần cứng.",
    target: null, view: "terminal",
  };
}
