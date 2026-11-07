# 01. Phạm vi và yêu cầu

## 1. Mục tiêu và câu hỏi nghiên cứu

Xây dựng một phòng mô phỏng trên Web cho phép cấu hình hệ thống và xử lý sự cố, có Agent hỗ trợ dựa trên bằng chứng thu thập được.

Các câu hỏi cần trả lời bằng thực nghiệm:

1. Các hành vi được chọn của mô hình có phù hợp với hệ thống tham chiếu trong phạm vi công bố không?
2. Agent có xác định nguyên nhân và hướng dẫn xử lý đúng, khả thi, an toàn từ các quan sát hay không?
3. So với hướng dẫn cố định cùng nội dung, Agent có cải thiện kết quả hoặc thời gian xử lý của người dùng hay không?

Không mặc định cả ba câu hỏi đều có kết quả tích cực trước khi đo.

## 2. Hình thức mô phỏng

Chọn mô phỏng bằng trạng thái và quy tắc chạy trong ứng dụng Web. Người dùng không cần cài Windows Server hoặc công cụ ảo hóa để sử dụng.

- Cài role/feature nghĩa là thay đổi trạng thái thành phần Windows Server trong máy chủ mô phỏng, không tải hay cài lên máy thật.
- Terminal là bộ thông dịch cho tập lệnh được hỗ trợ, không phải shell trên máy thật.
- Cấu hình dịch vụ thực sự ảnh hưởng đến kết quả kiểm tra trong mô hình.
- Những hành vi chưa hỗ trợ phải được thông báo rõ, không tạo kết quả giả như đã thực thi thành công.
- Tài liệu hướng dẫn và Agent là thành phần hỗ trợ, không thay thế engine mô phỏng.

Lựa chọn này cần được giảng viên xác nhận. Việc dùng VM/container trong phòng lab đối chiếu không làm sản phẩm trở thành hệ thống điều khiển VM/container.

## 3. Mô hình mạng tham chiếu

Các địa chỉ sau là dữ liệu của phòng mô phỏng, không đại diện cho thiết bị đang dùng của người học.

| Thành phần | Cấu hình dự kiến |
| --- | --- |
| Máy chủ `srv-01` | Windows Server 2022 Standard, Desktop Experience tham chiếu dự kiến; IPv4 `192.168.10.10/24` |
| DNS | Role DNS Server; vùng primary độc lập `lab.test`, bản ghi A `portal.lab.test` trỏ tới máy chủ |
| DHCPv4 | Role DHCP Server; scope ban đầu `192.168.10.100` đến `192.168.10.120` |
| Web Server | Role Web Server (IIS); HTTP cổng 80, một website nội bộ |
| Tài nguyên hệ thống | Ổ dữ liệu `D:`, thư mục chia sẻ `SupportShare`, tài khoản local mẫu và dịch vụ mẫu `LabWorker` |
| Máy trạm `client-01` | Máy khách Windows mô phỏng, DHCP hoặc IP tĩnh; có CMD và trình duyệt nội bộ |
| Switch | Kết nối logic trong LAN, không có giao diện quản trị switch nâng cao |
| Gateway | `192.168.10.1/24`; có đường tới một mạng kiểm tra khác |
| Đích kiểm tra ngoài LAN | `192.168.20.10`, đi qua gateway; không dùng Internet thật |

Miền `.test` dành cho kiểm thử. Tên role/feature, tên service, phiên bản phần mềm và dạng output cụ thể phải đối chiếu trong mốc khảo sát; chưa coi bảng trên là bộ hành vi đã được xác minh.

Máy chủ chạy độc lập trong workgroup, chưa có AD DS/domain controller. Vùng DNS không tích hợp AD; không đặt bước authorize DHCP trong AD thành yêu cầu của lab workgroup. Máy trạm dùng thông tin tài khoản local của server khi truy cập share. Các quy tắc firewall cần thiết được cấu hình sẵn có phạm vi; không tắt toàn bộ firewall để làm dịch vụ hoạt động. Cần đối chiếu điều kiện triển khai này trên bản Windows Server tham chiếu.

Không mở topology editor tổng quát trong phiên bản đầu. Các liên kết định sẵn có thể được ngắt/nối và các interface có thể bật/tắt.

## 4. Bốn nhóm nghiệp vụ chính

### Nhóm 1: DNS và DHCP phía máy chủ

- Thêm/gỡ role mô phỏng qua Server Manager; bật, dừng và kiểm tra dịch vụ.
- Tạo, lưu, kiểm tra và áp dụng cấu hình qua DNS Manager/DHCP console mô phỏng hoặc tập lệnh được hỗ trợ.
- DHCP: tạo và kích hoạt scope, dải cấp phát, subnet, option gateway/DNS, danh sách lease và gia hạn ở client.
- DNS: tạo vùng primary độc lập, bản ghi A, truy vấn tên và phản hồi theo trạng thái dịch vụ.
- Phân biệt lỗi cấp phát IP, cấu hình DNS client và dữ liệu bản ghi DNS server.

Không coi nút bật/tắt DHCP trên router của bản hiện tại là đủ để mô phỏng việc triển khai DHCP server.

### Nhóm 2: Web Server

