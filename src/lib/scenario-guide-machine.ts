import { assign, createMachine } from "xstate";
import { freeSpaceMB, runSimulationDiagnostic, type DeviceId, type Simulation } from "./system-simulator";
import type { SystemView } from "./system-store";

export type ScenarioGuideId = "dhcp" | "iis" | "gateway" | "disk";
export type ScenarioGuideTarget = "dhcp-running" | "client-renew" | "iis-pool" | "client-gateway" | "disk-cleanup" | "disk-write";
export type ScenarioGuideStep = {
  id: string;
  label: string;
  title: string;
  text: string;
  why: string;
  expected: string;
  view: SystemView;
  command?: string;
  device?: DeviceId;
  target?: ScenarioGuideTarget;
};

type ScenarioGuide = { label: string; presetId: string; steps: ScenarioGuideStep[] };

export const scenarioGuides: Record<ScenarioGuideId, ScenarioGuide> = {
  dhcp: {
    label: "DHCP",
    presetId: "dhcp-stopped",
    steps: [
      { id: "dhcp-inspect-ip", label: "Địa chỉ máy trạm", title: "Bước 1/6 · Xem địa chỉ CLIENT-01", view: "terminal", device: "client", command: "ipconfig /all",
        text: "Tự chạy lệnh trên CLIENT-01 và đọc IPv4, gateway, DNS. Trong tình huống ban đầu, máy đang dùng 169.254.10.100.",
        why: "Địa chỉ tự gán APIPA 169.254.x.x là dấu hiệu máy chưa nhận cấu hình DHCP; riêng dấu hiệu này chưa xác định nguyên nhân.",
        expected: "Đọc được cấu hình CLIENT-01 trước khi kiểm tra máy chủ cấp địa chỉ." },
      { id: "dhcp-inspect-service", label: "Dịch vụ máy chủ", title: "Bước 2/6 · Kiểm tra DHCP Server", view: "terminal", device: "server", command: "Get-Service DHCPServer",
        text: "Thiết bị terminal chuyển sang SRV-01. Chạy lệnh và xem trạng thái DHCPServer; ban đầu dịch vụ đang Stopped.",
        why: "Dịch vụ DHCP nằm trên SRV-01, không phải máy trạm. Cần kiểm tra đúng thiết bị trước khi khôi phục dịch vụ.",
        expected: "Có kết quả DHCPServer trên SRV-01; nếu đã Running, vẫn kiểm tra bước nhận lease phía máy trạm." },
      { id: "dhcp-start-service", label: "Khôi phục DHCP", title: "Bước 3/6 · Bật dịch vụ DHCP", view: "dns-dhcp", target: "dhcp-running",
        text: "Bật công tắc DHCP Server được tô sáng. Giữ scope đang hoạt động và các option mặc định của tình huống.",
        why: "Bật dịch vụ chỉ giúp máy chủ sẵn sàng trả lời. CLIENT-01 chưa tự thay địa chỉ APIPA thành địa chỉ được cấp.",
        expected: "DHCP Server đang chạy và scope đang hoạt động; sau đó cần renew trên CLIENT-01." },
      { id: "dhcp-renew-client", label: "Nhận lease mới", title: "Bước 4/6 · Renew địa chỉ CLIENT-01", view: "network", target: "client-renew",
        text: "Nhấn Gia hạn DHCP để CLIENT-01 gửi yêu cầu cấp địa chỉ mới. Không tự nhập một IP tĩnh để thay cho bước này.",
        why: "Renew nhận lease cùng gateway và DNS từ option DHCP. Bật dịch vụ không tự cập nhật cấu hình đang dùng ở máy trạm.",
        expected: "Máy trạm nhận lease còn hạn, gateway 192.168.10.1 và DNS 192.168.10.10." },
      { id: "dhcp-verify-ip", label: "Kiểm tra lease", title: "Bước 5/6 · Xác minh cấu hình đã nhận", view: "terminal", device: "client", command: "ipconfig /all",
        text: "Chạy lại ipconfig /all trên CLIENT-01. So sánh IPv4, gateway và DNS với kết quả APIPA lúc đầu.",
        why: "Cần lấy bằng chứng mới từ máy trạm sau renew; trạng thái máy chủ Running chưa chứng minh máy trạm đã được cấu hình đúng.",
        expected: "IPv4 trùng lease còn hạn; gateway 192.168.10.1, DNS 192.168.10.10 và DHCP Enabled: Yes." },
      { id: "dhcp-verify-dns", label: "Thử phân giải tên", title: "Bước 6/6 · Kiểm tra DNS từ CLIENT-01", view: "terminal", device: "client", command: "nslookup portal.lab.test",
        text: "Tự truy vấn portal.lab.test từ CLIENT-01 để kiểm tra cấu hình DNS vừa nhận qua DHCP có sử dụng được không.",
        why: "Nhận IP chưa đủ. Máy trạm còn cần DNS đúng và kết nối tới máy chủ để phân giải tên nội bộ.",
        expected: "portal.lab.test trả về 192.168.10.10 và lease DHCP vẫn hợp lệ." },
    ],
  },
  iis: {
    label: "IIS",
    presetId: "iis-pool",
    steps: [
      { id: "iis-inspect-dns", label: "Kiểm tra tên miền", title: "Bước 1/4 · Kiểm tra DNS của website", view: "terminal", device: "client", command: "nslookup portal.lab.test",
        text: "Tự chạy nslookup trên CLIENT-01 trước khi chỉnh IIS. Địa chỉ website phải trỏ tới SRV-01.",
        why: "DNS và dịch vụ Web là hai thành phần khác nhau. Cần xác nhận tên miền đúng để không sửa nhầm nơi gây lỗi.",
        expected: "portal.lab.test trả về địa chỉ máy chủ 192.168.10.10." },
      { id: "iis-inspect-http", label: "Quan sát HTTP 503", title: "Bước 2/4 · Đọc phản hồi HTTP", view: "terminal", device: "client", command: "curl http://portal.lab.test",
        text: "Chạy curl và xem mã phản hồi. Tình huống ban đầu trả HTTP 503 Service Unavailable vì application pool đang dừng.",
        why: "HTTP 503 cho thấy yêu cầu đã tới dịch vụ Web nhưng ứng dụng chưa sẵn sàng; nó khác lỗi DNS hay không kết nối được cổng.",
        expected: "Quan sát HTTP 503, hoặc HTTP 200 nếu bạn đã tự khôi phục trước đó." },
      { id: "iis-start-pool", label: "Khởi động pool", title: "Bước 3/4 · Khởi động application pool", view: "iis", target: "iis-pool",
        text: "Đánh dấu Application pool đang chạy rồi nhấn Áp dụng IIS. Giữ website đang chạy và binding cổng 80.",
        why: "Dấu chọn mới chỉ sửa biểu mẫu. Chỉ sau khi áp dụng, trạng thái IIS của máy chủ mô phỏng mới thay đổi.",
        expected: "Website và application pool đã chạy trên cổng 80 trong trạng thái máy chủ." },
      { id: "iis-verify-http", label: "Xác minh website", title: "Bước 4/4 · Kiểm tra HTTP sau sửa", view: "terminal", device: "client", command: "curl http://portal.lab.test",
        text: "Tự chạy lại curl từ CLIENT-01. Đọc phản hồi mới thay vì chỉ nhìn công tắc application pool.",
        why: "Kiểm tra từ máy trạm xác nhận cả phân giải tên, kết nối và website hoạt động cùng nhau.",
        expected: "Nhận HTTP/1.1 200 OK từ portal.lab.test; phản hồi lỗi không hoàn tất hướng dẫn." },
    ],
  },
  gateway: {
    label: "Gateway",
    presetId: "network-gateway",
    steps: [
      { id: "gateway-inspect-ip", label: "Đọc IPv4", title: "Bước 1/7 · Xem cấu hình mạng CLIENT-01", view: "terminal", device: "client", command: "ipconfig /all",
        text: "Chạy ipconfig /all, xem DHCP Enabled và Default Gateway. Ban đầu máy nhận IP tự động nhưng còn dùng gateway 192.168.10.254.",
        why: "Cần xác định nguồn cấu hình trước khi sửa. Gateway sai vẫn có thể cho phép liên lạc cùng LAN; không nên vội đổi máy DHCP sang IP tĩnh.",
        expected: "Đọc được DHCP Enabled: Yes, IPv4, subnet /24 và gateway hiện tại của CLIENT-01." },
      { id: "gateway-check-lan", label: "Kiểm tra LAN", title: "Bước 2/7 · Kiểm tra cùng mạng LAN", view: "terminal", device: "client", command: "ping 192.168.10.10",
        text: "Ping SRV-01 từ CLIENT-01 để xác nhận đường truyền trong LAN vẫn hoạt động.",
        why: "Đích 192.168.10.10 cùng mạng với máy trạm nên không cần qua default gateway trong mô hình này.",
        expected: "Nhận Reply from 192.168.10.10 với 0% mất gói." },
      { id: "gateway-check-route", label: "Kiểm tra khác mạng", title: "Bước 3/7 · Kiểm tra đích khác mạng", view: "terminal", device: "client", command: "ping 192.168.20.10",
        text: "Ping thiết bị kiểm tra ở mạng 192.168.20.0/24 và so sánh với ping LAN vừa thành công.",
        why: "Đích khác mạng cần router chuyển tiếp. LAN hoạt động nhưng đích này timeout là cơ sở kiểm tra cấu hình gateway.",
        expected: "Quan sát Request timed out, hoặc phản hồi thành công nếu gateway đã được bạn sửa trước đó." },
      { id: "gateway-inspect-options", label: "Đối chiếu DHCP", title: "Bước 4/7 · Kiểm tra option của DHCP", view: "terminal", device: "server", command: "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0",
        text: "Chạy lệnh trên SRV-01 và đối chiếu Option 3 Router với gateway máy trạm. Scope hiện cấp 192.168.10.1, còn máy trạm vẫn giữ giá trị cũ .254.",
        why: "Nếu option DHCP sai, cần sửa tại máy chủ trước khi renew. Ở tình huống này option đã đúng nên ưu tiên nhận lại cấu hình, không đặt IP tĩnh trong dải đang cấp phát.",
        expected: "Máy trạm vẫn bật DHCP; dịch vụ và scope hoạt động, Option 3 là 192.168.10.1 và Option 6 là 192.168.10.10." },
      { id: "gateway-repair", label: "Nhận lại cấu hình", title: "Bước 5/7 · Gia hạn DHCP trên CLIENT-01", view: "network", target: "client-renew",
        text: "Giữ chế độ DHCP và nhấn Gia hạn DHCP. Máy trạm sẽ nhận gateway và DNS từ option vừa kiểm tra trên SRV-01.",
        why: "Cập nhật option trên máy chủ không tự đổi ngay cấu hình của lease đang dùng. Renew cho phép nhận lại cấu hình mà không chuyển sang IP tĩnh.",
        expected: "CLIENT-01 có lease DHCP còn hạn, gateway 192.168.10.1 và DNS 192.168.10.10." },
      { id: "gateway-verify-ip", label: "Xác minh cấu hình", title: "Bước 6/7 · Đọc lại cấu hình sau renew", view: "terminal", device: "client", command: "ipconfig /all",
        text: "Chạy lại ipconfig /all trên CLIENT-01. Kiểm tra máy vẫn dùng DHCP và Default Gateway đã đổi từ .254 sang 192.168.10.1.",
        why: "Nút renew không đủ chứng minh sửa thành công. Cần bằng chứng mới rằng máy trạm đã nhận lease cùng các option đúng.",
        expected: "DHCP Enabled: Yes, lease còn hạn, gateway 192.168.10.1 và DNS 192.168.10.10." },
      { id: "gateway-verify-route", label: "Xác minh đường đi", title: "Bước 7/7 · Ping lại thiết bị khác mạng", view: "terminal", device: "client", command: "ping 192.168.20.10",
        text: "Tự chạy lại cùng lệnh ping từ CLIENT-01 để so sánh trước và sau khi sửa gateway.",
        why: "Cần xác nhận đường đi thật sự hoạt động trong mô hình; giá trị hiển thị trong biểu mẫu chưa đủ chứng minh kết nối.",
        expected: "Nhận Reply from 192.168.20.10 với 0% mất gói." },
    ],
  },
  disk: {
    label: "Ổ đĩa",
    presetId: "disk-full",
    steps: [
      { id: "disk-inspect-volume", label: "Xem dung lượng", title: "Bước 1/3 · Kiểm tra ổ dữ liệu D:", view: "terminal", device: "server", command: "Get-Volume",
        text: "Chạy Get-Volume trên SRV-01 và đọc SizeRemaining. Lệnh này chỉ cho biết dung lượng ổ, không liệt kê tệp hay quyết định tệp nào có thể xóa.",
        why: "Tác vụ cần 10 MB nhưng ổ D: ban đầu chỉ còn 4 MB. Danh sách tệp được kiểm tra riêng trong bảng Windows Server ở bước tiếp theo.",
        expected: "Đọc được Size và SizeRemaining của ổ D: trước khi kiểm tra danh sách tệp." },
      { id: "disk-clean-temp", label: "Dọn tệp tạm", title: "Bước 2/3 · Dọn bộ nhớ đệm an toàn", view: "system", target: "disk-cleanup",
        text: "Kiểm tra danh sách tệp tại đây. Tình huống cho phép xóa Cache-tam-lab.tmp; chọn đúng tệp rồi xác nhận trong hộp thoại. Giữ lại dữ liệu khách hàng và dịch vụ.",
        why: "Quyền xóa đến từ thông tin tình huống, không phải đuôi .tmp. Nhãn bảo vệ là cơ chế an toàn của mô phỏng, không có nghĩa Windows tự bảo vệ mọi tệp dữ liệu.",
        expected: "Tệp tạm đã được xóa, còn ít nhất 10 MB trống và hai tệp dữ liệu vẫn được giữ nguyên." },
      { id: "disk-verify-write", label: "Thử ghi dữ liệu", title: "Bước 3/3 · Ghi thử tệp 10 MB", view: "system", target: "disk-write",
        text: "Nhấn Ghi tệp kiểm tra 10 MB để thực hiện lại tác vụ từng thất bại. Xem thông báo kết quả và tệp kiểm tra mới trên ổ D:.",
        why: "Dung lượng trống là điều kiện cần; thao tác ghi thành công mới xác nhận tác vụ ban đầu đã hoạt động trở lại trong mô phỏng.",
        expected: "Ghi thành công Kiem-tra-ghi.dat 10 MB, đồng thời giữ nguyên dữ liệu được bảo vệ." },
    ],
  },
};

