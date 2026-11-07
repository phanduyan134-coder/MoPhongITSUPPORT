import { createMachine } from "xstate";
import type { DeviceId } from "./system-simulator";

export type DnsGuideStep = "idle" | "checkingIp" | "checkingDns" | "checkingService" | "repairingDns" | "verifyingDns" | "checkingHttp" | "complete";
export type DnsGuideEvent =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "DNS_STARTED" }
  | { type: "DIAGNOSTIC"; device: DeviceId; command: string; output: string };

const isCommand = (event: DnsGuideEvent, command: string, device: DeviceId = "client") =>
  event.type === "DIAGNOSTIC" && event.device === device && event.command.trim().toLowerCase().replace(/\s+/g, " ") === command.toLowerCase();

const hasPingResponse = (event: DnsGuideEvent) =>
  isCommand(event, "ping 192.168.10.10") && event.type === "DIAGNOSTIC"
  && /^Reply from 192\.168\.10\.10:/m.test(event.output)
  && /Packets: Sent = 4, Received = 4, Lost = 0 \(0% loss\)/.test(event.output);

const hasDnsTimeout = (event: DnsGuideEvent) =>
  isCommand(event, "nslookup portal.lab.test") && event.type === "DIAGNOSTIC"
  && /^DNS request timed out\./m.test(event.output)
  && /^Server: 192\.168\.10\.10\r?$/m.test(event.output);

const hasDnsAnswer = (event: DnsGuideEvent) =>
  isCommand(event, "nslookup portal.lab.test") && event.type === "DIAGNOSTIC"
  && /^Name: portal\.lab\.test\r?$/m.test(event.output)
  && /^Address: 192\.168\.10\.10\r?$/m.test(event.output);

const hasHttpResponse = (event: DnsGuideEvent) =>
  isCommand(event, "curl http://portal.lab.test") && event.type === "DIAGNOSTIC"
  && /^HTTP\/1\.1 200 OK(?:\r?\n|$)/.test(event.output);

const hasDnsServiceStatus = (event: DnsGuideEvent, status: "Running" | "Stopped") =>
  isCommand(event, "get-service dns", "server") && event.type === "DIAGNOSTIC"
  && /^Name[ \t]+Status[ \t]+Startup Type\r?$/m.test(event.output)
  && new RegExp(`^DNS[ \\t]+${status}[ \\t]+Automatic\\r?$`, "m").test(event.output);

export const dnsGuideMachine = createMachine({
  types: {} as { events: DnsGuideEvent },
  id: "dns-guidance",
  initial: "idle",
  states: {
    idle: { on: { START: "checkingIp" } },
    checkingIp: {
      on: {
        DIAGNOSTIC: { target: "checkingDns", guard: ({ event }) => hasPingResponse(event) },
        STOP: "idle",
      },
    },
    checkingDns: {
      on: {
        DIAGNOSTIC: [
          { target: "checkingService", guard: ({ event }) => hasDnsTimeout(event) },
          { target: "checkingHttp", guard: ({ event }) => hasDnsAnswer(event) },
        ],
        STOP: "idle",
      },
    },
    checkingService: {
      on: {
        DIAGNOSTIC: [
          { target: "repairingDns", guard: ({ event }) => hasDnsServiceStatus(event, "Stopped") },
          { target: "verifyingDns", guard: ({ event }) => hasDnsServiceStatus(event, "Running") },
        ],
        STOP: "idle",
      },
    },
    repairingDns: { on: { DNS_STARTED: "verifyingDns", STOP: "idle" } },
    verifyingDns: {
      on: {
        DIAGNOSTIC: { target: "checkingHttp", guard: ({ event }) => hasDnsAnswer(event) },
        STOP: "idle",
      },
    },
    checkingHttp: {
      on: {
        DIAGNOSTIC: {
          target: "complete",
          guard: ({ event }) => hasHttpResponse(event),
        },
        STOP: "idle",
      },
    },
    complete: { on: { STOP: "idle", START: "checkingIp" } },
  },
});

