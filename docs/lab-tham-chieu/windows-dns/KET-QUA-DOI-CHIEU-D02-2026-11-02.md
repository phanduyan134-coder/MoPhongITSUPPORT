# Đối chiếu D02: dịch vụ DNS dừng và khôi phục

**Trạng thái: `agent-reviewed-awaiting-supervisor` — Codex đã rà bằng chứng, đang chờ giảng viên/người thực hiện kiểm tra độc lập.** Kết quả hỗ trợ hành vi cốt lõi của ca DNS này trong phạm vi đã đo; chưa xác nhận toàn bộ pilot hoặc chất lượng AI Agent.

## Lần thực hiện và bằng chứng

Lượt `D02-reference-20261102-01` được Codex điều khiển bằng VirtualBox `guestcontrol`, chạy lệnh trong hai guest. Thời gian điều phối: **21:02:43–21:05:04 ngày 02/11/2026**, múi giờ Asia/Bangkok (UTC: `14:02:43–14:05:04Z`). Đây là thực nghiệm Windows trong máy ảo trên laptop; lệnh IP/DNS/dịch vụ của lab chạy trong guest.

| Thành phần | Cấu hình đã ghi |
| --- | --- |
| Máy chủ | `SRV-01`, Windows Server 2022 Standard Evaluation Desktop Experience, build `20348.587`, IP `192.168.10.10/24` |
| Máy trạm | `CLIENT-01`, Windows 11 Enterprise Evaluation, build `26300.9457`, IP tĩnh `192.168.10.100/24` |
| Mạng | VirtualBox 7.2.22r175245; Internal Network `SupportLab-DNS`; DNS hai guest là `.10`, không gateway |
| DNS/IIS | A `portal.lab.test → 192.168.10.10`; IIS Default Web Site, binding `*:80:` |

Có đủ **sáu quan sát**: hai guest ở ba giai đoạn. IP/DNS giữ nguyên, không có IPv4 default route hoặc bản ghi hosts cho portal. Đã kiểm tra **66 hash stdout/stderr và 56 hash log/ảnh/nguồn script**, không có sai lệch. Điều phối xác nhận DNS được bật lại; manifest không ghi lỗi.

- [Manifest gốc](../../../output/evidence/windows-dns/D02-reference-20261102-01/manifest.json), giữ trạng thái `collected-not-reviewed`.
- [Biên bản rà riêng dạng JSON](../../../output/evidence/windows-dns/D02-reference-20261102-01/comparison-review.json), có hash từng observation, nguồn script và kết luận.
- Protocol: `windows-dns-d02-capture-v2`; hash nguồn đầy đủ nằm trong JSON và manifest.

SHA-256 manifest: `854995681c850f51e3a9f5d156c621e02904e8e7d72549036b3b95278ac211f1`.

Sau khi xuất bằng chứng, đã tắt cả hai VM và tạo snapshot `dns-reference-complete-20261102` cho từng máy; snapshot Server là `7477642f-0bc8-47cd-ad07-a697401e1e5c`, client là `af386442-7919-4369-9676-b192c2cce47c`. Đĩa cài đặt đã tháo. Hồ sơ cuối: `output/labs/windows-dns/final-lab-state.json`; đây là trạng thái sau lượt đo, không thay thế sáu quan sát gốc.

## Kết quả quan sát

| Phép kiểm | Bình thường | DNS dừng | DNS khôi phục |
| --- | --- | --- | --- |
| `Get-Service DNS` trên Server | Running | Stopped | Running |
| Ping IP máy chủ từ client | Nhận 2/2 | Nhận 2/2 | Nhận 2/2 |
| Truy vấn A, DNS mặc định | Trả `.10` | Không có A; timeout | Trả `.10` |
| Truy vấn A, chỉ định DNS `.10` | Trả `.10` | Không có A; timeout | Trả `.10` |
| HTTP theo tên, sau xóa cache | HTTP 200 | Lỗi phân giải; curl exit 28 | HTTP 200 |
| HTTP theo IP | HTTP 200 | HTTP 200 | HTTP 200 |
| IIS site/binding | Started, `*:80:` | Started, `*:80:` | Started, `*:80:` |

Như vậy, khi DNS dừng, kết nối LAN và website qua IP vẫn hoạt động, còn truy cập theo tên thất bại. Bật lại DNS khôi phục câu trả lời A và HTTP theo tên. Phép kiểm theo IP giúp phân biệt ảnh hưởng của DNS với sự cố IIS.

## Các điểm cần hiểu đúng

