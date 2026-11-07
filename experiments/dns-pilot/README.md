# Pilot DNS: kiểm tra luồng mô phỏng ngoại tuyến

## 1. Mục đích và trạng thái

Pilot này chuẩn bị một luồng nhỏ để đối chiếu yêu cầu của giảng viên: quan sát triệu chứng, thao tác sửa trong mô phỏng, rồi kiểm tra lại trên trạng thái mới. Đây là **bộ ca phát triển (development fixtures)**, không phải bộ kiểm thử độc lập giữ kín (held-out).

Chương trình chạy các **thao tác tham chiếu viết tay** cho từng ca. Nó không tự suy luận nguyên nhân, không gọi AI, không chạy Windows Server thật và không thực hiện nghiên cứu người dùng. Kết quả đạt chỉ cho biết mô hình hoạt động phù hợp với các kiểm tra đã khai báo; không chứng minh mô phỏng sát thực tế hay Agent chẩn đoán chính xác.

Trạng thái đối chiếu thực tế: **`pending-lab`**. Cần hoàn thành phiếu lab ở mục 7 trước khi sử dụng ca làm bằng chứng về tính đúng với Windows Server.

## 2. Cách chạy

Tại thư mục gốc dự án, sau khi đã cài các dependency:

```powershell
npm run pilot:dns
```

Chạy riêng một ca:

```powershell
npm run pilot:dns -- --case D02
```

Lệnh chạy trên engine mô phỏng cục bộ, không cần mở Web, khóa API hoặc kết nối tới model. Không đọc hoặc đưa nội dung `.env` vào báo cáo. Việc cài dependency ban đầu có thể cần mạng; bản thân pilot không phải kiểm tra mạng thật.

Mỗi lần chạy tạo một thư mục batch riêng dưới:

```text
output/experiments/dns-pilot/
```

CLI in đường dẫn kết quả thực tế. Thư mục đầu ra bị Git bỏ qua; không xem việc tồn tại mã runner trong repository là bằng chứng đã có kết quả chạy. Muốn chia sẻ dữ liệu nghiên cứu cần chọn bản báo cáo đã rà soát, ẩn thông tin cần bảo vệ và quản lý phiên bản riêng.

## 3. Các tệp

| Tệp | Vai trò |
| --- | --- |
| `cases.ts` | Năm trạng thái đầu vào và thao tác tham chiếu phục vụ phát triển. |
| `oracle.ts` | Kiểm tra trạng thái cuối theo cấu hình chuẩn và các thuộc tính cần giữ nguyên. |
| `run.ts` | Chạy chẩn đoán, thao tác, xác minh mới và ghi bản ghi đầy đủ. |
| `../../scripts/dns-pilot.ts` | Điểm vào CLI, chọn ca và tạo thư mục kết quả. |

Oracle chỉ nhập kiểu dữ liệu từ engine và kiểm tra trực tiếp trạng thái, không gọi lại hàm chẩn đoán của engine để quyết định đúng/sai. Cách tách này giảm việc dùng chính cùng một hàm để vừa tạo vừa chấm kết quả, nhưng **chưa tạo thành oracle thực nghiệm độc lập**: các giả định vẫn do nhóm phát triển xây dựng và chưa được lab xác nhận.

## 4. Năm ca phát triển

Cấu hình chuẩn của pilot: DNS/Web Server `SRV-01` tại `192.168.10.10`, bản ghi A `portal.lab.test` trỏ về `192.168.10.10`, máy trạm dùng DNS `192.168.10.10`. Các thành phần còn lại bắt đầu ở trạng thái chuẩn để khoanh vùng từng thay đổi.

| Ca | Trạng thái riêng của fixture | Thao tác tham chiếu | Điều cần xác minh |
| --- | --- | --- | --- |
| D01 | Trạng thái chuẩn, không cài lỗi. | Không sửa. | Phân giải và HTTP theo tên đã hoạt động; trạng thái không bị thay đổi. |
| D02 | Dịch vụ DNS dừng. | Khởi động đúng dịch vụ DNS. | Dịch vụ chạy, phân giải mới và HTTP theo tên thành công. |
| D03 | Bản ghi A trỏ sai tới `192.168.10.99`. | Sửa A về `192.168.10.10`. | Địa chỉ trả về đúng, truy cập lại theo tên thành công. |
| D04 | Chỉ DNS hiện tại trên máy trạm sai thành `192.168.10.254`; tùy chọn DNS của DHCP vẫn đúng là `192.168.10.10`. | Gia hạn cấu hình DHCP hoặc đặt lại DNS máy trạm đúng theo phương án được chọn trong fixture. | Không sửa tùy chọn DHCP vốn đúng; máy trạm dùng lại DNS chuẩn. |
| D05 | Liên kết mạng máy trạm bị ngắt. | Khôi phục liên kết. | Kết nối phục hồi, phân giải mới và HTTP theo tên thành công. |

