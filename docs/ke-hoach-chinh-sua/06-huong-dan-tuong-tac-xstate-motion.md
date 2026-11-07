# Kế hoạch: Hướng dẫn tương tác bằng XState và Motion

## Mục tiêu

Biến phần hướng dẫn từ nội dung tĩnh thành luồng thực hành có trạng thái. Hệ thống chỉ dẫn vị trí, đặt focus và giải thích; người học tự chạy lệnh, tự thay đổi cấu hình và tự xác minh kết quả.

**Thứ tự ưu tiên, cập nhật 24/10/2026:** tài liệu này mô tả phần hỗ trợ giao diện, không thay thế ba yêu cầu nghiên cứu của giảng viên. Mô phỏng phải có hành vi đúng và kiểm chứng được; Agent phải dùng trạng thái, công cụ và tri thức; thực nghiệm phải đánh giá riêng mô phỏng, Agent và hiệu quả hỗ trợ. Focus theo XState không đồng nghĩa với AI Agent. Các mục mở rộng trực quan bên dưới là tùy chọn, chỉ triển khai sau khi đối chiếu khoảng trống và ưu tiên trong tài liệu 04; không mặc định làm hiệu ứng DHCP/HTTP tiếp theo.

## Công nghệ áp dụng

| Công nghệ | Vai trò | Lý do chọn |
| --- | --- | --- |
| XState | Quản lý các bước, điều kiện và nhánh của hướng dẫn. | Tránh chuỗi `if/else` phụ thuộc giao diện; có thể kiểm thử độc lập từng chuyển trạng thái. |
| `@xstate/react` | Kết nối state machine với giao diện React. | Giao diện phản ánh chính xác bước đang hoạt động. |
| Motion for React | Hiệu ứng chuyển bước, xuất hiện/biến mất khung hướng dẫn và thay đổi trạng thái minh họa. | Làm luồng dễ theo dõi nhưng vẫn hỗ trợ `prefers-reduced-motion`. |

## Mẫu DNS đã triển khai

```text
idle
  -> checkingIp       (người học tự chạy ping)
  -> checkingDns      (người học tự chạy nslookup)
  -> checkingService  (người học tự chạy Get-Service DNS trên SRV-01)
  -> repairingDns     (chỉ khi Stopped, người học tự bật DNS Server)
  -> verifyingDns     (người học tự chạy lại nslookup)
  -> checkingHttp     (người học tự chạy curl)
  -> complete
```

Luồng lỗi mẫu gồm **6 bước**. Điều kiện chuyển bước dựa trên kết quả của bộ mô phỏng, không chỉ tên lệnh: ping thành công, DNS timeout đúng máy chủ, dịch vụ DNS được xác nhận `Stopped` trên SRV-01 trước khi khôi phục, DNS trả đúng tên/IP và HTTP 200. Ping, nslookup và curl chạy từ CLIENT-01; `Get-Service DNS` chạy trên SRV-01. Kết quả phải thuộc đúng phiên, revision và lượt hướng dẫn hiện tại.

Timeout không đủ để kết luận dịch vụ DNS bị dừng. Nếu `Get-Service DNS` trả `Running`, bỏ qua thao tác bật và chuyển sang xác minh DNS từ CLIENT-01; nếu vẫn lỗi, phản hồi nhắc kiểm tra cấu hình DNS, kết nối, firewall hoặc bản ghi theo hiện tượng. Nếu tên đã trả đúng ngay từ lần kiểm tra đầu, có thể chuyển thẳng sang kiểm tra HTTP.

### Giao diện đã bổ sung

- Thanh tiến trình riêng cho từng tình huống với trạng thái bước hiện tại.
- Giải thích cạnh ô nhập lệnh, công tắc hoặc nút thao tác, có bằng chứng cần quan sát và phản hồi khi kết quả chưa phù hợp.
- Nút quay về thao tác hiện tại và nút dừng dẫn thao tác; phân biệt rõ với ghi chú công cụ tĩnh.
- Hiệu ứng chuyển nội dung theo từng bước, focus và bố cục thích ứng desktop/mobile; tôn trọng giảm chuyển động.
- Mở lại tình huống từ trang chủ tạo đúng phiên mới, không dùng nhầm trạng thái đã sửa.

