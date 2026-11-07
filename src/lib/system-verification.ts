import type { DnsVerification } from "./system-evidence";
import type { DeviceId, SimulationDiagnosticResult } from "./system-simulator";

type Diagnose = (device: DeviceId, command: string) => SimulationDiagnosticResult;

// Fresh observations on one snapshot. An IP control separates name resolution
// from HTTP availability; these checks do not assert byte-for-byte Windows fidelity.
export function verifyDnsPortal(revision: number, serverIp: string, diagnose: Diagnose): DnsVerification {
  const checks: DnsVerification["checks"] = [];
  function check(id: DnsVerification["checks"][number]["id"], label: string, device: DeviceId, command: string,
    passes: (result: SimulationDiagnosticResult) => boolean) {
    const result = diagnose(device, command);
    const observed = result.observed && result.revision === revision;
    checks.push({ id, label, device, command, output: result.output, observed, revision: result.revision,
      passed: observed && passes(result) });
    return result;
  }
  check("network", "Kết nối CLIENT-01 đến SRV-01", "client", `ping ${serverIp}`,
    (result) => result.output.includes(`Reply from ${serverIp}:`));
  const service = check("dns-service", "Dịch vụ DNS trên SRV-01", "server", "Get-Service DNS",
    (result) => /^DNS\s+Running\s/m.test(result.output));
  const answer = check("dns-answer", "portal.lab.test trỏ đến SRV-01", "client", "nslookup portal.lab.test",
    (result) => result.dnsTrace?.revision === revision && result.dnsTrace.device === "client"
      && result.dnsTrace.queryName === "portal.lab.test" && result.dnsTrace.outcome === "answer"
      && result.dnsTrace.answerIp === serverIp);
  check("http", "Website qua tên miền trả HTTP 200", "client", "curl http://portal.lab.test",
    (result) => /^HTTP\/1\.1 200 OK(?:\r?\n|$)/.test(result.output));
  check("http-ip", "Website qua IP trả HTTP 200", "client", `curl http://${serverIp}`,
    (result) => /^HTTP\/1\.1 200 OK(?:\r?\n|$)/.test(result.output));

  const [network, dnsService, dnsAnswer, httpName, httpIp] = checks.map((entry) => entry.passed);
  const trace = answer.dnsTrace;
  const complete = checks.every((entry) => entry.observed) && trace?.revision === revision
    && trace.device === "client" && trace.queryName === "portal.lab.test";
  const stopped = /^DNS\s+(?:Stopped|Not installed)\s/m.test(service.output);
  let assessment: DnsVerification["assessment"];
  if (!complete) assessment = {
    code: "inconclusive", summary: "Chưa đủ quan sát hợp lệ trên cùng cấu hình để khoanh vùng lỗi.",
    nextSteps: ["Đồng bộ phiên và chạy lại kiểm tra; không dùng kết quả cũ để xác nhận đã sửa."],
  };
  else if (!network) assessment = {
    code: stopped ? "multiple" : "network",
    summary: stopped ? "Máy trạm chưa liên lạc được IP máy chủ; DNS trên máy chủ cũng chưa chạy. Có nhiều dấu hiệu cần xử lý."
      : "Máy trạm chưa liên lạc được IP máy chủ. Chưa đủ cơ sở quy lỗi cho DNS.",
    nextSteps: ["Kiểm tra card mạng, link và IP/prefix của CLIENT-01; khôi phục kết nối IP trước.",
      ...(stopped ? ["Kiểm tra role DNS trên SRV-01 và bật dịch vụ đã xác định đang dừng."] : []),
      "Chạy lại đầy đủ các phép kiểm sau khi thay đổi cấu hình."],
  };
  else if (dnsService && dnsAnswer && httpName && httpIp) assessment = {
    code: "healthy", summary: "Kết nối IP, dịch vụ DNS, bản ghi A và website qua cả tên lẫn IP đều đạt trong mô phỏng.",
    nextSteps: ["Có thể xuất hồ sơ phiên để giữ kết quả; kết luận chỉ áp dụng cho luồng DNS/website đã kiểm tra."],
  };
  else if (stopped) assessment = {
    code: httpIp ? "dns-service" : "multiple",
    summary: httpIp ? "DNS trên SRV-01 chưa chạy; website qua IP vẫn hoạt động. Lỗi truy cập theo tên phù hợp với quan sát dịch vụ DNS."
      : "DNS trên SRV-01 chưa chạy và website qua IP cũng không đạt. Bật DNS chưa đủ để xác nhận toàn bộ luồng đã phục hồi.",
    nextSteps: ["Trong DNS / DHCP, kiểm tra role DNS và bật dịch vụ DNS trên SRV-01.",
      ...(!httpIp ? ["Kiểm tra thêm role IIS, site, application pool và binding HTTP 80."] : []),
      "Truy vấn lại portal.lab.test và kiểm tra website qua tên lẫn IP trên cấu hình mới."],
  };
  else if (!dnsService) assessment = {
    code: "inconclusive", summary: "Đầu ra kiểm tra chưa xác nhận được trạng thái dịch vụ DNS; không đề xuất bật/tắt theo suy đoán.",
    nextSteps: ["Chạy Get-Service DNS trên SRV-01 và kiểm tra role DNS, sau đó kiểm tra lại."],
  };
  else if (!dnsAnswer) assessment = {
    code: httpIp ? "dns-resolution" : "multiple",
    summary: httpIp ? "DNS trên máy chủ đang Running và website qua IP hoạt động, nhưng tên chưa trả về đúng máy chủ. Không cần bật lại DNS theo suy đoán."
      : "Tên chưa trả về đúng máy chủ và HTTP qua IP cũng không đạt. Cần kiểm tra riêng DNS và IIS.",
    nextSteps: [trace?.outcome === "answer"
      ? `Bản ghi A hiện trả ${trace.answerIp}; đối chiếu và sửa đích portal.lab.test thành ${serverIp}.`
      : trace?.outcome === "nxdomain"
      ? `DNS đã trả NXDOMAIN cho portal.lab.test; kiểm tra hoặc tạo bản ghi A portal trong zone lab.test trỏ đến ${serverIp}.`
      : `Kiểm tra DNS máy trạm đang dùng (${trace?.resolverIp}); thử nslookup portal.lab.test ${serverIp} để phân biệt cấu hình resolver với bản ghi. Nếu dùng DHCP, kiểm tra option DNS trước khi gia hạn.`,
      ...(!httpIp ? ["Kiểm tra role IIS, site, application pool và binding HTTP 80."] : []),
      "Sau sửa, chạy lại truy vấn DNS mặc định và HTTP theo tên."],
  };
  else assessment = {
    code: !httpName && !httpIp ? "http-service" : "inconclusive",
    summary: !httpName && !httpIp ? "DNS trả đúng IP nhưng website qua tên lẫn IP đều không đạt. Cần kiểm tra IIS thay vì sửa DNS."
      : "Kết quả HTTP qua tên và IP chưa nhất quán; cần thêm quan sát trước khi kết luận.",
    nextSteps: ["Kiểm tra role IIS, trạng thái site/application pool và binding HTTP 80.", "Chạy lại HTTP theo tên và IP sau thao tác."],
  };
  return { target: "dns-portal", protocol: "dns-portal-v2", revision,
    status: complete && checks.every((entry) => entry.passed) ? "passed" : "failed", assessment, checks };
}

export function describeDnsVerification(result: DnsVerification): string {
  const status = result.status === "passed"
    ? `Tại phiên bản ${result.revision}, cả ${result.checks.length} phép kiểm tra DNS và website portal.lab.test đều đạt trong mô phỏng. Kết quả này chỉ xác nhận luồng đã kiểm tra, chưa xác nhận toàn bộ hệ thống.`
    : `Tại phiên bản ${result.revision}, luồng DNS và website portal.lab.test chưa đạt: ${result.checks.filter((entry) => !entry.passed).map((entry) => entry.label).join("; ")}. Cần xử lý và kiểm tra lại trên cấu hình mới.`;
  return `${status}\n\n${result.assessment.summary}`;
}
