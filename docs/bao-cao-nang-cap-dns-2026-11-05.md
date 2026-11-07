# Nâng cấp và kiểm tra luồng DNS — 05/11/2026

**Đã hoàn thiện luồng DNS trên Web: quan sát → khoanh vùng → người dùng sửa → kiểm tra lại → xuất hồ sơ.** Phần nâng cấp bám hai góp ý của giảng viên: cấu hình ảnh hưởng kết quả thực sự, và Agent hỗ trợ dựa trên trạng thái/công cụ.

## 1. Bạn sẽ thấy gì mới?

- **Kiểm tra lại DNS / website** có năm mục: ping máy chủ, dịch vụ DNS, câu trả lời A, website theo tên và website theo IP.
- Có **Nhận định từ các phép kiểm** và **Bước tiếp theo** để giải thích tại sao nên kiểm tra DNS, IIS hoặc kết nối mạng.
- DNS timeout không tự dẫn đến đề xuất bật dịch vụ. Nếu dịch vụ đang Running, hướng dẫn xem resolver/bản ghi; nếu nhận NXDOMAIN, xem bản ghi trong zone.
- Nếu DNS và IIS cùng lỗi, sửa DNS vẫn chưa được báo đạt. Kết quả đã cũ được đánh dấu và ẩn phần nhận định trong thẻ kiểm tra để tránh dùng cho cấu hình mới.
- Trace phân biệt **Phép kiểm cố định**, **Agent lựa chọn** và **Quy tắc cục bộ**. Bộ kiểm cố định là chức năng của ứng dụng, không phải bằng chứng model tự chọn đủ công cụ.
- Hồ sơ JSON giữ protocol `dns-portal-v2`, revision và quan sát, nhận định, nguồn tri thức, công cụ, thao tác trước/sau và các lượt fallback trong giới hạn lưu trữ đã công bố.

Không cần bật máy ảo để dùng Web mô phỏng. Lab tham chiếu và Web là hai môi trường riêng.

## 2. Tự thử trong khoảng 5 phút

1. Chạy `npm run dev`, mở `http://127.0.0.1:3000/system?preset=healthy`.
2. Vào **DNS / DHCP**, bấm **Kiểm tra lại DNS / website**: năm mục đều đạt.
3. Bỏ chọn **DNS đang chạy** để tạo lỗi. Nhắn trợ lý: “Không mở được portal.lab.test, kiểm tra giúp mình”.
4. Xem kết quả: ping/IP website vẫn đạt, DNS và website theo tên chưa đạt. Mở từng mục để đọc đầu ra; mở **Bước tiếp theo** để xem đề xuất.
5. Tự bật lại **DNS đang chạy**. Kết quả cũ đổi sang trạng thái cần kiểm tra lại.
6. Bấm **Kiểm tra lại DNS / website** để xác nhận cấu hình mới; sau đó **Xuất hồ sơ phiên** để giữ JSON.

Nếu không truy cập được cổng 3000, dùng địa chỉ mà terminal `npm run dev` hiển thị. Mỗi lần tải lại trang tạo phiên mới; JSON tải về chưa dùng để nhập lại phiên.

## 3. Ảnh phiên Web đã chạy

Đã thao tác bằng Playwright trên trình duyệt với **trợ lý quy tắc cục bộ**, không gọi model AI. Ảnh bên dưới là giao diện Web; phần cuộn của trợ lý được mở rộng tạm khi chụp để đọc trọn kết quả, dữ liệu không thay đổi. Ảnh và JSON nằm trong `output/` trên laptop, không tự có trên GitHub. Nhấn **Ctrl + Shift + V** để xem ảnh trong VS Code.

### Bình thường — r0

![Năm phép kiểm DNS và website đều đạt ở cấu hình ban đầu](../output/evidence/web-dns/2026-11-05T15-52-33-216Z-local-workflow/01-healthy-details.png)

### Dừng DNS — r1

![DNS dừng: website theo tên lỗi, website qua IP vẫn đạt](../output/evidence/web-dns/2026-11-05T15-52-33-216Z-local-workflow/02-dns-stopped-details.png)

### Bật lại DNS — r2

![Sau khi người dùng bật DNS, kiểm tra lại xác nhận năm mục đều đạt](../output/evidence/web-dns/2026-11-05T15-52-33-216Z-local-workflow/03-restored-details.png)