export function getDnsGuideFeedback(step: DnsGuideStep, event: DnsGuideEvent): string | null {
  if (event.type !== "DIAGNOSTIC" || step === "idle" || step === "complete") return null;
  const { command, device = "client" } = dnsGuideCopy[step];
  if (event.device !== device) return device === "server"
    ? "Chọn SRV-01 để kiểm tra dịch vụ DNS trên máy chủ; kết quả trên CLIENT-01 không xác nhận được trạng thái dịch vụ ở SRV-01."
    : "Chọn CLIENT-01 để kiểm tra từ phía máy trạm; kết quả trên SRV-01 chưa xác nhận được kết nối của người dùng.";
  if (command && !isCommand(event, command, device)) return `Bước này cần chạy ${command} trên ${device === "server" ? "SRV-01" : "CLIENT-01"}. Lệnh khác vẫn dùng được nhưng chưa cung cấp bằng chứng cần kiểm tra.`;
  switch (step) {
    case "checkingIp":
      return hasPingResponse(event) ? null : "Ping chưa thành công. Kiểm tra kết nối và địa chỉ IP của CLIENT-01 trước; chưa đủ bằng chứng để chuyển sang xử lý DNS.";
    case "checkingDns":
      if (hasDnsTimeout(event) || hasDnsAnswer(event)) return null;
      return "Kết quả chưa cho thấy DNS tại 192.168.10.10 mất phản hồi. Kiểm tra DNS mà CLIENT-01 đang dùng và bản ghi portal.lab.test; chưa nên kết luận dịch vụ DNS bị dừng.";
    case "checkingService":
      if (hasDnsServiceStatus(event, "Stopped") || hasDnsServiceStatus(event, "Running")) return null;
      return "Chưa xác nhận được trạng thái DNS trên SRV-01. Cần đọc đúng dòng DNS và trạng thái Running hoặc Stopped; timeout từ máy trạm không đủ để kết luận dịch vụ đã dừng.";
    case "repairingDns":
      return "Mở DNS / DHCP và bật dịch vụ DNS Server. Sau khi trạng thái thay đổi, hướng dẫn sẽ yêu cầu kiểm tra lại từ CLIENT-01.";
    case "verifyingDns":
      return hasDnsAnswer(event) ? null : "Tên portal.lab.test chưa trả về 192.168.10.10. Kiểm tra dịch vụ DNS, cấu hình DNS máy trạm và bản ghi trước khi kiểm tra HTTP.";
    case "checkingHttp":
      return hasHttpResponse(event) ? null : "Chưa nhận được HTTP 200 OK. Xem lỗi trong terminal và kiểm tra DNS, website hoặc application pool IIS; hướng dẫn chưa đánh dấu hoàn thành.";
  }
}

export const dnsGuideCopy: Record<Exclude<DnsGuideStep, "idle">, { title: string; text: string; command?: string; device?: DeviceId }> = {
  checkingIp: { title: "Bước 1/6 · Kiểm tra kết nối IP", text: "Lệnh đã được điền sẵn. Tự chạy ping để xác nhận CLIENT-01 vẫn liên lạc được SRV-01 bằng địa chỉ IP.", command: "ping 192.168.10.10", device: "client" },
  checkingDns: { title: "Bước 2/6 · Kiểm tra phân giải tên", text: "Bây giờ tự chạy nslookup. Nếu ping thành công nhưng tra tên thất bại, ta có bằng chứng để kiểm tra DNS; timeout chưa chứng minh dịch vụ đã dừng.", command: "nslookup portal.lab.test", device: "client" },
  checkingService: { title: "Bước 3/6 · Xác nhận trạng thái dịch vụ DNS", text: "Chọn SRV-01 và tự chạy Get-Service DNS. Chỉ khôi phục dịch vụ khi thấy Stopped. Nếu là Running, không bật/tắt lại; chuyển sang kiểm tra lại DNS từ máy trạm.", command: "Get-Service DNS", device: "server" },
  repairingDns: { title: "Bước 4/6 · Khôi phục dịch vụ DNS", text: "Đã xác nhận DNS trên SRV-01 là Stopped. Công tắc DNS Server đang được tô sáng và focus. Tự bật nó; hệ thống sẽ không tự thay đổi cấu hình thay bạn." },
  verifyingDns: { title: "Bước 5/6 · Xác minh lại DNS", text: "Chạy lại nslookup từ CLIENT-01. Nếu dịch vụ đã Running mà vẫn timeout, kiểm tra địa chỉ DNS, kết nối và firewall; nếu tên không phân giải đúng, kiểm tra thêm bản ghi. Không kết luận dịch vụ dừng chỉ từ timeout.", command: "nslookup portal.lab.test", device: "client" },
  checkingHttp: { title: "Bước 6/6 · Xác nhận dịch vụ sử dụng DNS", text: "Tự chạy curl để xác nhận portal.lab.test đã mở được qua HTTP trong mô phỏng.", command: "curl http://portal.lab.test", device: "client" },
  complete: { title: "Đã hoàn thành hướng dẫn DNS", text: "Bạn đã phân biệt kết nối IP với DNS, kiểm tra trạng thái dịch vụ, chỉ khôi phục khi cần và xác minh lại kết quả. Bạn có thể đóng hướng dẫn hoặc tạo tình huống khác." },
};
