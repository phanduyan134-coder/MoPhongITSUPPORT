# 04. Lộ trình chỉnh sửa dự án

## 1. Hiện trạng được rà soát ngày 22/10/2026

| Thành phần hiện tại | Nhận xét | Hướng xử lý |
| --- | --- | --- |
| [`src/lib/engine.ts`](../../src/lib/engine.ts) | Một VirtualPC; BIOS, ổ đĩa, boot, mạng cố định, CMD và trả lời theo quy tắc | Giữ phần cài Windows; tạo engine nhiều thiết bị riêng và chỉ dùng lại helper phù hợp |
| [`src/lib/store.ts`](../../src/lib/store.ts) | Một máy, tab, log, hướng dẫn và thao tác đồng bộ ở client | Giữ store cũ; bổ sung store giao diện cho phiên hệ thống, không nhồi tất cả vào cùng state |
| [`src/components/lab.tsx`](../../src/components/lab.tsx) | Giao diện trung tâm của phòng mô phỏng hiện tại | Tách dần điều hướng để có không gian hệ thống bên cạnh phần Windows |
| [`src/components/panels.tsx`](../../src/components/panels.tsx) | Desktop, BIOS, installer, mạng, terminal | Tái sử dụng thành phần nhỏ khi phù hợp; thêm panel thiết bị/dịch vụ mới |
| [`src/app/api/agent/route.ts`](../../src/app/api/agent/route.ts) | Đường AI tùy chọn có công cụ chỉ đọc PC/log; nhận snapshot client | Giữ chế độ hiện tại; phát triển luồng Agent đọc phiên hệ thống và công cụ chẩn đoán/truy xuất |
| [`src/components/support-agent.tsx`](../../src/components/support-agent.tsx) | Hội thoại và nhãn nguồn trả lời | Bổ sung bằng chứng, nguồn tham khảo và trạng thái công cụ khi đã có hợp đồng API |
| [`src/lib/network-guide.ts`](../../src/lib/network-guide.ts) | Gợi ý cho mạng cố định của một client | Dùng ý tưởng hướng dẫn theo trạng thái; chưa coi là hướng dẫn DNS/DHCP server |
| [`src/lib/install-handbook.ts`](../../src/lib/install-handbook.ts) | Nội dung tham khảo cài Windows | Giữ nguyên; không xem là sản phẩm nghiên cứu chính của phạm vi mới |
| [`tests`](../../tests) và [`tests/e2e`](../../tests/e2e) | Kiểm thử logic/store và trình duyệt hiện có | Giữ hồi quy; thêm unit, integration, Agent contract và E2E cho hệ thống mới |

Rà soát này không thay thế việc chạy lại test khi bắt đầu sửa chức năng. Các tài liệu trong thư mục này chưa làm phát sinh API hoặc tính năng mới.

## 2. Cách chuyển đổi

- Không nâng major framework hoặc thay stack chỉ để triển khai đề tài.
- Không xóa mô-đun Windows hoặc test cũ để làm test mới chạy qua.
- Xây một luồng nhỏ xuyên suốt trước: đổi cấu hình mạng client, kiểm tra đường đi và quan sát phản hồi đúng.
- Mỗi mốc chỉ sửa phần sở hữu hành vi của mốc đó; tách thay đổi engine, UI và Agent khi có thể.
- Sau khi luồng hệ thống mới ổn định mới quyết định màn hình mặc định; không thay README để khẳng định chức năng chưa có.
- Chưa đặt thời gian hoàn thành cố định vì chưa thống nhất lịch KLTN, phạm vi cuối và nguồn lực thực nghiệm.

## 3. Các mốc triển khai

### Mốc 0: Chốt đề cương và lập bộ tham chiếu

- [ ] Gửi tên dự kiến, bốn nhóm dùng Windows Server, hình thức mô phỏng và sơ đồ mạng cho giảng viên.
- [ ] Xác nhận phạm vi chức năng, tiêu chí đánh giá và yêu cầu người tham gia.
- [ ] Đối chiếu một số ca đúng/lỗi trên hệ thống tham chiếu; chốt phiên bản và tập lệnh/cấu hình.
- [ ] Xác nhận lab Windows Server workgroup, vùng DNS độc lập, DHCP scope, IIS và ba lỗi hệ thống giới hạn; chưa có AD DS.
- [ ] Ghi nguồn, giới hạn và các hành vi không mô phỏng.
- [ ] Chạy lại kiểm thử hiện có làm baseline kỹ thuật.

