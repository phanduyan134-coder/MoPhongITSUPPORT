# 03. Danh mục tình huống mô phỏng

Đây là **22 ca ứng viên cho pilot thuộc bốn nhóm**: 8 ca DNS/DHCP, 5 ca IIS, 5 ca kết nối mạng và 4 ca hệ thống Windows Server. Không phải tuyên bố 22 ca đã được xây dựng hoặc đủ để kết luận cho toàn bộ khóa luận. Số ca chính thức, biến thể và bộ giữ lại để đánh giá sẽ chốt sau đối chiếu và trao đổi với giảng viên.

## 1. Nguyên tắc tổ chức

- Tình huống là trạng thái ban đầu có thể tái hiện trong môi trường tự do, không phải màn hình câu hỏi.
- Các thiết bị, cấu hình và công cụ vẫn hoạt động sau khi người dùng xử lý xong.
- Có ca bình thường để kiểm tra khả năng không chẩn đoán nhầm và không đề xuất thay đổi thừa.
- Có trạng thái role/feature chưa cài để mô phỏng việc cài đặt, không chỉ sửa một lỗi dựng sẵn.
- Các ID và cột nguyên nhân trong tài liệu này dành cho thiết kế/đánh giá, không gửi nguyên bảng cho Agent.
- Mỗi ca cần oracle độc lập, không chỉ gọi lại hàm chẩn đoán đang được kiểm thử.

## 2. Nhóm DNS/DHCP

| ID thiết kế | Trạng thái ban đầu/triệu chứng | Kiểm tra dự kiến | Điều kiện phục hồi/chấp nhận |
| --- | --- | --- | --- |
| DD-00 | DNS/DHCP hoạt động bình thường | Xem lease, cấu hình client và truy vấn `portal.lab.test` | Nhận diện không có lỗi; không sửa cấu hình không cần thiết |
| DD-01 | Role DNS/DHCP chưa cài, server chưa cấu hình dịch vụ | Kiểm tra Server Manager, service và cấu hình mạng server | Thêm role mô phỏng, tạo/kích hoạt scope và cấu hình vùng DNS; client nhận lease đúng và phân giải đúng tên |
| DD-02 | DHCP dừng; client không có lease còn hiệu lực | Kiểm tra service, renew và log | DHCP chạy; renew thành công; IP/subnet/gateway/DNS đúng |
| DD-03 | Dải DHCP hết địa chỉ khả dụng; client mới chưa có lease | Xem pool, lease và kết quả cấp phát | Khôi phục khả năng cấp địa chỉ hợp lệ, không tạo trùng IP; client nhận lease |
| DD-04 | DHCP cấp option DNS sai; client đã nhận option đó | Xem cấu hình client, DHCP option, kiểm tra IP và truy vấn tên | Sửa option; client renew nhận DNS đúng; truy vấn tên nội bộ thành công |
| DD-05 | DNS dừng nhưng kết nối IP đến server vẫn tốt | Ping server, truy vấn DNS và kiểm tra service | DNS phản hồi bản ghi nội bộ đúng; kết nối IP không bị thay đổi sai |
| DD-06 | DNS hoạt động nhưng thiếu bản ghi tên đang dùng | Truy vấn nhận `NXDOMAIN`, kiểm tra vùng và bản ghi | Bổ sung bản ghi hợp lệ, áp dụng cấu hình; truy vấn trả đúng đích |
| DD-07 | Bản ghi A tồn tại nhưng trỏ sai IP | So sánh kết quả DNS với cấu hình website và đích IP | Sửa dữ liệu bản ghi, áp dụng; truy cập đúng website qua tên |

Ca DD-03 có thể dùng lease fixture của các client logic khác để lấp pool; không cần thêm hàng loạt máy có giao diện. Fixture phải ghi rõ nguồn và thời hạn lease.

DHCP dừng chỉ tạo lỗi cấp phát khi client cần cấp/gia hạn địa chỉ; không xóa một lease còn hạn chỉ để làm tình huống dễ hơn. Việc tạm đặt IP tĩnh có thể giúp kiểm tra nhưng chưa được xem là khôi phục dịch vụ DHCP nếu đó là mục tiêu của ca.

Các ca dùng Windows Server độc lập trong workgroup và vùng DNS primary không tích hợp AD. Kiểm tra role, service, scope activation và option riêng biệt; không dựng lỗi authorization AD khi lab chưa có domain.

## 3. Nhóm Web Server (IIS)