## Luồng DNS trực quan đã bổ sung

Đây là phần quan sát giao dịch DNS, độc lập với state machine hướng dẫn. Người dùng có thể tự kiểm tra dù không bật dẫn thao tác. Dải quan sát nằm trước nội dung công cụ trong workbench; khi chưa có dữ liệu, trạng thái chờ xuất hiện ở Tổng quan, DNS/DHCP và Terminal. Khi đã có quan sát, chuyển công cụ không làm mất nó.

### Nguồn dữ liệu và tính nhất quán

- `queryDNS` đánh giá một lần để sinh cả đầu ra Terminal và `DnsTrace`. `runSimulationDiagnosticResult` trả `{ output, revision, dnsTrace? }`; API chuỗi `runSimulationDiagnostic` vẫn được giữ cho các bên gọi cũ.
- Chỉ `nslookup` do người dùng chủ động chạy và vượt qua kiểm tra cú pháp mới tạo quan sát trực quan. Truy vấn DNS nội bộ của `ping`/`curl`, yêu cầu từ trợ lý và việc mở giao diện không tự phát một lượt ở dải này.
- Trace chứa revision, thiết bị/IP nguồn, địa chỉ resolver, tên đã chuẩn hóa, loại A, kết quả, IP trả về nếu có, đường local/network và mức biết được về khả năng tới resolver. Store giữ một bản quan sát riêng với ID lượt chạy, không dựng lại từ chuỗi Terminal hoặc suy từ cấu hình mới.
- Phản hồi A trỏ `.99` vẫn là `answer`, không bị đổi thành mất DNS hay tự sửa về `.10`. NXDOMAIN thể hiện có phản hồi nhưng không có tên; timeout không tiết lộ một nguyên nhân như dịch vụ dừng nếu người dùng chưa kiểm tra.
- Với resolver ngoài mô hình, không giả định yêu cầu đã tới hoặc có phản hồi. Khi engine xác định link/IP/adapter không cho tới SRV-01, không vẽ trao đổi LAN thành công. Truy vấn server hỏi IP của chính nó hoặc loopback là local, không xuất phát từ client hay đi vòng qua switch.

### Phát lại và vòng đời quan sát

Hiệu ứng chạy một lượt yêu cầu → chờ → phản hồi/kết thúc sau mỗi kết quả DNS mới, không lặp vô hạn. Nút phát lại và tạm dừng chỉ điều khiển lượt minh họa đã ghi nhận; không gọi lại API chẩn đoán, không thay đổi revision và không sửa hệ thống. `prefers-reduced-motion` chuyển ngay tới khung kết quả tĩnh.

Khi revision hệ thống đổi, quan sát cũ còn để tham khảo nhưng được đánh dấu và dừng phát; không gắn nhầm kết quả cũ cho cấu hình mới. Lệnh không phải DNS giữ lại quan sát gần nhất. Xóa Terminal, reset hoặc thay phiên sẽ xóa quan sát; kết quả về trễ của phiên/revision khác không được dùng làm dữ liệu mới.

