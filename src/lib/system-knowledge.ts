export type SystemKnowledge = { id: string; title: string; url: string; keywords: string; content: string };

export const systemKnowledge: SystemKnowledge[] = [
  {
    id: "dhcp", title: "Microsoft Learn: Triển khai DHCP Server",
    url: "https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-deploy-wps",
    keywords: "dhcp ipconfig renew lease apipa 169.254 scope vùng cấp địa chỉ tự động",
    content: "DHCP cần role đã cài, dịch vụ chạy và scope hoạt động với vùng địa chỉ hợp lệ. Kiểm tra kết nối máy trạm, cấu hình scope, tùy chọn gateway/DNS rồi gia hạn lease. Nếu máy trạm dùng DHCP có gateway sai, đọc Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0 trên SRV-01: Router đúng thì giữ DHCP và gia hạn; Router sai thì sửa tùy chọn scope trước rồi gia hạn. Không ép IP tĩnh trong pool làm cách sửa mặc định. Địa chỉ APIPA 169.254.x.x là dấu hiệu máy trạm không lấy được lease IPv4, chưa đủ để kết luận nguyên nhân. Trong mô phỏng này không triển khai Active Directory hay bước authorize DHCP trong miền.",
  },
  {
    id: "dns", title: "Microsoft Learn: Khắc phục sự cố DNS",
    url: "https://learn.microsoft.com/en-us/windows-server/networking/dns/troubleshoot/troubleshoot-dns-server",
    keywords: "dns nslookup tên miền bản ghi phân giải server dns record",
    content: "Phân biệt kết nối IP với phân giải tên: kiểm tra đường đến DNS Server, địa chỉ DNS trên máy trạm, dịch vụ DNS và bản ghi A. Ping IP thành công không chứng minh DNS hay IIS đang chạy. So sánh curl http://portal.lab.test với curl http://192.168.10.10: tên lỗi nhưng IP trả HTTP 200 gợi ý khoanh vùng phân giải; DNS trả đúng IP nhưng HTTP qua cả tên lẫn IP lỗi thì kiểm tra IIS/site/pool/binding. DNS timeout không chứng minh dịch vụ dừng: chạy Get-Service DNS trên SRV-01 để xác nhận. Chỉ đề xuất bật khi Stopped; nếu Running, không bật/tắt theo suy đoán mà kiểm tra lại DNS máy trạm, bản ghi, kết nối và trên máy thật cả firewall. Có thể dùng nslookup portal.lab.test 192.168.10.10 để so với resolver mặc định; truy vấn chỉ định thành công chưa xác nhận cấu hình DNS mặc định đúng. Sau sửa phải thử lại trên cấu hình mới. Windows nslookup có thể exit 0 dù timeout; Server: UnKnown hoặc timeout tra tên resolver ban đầu không phủ nhận câu trả lời A đúng phía sau. Mô phỏng giản lược thông báo và không tái tạo thời gian/mã thoát Windows, DNS cache/forwarder hoặc firewall; không tự thêm reverse zone hay bỏ kiểm tra để làm log giống nhau.",
  },
  {
    id: "iis", title: "Microsoft Learn: Quản lý IIS",
    url: "https://learn.microsoft.com/en-us/iis/manage/",
    keywords: "iis web http curl site application pool binding port 80 cổng website",
    content: "Để truy cập web cần đường truyền IP, phân giải tên (nếu dùng tên), role IIS, site và application pool đang chạy, binding đúng cổng. Thử truy cập theo IP và theo tên để khoanh vùng DNS; kiểm tra cổng và trạng thái site/pool trước khi thay đổi cấu hình. Phạm vi mô phỏng chưa gồm HTTPS, chứng chỉ, firewall và toàn bộ HTTP substatus.",
  },
  {
    id: "network", title: "Microsoft Learn: Công cụ chẩn đoán TCP/IP",
    url: "https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping",
    keywords: "mạng network ping ip subnet gateway adapter card cable link kết nối",
    content: "Kiểm tra adapter và liên kết, IP/prefix, gateway, DNS theo thứ tự. Hai thiết bị cùng subnet không cần gateway để liên lạc trực tiếp; gateway dùng cho mạng khác. Ping chỉ kiểm tra phản hồi ICMP, không chứng minh dịch vụ HTTP hoặc DNS chạy. Trong mô hình này kết nối ngoài subnet được giản lược, không truy cập Internet thật.",
  },
  {
    id: "storage", title: "Microsoft Learn: Get-Volume",
    url: "https://learn.microsoft.com/en-us/powershell/module/storage/get-volume",
    keywords: "disk volume storage dung lượng đầy ổ đĩa file tệp ghi write space",
    content: "Get-Volume chỉ báo thuộc tính, dung lượng và dung lượng trống của ổ, không liệt kê tệp hoặc xác định tệp an toàn để xóa. Xem danh sách tệp riêng trong Windows Server hoặc inspect_system storage. Trong mô phỏng, chỉ Cache-tam-lab.tmp là cache được tình huống cho phép dọn; phải xác nhận đúng tệp và giữ nguyên dữ liệu khách hàng/dịch vụ. Không xóa dữ liệu nghiệp vụ, cấu hình hoặc bản sao lưu để giải phóng nhanh. Cờ protected và thao tác chặn xóa là rào chắn của simulator, không phải cơ chế Windows đảm bảo tệp khác an toàn. Đuôi .tmp hoặc không có cờ protected không đủ làm bằng chứng được phép xóa. Sau dọn, xác nhận dung lượng bằng Get-Volume và thử ghi lại. Mô hình chỉ xét ổ dữ liệu, không suy rộng sang xử lý đầy ổ hệ điều hành.",
  },
  {
    id: "permissions", title: "Microsoft Learn: Get-SmbShareAccess và quyền Share",
    url: "https://learn.microsoft.com/en-us/powershell/module/smbshare/get-smbshareaccess",
    keywords: "share smb ntfs icacls permission quyền thư mục truy cập access denied",
    content: "Truy cập SMB từ xa chịu cả quyền Share và quyền NTFS. Quyền đọc phải được cho phép ở cả hai lớp đối với tài khoản đang xét; không cấp Everyone Full Control chỉ để hết lỗi. Mô phỏng dùng một danh tính cố định và hai quyền đọc dạng boolean, không mô hình hóa đầy đủ nhóm, kế thừa, Deny hay xác thực miền. Kiểm tra kết nối mạng trước, so sánh Get-SmbShareAccess với icacls rồi thử truy cập lại.",
  },
  {
    id: "service", title: "Microsoft Learn: Set-Service và chế độ khởi động",
    url: "https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-service",
    keywords: "service dịch vụ startup automatic manual disabled reboot khởi động event log nhật ký",
    content: "Running hiện tại không đồng nghĩa dịch vụ sẽ tự chạy sau reboot. Kiểm tra cả Status và StartType, dùng nhật ký để xem thay đổi qua lần khởi động. Automatic là lựa chọn cho dịch vụ cần tự khởi động; chỉ bật đúng dịch vụ đã xác định. Mô phỏng worker không xét dependency, delayed start hoặc lỗi tài khoản dịch vụ.",
  },
];

function words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().split(/[^a-z0-9.]+/).filter((word) => word.length > 2);
}

export function searchSystemKnowledge(query: string): SystemKnowledge[] {
  const terms = [...new Set(words(query))].slice(0, 40);
  return systemKnowledge.map((entry) => {
    const keywords = new Set(words(entry.keywords));
    return { entry, score: terms.reduce((sum, term) => sum + (keywords.has(term) ? 3 : 0), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.entry);
}
