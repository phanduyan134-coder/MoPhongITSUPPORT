import { z } from "zod";

export type SystemGroup = "dns-dhcp" | "iis" | "network" | "system";
export type DeviceId = "server" | "client";
type IPv4Config = { ip: string; prefix: number; gateway: string; dns: string };

export type DnsTrace = {
  revision: number;
  device: DeviceId;
  sourceIp: string;
  resolverIp: string;
  queryName: string;
  queryType: "A";
  resolverDevice: "server" | null;
  transport: "network" | "local";
  reachability: "reachable" | "unreachable" | "unknown";
  outcome: "answer" | "nxdomain" | "timeout";
  answerIp?: string;
};

export type SimulationDiagnosticResult = { output: string; revision: number; observed: boolean; dnsTrace?: DnsTrace };

export type Simulation = {
  revision: number;
  simulatedTime: number;
  client: IPv4Config & { dhcp: boolean; link: boolean; enabled: boolean };
  server: IPv4Config;
  roles: { dns: boolean; dhcp: boolean; iis: boolean };
  dns: { running: boolean; record: string | null };
  dhcp: {
    running: boolean; active: boolean; start: string; end: string; gateway: string; dns: string;
    lease: null | { ip: string; expiresAt: number };
  };
  iis: { siteRunning: boolean; poolRunning: boolean; port: number };
  system: {
    capacityMB: number;
    files: { id: string; name: string; sizeMB: number; protected: boolean }[];
    shareRead: boolean;
    ntfsRead: boolean;
    startup: "Automatic" | "Manual" | "Disabled";
    workerRunning: boolean;
  };
  events: { id: number; revision: number; message: string }[];
};

function validIPv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

const addressSchema = z.string().max(15).refine(validIPv4, "Địa chỉ IPv4 không hợp lệ.");
const clientConfigSchema = z.object({
  ip: addressSchema, prefix: z.number().int().min(1).max(30), gateway: addressSchema,
  dns: addressSchema, dhcp: z.boolean(),
}).strict();