[Hồ sơ phiên tải từ giao diện](../output/evidence/web-dns/2026-11-05T15-52-33-216Z-local-workflow/web-session.json) · [Manifest và hash ảnh/JSON](../output/evidence/web-dns/2026-11-05T15-52-33-216Z-local-workflow/manifest.json). Phiên có ba lượt trợ lý tại r0/r1/r2, hai thao tác dừng/bật DNS, không bị lược nhật ký và không sửa cấu hình không liên quan.

## 4. Đối chiếu với kết quả máy ảo

Đã đọc lại lab Windows ngày **02/11/2026**, kiểm hash manifest, sáu observation JSON và **66 tệp đầu ra gốc**. Sau đó chạy mã mô phỏng hiện tại ở ba giai đoạn bằng thao tác dừng/bật DNS, so sánh kết quả đọc từ đầu ra thay vì tin nhãn giai đoạn hoặc riêng exit code.

| Phép kiểm | Bình thường | DNS dừng | Bật lại DNS |
| --- | --- | --- | --- |
| Ping IP | Được | Được | Được |
| Dịch vụ DNS | Running | Stopped | Running |
| A của portal trỏ `.10` | Có | Không có câu trả lời, timeout | Có |
| HTTP theo tên | 200 | Lỗi phân giải | 200 |
| HTTP qua IP | 200 | 200 | 200 |

**Cả ba pha đều khớp năm hành vi đã so sánh**; cấu hình không liên quan được bảo toàn. Đây là đối chiếu lại log có sẵn, không chạy Windows mới. [Báo cáo đối chiếu](../output/experiments/dns-reference/2026-11-05T15-54-38-222Z-9fc35142/README.md) và [JSON giữ đầu ra/hash nguồn](../output/experiments/dns-reference/2026-11-05T15-54-38-222Z-9fc35142/comparison.json).

Chạy lại khi sửa engine bằng `npm run compare:dns`. Lệnh tạo thư mục mới, không ghi đè hồ sơ cũ. Thiếu bằng chứng cục bộ hoặc hash sai thì dừng; khi chuyển máy cần sao lưu `output/` riêng. [Cách hoạt động của bộ đối chiếu](../experiments/dns-reference/README.md).

## 5. Đã kiểm tra đến đâu?

| Kiểm tra kỹ thuật | Kết quả |
| --- | --- |
| `npm test` — unit/API/oracle/đối chiếu | 187/187 đạt |
| `npx playwright test` — toàn bộ E2E | 96/96 đạt |
| `npm run typecheck` | Đạt |
| `npm run build` | Đạt |
| `npm run compare:dns` — đối chiếu lab đã lưu | 3/3 pha khớp, năm phép kiểm mỗi pha |

Các kiểm thử mới bao phủ lỗi DNS, bản ghi/resolver sai, NXDOMAIN, IIS, mất mạng, lỗi kết hợp, kết quả cũ, trace công cụ, nguồn tri thức không liên quan, lỗi nhà cung cấp AI và xuất bằng chứng. Vòng API của model được thử bằng mock; chế độ cục bộ được thử qua trình duyệt. Không phát sinh lượt gọi AI có phí.

## 6. Giới hạn và bước nghiên cứu tiếp theo

Kết quả chỉ hỗ trợ **DNS/IIS cùng LAN cho ca D02**. Lab dùng IP tĩnh/không gateway, Web dùng DHCP/gateway `.1`; chưa xác nhận DHCP, định tuyến hoặc mọi ca khác. Thông báo, thời gian, mã thoát và HTML được giản lược; ví dụ `nslookup` thật có thể exit 0 dù timeout, còn HTTP lỗi thực là curl exit 28. Không dùng việc khớp hành vi để kết luận giống Windows từng chi tiết.

Kết quả giữ trạng thái **Codex đã rà, chờ giảng viên/người thực hiện kiểm tra độc lập**. Pilot cũ không bị viết lại. Chưa có kết quả chất lượng model AI thật hoặc nghiên cứu hiệu quả với người dùng; cần thiết kế hai đánh giá này với bộ ca/rubric và ngân sách phù hợp.

Bước tiếp theo là bạn tự chạy luồng ở mục 2, đọc bằng chứng và trao đổi phạm vi kết luận với thầy. Sau đó chuẩn bị thử model thật cho DNS, rồi mở rộng cách đối chiếu sang các ca DNS/DHCP/IIS khác.

Tài liệu API tham khảo khi rà vòng gọi công cụ: [OpenAI Docs — Function calling](https://developers.openai.com/api/docs/guides/function-calling). Nguồn kỹ thuật của các gợi ý DNS/IIS hiển thị trực tiếp trong trợ lý.
