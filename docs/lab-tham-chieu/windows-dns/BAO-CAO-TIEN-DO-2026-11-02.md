# Báo cáo lab Windows DNS — 02/11/2026

**Đã cài hai máy ảo, chạy đủ ba giai đoạn DNS và lưu sáu bộ quan sát thực tế.** Codex đã rà đầu ra; kết quả chờ giảng viên/người thực hiện kiểm tra độc lập trước khi dùng trong khóa luận.

## Đã làm được gì?

- Cài Windows Server 2022 Standard Evaluation Desktop Experience và Windows 11 Enterprise Evaluation trong VirtualBox trên laptop.
- Server `SRV-01`: IP `192.168.10.10/24`, DNS/IIS, zone `lab.test`, A `portal.lab.test → 192.168.10.10`.
- Máy trạm `CLIENT-01`: IP tĩnh `192.168.10.100/24`, DNS `.10`.
- Hai VM dùng Internal Network `SupportLab-DNS`, không gateway, NAT, bridged hoặc card phụ trong lượt đo. Không đặt IP/DNS lab trên Windows laptop.
- Chạy bình thường → dừng DNS trên Server → bật lại DNS; giữ nguyên IP, bản ghi và IIS.
- Giữ raw stdout/stderr, mã thoát, timeout, hash, cấu hình VM, phiên bản Windows và ảnh console.

Lượt đo `D02-reference-20261102-01` diễn ra lúc **21:02:43–21:05:04 ngày 02/11/2026** (Asia/Bangkok). Server build `20348.587`, client build `26300.9457`; RAM trong lượt đo: Server 2 GB, client 4 GB.

## Kết quả dễ hiểu

| Phép kiểm từ máy trạm | Bình thường | DNS dừng | Bật lại DNS |
| --- | --- | --- | --- |
| Ping IP Server | Được, 2/2 | Được, 2/2 | Được, 2/2 |
| Hỏi IP `portal.lab.test` | Trả `.10` | Timeout, không có A | Trả `.10` |
| Truy cập website bằng tên | HTTP 200 | Timeout phân giải | HTTP 200 |
| Truy cập website bằng IP | HTTP 200 | HTTP 200 | HTTP 200 |

DNS đã được bật lại thành công. Kết quả cho thấy lỗi DNS làm truy cập theo tên thất bại dù kết nối LAN và IIS vẫn hoạt động.

## Ảnh chụp kết quả trong máy ảo

Sáu ảnh dưới đây được chụp từ console VirtualBox khi mở lại kết quả đã lưu của lượt đo `D02-reference-20261102-01`. Dòng `RECORDED OBSERVATION` trên ảnh cho biết đây là kết quả của lần đo trước; thời gian chụp ảnh khác thời gian thu kết quả. Ảnh bổ sung cho log gốc, không phải bộ ảnh từng bước cấu hình bằng DNS Manager hoặc một lượt đo trực tiếp mới.

Trong VS Code, nhấn **Ctrl + Shift + V** để mở bản xem trước Markdown và thấy ảnh. Nhấp vào liên kết dưới mỗi ảnh để mở kích thước đầy đủ. Ảnh nằm trong `output/`, được giữ trên laptop và không tự xuất hiện trên GitHub.

### 1. DNS hoạt động bình thường

**Máy chủ:** dịch vụ DNS là `Running`, bản ghi A của `portal` trỏ `192.168.10.10`, IIS là `Started`.

![Máy chủ: kết quả đã lưu khi DNS hoạt động bình thường](../../../output/evidence/windows-dns/D02-reference-20261102-01/healthy-server-recorded.png)

[Mở ảnh máy chủ đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/healthy-server-recorded.png).

**Máy trạm:** ping máy chủ thành công; câu trả lời A của `portal.lab.test` là `.10`; HTTP theo tên và IP đều trả `200 OK`. Cảnh báo `Server: UnKnown`/timeout ban đầu vẫn xuất hiện trước câu trả lời A; xem phần giới hạn bên dưới để hiểu đúng.

![Máy trạm: kết quả đã lưu khi DNS hoạt động bình thường](../../../output/evidence/windows-dns/D02-reference-20261102-01/healthy-client-recorded.png)

[Mở ảnh máy trạm đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/healthy-client-recorded.png).

### 2. Khi dừng dịch vụ DNS

**Máy chủ:** dịch vụ DNS là `Stopped`, IIS vẫn `Started`. Lệnh quản lý không đọc được bản ghi khi dịch vụ dừng; điều này không có nghĩa bản ghi đã bị xóa.

![Máy chủ: kết quả đã lưu khi dịch vụ DNS dừng](../../../output/evidence/windows-dns/D02-reference-20261102-01/dns-stopped-server-recorded.png)

[Mở ảnh máy chủ đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/dns-stopped-server-recorded.png).

**Máy trạm:** ping IP vẫn thành công; DNS timeout; HTTP theo tên thất bại với curl exit `28`; HTTP theo IP vẫn trả `200 OK`. Đây là điểm giúp phân biệt lỗi DNS với lỗi kết nối LAN hoặc IIS.

![Máy trạm: kết quả đã lưu khi DNS dừng, IP vẫn truy cập được](../../../output/evidence/windows-dns/D02-reference-20261102-01/dns-stopped-client-recorded.png)

