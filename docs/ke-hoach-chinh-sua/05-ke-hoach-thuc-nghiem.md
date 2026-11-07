# 05. Kế hoạch thực nghiệm

Trạng thái: thiết kế dự kiến, chưa có kết quả đo. Cỡ mẫu, số ca chính thức, số lần lặp và ngưỡng nghiệm thu phải được thống nhất trước đợt đánh giá chính thức.

## 1. Tách ba loại đánh giá

| Loại | Câu hỏi | Không được dùng để thay thế |
| --- | --- | --- |
| Độ đúng mô phỏng | Hành vi trong phạm vi chọn có phù hợp tham chiếu không? | Chỉ có unit test tự viết từ cùng logic engine |
| Chất lượng Agent | Chẩn đoán và đề xuất có đúng, khả thi, an toàn, có bằng chứng không? | Chỉ có một cuộc chat demo hoặc test mock |
| Hiệu quả hỗ trợ người dùng | Agent có giúp xử lý tốt hơn hướng dẫn cố định không? | Chỉ có số lượt tool call hoặc Agent tự nhận thành công |

## 2. Đánh giá độ đúng mô phỏng

### Chuẩn đối chiếu

- Dùng tài liệu chính thức đúng phiên bản và phòng lab Windows Server/client để đối chiếu các hành vi trọng yếu; phần chưa đối chiếu thực tế phải được gắn nhãn rõ.
- Lab Windows Server tham chiếu cần tuân thủ giấy phép/điều kiện bản đánh giá hợp lệ. Không đóng gói ISO, khóa sản phẩm hoặc dữ liệu máy thật vào repository.
- Chọn các hành vi quan trọng để đối chiếu thực tế, không cần đưa VM vào sản phẩm.
- Với mỗi ca, lưu trạng thái trước, thao tác, quan sát sau và tiêu chí khôi phục.
- Có người rà soát độc lập với tác giả khi khả thi; đánh dấu rõ ca chỉ được đối chiếu tài liệu.
- Ghi khác biệt đã chấp nhận như thời gian phản hồi rút gọn, không mô phỏng packet hoặc cache.

### Chỉ số

- Tỷ lệ assertion hành vi khớp tham chiếu trên các assertion đã có bằng chứng.
- Số và mức nghiêm trọng của sai lệch, phân theo mạng, DNS, DHCP, IIS và hệ thống Windows Server (ổ dữ liệu, quyền Share/NTFS, dịch vụ sau reboot).
- Tính nhất quán giữa UI, terminal, log, công cụ Agent và trạng thái đang áp dụng.
- Khả năng tái lập kết quả từ cùng snapshot, action và thời gian/seed.

Không yêu cầu chuỗi output giống từng byte khi timestamp hoặc timing khác nhau. So sánh ngữ nghĩa, trạng thái và các trường quan trọng; chỉ so khớp định dạng khi đó là mục tiêu được công bố.

## 3. Đánh giá Agent

### Bộ ca và tránh lộ đáp án

- Mỗi ca có nguyên nhân, bằng chứng, phương án hợp lệ, bất biến an toàn và oracle do người thiết kế/rà soát xác nhận.
- Chia ca phát triển và ca giữ lại trước khi tối ưu prompt hoặc công cụ.
- Không chỉ thay IP của cùng một mẫu lỗi rồi coi đó là tổng quát hóa sang họ lỗi mới.
- Không gửi nhãn nguyên nhân, expected fix, oracle, tên preset tiết lộ lỗi hoặc log tiêm lỗi cho Agent.
- Kho tri thức chứa hướng dẫn chung có nguồn, không chứa lời giải riêng của bộ giữ lại.
- Giữ cả ca bình thường và ca có triệu chứng giống nhau nhưng nguyên nhân khác nhau.
- Bao phủ cả bốn nhóm nghiệp vụ; ghi số ca và kết quả từng nhóm, không để kết quả nhóm mạng che thiếu sót ở nhóm hệ thống Windows Server.