export type ScenarioGuideContext = { guideId: ScenarioGuideId | null; stepIndex: number; feedback: string };
export type ScenarioGuideEvent =
  | { type: "START"; guideId: ScenarioGuideId }
  | { type: "STOP" }
  | { type: "DIAGNOSTIC"; device: DeviceId; command: string; output: string; state: Simulation }
  | { type: "STATE_CHANGED"; state: Simulation };

export function getScenarioGuideStep(context: ScenarioGuideContext): ScenarioGuideStep | undefined {
  return context.guideId ? scenarioGuides[context.guideId].steps[context.stepIndex] : undefined;
}

const normalizeCommand = (command: string) => command.trim().toLowerCase().replace(/\s+/g, " ");
const pingSucceeded = (state: Simulation, target: string) =>
  runSimulationDiagnostic(state, "client", `ping ${target}`).includes("Received = 4, Lost = 0 (0% loss)");
const dnsSucceeded = (state: Simulation) =>
  runSimulationDiagnostic(state, "client", "nslookup portal.lab.test").includes(`\nAddress: ${state.server.ip}`);
const httpSucceeded = (state: Simulation) =>
  runSimulationDiagnostic(state, "client", "curl http://portal.lab.test").startsWith("HTTP/1.1 200 OK\n");

function hasValidLease(state: Simulation): boolean {
  const { client, dhcp, server } = state;
  return client.dhcp && client.enabled && client.link && state.roles.dhcp && dhcp.running && dhcp.active
    && dhcp.lease !== null && dhcp.lease.expiresAt > state.simulatedTime && dhcp.lease.ip === client.ip
    && !client.ip.startsWith("169.254.") && client.prefix === server.prefix
    && client.gateway === dhcp.gateway && client.gateway === server.gateway
    && client.dns === dhcp.dns && client.dns === server.ip && pingSucceeded(state, server.ip);
}

