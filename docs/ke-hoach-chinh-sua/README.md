# Kế hoạch chỉnh sửa SupportLab theo định hướng khóa luận

Ngày lập: 22/10/2026.

Trạng thái: kế hoạch triển khai dự kiến theo góp ý của giảng viên; chưa phải đề cương đã được phê duyệt và chưa phải chức năng đã hoàn thành.

## Ưu tiên theo góp ý của giảng viên

Cập nhật ngày 24/10/2026 theo yêu cầu của người thực hiện: **ưu tiên đáp ứng yêu cầu khóa luận trước khi mở rộng giao diện hoặc hiệu ứng**. Các đề xuất minh họa DHCP/HTTP không tự động trở thành công việc tiếp theo.

| Ưu tiên | Việc cần làm | Điều kiện để ghi nhận kết quả |
| --- | --- | --- |
| 1. Phạm vi và mô phỏng | Xác nhận phạm vi với giảng viên; rà bốn nhóm DNS/DHCP, IIS, kết nối mạng và lỗi Windows Server. Mỗi nhóm cần trạng thái đúng, trạng thái lỗi, cách kiểm tra, khắc phục và tiêu chí xác nhận. | Có bảng đối chiếu chức năng với góp ý, hành vi sinh từ trạng thái chung và hồ sơ đối chiếu lab trong phạm vi công bố. |
| 2. AI Agent | Hoàn thiện luồng đọc trạng thái, chọn công cụ, truy xuất tri thức, đề xuất xử lý và kiểm tra lại sau thao tác của người dùng. | Có trace công cụ/nguồn/revision và đánh giá model thật trên các ca không lộ đáp án; không lấy chế độ quy tắc hoặc focus cố định thay cho Agent. |
| 3. Thực nghiệm | Chuẩn bị bộ ca, chuẩn đối chiếu và công cụ ghi nhận ngay trong lúc phát triển; đánh giá riêng mô phỏng, Agent và hiệu quả hỗ trợ. | Có baseline, dữ liệu thực nghiệm, phân tích và giới hạn; test passed hay ảnh demo không thay thế các kết quả này. |

Ba yêu cầu cần được thiết kế cùng nhau, không đợi hoàn thiện mọi tính năng mới nghĩ tới đánh giá. **Đã có [bảng đối chiếu hiện trạng ngày 24/10/2026](07-doi-chieu-yeu-cau-giang-vien.md)**: nền tảng tương tác cho bốn nhóm và Agent đã được triển khai, nhưng chưa đủ bằng chứng lab/model thật và hiệu quả hỗ trợ.

Sau rà soát, đã tạo [bộ pilot DNS ngoại tuyến](../../experiments/dns-pilot/README.md) gồm năm ca phát triển, oracle trạng thái tách khỏi hàm chẩn đoán và hồ sơ JSON từng lần chạy. Chạy bằng `npm run pilot:dns`; runner dùng thao tác tham chiếu viết tay, **không phải Agent và không chạy Windows thật**. Đã có đối chiếu DNS/IIS cùng LAN cho riêng ca D02 với lab ngày 02/11/2026; chưa xác nhận toàn bộ năm ca hoặc oracle. Bước tiếp theo là thống nhất phạm vi/rubric với giảng viên, hoàn thiện các ca tham chiếu còn lại và chuẩn bị đánh giá model thật.

Focus và hình minh họa DNS đã có được giữ làm công cụ hỗ trợ quan sát. Chỉ bổ sung hiệu ứng khác khi nó giúp làm rõ hành vi đã mô phỏng đúng hoặc phục vụ câu hỏi đánh giá cụ thể. Không mở rộng sang camera, máy in, nhiều hãng máy hoặc hệ điều hành khác trong phạm vi này. Các quyết định phạm vi vẫn cần xác nhận với giảng viên.

## Tiến độ nguyên mẫu 0.2

Cùng ngày 05/11/2026, theo yêu cầu thao tác gần giao diện hệ điều hành, đã bổ sung **Màn hình thiết bị** cho luồng DNS: giữ sơ đồ server–client, desktop từng máy, Services, DNS Manager, PowerShell và trình duyệt. Đây là cách thao tác khác trên cùng engine/API, không mở rộng thành mô phỏng toàn bộ Windows. Các cấu hình tác động kết quả kiểm tra và Agent vẫn đọc cùng phiên. Xem [báo cáo desktop và ảnh](../bao-cao-giao-dien-desktop-2026-11-05.md), [hướng dẫn sử dụng](../giao-dien-desktop-mo-phong.md). Nâng cấp giao diện không thay thế các thực nghiệm còn thiếu.