Đầu ra: phạm vi có thể triển khai, bảng hành vi tham chiếu và danh sách điểm chưa thống nhất. Không tự đánh dấu giảng viên đã duyệt chỉ vì đã gửi email.

### Mốc 1: Luồng mẫu mô phỏng mạng xuyên suốt

- [ ] Tạo schema thiết bị, interface, link, route và phiên có revision.
- [ ] Thực hiện engine kiểm tra kết nối cùng LAN/khác LAN bằng dữ liệu topology.
- [ ] Tạo một view chọn thiết bị, chỉnh IP/prefix/gateway và chạy kiểm tra.
- [ ] Dùng API phiên và Zustand phản chiếu; phân biệt bản nháp với cấu hình áp dụng.
- [ ] Kiểm thử lỗi IP, link ngắt và gateway sai, không dựa vào IP hardcode của lab cũ.

Điều kiện xong: từ cấu hình đúng, người dùng tự tạo lỗi rồi tự sửa; giao diện, terminal và log đều phản ánh cùng trạng thái. Phần cài Windows cũ vẫn hoạt động.

### Mốc 2: DNS và DHCP

- [ ] Thêm trạng thái role/feature, cấu hình, service, event log và lease của Windows Server.
- [ ] Cho thêm role qua Server Manager mô phỏng, cấu hình DNS/DHCP phía server và cấp IP cho client theo scope/option trong mô hình.
- [ ] Cho quản lý vùng/bản ghi A và truy vấn DNS nội bộ.
- [ ] Mô phỏng renew, lease còn hiệu lực, hết pool, timeout và `NXDOMAIN` riêng biệt.
- [ ] Thêm ca đúng, ca cài mới và ca lỗi trong nhóm DD; kiểm tra cả ảnh hưởng chéo lên client.

Điều kiện xong: đổi cấu hình server thực sự thay kết quả của client khi đúng thời điểm áp dụng. Không trả đáp án chỉ dựa trên tên tình huống.

### Mốc 3: Web Server IIS

- [ ] Thêm role IIS mô phỏng và view IIS Manager với trạng thái website/application pool.
- [ ] Thêm website nội bộ, binding, physical path và nội dung mẫu.
- [ ] Thêm trình duyệt nội bộ hoặc công cụ HTTP đọc từ cùng engine.
- [ ] Phân biệt lỗi DNS, lỗi kết nối HTTP, binding sai cổng và application pool dừng.
- [ ] Thêm log phục vụ chẩn đoán và ca nhóm WEB.

Điều kiện xong: website truy cập được qua tên khi cả DNS, mạng và HTTP đúng; hỏng từng lớp tạo hiện tượng phù hợp với bản tham chiếu.

### Mốc 3B: Lỗi hệ thống Windows Server

- [ ] Thêm ổ dữ liệu `D:`, dung lượng suy ra từ tệp mẫu và thao tác ghi/dọn tệp có xác nhận.
- [ ] Thêm tài khoản local mẫu, share và tập quyền Share/NTFS giới hạn; kiểm tra quyền hiệu lực từ máy trạm.
- [ ] Thêm dịch vụ mẫu `LabWorker`, Startup Type và quy tắc start sau reboot; không phụ thuộc DNS/DHCP/IIS.
- [ ] Thêm view Services, Event Viewer, thuộc tính ổ/thư mục ở mức cần thiết.
- [ ] Thêm ca SYS-00 đến SYS-03; kiểm tra dữ liệu được bảo vệ, quyền tối thiểu và trạng thái sau reboot.

Điều kiện xong: người dùng chẩn đoán và xử lý được ba lỗi riêng của nhóm 4; oracle xác nhận ghi dữ liệu, quyền truy cập và tự khởi động thực sự phục hồi. Không tính start thủ công, cấp quyền toàn bộ hoặc xóa dữ liệu cần giữ là cách sửa đạt.