function protectedDataIntact(state: Simulation): boolean {
  return [["business-data", 128], ["service-data", 64]].every(([id, sizeMB]) =>
    state.system.files.some((file) => file.id === id && file.sizeMB === sizeMB && file.protected));
}

function targetSatisfied(target: ScenarioGuideTarget, state: Simulation): boolean {
  switch (target) {
    case "dhcp-running": return state.roles.dhcp && state.dhcp.running && state.dhcp.active;
    case "client-renew": return hasValidLease(state);
    case "iis-pool": return state.roles.iis && state.iis.siteRunning && state.iis.poolRunning && state.iis.port === 80;
    case "client-gateway": return hasValidLease(state) && pingSucceeded(state, "192.168.20.10");
    case "disk-cleanup": return !state.system.files.some((file) => file.id === "temp-cache") && freeSpaceMB(state) >= 10 && protectedDataIntact(state);
    case "disk-write": return protectedDataIntact(state)
      && state.system.files.some((file) => file.id === "write-probe" && file.sizeMB === 10 && file.protected)
      && state.events.some((event) => event.message.startsWith("Đã ghi thành công tệp kiểm tra 10 MB trên ổ D:"));
  }
}

function diagnosticSucceeded(step: ScenarioGuideStep, state: Simulation): boolean {
  switch (step.id) {
    case "dhcp-inspect-ip":
    case "gateway-inspect-ip":
    case "disk-inspect-volume": return true;
    case "dhcp-inspect-service": return state.roles.dhcp;
    case "dhcp-verify-ip": return hasValidLease(state);
    case "dhcp-verify-dns": return hasValidLease(state) && dnsSucceeded(state);
    case "iis-inspect-dns": return dnsSucceeded(state);
    case "iis-inspect-http": {
      const output = runSimulationDiagnostic(state, "client", step.command!);
      return output.startsWith("HTTP/1.1 503 Service Unavailable\n") || output.startsWith("HTTP/1.1 200 OK\n");
    }
    case "iis-verify-http": return httpSucceeded(state);
    case "gateway-check-lan": return pingSucceeded(state, state.server.ip);
    case "gateway-check-route": return pingSucceeded(state, state.server.ip);
    case "gateway-inspect-options": return state.client.dhcp && state.roles.dhcp && state.dhcp.running && state.dhcp.active
      && state.dhcp.gateway === state.server.gateway && state.dhcp.dns === state.server.ip
      && runSimulationDiagnostic(state, "server", step.command!).startsWith("ScopeId: 192.168.10.0\n");
    case "gateway-verify-ip": return hasValidLease(state);
    case "gateway-verify-route": return hasValidLease(state) && pingSucceeded(state, "192.168.20.10");
    default: return false;
  }
}