- **`nslookup` vẫn trả exit code 0 khi truy vấn timeout.** Cả hai truy vấn ở pha DNS dừng đều không có khối trả lời A và ghi timeout; phải đọc stdout/stderr cùng trạng thái dịch vụ, không chỉ xem mã thoát.
- Pha bình thường và khôi phục đều có timeout 2 giây ban đầu, `Server: UnKnown`, rồi trả A đúng. Lab chưa tạo reverse zone/PTR cho địa chỉ DNS; cảnh báo tìm tên resolver khác với kết quả truy vấn A của portal.
- HTTP theo tên khi DNS dừng có `curl: (28) Resolving timed out after 5000 milliseconds`. Tiến trình tự kết thúc theo giới hạn curl; trường `timedOut` của công cụ thu thập là false. Mô phỏng báo “Could not resolve host” với thông báo DNS đơn giản hơn: cùng nhóm lỗi, khác chuỗi, mã và thời gian.
- `Get-DnsServerResourceRecord` exit 1 khi DNS dừng, báo không lấy được thông tin zone; sau khôi phục đọc lại A `.10` bình thường. Lỗi truy vấn quản lý này chưa chứng minh bản ghi bị xóa.
- IIS thực trả trang mặc định 703 byte; mô phỏng trả nội dung mẫu SupportLab. Lần này đối chiếu trạng thái HTTP và khả năng truy cập, không yêu cầu HTML/header giống từng byte.

## Liên hệ với pilot D02

Artifact gốc: [D02.json](../../../output/experiments/dns-pilot/2026-10-30T16-38-59-363Z-7e70039a/D02.json); run ID `8c8bb5a6-f551-4e11-a06a-07c3c9f62d2c`; SHA-256:

`0da98c0daaba4c6cf5bb676180b11729500ce67a59da14b20d9f8b734d732cfe`.

| Pha thực tế | Journal D02 tương ứng |
| --- | --- |
| `healthy` | Baseline bổ sung, không phải pha có sẵn của journal |
| `dns-stopped` | `before`, sequence 1–5: IP, ping, DNS, dịch vụ, HTTP |
| Bật DNS | Action sequence 6: `service.toggle`, DNS = true |
| `restored` | `after`, sequence 7–11: cùng bộ phép kiểm |

Bảy hash nguồn mô phỏng hiện tại khớp các hash đã ghi trong D02 tại thời điểm rà. JSON pilot vẫn giữ `pending-lab`; biên bản riêng này liên kết bằng đường dẫn/hash thay vì viết lại lịch sử.

Pilot dùng DHCP và gateway `192.168.10.1`; lab này dùng IP tĩnh, không DHCP/gateway. Vì vậy, kết quả chỉ hỗ trợ phần **DNS/IIS cùng LAN** đã quan sát, chưa xác nhận DHCP lease, định tuyến, bảo toàn mọi trạng thái hay toàn bộ `stateOracle`. HTTP theo IP, truy vấn chỉ định resolver, xóa cache và baseline là các phép kiểm bổ sung của lab.

## Ảnh và giới hạn kết luận

Các ảnh `*-console.png` trong manifest là ảnh console thật, nhưng được ghi rõ không chứng minh nội dung lệnh; có thể chỉ hiển thị màn hình khóa. Đã bổ sung đủ sáu ảnh `<healthy|dns-stopped|restored>-<server|client>-recorded.png`, **hiển thị kết quả đã lưu của từng pha**, không phải lượt đo trực tiếp mới. Metadata/hash ảnh ở [recorded-screenshots.json](../../../output/evidence/windows-dns/D02-reference-20261102-01/recorded-screenshots.json); viewer kiểm hash raw và chỉ ẩn XML progress khi trình bày. Raw files được giữ nguyên.

Trước lượt đo, client Evaluation báo `LicenseStatus=5`, `GracePeriodRemaining=0` và hiện watermark; bản ISO dùng để cài đã khớp SHA-256 Microsoft. Phép đo ngắn đã hoàn thành, nhưng cần giải quyết kích hoạt/giấy phép hợp lệ trước các đợt thử dài hạn; trạng thái ghi ở `output/labs/windows-dns/client-setup/post-installation.txt`.

Đây là một ca lỗi trên một cặp phiên bản Windows. Chưa đánh giá AI Agent, hiệu quả học tập, các nhóm tình huống khác hoặc độ giống nhau về thời gian thực thi. Cần giảng viên/người thực hiện rà độc lập trước khi dùng kết luận trong khóa luận.