- Thêm role IIS mô phỏng, tạo một website, kiểm tra cấu hình và quản lý trạng thái website/application pool liên quan.
- Cấu hình binding IP/cổng/hostname và physical path trong phạm vi được chọn.
- Truy cập bằng trình duyệt nội bộ hoặc công cụ HTTP mô phỏng.
- Quan sát lỗi kết nối, mã HTTP và log dịch vụ phù hợp với nguyên nhân.

Không có reverse proxy, HTTPS, chứng chỉ, PHP, cơ sở dữ liệu hoặc cân bằng tải trong phạm vi đầu.

### Nhóm 3: Chẩn đoán kết nối

- Kiểm tra link, trạng thái interface, IP, subnet mask/prefix, gateway và DNS.
- Kiểm tra từ máy trạm đến máy chủ cùng LAN và đến đích khác mạng.
- Phân biệt kết nối IP, phân giải tên và truy cập HTTP.
- Dùng các lệnh kiểm tra được hỗ trợ; đối chiếu kết quả trước và sau khi thay đổi.

Không có VLAN, VPN, routing động, Wi-Fi vô tuyến, firewall phức tạp hoặc đo băng thông thật trong phạm vi đầu.

### Nhóm 4: Xử lý một số lỗi hệ thống Windows Server

- **Ổ dữ liệu đầy:** xem dung lượng, xác định tệp tạm/log mẫu có thể dọn an toàn, xác nhận thao tác và kiểm tra khả năng ghi sau xử lý. Không xóa tệp hệ thống hoặc dữ liệu nghiệp vụ để lấy chỗ.
- **Không truy cập được thư mục chia sẻ:** kiểm tra xác thực tài khoản local mẫu, quyền Share, quyền NTFS và quyền hiệu lực trên một tập quyền được công bố; xác nhận từ máy trạm.
- **Dịch vụ không tự chạy sau khởi động:** dùng Services và Event Viewer mô phỏng để kiểm tra `Startup Type`, trạng thái và sự kiện của dịch vụ mẫu `LabWorker`; sửa cấu hình rồi reboot để xác nhận.

Nhóm này dùng ổ `D:`, share và dịch vụ mẫu riêng để không lặp lại việc bật DNS/DHCP/IIS. Giao diện chỉ tái hiện các thao tác cần thiết, không sao chép toàn bộ Windows Server.

Chưa mô phỏng sửa boot, registry tổng quát, AD DS, Group Policy, DFS, RAID, lỗi kernel hoặc đầy đủ quy tắc ACL kế thừa/deny. Share dùng xác thực, không cho phép khách ẩn danh; không dùng `Everyone: Full Control` làm cách sửa mặc định.

## 5. Yêu cầu trải nghiệm

- Mở vào môi trường mô phỏng sử dụng được, không chỉ trang giới thiệu.
- Chọn thiết bị đang thao tác; cấu hình và kết quả của các thiết bị liên quan phải nhất quán.
- Có chế độ tự do và các trạng thái ban đầu để tái hiện sự cố; không khóa người dùng trong một trình tự cố định.
- Hướng dẫn và Agent bật/tắt tùy chọn; không có bảng điểm hay câu hỏi trắc nghiệm bắt buộc.
- Cho phép nhiều phương án xử lý hợp lệ trong giới hạn mục tiêu của tình huống.
- Có thông báo xác nhận khi reset phiên hoặc thay đổi có tính phá hủy dữ liệu mô phỏng.
- Giữ trạng thái khi chuyển thiết bị/view; hỗ trợ xuất/nhập snapshot có phiên bản để tái lập.
- Việc tự lưu qua reload là một quyết định riêng sau khi có cơ chế phiên, không tự thêm tài khoản hay đồng bộ đám mây.

## 6. Phần không làm trong đợt này

- Không mô phỏng mọi model ASUS/Dell/HP hoặc mọi BIOS.
- Không mở rộng Office, phần cứng máy tính, máy in, camera và thi công thực địa.
- Không triển khai một hệ điều hành hoặc shell đầy đủ.
- Không triển khai Linux hoặc nhiều phiên bản Windows Server trong đợt này.
- Không tự điều khiển, dò quét hay thay đổi máy/mạng thật của người dùng.
- Không tự thêm tài khoản, lớp học, bảng điểm hoặc hệ thống quản lý khóa học.
- Không tuyên bố mô phỏng tương đương hoàn toàn với vận hành thiết bị thật.

## 7. Những điểm cần xác nhận với giảng viên

- [ ] Bốn nhóm trên có phạm vi và độ sâu phù hợp cho KLTN 10 tín chỉ chưa?
- [ ] Mô phỏng bằng trạng thái, không tích hợp VM/container lúc chạy, có phù hợp không?
- [ ] Một Windows Server độc lập, một máy trạm và topology cố định có đủ cho phạm vi đã chọn không?
- [ ] Ba lỗi hệ thống giới hạn trong nhóm 4 và việc chưa có AD DS/domain có phù hợp không?
- [ ] Phạm vi lệnh/cấu hình, số ca cuối cùng, tiêu chí nghiệm thu và kế hoạch người tham gia là gì?
- [ ] Vai trò của mô-đun cài Windows cũ và tên đề tài cuối cùng được thống nhất thế nào?

Các câu hỏi này không ngăn việc khảo sát và làm nguyên mẫu nhỏ, nhưng cần được giải quyết trước khi cam kết phạm vi và thực nghiệm chính thức.
