# Kế hoạch kiểm chứng mô phỏng và AI Agent

Tài liệu này mô tả bộ kiểm chứng lặp lại cho nền tảng mô phỏng. Mỗi ca kiểm thử cần lưu trạng thái trước thao tác, thao tác người học thực hiện, trạng thái sau thao tác, kết quả kiểm tra và phản hồi của AI Agent.

## Tài liệu và trạng thái hiện tại

- [Ma trận chấp nhận bốn nhóm mô phỏng](ma-tran-chap-nhan.md): thao tác, phép kiểm sau sửa và cấu hình cần bảo toàn.
- [Tiêu chí đánh giá AI Agent](danh-gia-agent.md): chẩn đoán, chọn công cụ, truy xuất tri thức, hướng dẫn và xác minh.
- [Phiếu đối chiếu lab Windows Server/Client](phieu-doi-chieu-lab.md): ghi cấu hình, quan sát thực tế và khác biệt với mô phỏng.

Ca D02 đã có [báo cáo đối chiếu DNS/IIS cùng LAN với hai máy ảo](../lab-tham-chieu/windows-dns/KET-QUA-DOI-CHIEU-D02-2026-11-02.md), ở ba giai đoạn bình thường, DNS dừng và DNS khôi phục. Kết quả đang chờ giảng viên/người thực hiện rà độc lập. Các ca và nhóm còn lại chưa được đối chiếu đầy đủ với Windows Server thật; chưa có kết quả đánh giá model AI thật hoặc thực nghiệm hiệu quả hỗ trợ người dùng.

## Nguyên tắc

- Tách kết quả kiểm thử mô hình trạng thái trên Web, kết quả lab Windows trong máy ảo, đánh giá model AI và thực nghiệm người dùng; mỗi loại chỉ hỗ trợ kết luận trong phạm vi đã đo.
- Khi người dùng áp dụng thay đổi cấu hình, trạng thái được cập nhật; kết quả kiểm tra phải phản ánh phần bị tác động, đồng thời giữ các thành phần không liên quan. Thay đổi bản nháp chưa tính là áp dụng cấu hình.
- Chạy lại phép kiểm sau sửa; kết quả ở revision cũ không xác nhận cấu hình hiện tại đã hoạt động.
- AI Agent chỉ được kết luận dựa trên trạng thái mô phỏng và kết quả công cụ đã nhận; câu trả lời cần nêu nguyên nhân, bước kiểm tra và cách khắc phục.
- Phản hồi theo quy tắc cục bộ, hướng dẫn focus và model AI được ghi riêng; không dùng kết quả local để báo độ chính xác của model.
- Dữ liệu bằng chứng không lưu mật khẩu, API key, token hoặc thông tin cá nhân.

## Ma trận ca kiểm thử tối thiểu

| Nhóm | Ca đúng | Ca lỗi | Kỳ vọng khôi phục |
|---|---|---|---|
| DNS/DHCP | `portal.lab.test` phân giải đúng; máy trạm nhận lease hợp lệ | DNS dừng làm truy vấn thất bại; DHCP dừng trong ca máy trạm không có lease hợp lệ làm renew thất bại | Bật dịch vụ tương ứng; tra DNS lại hoặc renew lease rồi kiểm tra cấu hình mới |
| Web Server IIS | HTTP trả về trang mô phỏng | Dừng website/application pool hoặc sai cổng binding | Khởi động đúng thành phần/sửa cổng, kiểm tra HTTP mới thành công |
| Kết nối mạng | IP, gateway, DNS hợp lệ; ping/resolve thành công | Sai IP/gateway/DNS hoặc mất kết nối | Sửa cấu hình, kiểm tra lại từng lớp |
| Windows Server | Dịch vụ và quyền truy cập hợp lệ; đủ dung lượng ghi | Dịch vụ dừng, thiếu quyền hoặc thiếu dung lượng | Khởi động/sửa quyền/dọn tệp được phép, kiểm tra lại |

Máy trạm đang giữ lease DHCP còn hiệu lực có thể tiếp tục dùng địa chỉ khi dịch vụ DHCP dừng; dừng dịch vụ không tự thu hồi lease đó. Phạm vi hiện tại chỉ có HTTP và một số lỗi Windows Server; HTTPS và Linux chưa được triển khai.

## Ví dụ khái niệm về bằng chứng

JSON dưới đây chỉ minh họa các thông tin cần thu, **không phải kết quả đã đo hoặc schema của tệp xuất từ ứng dụng**. Cấu trúc xuất thực tế được định nghĩa tại [system-evidence.ts](../../src/lib/system-evidence.ts), với trạng thái đầu/cuối, nhật ký thao tác/chẩn đoán, trace Agent, revision và thông tin lược bỏ do giới hạn lưu trữ.

```json
{
  "scenarioId": "dns-service-stopped",
  "before": {"dnsService": "running", "record": "portal.lab.test -> 192.168.10.10"},
  "action": "stop_dns",
  "after": {"dnsService": "stopped", "query": "failed"},
  "expected": "query fails while DNS is stopped",
  "actual": "",
  "aiAgent": {"diagnosis": "", "checks": [], "repair": [], "groundedInState": null},
  "passed": false,
  "timestamp": ""
}
```

Khi thực hiện một phiên trên Web, dùng **Xuất hồ sơ phiên** để lấy JSON do ứng dụng ghi nhận, lưu nguyên tệp vào `output/evidence/`. Viết nhận xét, đối chiếu và kết luận trong báo cáo riêng ở `docs/`; không sửa tệp đầu ra để điền kết quả kỳ vọng hoặc làm bằng chứng khớp mẫu. Thư mục `output/` không được đẩy lên GitHub; báo cáo cần ghi rõ dữ liệu gốc nào chỉ có ở máy cục bộ.
