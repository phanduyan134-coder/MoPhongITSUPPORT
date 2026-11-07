# Đối chiếu hồi quy DNS với lab đã lưu

Chạy từ thư mục dự án:

```powershell
npm run compare:dns
```

Runner đọc lại `output/evidence/windows-dns/D02-reference-20261102-01/`, đối chiếu hash manifest và sáu observation JSON đã ghim, kiểm hash 66 tệp stdout/stderr rồi suy ra kết quả từ đầu ra thật. Nó không dùng tên pha hoặc `nslookup` exit code 0 làm bằng chứng thành công. Thiếu dữ liệu, hash sai hay phép đo không đầy đủ đều gây lỗi, không tự coi là đạt.

Timestamp bắt đầu lệnh phải nằm trong khoảng thu quan sát và thời lượng phải hợp lệ. Đồng hồ Windows guest có thể được hiệu chỉnh trong lúc đo, nên không suy `startedAt + durationMs` thành thời điểm kết thúc chính xác: `durationMs` dùng đồng hồ monotonic, còn timestamp dùng đồng hồ lịch. Runner không đánh giá độ giống nhau về thời gian.

Sau đó runner chạy mô phỏng hiện tại ở ba giai đoạn: bình thường → thao tác dừng DNS → thao tác bật lại DNS. Năm kết quả được so sánh là ping IP, trạng thái DNS, câu trả lời A đúng, HTTP qua tên và HTTP qua IP. Cấu hình không liên quan phải được bảo toàn.

Mỗi lần chạy tạo thư mục mới trong `output/experiments/dns-reference/`, gồm `comparison.json` và báo cáo Markdown. JSON giữ hash nguồn hiện tại, liên kết/hash observation gốc, đầu ra mô phỏng, revision, kết quả từng phép đối chiếu và giới hạn. Không viết lại manifest hoặc pilot cũ.

Đây là **kiểm tra hồi quy mô phỏng với một lượt lab đã thu**, không chạy lại Windows, không gọi AI API và không tự xác nhận toàn bộ pilot hoặc chất lượng AI Agent. Lab dùng IP tĩnh/không gateway, mô phỏng dùng DHCP/gateway `.1`; kết luận chỉ trong phạm vi DNS/IIS cùng LAN đã so sánh. Thông báo, mã thoát, thời gian và nội dung HTML vẫn có khác biệt đã công bố. Kết quả giữ trạng thái `agent-reviewed-awaiting-supervisor` để người thực hiện/giảng viên rà độc lập.

Nếu chuyển dự án sang máy khác, cần sao lưu riêng thư mục bằng chứng trong `output/`; Git không chứa thư mục này. Không có bằng chứng cục bộ thì runner sẽ dừng, không tái tạo hoặc giả lập log Windows thay thế.