export const simulationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("client.configure"), config: clientConfigSchema }).strict(),
  z.object({ type: z.literal("client.link"), connected: z.boolean() }).strict(),
  z.object({ type: z.literal("client.enabled"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("client.renew") }).strict(),
  z.object({ type: z.literal("role.install"), role: z.enum(["dns", "dhcp", "iis"]) }).strict(),
  z.object({ type: z.literal("service.toggle"), service: z.enum(["dns", "dhcp"]), running: z.boolean() }).strict(),
  z.object({ type: z.literal("dns.record"), address: addressSchema }).strict(),
  z.object({ type: z.literal("dhcp.configure"), config: z.object({
    start: addressSchema, end: addressSchema, gateway: addressSchema, dns: addressSchema, active: z.boolean(),
  }).strict() }).strict(),
  z.object({ type: z.literal("iis.configure"), config: z.object({
    port: z.number().int().min(1).max(65535), siteRunning: z.boolean(), poolRunning: z.boolean(),
  }).strict() }).strict(),
  z.object({ type: z.literal("file.delete"), id: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal("file.write") }).strict(),
  z.object({ type: z.literal("share.configure"), config: z.object({ shareRead: z.boolean(), ntfsRead: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("worker.configure"), config: z.object({
    startup: z.enum(["Automatic", "Manual", "Disabled"]), running: z.boolean(),
  }).strict() }).strict(),
  z.object({ type: z.literal("server.reboot") }).strict(),
]);

export type SimulationAction = z.infer<typeof simulationActionSchema>;

export const simulationPresets: { id: string; label: string; group: SystemGroup | "all"; report: string }[] = [
  { id: "healthy", label: "Hệ thống đang hoạt động", group: "all", report: "Kiểm tra hoạt động các dịch vụ nội bộ và máy trạm." },
  { id: "unconfigured", label: "Máy chủ mới", group: "all", report: "Máy chủ chưa triển khai các role mạng và website. Cần cấu hình các dịch vụ nội bộ." },
  { id: "dns-stopped", label: "Không phân giải được tên nội bộ", group: "dns-dhcp", report: "Máy trạm không truy vấn được portal.lab.test, nhưng vẫn liên lạc được với IP máy chủ." },
  { id: "dns-record", label: "Tên website trả về đích khác", group: "dns-dhcp", report: "Máy trạm nhận được kết quả truy vấn tên, nhưng không mở được website nội bộ." },
  { id: "dhcp-stopped", label: "Máy trạm chưa nhận địa chỉ", group: "dns-dhcp", report: "Máy trạm mới khởi động đang dùng địa chỉ tự gán, chưa nhận được cấu hình từ máy chủ." },
  { id: "dhcp-options", label: "Nhận IP nhưng không truy vấn được tên", group: "dns-dhcp", report: "Máy trạm nhận được địa chỉ IP tự động nhưng không truy vấn được tên miền nội bộ." },
  { id: "iis-site", label: "Website không nhận kết nối", group: "iis", report: "Máy chủ vẫn phản hồi kiểm tra IP và DNS, nhưng trình duyệt không mở được website." },
  { id: "iis-pool", label: "Website trả về HTTP 503", group: "iis", report: "Trình duyệt nhận HTTP 503 khi mở portal.lab.test." },
  { id: "iis-port", label: "Không truy cập được cổng HTTP chuẩn", group: "iis", report: "Truy cập http://portal.lab.test không thành công; cần kiểm tra dịch vụ HTTP và binding." },
  { id: "network-gateway", label: "Truy cập LAN nhưng không đến mạng khác", group: "network", report: "Máy trạm liên lạc được máy chủ nội bộ nhưng không tới được thiết bị kiểm tra 192.168.20.10." },
  { id: "network-link", label: "Máy trạm mất kết nối", group: "network", report: "Máy trạm không liên lạc được với thiết bị khác trong mô hình mạng." },
  { id: "network-disabled", label: "Giao diện mạng không hoạt động", group: "network", report: "Máy trạm không gửi được yêu cầu mạng. Kiểm tra trạng thái kết nối và giao diện mạng." },
  { id: "network-subnet", label: "Máy trạm không liên lạc được máy chủ", group: "network", report: "Máy trạm có địa chỉ IP nhưng không ping được máy chủ 192.168.10.10." },
  { id: "disk-full", label: "Không ghi được dữ liệu", group: "system", report: "Tác vụ ghi tệp mẫu 10 MB trên ổ D: không thành công." },
  { id: "share-ntfs", label: "Tài khoản kỹ thuật không đọc được share", group: "system", report: "Tài khoản local tech đã xác thực nhưng không đọc được thư mục chia sẻ trên máy chủ." },
  { id: "share-permission", label: "Truy cập thư mục chia sẻ bị từ chối", group: "system", report: "Tài khoản local tech bị từ chối khi đọc thư mục chia sẻ; cần kiểm tra cả hai lớp quyền." },
  { id: "worker-disabled", label: "Dịch vụ mẫu không chạy", group: "system", report: "Dịch vụ mẫu LabWorker không hoạt động sau khi máy chủ khởi động." },
  { id: "worker-manual", label: "Dịch vụ mẫu không tự khởi động", group: "system", report: "LabWorker chỉ chạy sau khi được bật thủ công và không tự chạy lại sau reboot." },
];

export function createSimulation(presetId = "healthy"): Simulation {
  if (!simulationPresets.some((preset) => preset.id === presetId)) throw new Error("Không tìm thấy cấu hình khởi tạo.");
  const state: Simulation = {
    revision: 0, simulatedTime: 0,
    client: { ip: "192.168.10.100", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10", dhcp: true, link: true, enabled: true },
    server: { ip: "192.168.10.10", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10" },
    roles: { dns: true, dhcp: true, iis: true },
    dns: { running: true, record: "192.168.10.10" },
    dhcp: { running: true, active: true, start: "192.168.10.100", end: "192.168.10.120", gateway: "192.168.10.1", dns: "192.168.10.10", lease: { ip: "192.168.10.100", expiresAt: 28800 } },
    iis: { siteRunning: true, poolRunning: true, port: 80 },
    system: {
      capacityMB: 1024,
      files: [
        { id: "business-data", name: "Du-lieu-khach-hang.dat", sizeMB: 128, protected: true },
        { id: "service-data", name: "Du-lieu-dich-vu.dat", sizeMB: 64, protected: true },
        { id: "temp-cache", name: "Cache-tam-lab.tmp", sizeMB: 128, protected: false },
      ],
      shareRead: true, ntfsRead: true, startup: "Automatic", workerRunning: true,
    },
    events: [],
  };
  switch (presetId) {
    case "unconfigured":
      state.roles = { dns: false, dhcp: false, iis: false };
      state.dns = { running: false, record: null };
      state.dhcp.running = false; state.dhcp.active = false; state.dhcp.lease = null;
      state.client.ip = "169.254.10.100"; state.client.prefix = 16; state.client.gateway = "0.0.0.0"; state.client.dns = "0.0.0.0";
      state.iis.siteRunning = false; state.iis.poolRunning = false;
      break;
    case "dns-stopped": state.dns.running = false; break;
    case "dns-record": state.dns.record = "192.168.10.99"; break;
    case "dhcp-stopped":
      state.dhcp.running = false; state.dhcp.lease = null;
      state.client.ip = "169.254.10.100"; state.client.prefix = 16; state.client.gateway = "0.0.0.0"; state.client.dns = "0.0.0.0";
      break;
    case "dhcp-options": state.dhcp.dns = "192.168.10.254"; state.client.dns = state.dhcp.dns; break;
    case "iis-site": state.iis.siteRunning = false; break;
    case "iis-pool": state.iis.poolRunning = false; break;
    case "iis-port": state.iis.port = 8080; break;
    case "network-gateway": state.client.gateway = "192.168.10.254"; break;
    case "network-link": state.client.link = false; break;
    case "network-disabled": state.client.enabled = false; break;
    case "network-subnet": state.client.ip = "192.168.30.100"; state.client.dhcp = false; break;
    case "disk-full": state.system.files[2].sizeMB = 828; break;
    case "share-ntfs": state.system.ntfsRead = false; break;
    case "share-permission": state.system.shareRead = false; break;
    case "worker-disabled": state.system.startup = "Disabled"; state.system.workerRunning = false; break;
    case "worker-manual": state.system.startup = "Manual"; state.system.workerRunning = false; break;
  }
  return state;
}

const ipNumber = (ip: string): number => ip.split(".").reduce((value, part) => value * 256 + Number(part), 0) >>> 0;
const prefixMask = (prefix: number): number => (0xffffffff << (32 - prefix)) >>> 0;
const sameSubnet = (left: string, right: string, prefix: number): boolean =>
  ((ipNumber(left) & prefixMask(prefix)) >>> 0) === ((ipNumber(right) & prefixMask(prefix)) >>> 0);
const isHost = (ip: string, prefix: number): boolean => {
  if (!validIPv4(ip) || ip.startsWith("0.") || ip.startsWith("127.") || Number(ip.split(".")[0]) >= 224) return false;
  if (prefix === 32) return true;
  const number = ipNumber(ip), mask = prefixMask(prefix);
  return number !== ((number & mask) >>> 0) && number !== (((number & mask) | ~mask) >>> 0);
};

export function freeSpaceMB(state: Simulation): number {
  return Math.max(0, state.system.capacityMB - state.system.files.reduce((sum, file) => sum + file.sizeMB, 0));
}

export type PortalFlow = {
  network: boolean;
  dns: boolean;
  record: boolean;
  iis: boolean;
  message: string;
};

function validateScope(state: Simulation, start: string, end: string): void {
  if (!isHost(start, state.server.prefix) || !isHost(end, state.server.prefix) ||
    !sameSubnet(start, state.server.ip, state.server.prefix) || !sameSubnet(end, state.server.ip, state.server.prefix) ||
    ipNumber(start) > ipNumber(end)) throw new Error("Dải DHCP phải gồm các địa chỉ host trong mạng máy chủ, với địa chỉ đầu không lớn hơn địa chỉ cuối.");
}

export function applySimulationAction(input: Simulation, rawAction: SimulationAction): { state: Simulation; message: string } {
  const action = simulationActionSchema.parse(rawAction);
  const state = structuredClone(input);
  state.revision += 1; state.simulatedTime += 1;
  let message: string;
  switch (action.type) {
    case "client.configure":
      state.client = { ...state.client, ...action.config };
      message = "Đã áp dụng cấu hình IPv4 máy trạm. Chế độ DHCP cần renew để nhận lại option từ máy chủ.";
      break;
    case "client.link": state.client.link = action.connected; message = action.connected ? "Đã nối link máy trạm với switch." : "Đã ngắt link máy trạm với switch."; break;
    case "client.enabled": state.client.enabled = action.enabled; message = action.enabled ? "Đã bật giao diện mạng máy trạm." : "Đã tắt giao diện mạng máy trạm."; break;
    case "client.renew": {
      if (!state.client.dhcp) throw new Error("Máy trạm đang dùng IP tĩnh. Bật DHCP trước khi renew.");
      if (!state.client.enabled || !state.client.link) throw new Error("Không thể renew khi giao diện mạng bị tắt hoặc link đã ngắt.");
      const available = state.roles.dhcp && state.dhcp.running && state.dhcp.active;
      const liveLease = state.dhcp.lease && state.dhcp.lease.ip === state.client.ip && state.dhcp.lease.expiresAt > state.simulatedTime;
      if (!available) {
        if (liveLease) {
          message = "Không nhận được phản hồi DHCP; giữ lease còn hạn và cấu hình hiện tại.";
        } else {
          state.client.ip = "169.254.10.100"; state.client.prefix = 16;
          state.client.gateway = "0.0.0.0"; state.client.dns = "0.0.0.0"; state.dhcp.lease = null;
          message = "DHCP không phản hồi hoặc scope chưa hoạt động; máy trạm tự gán APIPA 169.254.10.100.";
        }
        break;
      }
      validateScope(state, state.dhcp.start, state.dhcp.end);
      const existing = state.dhcp.lease?.ip;
      let address = existing && ipNumber(existing) >= ipNumber(state.dhcp.start) && ipNumber(existing) <= ipNumber(state.dhcp.end) ? existing : state.dhcp.start;
      const reserved = new Set([state.server.ip, "192.168.10.1"]);
      while (reserved.has(address) && ipNumber(address) < ipNumber(state.dhcp.end)) {
        const next = ipNumber(address) + 1;
        address = [next >>> 24, (next >>> 16) & 255, (next >>> 8) & 255, next & 255].join(".");
      }
      if (reserved.has(address)) throw new Error("Dải DHCP không còn địa chỉ khả dụng ngoài các địa chỉ dành riêng.");
      state.dhcp.lease = { ip: address, expiresAt: state.simulatedTime + 28800 };
      state.client = { ...state.client, ip: address, prefix: state.server.prefix, gateway: state.dhcp.gateway, dns: state.dhcp.dns };
      message = `DHCP ACK: ${address}/${state.server.prefix}; gateway ${state.client.gateway}; DNS ${state.client.dns}.`;
      break;
    }
    case "role.install":
      state.roles[action.role] = true;
      if (action.role === "dns") state.dns.running = true;
      if (action.role === "dhcp") state.dhcp.running = true;
      message = `Đã cài role ${action.role === "iis" ? "Web Server (IIS)" : action.role.toUpperCase()} trong mô phỏng.`;
      break;
    case "service.toggle":
      if (!state.roles[action.service]) throw new Error("Role tương ứng chưa được cài đặt.");
      state[action.service].running = action.running;
      message = `Dịch vụ ${action.service.toUpperCase()}: ${action.running ? "Running" : "Stopped"}.`;
      break;
    case "dns.record":
      if (!state.roles.dns) throw new Error("Cài role DNS Server trước khi tạo bản ghi.");
      if (!isHost(action.address, 32)) throw new Error("Bản ghi A cần địa chỉ IPv4 unicast hợp lệ.");
      state.dns.record = action.address; message = `Đã lưu bản ghi A portal.lab.test → ${action.address}.`;
      break;
    case "dhcp.configure":
      if (!state.roles.dhcp) throw new Error("Cài role DHCP Server trước khi cấu hình scope.");
      validateScope(state, action.config.start, action.config.end);
      state.dhcp = { ...state.dhcp, ...action.config };
      message = "Đã áp dụng scope và option DHCP. Lease hiện có không tự thay đổi; renew ở máy trạm để nhận option mới.";
      break;
    case "iis.configure":
      if (!state.roles.iis) throw new Error("Cài role Web Server (IIS) trước khi cấu hình website.");
      state.iis = { ...action.config }; message = "Đã áp dụng binding, trạng thái website và application pool IIS.";
      break;
    case "file.delete": {
      const file = state.system.files.find((entry) => entry.id === action.id);
      if (!file) throw new Error("Không tìm thấy tệp mẫu.");
      if (file.protected) throw new Error("Tệp được bảo vệ; mô phỏng không cho phép xóa dữ liệu cần giữ.");
      state.system.files = state.system.files.filter((entry) => entry.id !== action.id);
      message = `Đã xóa tệp tạm ${file.name}; còn trống ${freeSpaceMB(state)} MB.`;
      break;
    }
    case "file.write": {
      const existing = state.system.files.find((entry) => entry.id === "write-probe");
      if (freeSpaceMB(state) + (existing?.sizeMB ?? 0) < 10) {
        message = "Ghi tệp thất bại: ổ D: không đủ 10 MB trống. Dữ liệu hiện có không bị thay đổi.";
      } else {
        if (existing) existing.sizeMB = 10;
        else state.system.files.push({ id: "write-probe", name: "Kiem-tra-ghi.dat", sizeMB: 10, protected: true });
        message = "Đã ghi thành công tệp kiểm tra 10 MB trên ổ D:. Những lần thử sau ghi đè cùng tệp.";
      }
      break;
    }
    case "share.configure":
      state.system = { ...state.system, ...action.config };
      message = "Đã áp dụng quyền đọc Share và NTFS cho tài khoản local tech. Tài khoản outsider không được cấp quyền.";
      break;
    case "worker.configure":
      if (action.config.startup === "Disabled" && action.config.running) throw new Error("Không thể start LabWorker khi Startup Type là Disabled.");
      state.system.startup = action.config.startup; state.system.workerRunning = action.config.running;
      message = `LabWorker: ${action.config.running ? "Running" : "Stopped"}; Startup Type: ${action.config.startup}.`;
      break;
    case "server.reboot":
      state.simulatedTime += 60;
      state.system.workerRunning = state.system.startup === "Automatic";
      state.dns.running = state.roles.dns; state.dhcp.running = state.roles.dhcp;
      message = `Máy chủ đã khởi động lại. LabWorker: ${state.system.workerRunning ? "Running" : "Stopped"} (${state.system.startup}).`;
      break;
  }
  state.events.push({ id: state.revision, revision: state.revision, message });
  state.events = state.events.slice(-100);
  return { state, message };
}

function canReach(state: Simulation, device: DeviceId, target: string): boolean {
  const source = state[device];
  if (target === "127.0.0.1") return true;
  if (device === "client" && !state.client.enabled) return false;
  if (target === source.ip && isHost(source.ip, source.prefix)) return true;
  if (device === "client" && !state.client.link) return false;
  if (!isHost(source.ip, source.prefix) || source.ip.startsWith("169.254.")) return false;
  if (device === "client" && (source.ip === state.server.ip || source.ip === "192.168.10.1")) return false;
  const reciprocalLAN = (targetIP: string, prefix: number): boolean =>
    sameSubnet(source.ip, targetIP, source.prefix) && sameSubnet(targetIP, source.ip, prefix);
  if (target === state.server.ip) return reciprocalLAN(state.server.ip, state.server.prefix);
  if (target === "192.168.10.1") return reciprocalLAN(target, 24);
  if (target === state.client.ip) return state.client.enabled && state.client.link && reciprocalLAN(target, state.client.prefix);
  if (target === "192.168.20.10") {
    return !sameSubnet(source.ip, target, source.prefix) && source.gateway === "192.168.10.1" && reciprocalLAN(source.gateway, 24);
  }
  return false;
}

type DnsQueryResult = { address?: string; output: string; dnsTrace: DnsTrace };

function queryDNS(state: Simulation, device: DeviceId, name: string, server = state[device].dns): DnsQueryResult {
  const loopback = server === "127.0.0.1";
  const localServer = device === "server" && loopback;
  const knownResolver = localServer || server === state.server.ip;
  const reachable = knownResolver && (localServer || canReach(state, device, server));
  const dnsTrace: DnsTrace = {
    revision: state.revision,
    device,
    sourceIp: loopback ? "127.0.0.1" : state[device].ip,
    resolverIp: server,
    queryName: name.toLowerCase().replace(/\.$/, ""),
    queryType: "A",
    resolverDevice: knownResolver ? "server" : null,
    transport: loopback || (device === "server" && server === state.server.ip) ? "local" : "network",
    reachability: knownResolver ? (reachable ? "reachable" : "unreachable") : "unknown",
    outcome: "timeout",
  };
  // Host reachability is separate from receiving a DNS reply; a timeout is not a service diagnosis.
  if (!reachable || !state.roles.dns || !state.dns.running) {
    return { output: `DNS request timed out.\nServer: ${server}\nKhông nhận được phản hồi từ máy chủ DNS.`, dnsTrace };
  }
  if (dnsTrace.queryName !== "portal.lab.test" || !state.dns.record) {
    return { output: `Server: ${server}\n*** Non-existent domain (NXDOMAIN): ${name}`, dnsTrace: { ...dnsTrace, outcome: "nxdomain" } };
  }
  return {
    address: state.dns.record,
    output: `Server: ${server}\nName: portal.lab.test\nAddress: ${state.dns.record}`,
    dnsTrace: { ...dnsTrace, outcome: "answer", answerIp: state.dns.record },
  };
}

type NonObservation = { output: string; observed: false };
const nonObservation = (output: string): NonObservation => ({ output, observed: false });

function httpDiagnostic(state: Simulation, device: DeviceId, address: string): string | NonObservation {
  let url: URL;
  try { url = new URL(address); } catch { return nonObservation("URL không hợp lệ. Dùng http://portal.lab.test hoặc http://192.168.10.10[:port]."); }
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return nonObservation("Mô phỏng chỉ hỗ trợ HTTP ở đường dẫn /, không có thông tin đăng nhập hoặc tham số.");
  let target = url.hostname;
  if (!validIPv4(target)) {
    const query = queryDNS(state, device, target);
    if (!query.address) return `curl: Could not resolve host: ${target}\n${query.output}`;
    target = query.address;
  }
  if (!canReach(state, device, target) || target !== state.server.ip) return `curl: Connection timed out to ${target}.`;
  const port = url.port ? Number(url.port) : 80;
  if (!state.roles.iis || !state.iis.siteRunning || port !== state.iis.port) return `curl: Failed to connect to ${target} port ${port}: connection refused (không có website lắng nghe tại binding này).`;
  if (!state.iis.poolRunning) return "HTTP/1.1 503 Service Unavailable\nApplication pool của website đang dừng.";
  return "HTTP/1.1 200 OK\nServer: Microsoft-IIS (mô phỏng)\n\nSupportLab — Cổng thông tin nội bộ portal.lab.test";
}

// This visual flow uses the same conditions as curl http://portal.lab.test.
export function getPortalFlow(state: Simulation): PortalFlow {
  const network = canReach(state, "client", state.server.ip);
  const dns = network && state.roles.dns && state.dns.running && state.client.dns === state.server.ip;
  const record = dns && state.dns.record === state.server.ip;
  const iis = record && state.roles.iis && state.iis.siteRunning && state.iis.poolRunning && state.iis.port === 80;

  if (!network) return { network, dns, record, iis, message: "CLIENT-01 chưa liên lạc được với SRV-01 qua IP." };
  if (!dns) return { network, dns, record, iis, message: "Không nhận được phản hồi DNS từ máy chủ đã cấu hình." };
  if (!record) return { network, dns, record, iis, message: "portal.lab.test chưa trỏ đúng tới SRV-01." };
  if (!iis) return { network, dns, record, iis, message: "Tên đã phân giải đúng, nhưng IIS chưa sẵn sàng trên HTTP cổng 80." };
  return { network, dns, record, iis, message: "Luồng truy cập portal.lab.test đang hoạt động trong mô phỏng." };
}

function evaluateSimulationDiagnostic(state: Simulation, device: DeviceId, rawCommand: string): string | DnsQueryResult | NonObservation {
  if (device !== "server" && device !== "client") return nonObservation("Thiết bị không hợp lệ.");
  const command = rawCommand.trim();
  if (!command || command.length > 240 || /[;&|`\r\n<>]/.test(command)) return nonObservation("Lệnh không hợp lệ. Chỉ hỗ trợ các lệnh chẩn đoán trong mô phỏng; không thực thi trên máy thật.");
  const parts = command.split(/\s+/);
  const verb = parts[0].toLowerCase();
  if (verb === "help" && parts.length === 1) return nonObservation([
    "Công cụ chỉ đọc trong mạng mô phỏng:", "ipconfig [/all]", "ping <IPv4|portal.lab.test>",
    "nslookup <tên> [IPv4-DNS]", "curl http://portal.lab.test hoặc http://192.168.10.10[:port]",
    "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0",
    "Get-Service [DNS|DHCPServer|W3SVC|LabWorker]", "Get-Volume", "Get-WinEvent", "Get-SmbShareAccess", "icacls D:\\SupportShare", "Test-Share [tech|outsider]",
    "Thay đổi cấu hình bằng các bảng điều khiển; không có kết nối Internet hoặc hệ điều hành thật.",
  ].join("\n"));
  if (verb === "ipconfig" && (parts.length === 1 || (parts.length === 2 && parts[1].toLowerCase() === "/all"))) {
    const network = state[device];
    return [
      `Windows IP Configuration — ${device === "server" ? "SRV-01" : "CLIENT-01"}`,
      `IPv4 Address: ${network.ip}`, `Subnet Prefix: /${network.prefix}`, `Default Gateway: ${network.gateway}`, `DNS Servers: ${network.dns}`,
      device === "client" ? `DHCP Enabled: ${state.client.dhcp ? "Yes" : "No"}\nInterface: ${state.client.enabled ? "Enabled" : "Disabled"}\nMedia State: ${state.client.link ? "Connected" : "Media disconnected"}` : "DHCP Enabled: No",
      device === "client" && state.dhcp.lease ? `DHCP Lease Expires (simulation seconds): ${state.dhcp.lease.expiresAt}` : "",
    ].filter(Boolean).join("\n");
  }
  if (verb === "ping" && parts.length === 2) {
    let target = parts[1];
    if (!validIPv4(target)) {
      if (!/^[a-z0-9.-]{1,253}$/i.test(target)) return nonObservation("Đích ping không hợp lệ.");
      const query = queryDNS(state, device, target);
      if (!query.address) return `Ping request could not find host ${target}.\n${query.output}`;
      target = query.address;
    }
    return canReach(state, device, target)
      ? `Pinging ${parts[1]} [${target}] with 32 bytes of data:\nReply from ${target}: bytes=32 time<1ms TTL=128\nPackets: Sent = 4, Received = 4, Lost = 0 (0% loss)`
      : `Pinging ${target}:\nRequest timed out.\nPackets: Sent = 4, Received = 0, Lost = 4 (100% loss)`;
  }
  if (verb === "nslookup" && (parts.length === 2 || parts.length === 3)) {
    if (!/^[a-z0-9.-]{1,253}$/i.test(parts[1]) || (parts[2] && !validIPv4(parts[2]))) return nonObservation("Tham số nslookup không hợp lệ.");
    return queryDNS(state, device, parts[1], parts[2]);
  }
  if (verb === "curl" && parts.length === 2) return httpDiagnostic(state, device, parts[1]);
  if (verb === "get-service" && parts.length <= 2) {
    if (device !== "server") return nonObservation("Các dịch vụ máy chủ không nằm trên CLIENT-01. Chọn thiết bị SRV-01 để kiểm tra.");
    const services = [
      { name: "DNS", installed: state.roles.dns, running: state.dns.running, startup: "Automatic" },
      { name: "DHCPServer", installed: state.roles.dhcp, running: state.dhcp.running, startup: "Automatic" },
      { name: "W3SVC", installed: state.roles.iis, running: state.roles.iis, startup: "Automatic" },
      { name: "LabWorker", installed: true, running: state.system.workerRunning, startup: state.system.startup },
    ];
    const requested = parts[1]?.toLowerCase().split(",");
    if (requested?.some((name) => !services.some((service) => service.name.toLowerCase() === name))) return nonObservation("Không tìm thấy dịch vụ yêu cầu trong mô phỏng.");
    return "Name          Status       Startup Type\n" + services.filter((service) => !requested || requested.includes(service.name.toLowerCase())).map((service) => `${service.name.padEnd(13)} ${service.installed ? (service.running ? "Running" : "Stopped") : "Not installed"}  ${service.installed ? service.startup : "—"}`).join("\n");
  }
  if (verb === "get-dhcpserverv4optionvalue") {
    if (device !== "server") return nonObservation("Tùy chọn DHCP được quản lý trên SRV-01. Chọn máy chủ để xem cấu hình scope.");
    if (parts.length !== 3 || parts[1].toLowerCase() !== "-scopeid" || !validIPv4(parts[2])) return nonObservation("Cú pháp hỗ trợ: Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0");
    if (!state.roles.dhcp) return "Chưa cài role DHCP Server trên SRV-01.";
    if (!state.dhcp.running) return "Không truy vấn được tùy chọn scope vì dịch vụ DHCPServer đang dừng trên SRV-01.";
    const scopeNumber = (ipNumber(state.dhcp.start) & prefixMask(state.server.prefix)) >>> 0;
    const scopeId = [24, 16, 8, 0].map((shift) => (scopeNumber >>> shift) & 255).join(".");
    if (parts[2] !== scopeId) return `Không có scope ${parts[2]} trong mô phỏng. Scope hiện tại: ${scopeId}.`;
    return `ScopeId: ${scopeId}\nOptionId Name          Value\n3        Router        ${state.dhcp.gateway}\n6        DNS Servers   ${state.dhcp.dns}`;
  }
  if (verb === "get-volume" && parts.length === 1) {
    if (device !== "server") return nonObservation("Ổ dữ liệu D: nằm trên SRV-01. Chọn máy chủ để xem dung lượng.");
    return `DriveLetter: D\nFileSystem: NTFS\nSize: ${state.system.capacityMB} MB\nSizeRemaining: ${freeSpaceMB(state)} MB`;
  }
  if (["get-winevent", "get-eventlog"].includes(verb) && parts.length === 1) {
    if (device !== "server") return nonObservation("Nhật ký máy chủ được xem trên SRV-01.");
    return state.events.length ? state.events.slice(-15).map((event) => `[${event.id}] ${event.message}`).join("\n") : "Chưa có sự kiện thao tác trong phiên mô phỏng. Dùng Get-Service và các công cụ kiểm tra để quan sát trạng thái hiện tại.";
  }
  if (verb === "get-smbshareaccess" && parts.length === 1) {
    if (device !== "server") return nonObservation("Quyền Share được quản lý trên SRV-01.");
    return `Share: SupportShare (D:\\SupportShare)\nAccount: SRV-01\\tech\nRead: ${state.system.shareRead ? "Allow" : "Not granted"}\nSRV-01\\outsider: Not granted\nMô phỏng quyền allow tường minh; không có Guest hoặc Everyone.`;
  }
  if (verb === "icacls" && parts.length === 2 && /^d:\\(?:share|support|supportshare)\\?$/i.test(parts[1])) {
    if (device !== "server") return nonObservation("Quyền NTFS của D:\\SupportShare được xem trên SRV-01.");
    return `D:\\SupportShare\nSRV-01\\tech: ${state.system.ntfsRead ? "(R) Allow" : "Read not granted"}\nSRV-01\\outsider: Not granted\nGiới hạn mô phỏng: quyền allow đọc cho tài khoản local, chưa mô phỏng kế thừa/deny.`;
  }
  if (verb === "test-share" && (parts.length === 1 || parts.length === 2)) {
    const account = parts[1]?.toLowerCase() ?? "tech";
    if (!["tech", "outsider"].includes(account)) return nonObservation("Chỉ hỗ trợ tài khoản local tech hoặc outsider trong mô phỏng.");
    if (!canReach(state, device, state.server.ip)) return "Không kết nối được SRV-01 qua mạng; chưa thể kiểm tra quyền thư mục chia sẻ.";
    if (account !== "tech" || !state.system.shareRead || !state.system.ntfsRead) return `Access denied: ${account} không có quyền đọc hiệu lực trên \\\\SRV-01\\SupportShare. Quyền Share và NTFS phải cùng cho phép.`;
    return "Read successful: tech đọc được \\\\SRV-01\\SupportShare\\Huong-dan.txt. Chỉ quyền đọc; không cấp Full Control.";
  }
  return nonObservation("Lệnh chưa được hỗ trợ trong mô phỏng. Gõ help để xem danh sách; không có lệnh nào được thực thi trên máy thật.");
}

export function runSimulationDiagnosticResult(state: Simulation, device: DeviceId, rawCommand: string): SimulationDiagnosticResult {
  const result = evaluateSimulationDiagnostic(state, device, rawCommand);
  return typeof result === "string"
    ? { output: result, revision: state.revision, observed: true }
    : "observed" in result
      ? { output: result.output, revision: state.revision, observed: false }
      : { output: result.output, revision: state.revision, observed: true, dnsTrace: result.dnsTrace };
}

export function runSimulationDiagnostic(state: Simulation, device: DeviceId, rawCommand: string): string {
  return runSimulationDiagnosticResult(state, device, rawCommand).output;
}