| ID thiết kế | Trạng thái ban đầu/triệu chứng | Kiểm tra dự kiến | Điều kiện phục hồi/chấp nhận |
| --- | --- | --- | --- |
| WEB-00 | Website IIS nội bộ hoạt động bình thường, binding cho phép IP và tên | Truy cập bằng IP và tên; kiểm tra HTTP | Đúng nội dung và mã thành công; không sửa dịch vụ thừa |
| WEB-01 | Chưa cài/cấu hình role IIS | Kiểm tra Server Manager, IIS Manager và đích HTTP | Thêm role mô phỏng, tạo website/binding/physical path; đích chuẩn phục vụ đúng nội dung |
| WEB-02 | Website bị stop; các dịch vụ nền IIS, DNS và IP vẫn hoạt động | Tách kiểm tra DNS, IP và HTTP; xem trạng thái website/binding | Start website, truy cập được đích chuẩn; không sửa DNS để che nguyên nhân |
| WEB-03 | Binding của website dùng cổng khác cổng yêu cầu | Kiểm tra đích URL, binding và trạng thái website | Cấu hình binding đúng cổng mục tiêu; website hoạt động và không xung đột site khác |
| WEB-04 | Application pool của website bị stop; website vẫn được cấu hình | Kiểm tra HTTP, trạng thái pool và sự kiện liên quan | Pool hoạt động; website phục vụ đúng nội dung, không tạo quyền truy cập thừa |

Với WEB-02, phân biệt stop website với dừng toàn bộ IIS hoặc stop application pool. Fixture quy định rõ các site khác, binding và thành phần nền để đối chiếu hiện tượng thực tế.

Với WEB-03, đổi URL sang cổng sai chỉ là kiểm tra nguyên nhân, chưa khôi phục cổng mục tiêu. Với WEB-04, đối chiếu mã HTTP và điều kiện của IIS tham chiếu, không dùng 503 làm mã chung cho mọi lỗi web. Bộ ca IIS đầu không mở thêm lỗi ACL website; quyền chia sẻ được đánh giá riêng ở nhóm hệ thống.

## 4. Nhóm kết nối mạng

| ID thiết kế | Trạng thái ban đầu/triệu chứng | Kiểm tra dự kiến | Điều kiện phục hồi/chấp nhận |
| --- | --- | --- | --- |
| NET-00 | LAN, DNS, HTTP và đường đến mạng kiểm tra đều tốt | Đọc cấu hình, kiểm tra đích cùng LAN và khác LAN | Nhận diện bình thường; không chẩn đoán lỗi chỉ vì thiếu Internet thật |
| NET-01 | Link client-switch bị ngắt | Xem link/interface và kết quả kiểm tra | Kết nối lại link; khôi phục khả năng liên lạc theo cấu hình hợp lệ |
| NET-02 | Client dùng IP/subnet không phù hợp với LAN | Đọc địa chỉ/prefix và so sánh topology | Sửa cấu hình hợp lệ; client liên lạc đúng với máy chủ |
| NET-03 | Default gateway sai nhưng địa chỉ LAN hợp lệ | Kiểm tra server cùng LAN và `192.168.20.10` khác LAN | Giữ truy cập LAN; sửa route/gateway để đến đích khác mạng |
| NET-04 | Interface mạng client bị tắt dù link đã nối | Phân biệt link và trạng thái interface | Bật interface; kiểm tra lại cấp IP và các đích phù hợp |

Trong NET-03, không đánh dấu mất LAN chỉ vì gateway sai. Đích ngoài LAN là một thiết bị logic trong topology, không phải host trên Internet được truy cập thật.

## 5. Nhóm lỗi hệ thống Windows Server

| ID thiết kế | Trạng thái ban đầu/triệu chứng | Kiểm tra dự kiến | Điều kiện phục hồi/chấp nhận |
| --- | --- | --- | --- |
| SYS-00 | Ổ dữ liệu đủ chỗ, truy cập share hợp lệ và dịch vụ mẫu tự chạy sau reboot | Xem dung lượng, truy cập share bằng tài khoản mẫu, kiểm tra Services/Event Viewer | Xác nhận bình thường; không xóa tệp hoặc mở rộng quyền không cần thiết |
| SYS-01 | Ổ `D:` đầy do tệp tạm mẫu, tác vụ ghi dữ liệu thất bại | Xem dung lượng, tệp mẫu và lỗi ghi | Dọn đúng tệp tạm được phép sau xác nhận; đủ dung lượng và ghi lại thành công; giữ nguyên dữ liệu cần bảo vệ |
| SYS-02 | Người dùng local đã xác thực nhưng không đọc được share do một trong hai lớp quyền Share/NTFS | Kiểm tra danh tính, quyền Share, quyền NTFS và thử từ client | Quyền hiệu lực đủ cho tác vụ đọc được yêu cầu; tài khoản ngoài phạm vi vẫn không có quyền; không cấp Full Control hoặc bật guest |
| SYS-03 | Dịch vụ mẫu `LabWorker` có Startup Type Disabled nên không tự chạy sau reboot | Xem Services, Event Viewer và kiểm tra qua reboot | Đặt Automatic, start dịch vụ khi phù hợp; sau reboot dịch vụ chạy; giữ các dịch vụ khác nguyên trạng |