### Nhóm so sánh

Baseline chính là **hướng dẫn cố định** với cùng phạm vi tri thức, cùng môi trường và cùng quyền thao tác của người dùng. Nhóm thử nghiệm dùng **Agent có công cụ và truy xuất tri thức**.

Nếu đủ thời gian/ngân sách, thêm một ablation như Agent không truy xuất hoặc chatbot không công cụ để phân tích đóng góp thành phần. Không coi ablation là điều kiện bắt buộc để hoàn thành phiên bản đầu.

### Chỉ số chính

| Chỉ số | Cách ghi nhận |
| --- | --- |
| Chẩn đoán đúng | Đối chiếu nguyên nhân/bằng chứng với rubric, cho phép mô tả tương đương |
| Hướng dẫn đúng và khả thi | Hành động tồn tại trong mô hình, phù hợp trạng thái, đủ thông tin thực hiện |
| An toàn | Không sửa thừa, không cấp quyền tràn lan, không phá dịch vụ/đích khác |
| Kiểm tra phục hồi | Có phép kiểm tra phù hợp sau thay đổi, không chỉ nói đã sửa |
| Kết quả cuối | Oracle xác nhận mục tiêu phục hồi và các bất biến |
| Hiệu năng/chi phí | Thời gian phản hồi, số tool call, token/chi phí và số vòng tương tác |
| Lỗi vận hành | Timeout, tool lỗi, model lỗi, dữ liệu thiếu hoặc vòng chẩn đoán không kết thúc |

Ghi riêng chất lượng chẩn đoán, chất lượng đề xuất và khả năng làm theo hướng dẫn đến kết quả cuối. Một câu trả lời đúng không chứng minh người dùng đã sửa được lỗi.

### Quy trình chạy

1. Reset về snapshot chuẩn; ghi version engine, bộ ca, tri thức, cấu hình Agent và model.
2. Gửi triệu chứng công khai giống nhau cho các điều kiện so sánh.
3. Lưu đầy đủ tool input/output, nguồn truy xuất, revision, câu trả lời và thời gian.
4. Với bài đo kỹ thuật tự động, dùng người vận hành hoặc bộ thực thi hành động được định nghĩa trước; ghi rõ cách chuyển hướng dẫn thành thao tác.
5. Dùng oracle độc lập để kiểm tra trạng thái cuối; không dùng Agent tự chấm mình.
6. Lặp các ca theo thiết kế đã chốt để phản ánh biến thiên của model; ghi đủ số lần chạy và thất bại.

Kết quả chạy model thật phải tách khỏi test mock. Khi API lỗi, không âm thầm thay bằng giải thích theo quy tắc rồi tính là Agent thành công.

## 4. Đánh giá hiệu quả hỗ trợ thực hành

### Thiết kế dự kiến

- Tuyển người tham gia có mức nền tảng được ghi nhận, thông qua đồng thuận phù hợp yêu cầu của trường.
- So sánh hướng dẫn cố định và Agent trên các ca tương đương, cùng thời hạn và điều kiện thao tác.
- Nếu cùng người thử hai chế độ, hoán đổi thứ tự và dùng ca tương đương khác nhau để hạn chế nhớ đáp án.
- Hướng dẫn ban đầu về giao diện giống nhau; không giúp một nhóm nhiều hơn nhóm còn lại.
- Chốt cỡ mẫu, tiêu chí chọn ca và cách phân tích với giảng viên sau pilot, không tự chọn số đẹp.

### Dữ liệu cần thu

- Tỷ lệ hoàn thành theo oracle và thời gian đến khi xác nhận phục hồi.
- Số thao tác sai, lần nhờ trợ giúp và thay đổi không cần thiết.
- Mức dễ sử dụng và mức hữu ích do người tham gia phản hồi bằng biểu mẫu thống nhất.
- Trình độ ban đầu và các trường hợp bỏ dở/đạt giới hạn thời gian.