Mốc này dùng chung engine thiết bị, phiên và sự kiện của các mốc trước. Không thêm trình giả lập Windows Server tổng quát.

### Mốc 4: Không gian mô phỏng và tái hiện tình huống

- [ ] Hoàn thiện chọn thiết bị, trạng thái dịch vụ, panel cấu hình, terminal và log.
- [ ] Cho tạo/reset phiên, chọn trạng thái ban đầu và xuất/nhập snapshot có phiên bản.
- [ ] Kiểm tra dữ liệu nhập, giới hạn dung lượng và không xuất metadata đáp án.
- [ ] Giữ chế độ tự do; bổ sung hướng dẫn tùy chọn theo trạng thái thực, không khóa thứ tự.
- [ ] Hoàn thiện các ca ứng viên và hồ sơ đối chiếu; ưu tiên ca đơn lỗi trước ca kết hợp.
- [ ] Kiểm tra desktop/mobile, focus, thông báo lỗi và thao tác có tính phá hủy.

Điều kiện xong: tái hiện được một phiên, nhiều cách xử lý hợp lệ và trạng thái nhất quán sau chuyển view/thiết bị. Các ca chưa được xác minh vẫn được gắn trạng thái tương ứng trong hồ sơ.

### Mốc 5: Agent chẩn đoán dựa trên công cụ và tri thức

- [ ] Tách dữ liệu quan sát khỏi metadata đánh giá trước khi cấp công cụ cho Agent.
- [ ] Làm hợp đồng công cụ cho network, service, diagnostic, log và truy xuất tri thức.
- [ ] Cho Agent kiểm tra dung lượng/tệp mẫu, Share/NTFS và Startup Type qua công cụ chỉ đọc, không cung cấp đáp án nhóm SYS.
- [ ] Xây kho tri thức nhỏ có nguồn và phiên bản; kiểm tra truy xuất trước khi mở rộng.
- [ ] Tích hợp chu trình quan sát, giả thuyết, đề xuất và kiểm tra lại sau thao tác người dùng.
- [ ] Giới hạn công cụ, thời gian, chi phí; xử lý timeout, lỗi nhà cung cấp và dữ liệu không đáng tin cậy.
- [ ] Lưu trace, nguồn tham khảo và revision; kiểm thử bằng mock trước khi gọi model thật.

Điều kiện xong: Agent dùng được công cụ/tri thức trên nhiều ca không lộ đáp án, không tự thay cấu hình, không tự nhận đã chạy lệnh thật. Có báo cáo model thật riêng với báo cáo mock.

### Mốc 6: Pilot và thực nghiệm chính thức

- [ ] Chạy pilot kỹ thuật để sửa tình huống, oracle và công cụ đo.
- [ ] Chia bộ phát triển/bộ đánh giá theo họ nguyên nhân và biến thể trước khi chốt Agent.
- [ ] Chốt baseline hướng dẫn cố định, chỉ số, cách chấm và số lần lặp.
- [ ] Chốt kế hoạch người dùng, đồng thuận, ẩn danh và phương pháp so sánh với giảng viên.
- [ ] Đóng băng phiên bản engine, tri thức, prompt/model và bộ ca cho đợt đo chính thức.
- [ ] Thực hiện ba phần đánh giá trong tài liệu 05 trên cả bốn nhóm nghiệp vụ; lưu cả thất bại và ngoại lệ.

Điều kiện xong: có dữ liệu, phân tích và giới hạn cho cả ba yêu cầu; không thay thực nghiệm bằng ảnh demo hoặc số test passed.

### Mốc 7: Báo cáo, tài liệu và bàn giao

- [ ] Viết mô hình, quyết định kiến trúc, thiết kế Agent và phương pháp đánh giá.
- [ ] Báo cáo kết quả theo phạm vi đã kiểm chứng, không khái quát mọi hệ thống CNTT.
- [ ] Cập nhật README, ảnh thật của chức năng mới và hướng dẫn chạy.
- [ ] Rà soát khóa API, dữ liệu cá nhân, dependency và giới hạn triển khai.
- [ ] Chạy lại unit/integration/E2E, typecheck và build cho phiên bản bàn giao.