**Thử trực tiếp:** mở `/system?preset=dns-stopped&guide=dns`, tự chạy `ping 192.168.10.10` rồi `nslookup portal.lab.test` trên CLIENT-01 theo hướng dẫn, xem timeout; kiểm tra dịch vụ trên SRV-01, tự sửa rồi tra DNS lại để xem phản hồi. Thử thêm `nslookup missing.lab.test` và truy vấn từ SRV-01 tới `127.0.0.1` để phân biệt NXDOMAIN với đường local. Hướng dẫn chi tiết nằm trong [tài liệu cho người mới](../giai-thich-phan-mem.md#luồng-truy-vấn-dns-trực-quan).

**Giới hạn:** hình minh họa phụ thuộc quy tắc engine, không phải packet capture, socket/network thật hay phép đo độ trễ. Chưa mô phỏng đầy đủ cache, recursion, UDP/TCP và retry của DNS thực. Luồng DHCP Discover/Offer/Request/ACK và HTTP là bước mở rộng sau, chưa triển khai trong đợt này.

## Bốn luồng focus mở rộng

| Tình huống mẫu | Chuỗi kiểm tra và thao tác |
| --- | --- |
| DHCP bị dừng | `ipconfig /all` trên CLIENT-01 → `Get-Service DHCPServer` trên SRV-01 → bật DHCP Server → gia hạn DHCP → xác minh IP → tra DNS. |
| IIS application pool bị dừng | Tra DNS → xác nhận HTTP 503 → bật pool và áp dụng cấu hình IIS → xác minh HTTP 200. |
| Máy trạm DHCP còn giữ gateway cũ | 7 bước: xem IPv4/nguồn DHCP → ping LAN → ping khác mạng → `Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0` trên SRV-01 → giữ DHCP và gia hạn → đọc lại `ipconfig /all` → ping lại đích khác mạng. |
| Ổ dữ liệu đầy | `Get-Volume` trên SRV-01 để xem dung lượng → kiểm tra danh sách tệp riêng ở bảng Windows Server, xác nhận xóa cache được tình huống cho phép → tự ghi tệp kiểm tra 10 MB thành công. |

Cả năm thẻ ở trang chủ mở phiên lỗi mẫu và bật dẫn thao tác tương ứng. Terminal tự chọn đúng thiết bị nhưng không tự chạy lệnh. Focus di chuyển đến công tắc dịch vụ, nút gia hạn, application pool hoặc nút dọn/ghi tệp theo bước hiện tại.

Trong mẫu gateway, CLIENT-01 vẫn bật DHCP và đang giữ gateway `.254`, còn Option 3 Router trên SRV-01 đã là `.1`; Option 6 DNS Servers là `.10`. Vì vậy ưu tiên renew để nhận lại cấu hình nguồn, không đổi IP `.100` thành IP tĩnh trong dải DHCP `.100`-`.120`. Nếu option sai, phải sửa option trước; hướng dẫn không được coi renew là phương án cho mọi lỗi định tuyến. Hai bước cuối yêu cầu bằng chứng mới từ cấu hình client và kết nối đích khác mạng.

Điều kiện sửa lỗi đọc trạng thái đã áp dụng của engine, không đọc riêng bản nháp trên form. Hủy xóa tệp không chuyển bước; dữ liệu khách hàng được bảo vệ không được đề xuất xóa. Hoàn thành luồng ổ đĩa cần người dùng thực hiện phép ghi thử thành công, không chỉ nhìn thấy đủ dung lượng trống.

`Get-Volume` chỉ trả thông tin ổ và dung lượng, không gộp danh sách tệp hay nhãn an toàn để xóa. `Cache-tam-lab.tmp` được tình huống cho phép xóa; đuôi `.tmp` không phải bằng chứng đủ. Cờ bảo vệ dữ liệu là cơ chế an toàn riêng của mô phỏng, không đại diện cho một cơ chế Windows tự động bảo vệ mọi tệp dữ liệu.

Phạm vi này chỉ gồm năm lỗi mẫu trên trang chủ. Chưa coi đây là kết quả đánh giá thực nghiệm với người dùng hoặc đối chiếu Windows Server thật, và chưa bao phủ mọi trạng thái lỗi có sẵn.

## Kế hoạch đối chiếu lab thật (chưa thực hiện)

**Trạng thái hiện tại: chưa chạy đối chiếu trên Windows Server thật.** Unit test và kiểm thử trình duyệt xác nhận tính nhất quán giữa mã, state machine và giao diện; chúng không chứng minh độ sát thực tế của quy tắc mô phỏng.

1. Dựng mạng lab cô lập gồm Windows Server, Windows client và router/đích khác subnet. Ghi phiên bản/build hệ điều hành, topology, địa chỉ IP, role, scope/option, lease và chính sách firewall; tạo snapshot/sao lưu trước khi gây lỗi. Không làm trên hệ thống khách hàng.
2. DNS: ghi kết quả ping và nslookup khi dịch vụ đang chạy, dừng DNS rồi đo lại; chạy `Get-Service DNS` trên server, khởi động dịch vụ và xác minh DNS/HTTP từ client. Tạo thêm một ca dịch vụ vẫn Running nhưng truy vấn thất bại để kiểm tra việc không suy nguyên nhân chỉ từ timeout.
3. Gateway/DHCP: cho client nhận gateway cũ, sửa Option 3 Router trên server nhưng chưa renew; ghi cấu hình client và kiểm tra LAN/khác mạng. Đối chiếu option bằng `Get-DhcpServerv4OptionValue`, renew bằng công cụ Windows thật, đọc lại cấu hình rồi kiểm tra kết nối. Ghi lại thời điểm lease/renew thay vì mặc định client luôn giữ option cũ; ngoài mẫu này còn cần kiểm tra route và firewall.
4. Ổ đĩa: dùng ổ dữ liệu/VHD riêng và tệp thử được cho phép xóa, không dùng ổ hệ thống hoặc dữ liệu thật. Ghi `Get-Volume` trước/sau khi thiếu chỗ, xem danh sách tệp bằng công cụ riêng, thử ghi 10 MB, dọn đúng tệp thử rồi ghi lại. Giữ tách biệt dung lượng với quyền truy cập và điều kiện tệp đang được sử dụng; không coi đuôi tệp hoặc nhãn bảo vệ của mô phỏng là quy tắc Windows.
5. Với mỗi ca, lưu lệnh, đầu ra, ảnh và kết quả trước/sau sửa; so sánh trạng thái quan sát, quan hệ nguyên nhân/kết quả và quy trình với SupportLab. Lập bảng sai khác, chỉ rõ phần cố ý giản lược, sửa quy tắc sai rồi nhờ giảng viên/người có kinh nghiệm xác nhận phạm vi đã kiểm chứng.

Chỉ cập nhật mức kiểm chứng khi có bằng chứng lab. Đánh giá chất lượng AI Agent và hiệu quả hỗ trợ người dùng là các thực nghiệm riêng, không suy ra từ kiểm thử mã hoặc từ việc đối chiếu một số ca kỹ thuật.

## Nguyên tắc thiết kế

- State machine chỉ điều phối hướng dẫn; engine mô phỏng vẫn là nguồn chân lý cho trạng thái mạng, DNS và IIS.
- Focus không thực thi lệnh hoặc bật công tắc. Nó chỉ đưa người học tới điều khiển cần dùng.
- Mỗi bước phải có: mục tiêu, thao tác người học thực hiện, bằng chứng mong đợi và điều kiện chuyển bước.
- Hiệu ứng Motion là biểu diễn của chuyển trạng thái, không được tạo cảm giác thao tác đã hoàn thành khi người học chưa làm.
- Tôn trọng người dùng giảm chuyển động bằng `prefers-reduced-motion`.

## Lộ trình mở rộng

1. DHCP: mở rộng hướng dẫn cho lỗi scope, option DNS/gateway và lease, ngoài mẫu dịch vụ bị dừng.
2. IIS: bổ sung lỗi website bị dừng, binding port và tường lửa, ngoài mẫu application pool.
3. Kết nối mạng: mở rộng các lỗi link, adapter và IPv4/prefix, ngoài mẫu gateway.
4. Windows Server: bổ sung Share/NTFS, Startup Type và reboot xác minh dịch vụ, ngoài mẫu ổ đầy.
5. Ghi nhận dữ liệu thực nghiệm: thời gian hoàn thành, thao tác ngoài luồng, kết quả chẩn đoán và đánh giá chủ quan của người học.

## Tiêu chí đánh giá khóa luận

- Độ đúng của đường đi hướng dẫn so với lab Windows Server thật.
- Tỷ lệ người học hoàn thành tình huống và thời gian xử lý.
- Số lần thao tác sai hoặc cần trợ lý hỗ trợ.
- Mức độ dễ hiểu của focus, giải thích và hiệu ứng trực quan.