[Mở ảnh máy trạm đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/dns-stopped-client-recorded.png).

### 3. Sau khi bật lại DNS

**Máy chủ:** dịch vụ trở về `Running`, đọc lại được bản ghi A `.10`, IIS tiếp tục `Started`.

![Máy chủ: kết quả đã lưu sau khi bật lại DNS](../../../output/evidence/windows-dns/D02-reference-20261102-01/restored-server-recorded.png)

[Mở ảnh máy chủ đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/restored-server-recorded.png).

**Máy trạm:** truy vấn A lại trả `.10`; HTTP theo tên và IP đều trở lại `200 OK`.

![Máy trạm: kết quả đã lưu sau khi DNS được khôi phục](../../../output/evidence/windows-dns/D02-reference-20261102-01/restored-client-recorded.png)

[Mở ảnh máy trạm đầy đủ](../../../output/evidence/windows-dns/D02-reference-20261102-01/restored-client-recorded.png).

Hash và thời điểm chụp từng ảnh nằm trong [recorded-screenshots.json](../../../output/evidence/windows-dns/D02-reference-20261102-01/recorded-screenshots.json). Những ảnh `*-console.png` thu lúc chạy ban đầu có thể chỉ hiện màn hình khóa; phần này dùng bộ `*-recorded.png` để bạn đọc được kết quả.

## Đọc và xem bằng chứng ở đâu?

- [Biên bản đối chiếu chi tiết](KET-QUA-DOI-CHIEU-D02-2026-11-02.md): bảng kết quả, sai khác với mô phỏng và giới hạn kết luận.
- Hồ sơ đầy đủ: `output/evidence/windows-dns/D02-reference-20261102-01/`.
- `manifest.json`: thông tin lần thu thập, sáu observations, log chuyển trạng thái và hash.
- `comparison-review.json`: kết luận rà bằng chứng riêng, trạng thái `agent-reviewed-awaiting-supervisor`. Giữ nguyên manifest và JSON pilot cũ.
- `server/<giai-doan>/`, `client/<giai-doan>/`: `observation.json` và đầu ra gốc.
- Ảnh `<giai-doan>-<server|client>-recorded.png`: console guest hiển thị kết quả đã lưu, có nhãn và thời gian; không phải phép đo trực tiếp mới. Metadata/hash ảnh được ghi riêng.
- Máy ảo, ISO và snapshot: `output/labs/windows-dns/`. Toàn bộ `output/` được Git bỏ qua.

Bản cài client ban đầu sai khoảng 20 KiB trước điểm nối tải. Đã giữ nguyên tệp cũ, tạo bản sao và tải lại vùng lỗi từ Microsoft. SHA-256 **toàn bộ ISO sau phục hồi đã khớp Microsoft**; chi tiết ở `output/labs/windows-dns/client-iso-repair.json`. Không cần tiếp tục lượt tải chia phần.

## Những giới hạn cần ghi trong khóa luận

- Lab xác nhận hành vi DNS/IIS cùng LAN cho một ca D02; chưa xác nhận DHCP, định tuyến, mọi tình huống hoặc chất lượng AI Agent.
- Pilot dùng DHCP/gateway `.1`, lab dùng IP tĩnh và không gateway. Không tự đổi toàn bộ pilot thành “đã kiểm chứng”.
- `nslookup` có thể exit 0 dù timeout. Cảnh báo `Server: UnKnown` ban đầu còn xuất hiện khi truy vấn A thành công; đọc phần trả lời và log Server.
- HTTP lỗi thực là curl exit 28 (timeout phân giải), khác thông báo đơn giản của mô phỏng. Nội dung trang IIS mặc định cũng khác HTML mẫu.
- Client Evaluation đang báo `LicenseStatus=5`, `GracePeriodRemaining=0` trước lượt đo. Cần xử lý kích hoạt/giấy phép hợp lệ trước các đợt thử dài hạn; không bỏ qua hoặc che watermark. Trạng thái được giữ ở `client-setup/post-installation.txt`.

## Khi muốn mở lại lab

Khi kết thúc lượt đo, đã **tắt hoàn toàn hai VM để trả RAM cho laptop**. Mỗi VM có snapshot `dns-reference-complete-20261102`, lưu sau khi đã bật lại DNS. Đã tháo đĩa cài đặt ảo và tắt tự đăng nhập. Trạng thái tại thời điểm kết thúc cùng UUID snapshot được ghi ở `output/labs/windows-dns/final-lab-state.json`; việc bạn mở lại VM sau đó sẽ thay đổi trạng thái đang chạy.

Mở VirtualBox và khởi động `SupportLab-SRV-01`, `SupportLab-CLIENT-01`. Đăng nhập tài khoản `Administrator`; mật khẩu VM riêng nằm trong `output/labs/windows-dns/private/<server|client>/guest-password.txt`, không gửi thư mục này lên GitHub hoặc chia sẻ công khai.

`portal.lab.test` thuộc mạng riêng của hai VM; hãy truy cập bên trong máy trạm. Web mô phỏng của đề tài vẫn chạy riêng và không cần bật VM mỗi lần sử dụng.

Bước tiếp theo cho phần nghiên cứu là đọc biên bản cùng giảng viên, thống nhất phạm vi đã kiểm chứng và chọn ca tham chiếu tiếp theo.