## 4. Việc thực hiện đầu tiên khi bắt đầu code

**Ưu tiên ban đầu là mốc 0 và mốc 1**, không làm chatbot trước. Một luồng mẫu có IP/prefix, topology, phép kiểm tra và trạng thái nhất quán giúp xác nhận kiến trúc trước khi phát triển ba dịch vụ.

### Ưu tiên hiện tại, cập nhật 24/10/2026

Nguyên mẫu hiện đã có engine hệ thống, năm luồng hướng dẫn và minh họa truy vấn DNS; không cần bắt đầu lại dự án. Tuy nhiên, các thành phần này chưa chứng minh đề tài đã đáp ứng ba yêu cầu của giảng viên. Checklist mốc triển khai ở trên là tiêu chí kế hoạch, không phải bảng xác nhận chức năng đã được nghiệm thu.

1. Đã lập [bảng đối chiếu ba yêu cầu](07-doi-chieu-yeu-cau-giang-vien.md) với chức năng hiện có, phần còn thiếu và bằng chứng cần thu thập. Dùng bảng này để ưu tiên công việc; giữ bốn nhóm Windows Server và xác nhận phạm vi cuối với giảng viên.
2. Kiểm chứng một luồng xuyên suốt: trạng thái đúng/lỗi → người dùng chẩn đoán → Agent quan sát bằng công cụ và truy xuất tri thức → người dùng tự khắc phục → kiểm tra lại. Đã có [bộ khung pilot DNS ngoại tuyến](../../experiments/dns-pilot/README.md) để kiểm tra quan sát/thao tác tham chiếu/ghi nhận; chưa chạy luồng người dùng hoặc Agent thật. Tiếp theo đối chiếu hành vi với lab tham chiếu, ghi rõ phần giản lược và chuẩn bị lượt đo riêng cho Agent.
3. Hoàn thiện các khoảng trống của bốn nhóm theo tiêu chí mỗi ca, không mở rộng số lượng tình huống chỉ để tăng danh mục. Phát triển Agent và công cụ ghi nhận thực nghiệm gắn với các ca này.
4. Thực hiện pilot và ba phần đánh giá theo tài liệu 05. Kiểm thử mock và unit/E2E chỉ chứng minh kỹ thuật ở phạm vi kiểm tra, không thay cho thử model thật, lab thật hoặc người dùng.

**Không mặc định ưu tiên tiếp theo là hiệu ứng DHCP/HTTP.** Focus và chuyển động chỉ bổ sung khi giúp quan sát hành vi đã đúng hoặc phục vụ mục tiêu đánh giá. Tạm hoãn các nâng cấp thuần trang trí và tính năng ngoài phạm vi để ưu tiên mốc 0, chất lượng mô phỏng, mốc 5 và mốc 6.

## 5. Các rủi ro chính

| Rủi ro | Cách kiểm soát |
| --- | --- |
| Mở rộng quá nhiều hệ điều hành/dịch vụ | Một phiên bản Windows Server, DNS/DHCP/IIS và ba lỗi hệ thống; bốn nhóm không bao gồm toàn bộ Windows Server |
| Nhóm 4 lặp lại lỗi DNS/DHCP/IIS | Dùng ổ dữ liệu, share và dịch vụ mẫu riêng; đánh giá kết quả hệ thống độc lập |
| Kết quả lệnh chỉ là chuỗi trả lời dựng sẵn | Sinh kết quả từ engine và đối chiếu nhiều biến thể không cùng snapshot |
| Agent đọc sẵn đáp án | Tách observation/oracle, kiểm thử payload/log và dùng bộ đánh giá giữ lại |
| Thay đổi cấu hình và Agent đọc lệch trạng thái | Revision trên action/observation và kiểm tra lại khi phiên đã đổi |
| Không đủ nguồn lực thử người dùng | Chốt sớm với giảng viên; giảm độ rộng tính năng trước, không bịa kết quả |
| API tốn chi phí hoặc không ổn định | Mock cho kiểm thử kỹ thuật; budget và đo model thật riêng |
| Kế hoạch làm mất nguyên mẫu đang chạy | Phát triển từng mốc, giữ mã/test cũ và không sửa ngoài phạm vi |
