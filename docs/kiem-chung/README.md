# Kế hoạch kiểm chứng mô phỏng và AI Agent

Tài liệu này mô tả bộ kiểm chứng lặp lại cho nền tảng mô phỏng. Mỗi ca kiểm thử cần lưu trạng thái trước thao tác, thao tác người học thực hiện, trạng thái sau thao tác, kết quả kiểm tra và phản hồi của AI Agent.

## Nguyên tắc

- Kiểm chứng bằng dữ liệu và quy tắc của máy ảo mô phỏng; không coi kết quả này là bằng chứng Windows Server thật.
- Mỗi thay đổi cấu hình phải làm thay đổi trạng thái và kết quả kiểm tra tương ứng.
- AI Agent chỉ được kết luận dựa trên trạng thái mô phỏng và kết quả công cụ đã nhận; câu trả lời cần nêu nguyên nhân, bước kiểm tra và cách khắc phục.
- Dữ liệu bằng chứng không lưu mật khẩu, API key, token hoặc thông tin cá nhân.

## Ma trận ca kiểm thử tối thiểu

| Nhóm | Ca đúng | Ca lỗi | Kỳ vọng khôi phục |
|---|---|---|---|
| DNS/DHCP | `portal.lab.test` phân giải đúng; máy trạm nhận lease | Dừng DNS hoặc DHCP; truy vấn/lease thất bại | Bật dịch vụ, renew lease, kết quả trở lại đúng |
| Web Server | HTTP/HTTPS trả về trang mô phỏng | Dừng dịch vụ hoặc sai cổng | Khởi động dịch vụ/sửa cổng, kiểm tra lại thành công |
| Kết nối mạng | IP, gateway, DNS hợp lệ; ping/resolve thành công | Sai IP/gateway/DNS hoặc mất kết nối | Sửa cấu hình, kiểm tra lại từng lớp |
| Windows/Linux | Dịch vụ và quyền truy cập hợp lệ | Dịch vụ dừng, thiếu quyền hoặc thiếu dung lượng | Khởi động/sửa quyền/dọn dung lượng, kiểm tra lại |

## Mẫu bằng chứng

```json
{
  "scenarioId": "dns-service-stopped",
  "before": {"dnsService": "running", "record": "portal.lab.test -> 192.168.10.10"},
  "action": "stop_dns",
  "after": {"dnsService": "stopped", "query": "failed"},
  "expected": "query fails while DNS is stopped",
  "actual": "",
  "aiAgent": {"diagnosis": "", "checks": [], "repair": [], "groundedInState": true},
  "passed": false,
  "timestamp": ""
}
```

Khi chạy thật, thay các trường rỗng bằng kết quả tự động từ ứng dụng; lưu file JSON vào `output/evidence/` và báo cáo diễn giải vào `docs/`.