Cập nhật 05/11/2026: đã nâng cấp nút **Kiểm tra lại DNS / website** thành năm phép kiểm trên cùng snapshot, gồm HTTP theo tên và IP để phân biệt DNS với IIS; kết quả cũ được đánh dấu. Phần nhận định nêu bước kiểm tra tiếp theo, phân biệt lỗi kết hợp và giữ nguồn công cụ rõ ràng. **Xuất hồ sơ phiên** ghi thao tác trước/sau và công cụ Agent trong giới hạn công bố. Có [báo cáo, ảnh và kết quả kiểm thử](../bao-cao-nang-cap-dns-2026-11-05.md); chưa đánh giá model thật hoặc nghiên cứu người dùng.

Trang chủ `/` hiện chọn tình huống mô phỏng; phòng hệ thống nằm tại `/system`: engine dùng chung, phiên máy chủ có revision, giao diện bốn nhóm Windows Server, terminal, hướng dẫn tùy chọn và trợ lý chẩn đoán chỉ đọc có truy xuất ghi chú. Phần cài Windows cũ được giữ tại `/pc`.

Hiện có **18 preset hoạt động**, không phải đủ 22 ca ứng viên trong kế hoạch. Các chức năng dịch vụ, ACL, lease và topology đều giới hạn. Mới đối chiếu một ca DNS/IIS với lab thật; còn thiếu đối chiếu các ca khác, nhập lại phiên, thực nghiệm model thật và đánh giá hiệu quả với người dùng. Vì vậy các mốc dưới đây vẫn là tiêu chí cần tiếp tục thực hiện, không mặc định đã hoàn tất ba yêu cầu nghiên cứu.

## 1. Tên đề tài dự kiến

**Nghiên cứu và phát triển nền tảng thực hành mô phỏng cấu hình và xử lý sự cố hệ thống CNTT trên Web với sự hỗ trợ của AI Agent.**

Mục đích là xây dựng môi trường để người dùng tự cấu hình, quan sát, kiểm tra và xử lý sự cố. Không chuyển ứng dụng thành trang tài liệu, bài trắc nghiệm hoặc chuỗi bài tập bắt buộc.

## 2. Ba yêu cầu xuyên suốt

| Góp ý của giảng viên | Kế hoạch đáp ứng | Bằng chứng cần có |
| --- | --- | --- |
| Mô phỏng có tương tác thực sự | Nhiều thiết bị cùng một mạng; cấu hình, dịch vụ, kết nối và công cụ phản ứng theo trạng thái chung | Kiểm thử trạng thái, demo tương tác và hồ sơ đối chiếu với tài liệu/phòng lab thật |
| Agent vượt khỏi hỏi đáp | Đọc quan sát, chọn công cụ, truy xuất tri thức, đề xuất chẩn đoán và kiểm tra sau xử lý | Nhật ký gọi công cụ, nguồn tham khảo và đánh giá trên ca không lộ đáp án |
| Có thực nghiệm đánh giá | Đánh giá riêng độ đúng mô phỏng, chất lượng Agent và hiệu quả hỗ trợ người dùng | Bộ ca có chuẩn đối chiếu, baseline, dữ liệu thí nghiệm và báo cáo kết quả |

## 3. Phạm vi được chọn cho kế hoạch

1. Cài đặt và cấu hình dịch vụ **DNS/DHCP** phía máy chủ.
2. Cài đặt và cấu hình **Web Server**.
3. **Chẩn đoán và xử lý lỗi kết nối mạng**.
4. **Xử lý một số lỗi hệ thống Windows Server cơ bản**: dung lượng ổ dữ liệu, quyền thư mục chia sẻ và dịch vụ không tự chạy sau khởi động.

Dùng một mô hình mạng nhỏ với máy chủ **Windows Server**, máy trạm Windows, switch logic và gateway. Hai nhóm đầu dùng **DNS Server, DHCP Server và IIS** của Windows Server. Nhóm 4 được thiết kế riêng, không chỉ lặp lại lỗi DNS/DHCP/IIS; không mở thêm Linux hoặc mô phỏng toàn bộ hệ điều hành.

Đây là cập nhật phạm vi từ kế hoạch ba nhóm dùng Linux trước đó. Có bốn nhóm nghiệp vụ nhưng vẫn chỉ có ba yêu cầu nghiên cứu xuyên suốt ở mục 2.

Hình thức dự kiến: **mô phỏng bằng trạng thái và quy tắc trên Web**. Không cam kết chạy máy ảo/container trong sản phẩm. Máy ảo thật có thể dùng riêng để đối chiếu kết quả nghiên cứu.

Các ví dụ trong email của thầy là gợi ý phạm vi, không phải xác nhận rằng mọi quyết định kỹ thuật trong tài liệu này đã được thầy duyệt.

## 4. Đọc tài liệu theo thứ tự