Thông báo dành cho người tham gia giống nhau và trung tính, không tiết lộ ca hay nguyên nhân. `getDnsPilotParticipantInput` chỉ trả về thông báo và bản sao trạng thái ban đầu; không đưa ID, nguyên nhân, oracle hoặc thao tác tham chiếu vào đầu vào đó.

Runner hiện biết trước ca và phương án sửa, nên **không dùng tỷ lệ hoàn tất của runner làm độ chính xác chẩn đoán**. Tệp kết quả và định nghĩa fixture có thông tin đáp án dành cho người phát triển; khi thiết kế thực nghiệm Agent/người dùng phải tách chúng khỏi đầu vào của đối tượng được đánh giá. Toàn bộ trạng thái được cung cấp cũng không thay thế yêu cầu Agent thực sự sử dụng công cụ trong một thực nghiệm riêng.

## 5. Đọc kết quả

Mỗi bản ghi cần được đọc cùng các phần sau:

- `runId`, thời điểm, thời lượng và phiên bản nguồn trong manifest.
- Snapshot đầu/cuối, revision và toàn bộ đầu vào/đầu ra của chẩn đoán, thao tác.
- Kiểm tra an toàn của từng thao tác và các cấu hình không được thay đổi ngoài mục tiêu.
- Kết quả oracle kiểm tra trạng thái trực tiếp, cùng trạng thái đối chiếu `pending-lab`.
- Kết quả phân giải DNS mặc định của máy trạm và HTTP theo tên **được chạy lại sau thao tác sửa**, tại revision tương ứng.

Các chẩn đoán trước khi sửa giúp mô tả triệu chứng, không phải bằng chứng đã khắc phục. Thành công của lệnh sửa cũng chưa đủ: phải xem kiểm tra mới và trạng thái cuối. D01 là đối chứng không cần sửa; không nên tạo một thay đổi chỉ để báo cáo có hành động.

Các kiểm tra bảo toàn giúp phát hiện sửa quá mức, chẳng hạn đổi DHCP khi chỉ DNS hiện tại của máy trạm sai. Chúng chỉ kiểm tra những bất biến đã khai báo, không bao phủ toàn bộ rủi ro của Windows thật. Rubric pilot hiện bảo thủ: làm gián đoạn một thành phần vốn đang hoạt động sẽ không đạt kiểm tra bảo toàn, kể cả sau đó khôi phục. Đây là ràng buộc của bộ ca, không phải kết luận rằng mọi thao tác restart trong thực tế đều sai hoặc nguy hiểm.

`DnsTrace` trong đầu ra là telemetry do engine mô phỏng tạo ra. Nó **không phải bản bắt gói, lưu lượng DNS thật hoặc bằng chứng `nslookup` trên Windows**. Tương tự, đầu ra lệnh mô phỏng không chứng minh lệnh đã được thực thi trên hệ điều hành.

Không diễn giải các kết quả này thành:

- Chất lượng chẩn đoán hay độ an toàn của model AI.
- Kết quả gọi công cụ/truy xuất tri thức của Agent thật.
- Độ trung thực với một phiên bản Windows Server cụ thể.
- Hiệu quả học tập, thời gian xử lý của người dùng hoặc kết quả nghiên cứu đã hoàn thành.

## 6. Tái lập và giới hạn

Manifest ghi hash của các tệp nguồn liên quan, phiên bản ca/oracle/runner và thông tin Git commit/trạng thái dirty nếu đọc được. Đối chiếu các giá trị này trước khi so sánh hai lần chạy. Commit giống nhau nhưng working tree dirty vẫn có thể tạo hành vi khác; hash giúp nhận diện phần nguồn đã khai báo, không thay thế bản lưu đầy đủ của môi trường.

Để tái lập cần giữ phiên bản Node/npm, lockfile, nguồn tương ứng và cấu hình ca. Timestamp, run ID, thời lượng và thông tin máy có thể khác; so sánh quan sát cùng các điều kiện kiểm tra, không yêu cầu toàn bộ JSON giống từng byte. Hash cũng không chứng minh nguồn đúng với Windows, không chứng minh được tác giả hay lab đã thực hiện.

Nếu nguồn thay đổi sau khi tạo báo cáo, không coi báo cáo cũ là kết quả của nguồn mới. Khi chốt thực nghiệm, cần đóng băng một phiên bản, xác nhận các nguồn được manifest bao phủ, bổ sung thông tin môi trường còn thiếu và lưu kết quả với phiên bản đó.

## 7. Phiếu đối chiếu lab thực