function diagnosticFeedback(step: ScenarioGuideStep, event: Extract<ScenarioGuideEvent, { type: "DIAGNOSTIC" }>): string | null {
  if (!step.command) return `Bước này cần thao tác tại bảng điều khiển. ${step.text}`;
  const deviceName = step.device === "server" ? "SRV-01" : "CLIENT-01";
  if (event.device !== step.device) return `Chọn ${deviceName} trong terminal; kết quả từ thiết bị khác chưa xác nhận bước hiện tại.`;
  if (normalizeCommand(event.command) !== normalizeCommand(step.command)) return `Chạy ${step.command} trên ${deviceName} để lấy bằng chứng cho bước này.`;
  if (event.output !== runSimulationDiagnostic(event.state, event.device, event.command)) return "Kết quả chưa khớp trạng thái hiện tại. Chạy lại lệnh để lấy bằng chứng mới.";
  return diagnosticSucceeded(step, event.state) ? null : `Kết quả chưa đạt điều kiện để chuyển bước. ${step.expected}`;
}

export const scenarioGuideMachine = createMachine({
  types: {} as { context: ScenarioGuideContext; events: ScenarioGuideEvent },
  id: "scenario-guidance",
  initial: "idle",
  context: { guideId: null, stepIndex: 0, feedback: "" },
  on: {
    START: {
      target: ".active",
      reenter: true,
      actions: assign(({ event }) => ({ guideId: event.guideId, stepIndex: 0, feedback: "" })),
    },
    STOP: { target: ".idle", actions: assign({ guideId: null, stepIndex: 0, feedback: "" }) },
  },
  states: {
    idle: {},
    active: {
      always: { target: "complete", guard: ({ context }) => context.guideId !== null && context.stepIndex >= scenarioGuides[context.guideId].steps.length },
      on: {
        DIAGNOSTIC: {
          actions: assign(({ context, event }) => {
            const step = getScenarioGuideStep(context);
            if (!step) return {};
            const feedback = diagnosticFeedback(step, event);
            return feedback === null ? { stepIndex: context.stepIndex + 1, feedback: "" } : { feedback };
          }),
        },
        STATE_CHANGED: {
          actions: assign(({ context, event }) => {
            const step = getScenarioGuideStep(context);
            if (!step?.target) return {};
            return targetSatisfied(step.target, event.state)
              ? { stepIndex: context.stepIndex + 1, feedback: "" }
              : {};
          }),
        },
      },
    },
    complete: {},
  },
});
