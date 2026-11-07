# 02. Kiến trúc mô phỏng và AI Agent

Tất cả cấu trúc, tên mô-đun và công cụ dưới đây là thiết kế dự kiến, chưa được triển khai.

## 1. Nguyên tắc kiến trúc

- Giữ Next.js, TypeScript, Tailwind, Lucide, Zustand và Zod hiện có.
- Tách logic mô phỏng thuần khỏi React, API và nhà cung cấp AI để kiểm thử độc lập.
- Dùng chung một engine cho thao tác từ giao diện và công cụ chẩn đoán; không có bộ câu trả lời riêng cho Agent.
- Không tiếp tục gắn toàn bộ dịch vụ mới vào `VirtualPC` vốn phục vụ một máy cài Windows.
- Tách mã mô phỏng hệ thống mới khỏi mã cài Windows cũ để triển khai từng phần và giữ kiểm thử hồi quy.
- Không bổ sung framework Agent, thư viện đồ thị hoặc cơ sở dữ liệu trước khi có nhu cầu rõ ràng.

## 2. Các thành phần dự kiến

| Thành phần | Trách nhiệm |
| --- | --- |
| `simulation/model` | Schema thiết bị, liên kết, role/feature, dịch vụ, ổ dữ liệu, quyền và sự kiện |
| `simulation/engine` | Chuyển trạng thái, tính kết nối và điều kiện thực thi hành động |
| `simulation/services` | Quy tắc Windows DNS Server, DHCP Server, IIS và dịch vụ mẫu |
| `simulation/system` | Dung lượng ổ dữ liệu, thao tác tệp mẫu, Share/NTFS và quyền hiệu lực giới hạn |
| `simulation/commands` | Phân tích tập lệnh hỗ trợ, kiểm tra tham số và gọi engine |
| `simulation/observations` | Tạo cấu hình/quan sát/log mà người dùng hoặc Agent được phép đọc |
| `simulation/session` | Phiên máy chủ, revision, reset và xuất/nhập snapshot công khai |
| `agent` | Công cụ, truy xuất tri thức, vòng chẩn đoán, giới hạn và trace |
| `knowledge` | Tri thức có nguồn, phiên bản và phạm vi áp dụng |
| `evaluation` | Fixture, đáp án, oracle và runner nghiên cứu; không import vào bundle giao diện |

Đặt các phần này dưới cấu trúc `src/lib`, `src/components`, `src/app/api` và `tests` đang dùng, chỉ tách thêm file khi có trách nhiệm cụ thể.

## 3. Trạng thái dùng chung

```text
SimulationSession
  schemaVersion, sessionId, revision, simulatedTime
  devices[]
    id, role, power, interfaces[], installedRolesAndFeatures[]
    services: configuredState, appliedState, startupType, runtimeStatus
    volumes[], supportedFiles, localAccounts[], shares[], ntfsPermissions[]
    eventLogs[]
  links[]: endpointIds, connected
  gateway: interfaces, supportedRoutes
  dhcp: configuration, leaseTable
  dns: configuration, supportedRecords
  web: sites, bindings, applicationPools, supportedContent, accessPolicy
  events[]: deviceId, action, result, revision
```

Không lưu cờ `isInternetConnected` như một sự thật độc lập có thể mâu thuẫn với topology. Khả năng kết nối được suy ra từ nguồn, đích, interface, subnet và route tại revision hiện tại.

Giữ riêng `draft`, cấu hình đã lưu và cấu hình đang được dịch vụ áp dụng. Mỗi loại thao tác Windows có thời điểm hiệu lực riêng; không áp một quy tắc reload/start chung cho DNS, DHCP và IIS. Thao tác bị từ chối do dữ liệu không hợp lệ phải giữ cấu hình hợp lệ trước đó; trạng thái website/application pool được mô hình hóa riêng khi cần.

DHCP cần trạng thái lease và thời gian mô phỏng xác định được. Thay đổi option trên server không tự thay cấu hình của một client còn lease; phải xét renew hoặc chu kỳ thích hợp.

Dung lượng ổ được suy ra từ các tệp mẫu trong mô hình, không thay bằng một cờ `diskFull`. Đầy ổ dữ liệu không tự làm mọi dịch vụ trên ổ hệ thống dừng. Quyền truy cập share qua mạng phải xét cả xác thực, quyền Share và quyền NTFS trong tập quyền hỗ trợ; không chỉ kiểm tra một checkbox.