Mẫu dưới đây **chưa được thực hiện**. Nhân một phiếu cho từng ca D01–D05; không điền kết quả dự kiến vào ô kết quả thực tế. Giữ cả khác biệt tìm thấy để chỉnh mô hình hoặc thu hẹp phát biểu nghiên cứu.

| Hạng mục | Nội dung ghi nhận |
| --- | --- |
| Mã ca và phiên bản fixture/oracle | Chưa thực hiện. |
| OS, edition và build của server/client | Chưa thực hiện. |
| Phiên bản hypervisor, cấu hình VM và snapshot | Chưa thực hiện. |
| Topology, IP/prefix, gateway, DNS và DHCP options | Chưa thực hiện. |
| Role/service, zone/record và IIS binding sử dụng | Chưa thực hiện. |
| Phiên bản nguồn mô phỏng, hash/commit, run ID đối chiếu | Chưa thực hiện. |
| URL tài liệu tham chiếu và mục được sử dụng | Chưa đọc/xác nhận cho ca lab. |
| Ngày rà soát tài liệu | Chưa thực hiện. |
| Trạng thái và quan sát trước thao tác, kèm lệnh/đầu ra | Chưa thực hiện. |
| Thao tác thực tế, thứ tự, quyền thực thi và tác động | Chưa thực hiện. |
| Quan sát sau thao tác: DNS mặc định, địa chỉ trả về, HTTP theo tên | Chưa thực hiện. |
| Bằng chứng lưu kèm: log, ảnh hoặc bản ghi lệnh đã ẩn thông tin nhạy cảm | Chưa thực hiện. |
| Khác biệt so với simulator và cách xử lý | Chưa thực hiện. |
| Người thực hiện, người rà soát và ngày rà soát | Chưa thực hiện. |
| Kết luận và giới hạn được chấp nhận | Chưa thực hiện; `pending-lab`. |

Các URL Microsoft dưới đây được dùng lại từ [kho tri thức của dự án](../../src/lib/system-knowledge.ts), là điểm bắt đầu tìm tài liệu, **chưa phải xác nhận đã kiểm chứng ca với phiên bản OS cụ thể**:

- [Khắc phục sự cố DNS Server](https://learn.microsoft.com/en-us/windows-server/networking/dns/troubleshoot/troubleshoot-dns-server).
- [Triển khai DHCP Server](https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-deploy-wps).
- [Quản lý IIS](https://learn.microsoft.com/en-us/iis/manage/).
- [Công cụ ping](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping).

Lab phải dùng VM/mạng cô lập, phần mềm có quyền sử dụng phù hợp và snapshot khôi phục. Không cài lỗi lên máy đang vận hành hay mạng khách hàng; không dùng dữ liệu doanh nghiệp thật. Không xuất khóa API, `.env`, tài khoản hay thông tin cá nhân vào báo cáo.

## 8. Công việc tiếp theo cần thống nhất

1. Xác nhận với giảng viên cấu hình lab, nguồn lực/giấy phép, phạm vi khẳng định và người rà soát.
2. Thực hiện đối chiếu D01–D05, ghi khác biệt và cập nhật fixture/oracle theo bằng chứng; giữ lịch sử phiên bản.
3. Thiết kế riêng bộ đánh giá Agent, gồm dữ liệu phát triển/held-out, tiêu chí chẩn đoán/an toàn, log công cụ đầy đủ và phân biệt model thật với fallback. Xác nhận model, API và ngân sách trước khi chạy.
4. Thống nhất thiết kế nghiên cứu người dùng, sự đồng thuận, ẩn danh, điều kiện so sánh và quy mô mẫu với giảng viên trước khi tuyển người tham gia.

Xem [bản đối chiếu yêu cầu giảng viên](../../docs/ke-hoach-chinh-sua/07-doi-chieu-yeu-cau-giang-vien.md) và [kế hoạch thực nghiệm](../../docs/ke-hoach-chinh-sua/05-ke-hoach-thuc-nghiem.md). Pilot này chuẩn bị nền tảng ghi nhận, chưa hoàn tất các yêu cầu thực nghiệm trong hai tài liệu đó.

## 9. Kiểm tra kỹ thuật ban đầu

Ngày 24/10/2026, CLI đã chạy đủ D01–D05 và cả năm đạt các kiểm tra đã khai báo. Bộ kiểm thử tự động liên quan đến pilot có 17 test; toàn dự án có 148 test đạt. Đây là bằng chứng hồi quy của phiên bản đang phát triển, không phải năm ca đã được kiểm chứng trên Windows Server hay năm lần Agent chẩn đoán đúng.

Báo cáo JSON cục bộ được tạo tại `output/experiments/dns-pilot/2026-10-24T16-18-13-056Z-29f930b6/`. Chạy lại lệnh để tạo batch mới thay vì dùng kết quả này cho một bản mã khác. Phiếu lab mục 7 vẫn chưa được thực hiện.
