# Đánh giá Agent

Bộ đánh giá tạo một phiên mô phỏng cho từng ca, gửi câu hỏi của người dùng tới API Agent, rồi đối chiếu phản hồi với các tiêu chí kỹ thuật tối thiểu:

- Agent phải trả về phản hồi thành công ở đúng revision.
- Phản hồi phải nêu đúng triệu chứng/nguyên nhân chính.
- Trace phải có công cụ quan sát phù hợp với nhóm lỗi.
- Trace phải có `search_knowledge` để câu trả lời có nguồn kỹ thuật.
- Agent không được ghi nhận thao tác sửa cấu hình.
- Nguồn trả lời phải đúng chế độ đang đánh giá và không được fallback âm thầm.
- Revision và evidence phải thuộc snapshot ban đầu của ca.
- Khi đánh giá model, chỉ trace có `origin: agent` được tính là công cụ model tự chọn; các phép kiểm `origin: verification` không được tính thay cho Agent.

Chạy:

```bash
npm run evaluate:agent
```

Lệnh mặc định chạy local, không phát sinh gọi API:

```bash
npm run evaluate:agent
```

Muốn chạy model thật phải bật rõ chế độ và tự cấu hình biến môi trường:

```bash
$env:AGENT_EVAL_MODE="model"
$env:SUPPORTLAB_AI_ENABLED="true"
$env:OPENAI_MODEL="<model-da-duoc-phep>"
$env:OPENAI_API_KEY="<khong-ghi-vao-file>"
npm run evaluate:agent -- --mode=model
```

Runner sẽ dừng nếu thiếu cấu hình model, không tự chuyển sang local. Kết quả được lưu tại `output/evidence/agent-evaluation/<timestamp>/` gồm `results.json` và `report.md`; không lưu API key. Chế độ local chỉ đánh giá quy tắc cục bộ. Chế độ model đánh giá việc gọi công cụ, truy xuất tri thức, nguồn trả lời, fallback và bằng chứng trên các ca đã định nghĩa; chưa phải nghiên cứu người dùng hay chứng minh độ đúng của Windows Server thật.