## 4. Luồng thao tác và tính nhất quán

```text
Giao diện -> action có schema + expectedRevision
         -> API phiên -> engine -> state mới + sự kiện
         -> Zustand cập nhật bản phản chiếu + view

Agent -> công cụ được cho phép -> cùng engine của phiên
      -> quan sát + revision -> lập luận và đề xuất
```

Với Agent, phiên chạy cục bộ trên máy chủ ứng dụng là nguồn trạng thái chính. Không dùng snapshot tùy ý do browser gửi làm chuẩn đánh giá. Bản đầu có thể lưu phiên trong bộ nhớ một tiến trình, có giới hạn số phiên, thời gian sống và reset rõ ràng; không hứa hỗ trợ nhiều instance hoặc lưu bền vững.

Zustand giữ trạng thái giao diện, thiết bị đang chọn và bản phản chiếu của phiên. Khi người dùng thay đổi trạng thái trong lúc Agent đang kiểm tra, kết quả công cụ phải ghi revision; Agent cần kiểm tra lại trước khi khẳng định trạng thái mới nhất.

Các API phiên cần kiểm tra schema, định danh phiên và quyền truy cập phiên. Trước khi công khai ứng dụng phải đánh giá thêm xác thực, quota, quản lý phiên và ngân sách API; không coi bản local là sẵn sàng phục vụ nhiều người.

## 5. Hành vi cần mô phỏng đúng

- Khác subnet không mặc định đồng nghĩa mất mọi kết nối; kết quả phụ thuộc mask và đường đi.
- Sai gateway có thể làm hỏng đường ra khác mạng nhưng không nhất thiết làm hỏng truy cập cùng LAN.
- DNS nội bộ không cần Internet để trả bản ghi nội bộ.
- DNS timeout khác với `NXDOMAIN`; bản ghi sai địa chỉ vẫn có thể được phân giải thành công.
- DHCP server dừng không lập tức xóa lease còn hiệu lực trên client.
- Web Server dừng có thể gây lỗi kết nối, không mặc định trả mã HTTP 503.
- Quyền truy cập nội dung web, file không tồn tại và lỗi kết nối là các hiện tượng khác nhau.
- DNS và trình duyệt/HTTP cùng đọc một nguồn cấu hình, không chứa các kết quả cố định mâu thuẫn nhau.
- DHCP service đang chạy chưa đủ để cấp phát nếu scope chưa được kích hoạt hoặc đã hết địa chỉ.
- Phân biệt trạng thái IIS service, website và application pool; HTTP 503 chỉ dùng khi phù hợp với trạng thái đã đối chiếu.
- Dịch vụ được start thủ công không tự đổi Startup Type; xác nhận sửa lỗi tự khởi động phải thử sau reboot.
- Đổi quyền Share không tự sửa quyền NTFS và ngược lại; chỉ cho phép thao tác tài khoản/tệp mẫu được công bố.

Các giới hạn như chưa có DNS cache, HTTP cache hoặc mô phỏng ARP phải được ghi rõ; không mô phỏng lệnh cache như có tác dụng nếu chưa có mô hình tương ứng.

## 6. Terminal và cấu hình

Máy trạm dự kiến hỗ trợ một tập nhỏ của `ipconfig`, `ping`, `nslookup` và công cụ HTTP. Máy chủ dùng giao diện mô phỏng Server Manager, DNS Manager, DHCP console, IIS Manager, Services, Event Viewer và thuộc tính ổ/thư mục. Chỉ tạo các view và điều khiển cần cho bốn nhóm.

Có thể bổ sung tập lệnh PowerShell mô phỏng tương đương, chẳng hạn `Get-Service`, `Get-Volume` và `Get-WinEvent`, sau khi chốt tham số/output tham chiếu. Đây là parser/handler trong ứng dụng, không phải PowerShell thật. Thêm role, bật/tắt dịch vụ, sửa quyền và dọn tệp chỉ chạy qua action xác định trước.