| Tài liệu | Nội dung |
| --- | --- |
| [01-pham-vi-va-yeu-cau.md](01-pham-vi-va-yeu-cau.md) | Mục tiêu, phạm vi từng nhóm, giới hạn và các câu hỏi cần xác nhận |
| [02-kien-truc-va-ai-agent.md](02-kien-truc-va-ai-agent.md) | Mô hình trạng thái, luồng thao tác, công cụ và cơ chế Agent |
| [03-danh-muc-tinh-huong.md](03-danh-muc-tinh-huong.md) | Các ca bình thường, ca cài đặt, ca lỗi và điều kiện phục hồi |
| [04-lo-trinh-chinh-sua.md](04-lo-trinh-chinh-sua.md) | Đối chiếu mã nguồn hiện tại, thứ tự triển khai và tiêu chí hoàn tất từng mốc |
| [05-ke-hoach-thuc-nghiem.md](05-ke-hoach-thuc-nghiem.md) | Đánh giá mô phỏng, Agent, hỗ trợ thực hành và kiểm soát sai lệch |
| [06-huong-dan-tuong-tac-xstate-motion.md](06-huong-dan-tuong-tac-xstate-motion.md) | State machine hướng dẫn thao tác, focus và hiệu ứng Motion |
| [07-doi-chieu-yeu-cau-giang-vien.md](07-doi-chieu-yeu-cau-giang-vien.md) | Kết quả rà soát ba yêu cầu, giới hạn bốn nhóm, bằng chứng còn thiếu và pilot nên làm tiếp |
| [Bộ kiểm chứng khóa luận](../kiem-chung/README.md) | Kết quả chạy hiện tại, ma trận chấp nhận, rubric Agent và phiếu đối chiếu lab |
| [Pilot DNS ngoại tuyến](../../experiments/dns-pilot/README.md) | Chạy năm ca phát triển, đọc hồ sơ kỹ thuật và phiếu đối chiếu Windows Server chưa thực hiện |

## 5. Dự án hiện tại được xử lý thế nào?

- Giữ nguyên nguyên mẫu cài Windows, BIOS, USB/driver và sổ tay trong giai đoạn lập kế hoạch.
- Tái sử dụng Next.js, TypeScript, Tailwind, Lucide, Zustand, Zod và bộ công cụ kiểm thử hiện có.
- Phát triển các mô-đun mô phỏng hệ thống bên cạnh phần hiện có; không xóa hoặc viết lại toàn bộ trong một lần.
- Phần cài Windows tạm nằm ngoài trọng tâm thực nghiệm mới. Việc đưa phần này trở lại phạm vi chính cần được cân nhắc với giảng viên.
- DNS/DHCP phía server, IIS và ba lỗi hệ thống đã có nguyên mẫu giới hạn, kèm ghi chú tri thức và công cụ trợ lý. Bộ ca đầy đủ, kiểm chứng tham chiếu và bộ đánh giá nghiên cứu **chưa hoàn thành**.

## 6. Trạng thái công việc

- [x] Đọc góp ý và cập nhật phạm vi bốn nhóm, đồng nhất nền tảng Windows Server theo trao đổi với người dùng.
- [x] Rà soát README, engine, store, API Agent và cấu trúc kiểm thử hiện tại.
- [x] Lập bảng đối chiếu ba yêu cầu với mã nguồn; phân biệt chức năng đã có, giới hạn và bằng chứng nghiên cứu còn thiếu trong tài liệu 07.
- [x] Tạo runner pilot DNS ngoại tuyến với năm ca phát triển, kiểm tra bảo toàn từng thao tác và xác minh mới; đã chạy smoke check, chưa đối chiếu lab/model thật.
- [x] Tạo bộ tài liệu kế hoạch và bắt đầu chuyển đổi nguyên mẫu theo bốn nhóm Windows Server.
- [x] Hoàn thành luồng mẫu DNS bằng XState: người học tự chẩn đoán, tự bật dịch vụ và tự xác minh; Motion chỉ biểu diễn chuyển bước.
- [ ] Trao đổi với giảng viên về phạm vi, hình thức mô phỏng và cách đánh giá.
- [ ] Chốt các thành phần dịch vụ, cấu hình và hành vi được mô phỏng.
- [ ] Hoàn thành một luồng mẫu xuyên suốt trước khi mở rộng danh mục ca.
- [ ] Triển khai theo các mốc trong tài liệu 04.
- [ ] Thực hiện đánh giá và báo cáo giới hạn trong tài liệu 05.

Thư mục này chỉ chứa kế hoạch kỹ thuật bằng Markdown, không sao chép email, hồ sơ cá nhân, Word hoặc Excel. Việc tạo tài liệu không đồng nghĩa với commit hoặc push GitHub.