`LabWorker` là dịch vụ mẫu để tách lỗi hệ thống khỏi DNS/DHCP/IIS, không phải tên dịch vụ Windows tích hợp. Hành vi start/stop/Startup Type cần đối chiếu bằng dịch vụ mẫu an toàn trong lab tham chiếu. Chưa mô phỏng delayed start, trigger start, dependency hoặc recovery nâng cao.

SYS-02 có các biến thể lỗi Share hoặc NTFS, giữ lớp còn lại đúng để chẩn đoán phân biệt. Mỗi lần chạy chỉ có một lỗi quyền chính; giới hạn tài khoản local và quyền allow trên tài nguyên mẫu, chưa tuyên bố hỗ trợ đầy đủ kế thừa/deny của Windows.

SYS-01 chỉ dùng ổ dữ liệu và danh mục tệp mẫu có kích thước/quyền xóa xác định. Không mô phỏng việc ổ `D:` đầy khiến toàn bộ Windows dừng; không dùng format ổ hoặc xóa dữ liệu được bảo vệ làm cách xử lý.

## 6. Hồ sơ bắt buộc cho mỗi ca

| Trường | Nội dung |
| --- | --- |
| ID, phiên bản, nhóm | Định danh thiết kế, không dùng làm gợi ý nguyên nhân cho Agent |
| Phạm vi hỗ trợ | Thành phần, phiên bản tham chiếu và hành vi được mô phỏng |
| Trạng thái ban đầu | Snapshot, seed nếu có ngẫu nhiên, thời gian mô phỏng và topology |
| Báo cáo công khai | Triệu chứng trung tính mà người dùng/Agent nhận được |
| Dữ liệu riêng đánh giá | Nguyên nhân, bằng chứng chuẩn, phương án hợp lệ và oracle |
| Quan sát kỳ vọng | Các kiểm tra phân biệt được nguyên nhân, không bắt duy nhất một thứ tự |
| Thao tác hợp lệ | Hành động được engine hỗ trợ và tác động dự kiến |
| Điều kiện phục hồi | Đúng dịch vụ/đích/mục tiêu, không chỉ kiểm tra một cờ `resolved` |
| Điều kiện an toàn | Không phá các dịch vụ khác, không cấp quyền hoặc đổi cấu hình vượt mức cần thiết |
| Hồ sơ đối chiếu | Tài liệu, lab thật, người rà soát, ngày và khác biệt đã biết |

## 7. Các quy tắc đánh giá tránh kết quả giả

- Truy cập bằng IP không chứng minh lỗi phân giải tên đã được sửa.
- Client dùng IP tĩnh không chứng minh DHCP đã cấp phát trở lại.
- Dừng kiểm tra hoặc tắt thành phần bị lỗi không được tính là khôi phục dịch vụ.
- Thay đổi đích kiểm tra để tránh lỗi không được tính thành công nếu mục tiêu vẫn là đích ban đầu.
- Nhận HTTP bất kỳ chưa đủ: phải đúng website/nội dung và mã phản hồi phù hợp.
- Nhiều phương án sửa có thể hợp lệ; oracle kiểm tra kết quả và các bất biến, không chỉ so khớp một chuỗi lệnh mẫu.
- Sau khi đổi cấu hình phải kiểm tra trạng thái đang áp dụng, không chỉ bản nháp hoặc thông báo đã lưu.
- Ca bình thường được đánh giá cả khả năng không tạo thêm lỗi.
- Chạy dịch vụ thủ công chưa chứng minh lỗi tự khởi động đã sửa; phải thử sau reboot.
- Dọn ổ phải giữ nguyên tệp được bảo vệ và thử lại tác vụ ghi, không chỉ làm thanh dung lượng chuyển màu.
- Đọc được share bằng tài khoản quản trị không chứng minh tài khoản được yêu cầu đã có quyền đúng; phải kiểm tra cả tài khoản được phép và tài khoản ngoài phạm vi.

## 8. Nguồn cần đối chiếu khi triển khai

- Microsoft Learn, Windows Server: <https://learn.microsoft.com/windows-server/>; khảo sát DNS, DHCP, SMB/file services, ổ dữ liệu và quyền truy cập.
- Microsoft Learn, IIS: <https://learn.microsoft.com/iis/>; khảo sát role, site, binding, application pool và mã lỗi.
- Microsoft Learn, PowerShell: <https://learn.microsoft.com/powershell/module/>; đối chiếu lệnh được chọn cho Services, Event Log và Storage.
- RFC Editor: <https://www.rfc-editor.org/>; đối chiếu các RFC liên quan IPv4 riêng, DHCP, DNS và miền kiểm thử.

Đây là danh sách điểm bắt đầu khảo sát, chưa phải xác nhận đã kiểm chứng từng ca theo các nguồn này. Khi triển khai cần lưu đúng trang, phiên bản, ngày truy cập và bằng chứng đối chiếu cụ thể.