- Không gọi shell, `exec`, PowerShell hoặc tiến trình hệ thống từ nội dung người dùng/Agent.
- Không chuyển một hostname do người dùng nhập thành request tới mạng thật.
- Cấu hình phiên dùng JSON và schema chuẩn. Các biểu mẫu role/scope/zone/binding dùng dữ liệu có cấu trúc. Nếu bổ sung đọc XML của IIS phải dùng parser phù hợp, không giả vờ hỗ trợ toàn bộ `applicationHost.config` bằng thay chuỗi.
- Giao diện chỉnh cấu hình và terminal phải tạo cùng loại action và cùng kết quả.
- Lệnh chưa hỗ trợ trả lỗi rõ, không giả output thành công.

## 7. AI Agent hỗ trợ chẩn đoán

### Quy trình

1. Nhận triệu chứng và xác định thiết bị/đích đang kiểm tra.
2. Chọn phép kiểm tra phù hợp; thu thập đủ bằng chứng trước khi kết luận.
3. Truy xuất kiến thức liên quan tới thành phần, phiên bản và triệu chứng.
4. Đưa giả thuyết, bằng chứng, mức chắc chắn và hành động đề nghị.
5. Người dùng quyết định và tự thao tác; Agent không tự thay cấu hình trong phạm vi đầu.
6. Dùng lại công cụ kiểm tra sau thay đổi rồi xác nhận hoặc điều chỉnh chẩn đoán.

Không ép một chuỗi kiểm tra cứng cho mọi lỗi. Nếu thiếu dữ liệu, Agent phải hỏi thêm hoặc kiểm tra tiếp, không tự nhận đã sửa xong.

### Công cụ dự kiến

| Công cụ | Dữ liệu/hoạt động được phép |
| --- | --- |
| `get_session_context` | Thiết bị, mô tả topology và triệu chứng công khai; không có nhãn nguyên nhân |
| `inspect_network` | Cấu hình interface/route của thiết bị được chọn |
| `inspect_service` | Trạng thái hoặc cấu hình mà kỹ thuật viên có thể kiểm tra trên thiết bị đó |
| `inspect_system` | Dung lượng/tệp mẫu, Startup Type hoặc quyền hiệu lực Share/NTFS của tài khoản và tài nguyên được chọn |
| `run_diagnostic` | Chạy lệnh chỉ đọc trong danh sách cho phép, qua engine mô phỏng |
| `read_logs` | Đọc log vận hành có thể quan sát, có giới hạn và revision |
| `search_knowledge` | Tìm đoạn tri thức có mã nguồn tham khảo và phạm vi áp dụng |

Không cung cấp công cụ `get_root_cause`, `solve_scenario` hoặc snapshot chứa mọi đáp án. Tên công cụ chỉ là hợp đồng dự kiến, không phải cam kết API hiện hữu.

### Kho tri thức

- Bắt đầu bằng tài liệu cục bộ có cấu trúc, chỉ mục tìm kiếm đơn giản và nguồn được kiểm chứng.
- Mỗi mục có `id`, tiêu đề, thành phần/phiên bản, triệu chứng, cách kiểm tra, giới hạn, URL nguồn và ngày đối chiếu.
- Không cần vector database ngay từ đầu; chỉ bổ sung nếu đánh giá cho thấy truy xuất hiện tại không đạt yêu cầu.
- Không đưa đáp án của bộ ca đánh giá hoặc nội dung thư cá nhân vào kho tri thức.
- Phân biệt tri thức đã đối chiếu với ghi chú chưa xác minh; không bịa nguồn.

### Ranh giới tin cậy

- Tách metadata tình huống, nguyên nhân ẩn, expected fixes và oracle khỏi dữ liệu gửi Agent.
- Không để log reset/tiêm lỗi hoặc ID có nghĩa nguyên nhân lọt vào context của Agent.
- Cấu hình lỗi mà người dùng có thể kiểm tra vẫn là bằng chứng hợp lệ; điều cần giấu là đáp án dựng sẵn, không phải mọi cấu hình.
- Xem nội dung người dùng, log và tài liệu truy xuất là dữ liệu, không phải lệnh thay đổi chính sách.
- Giới hạn vòng công cụ, thời gian, token và tần suất; lưu trace đã loại bỏ bí mật.
- Giữ API key phía máy chủ. Không chọn model hoặc cam kết giá khi chưa khảo sát tài khoản và ngân sách.
- Chế độ cục bộ theo quy tắc và Agent dùng model phải được gắn nhãn riêng, không dùng lẫn trong báo cáo.