Nếu muốn kết luận về **học tập lâu dài**, cần thiết kế thêm đo trước/sau hoặc kiểm tra duy trì kiến thức. Kết quả xử lý nhanh hơn trong một phiên chỉ hỗ trợ kết luận về hiệu quả hỗ trợ thực hành trong điều kiện đó.

Nếu không thu được dữ liệu người dùng, phải báo cáo rõ phần chưa hoàn thành và trao đổi với giảng viên về phương án đánh giá hiệu quả hỗ trợ khác. Phương án thay thế cần được chấp thuận trước khi thực hiện. Chỉ công bố giới hạn hoặc đưa số liệu kỹ thuật không tự đáp ứng yêu cầu về hiệu quả đối với người học.

## 5. Dữ liệu và tái lập

- Mỗi lần chạy có `runId`, điều kiện thử, phiên bản, thời gian, trace và kết quả oracle.
- Ghi seed nếu có ngẫu nhiên và thời gian mô phỏng liên quan lease.
- Dùng mã người tham gia; không thu mật khẩu, API key, dữ liệu khách hàng hoặc khóa khôi phục thiết bị thật.
- Làm rõ với người tham gia dữ liệu nào có thể gửi tới nhà cung cấp AI.
- Không commit API key, trace chứa dữ liệu cá nhân hoặc thư riêng lên GitHub.
- Dữ liệu công bố phải được rà soát/ẩn danh và phù hợp đồng thuận; có thể công bố dữ liệu tổng hợp thay dữ liệu thô.
- Báo cáo số ca thực sự đối chiếu, số lần chạy, số người tham gia, độ phân tán và giới hạn, không chỉ một tỷ lệ tổng hợp.
- Khi thay engine/prompt/model sau khi đã đo, đánh dấu phiên bản mới và chạy lại phần bị ảnh hưởng.

## 6. Kiểm thử kỹ thuật hỗ trợ nghiên cứu

- Unit: địa chỉ/prefix, đường đi, lease, DNS, IIS/HTTP, dung lượng tệp, quyền hiệu lực Share/NTFS và Startup Type.
- Integration: cấu hình server ảnh hưởng đến client; lệnh, UI và Agent đọc chung một phiên.
- Integration hệ thống: lỗi ghi do đầy ổ dữ liệu, truy cập share theo danh tính và hai lớp quyền, dịch vụ sau reboot; xác nhận dữ liệu/quyền/dịch vụ khác không bị phá.
- Agent contract: schema, allowlist, timeout, revision, lỗi upstream và lọc dữ liệu đáp án.
- E2E: chọn thiết bị, cài/cấu hình, tự tạo lỗi, kiểm tra, sửa và reset trên desktop/mobile.
- Hồi quy: cài Windows/BIOS/driver và hướng dẫn cũ không bị hỏng do kiến trúc mới.

Các kiểm thử trên giúp phát hiện lỗi triển khai. Chúng là bằng chứng bổ trợ, không thay thế ba phần thực nghiệm.

## 7. Điều kiện để báo cáo hoàn tất

- [ ] Có bảng nguồn và hành vi tham chiếu, kèm các sai lệch/giới hạn.
- [ ] Có bộ ca version hóa, dữ liệu phát triển/giữ lại và oracle không lộ cho Agent.
- [ ] Có kết quả Agent với baseline và model thật, không chỉ mock.
- [ ] Có thử nghiệm người dùng phù hợp, hoặc đã thực hiện đầy đủ phương án đánh giá hiệu quả hỗ trợ khác được giảng viên chấp thuận trước; không coi việc chỉ công bố thiếu dữ liệu là hoàn tất.
- [ ] Có dữ liệu, cấu hình và cách chạy lại trong giới hạn quyền riêng tư/ngân sách.
- [ ] Có nhận xét cả kết quả không đạt, không suy diễn phần mềm mô phỏng được mọi hệ thống CNTT.

Các ngưỡng phần trăm đạt không được tự gán trong kế hoạch khi chưa có pilot và thống nhất với giảng viên.
