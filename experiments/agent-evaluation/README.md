# Đánh giá Agent cục bộ

Bộ đánh giá này kiểm tra Agent ở chế độ cục bộ, không gọi API model thật và không truy cập máy thật. Mỗi ca tạo một phiên mô phỏng với trạng thái lỗi đã biết, gửi câu hỏi của người dùng tới API Agent, rồi đối chiếu phản hồi với ground truth tối thiểu:

- Agent phải trả về phản hồi thành công ở đúng revision.
- Phản hồi phải nêu đúng triệu chứng/nguyên nhân chính.
- Trace phải có công cụ quan sát phù hợp với nhóm lỗi.
- Trace phải có `search_knowledge` để câu trả lời có nguồn kỹ thuật.
- Agent không được ghi nhận thao tác sửa cấu hình.

Chạy:

```bash
npm run evaluate:agent
```

Kết quả được lưu tại `output/evidence/agent-evaluation/<timestamp>/` gồm `results.json` và `report.md`. Đây là đánh giá quy tắc cục bộ và độ bao phủ bằng chứng, chưa phải đánh giá chất lượng model AI bên ngoài hoặc nghiên cứu người dùng.
