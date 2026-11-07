# 07. Đối chiếu nguyên mẫu với yêu cầu của giảng viên

Ngày rà soát: **24/10/2026**.

Mục 1–8 là kết quả đọc mã nguồn, tài liệu và kiểm thử kỹ thuật tại thời điểm rà soát, trước khi tạo bộ pilot. Cập nhật triển khai sau rà soát nằm ở mục 9–10. Không phải xác nhận của giảng viên, báo cáo thực nghiệm hoàn tất hoặc chứng nhận mô phỏng đúng Windows Server thật.

## 1. Kết luận dễ hiểu

- **Không cần đập đi xây lại.** Đã có nền tảng mô phỏng tương tác cho cả bốn nhóm, không chỉ là trang hướng dẫn.
- **Agent đã có nền tảng dùng công cụ và truy xuất tri thức.** Tuy nhiên, chế độ quy tắc cục bộ không phải model AI; kiểm thử bằng mock chưa chứng minh chất lượng model thật.
- **Khoảng trống ưu tiên là kiểm chứng và thu thập bằng chứng.** Cần đối chiếu hành vi với lab tham chiếu, chuẩn hóa hồ sơ tình huống, ghi nhận lần chạy và thực hiện ba phần đánh giá.
- Focus, XState và hình minh họa DNS là phần hỗ trợ. Nâng cấp hiệu ứng không thay thế các yêu cầu nghiên cứu.

## 2. Bảng đối chiếu ba yêu cầu

| Yêu cầu của giảng viên | Hiện đã có | Phần chưa đủ hoặc chưa có bằng chứng | Điều kiện để ghi nhận hoàn thành |
| --- | --- | --- | --- |
| Môi trường mô phỏng tương tác thực sự | Trạng thái chung phía server; chọn thiết bị, đổi cấu hình, cài role, bật/tắt dịch vụ; kết quả lệnh sinh từ trạng thái; revision và sự kiện | Topology và dịch vụ còn giản lược; chưa có hồ sơ đối chiếu từng hành vi với Windows Server tham chiếu; chưa chuẩn hóa toàn bộ ca | Chốt hành vi trong phạm vi; mỗi ca có trạng thái đúng/lỗi, cách kiểm tra, cách khắc phục và tiêu chí phục hồi; có bằng chứng lab cùng danh sách sai khác |
| Agent phân tích trạng thái, truy xuất tri thức, dùng công cụ và hỗ trợ theo quy trình | Sáu công cụ chỉ đọc; bảy mục tri thức; vòng gọi công cụ với model tùy chọn; hiển thị nguồn, trace tóm tắt và revision | Điều kiện bằng chứng trước kết luận còn đơn giản; chưa kiểm chứng đầy đủ quy trình nhiều lượt và xác minh sau sửa; chưa tìm thấy báo cáo chất lượng model thật | Có hợp đồng chẩn đoán và bằng chứng liên quan; xác minh lại trên trạng thái mới; đánh giá model thật trên ca không lộ đáp án; ghi nhận cả lỗi và fallback |
| Thực nghiệm đánh giá mô phỏng, Agent và hiệu quả hỗ trợ | Kế hoạch thực nghiệm, unit/integration/E2E và xuất snapshot | Chưa tìm thấy bộ ca/oracle có phiên bản, dữ liệu lab, runner thực nghiệm, báo cáo model thật hoặc nghiên cứu người dùng trong phạm vi đã rà | Có protocol, chuẩn đối chiếu độc lập, baseline công bằng, dữ liệu và phân tích cho cả ba đánh giá; nêu rõ giới hạn và thất bại |

Kết luận trạng thái: **đã có triển khai cho yêu cầu 1 và 2, nhưng chưa đủ bằng chứng để kết luận đã đáp ứng trọn vẹn; yêu cầu 3 mới có kế hoạch và kiểm thử hỗ trợ**. Không quy đổi ba yêu cầu thành phần trăm hoàn thành khi chưa có tiêu chí được thống nhất.

## 3. Bốn nhóm hiện mô phỏng đến đâu?

| Nhóm | Tương tác và hành vi hiện có | Giới hạn cần công bố |
| --- | --- | --- |
| DNS / DHCP | Cài role; start/stop dịch vụ; chỉnh A record; DHCP scope/options; renew và lease; APIPA; phân biệt timeout, `NXDOMAIN` và IP phân giải sai | Một bản ghi A, một scope và một lease được biểu diễn; chưa mô phỏng đầy đủ cache/TTL/forwarder, nhiều client, reservation hoặc quản lý zone |
| Web Server IIS | Cài role; trạng thái site/application pool; binding port; kiểm tra HTTP; phân biệt HTTP 200, 503 và từ chối kết nối | Một site, một pool, một port; nội dung mẫu cố định; chưa có triển khai nội dung/physical path, TLS hoặc multi-site đầy đủ |
| Kết nối mạng | DHCP/static; IP/prefix/gateway/DNS; link và NIC; phân biệt cùng LAN với đích qua gateway; sai subnet/gateway, ngắt link và tắt NIC | Topology cố định với SRV-01, CLIENT-01, gateway và một đích khác mạng; không phải packet stack, routing table hay firewall tổng quát |
| Lỗi Windows Server | Dung lượng ổ D: theo tệp mẫu, ghi thử và dọn cache; quyền Share kết hợp NTFS Read; tài khoản local; LabWorker, Startup Type và reboot mô phỏng | Không có hệ thống tệp/OS thật; quyền chỉ là Allow Read giới hạn, không đầy đủ group/inheritance/Deny/AD; LabWorker là dịch vụ mẫu |

Bằng chứng triển khai: [engine `system-simulator.ts`](../../src/lib/system-simulator.ts), [panel cấu hình](../../src/components/system-panels.tsx), [unit test engine](../../tests/system-simulator.test.ts) và [E2E hệ thống](../../tests/e2e/system-lab.spec.ts).

### Phân biệt số lượng

- **5 lựa chọn trên trang chủ** là năm mẫu có hướng dẫn focus, không phải toàn bộ khả năng mô phỏng.
- **18 preset** trong phần **Tạo phiên mới** gồm hai trạng thái nền `healthy`, `unconfigured` và 16 trạng thái lỗi. Những lỗi chưa có focus riêng vẫn có thể thao tác trong mô hình.
- **22 ca trong tài liệu 03** là danh mục ứng viên để xem xét, không phải 22 ca đã triển khai hoặc đã kiểm chứng. Danh mục này không ánh xạ một-một với preset; không thể lấy 22 trừ 18 để kết luận còn thiếu bốn ca.

Nguồn: [trang chủ](../../src/components/simulation-home.tsx), [phòng mô phỏng](../../src/components/system-lab.tsx), [guide DNS](../../src/lib/system-guide-machine.ts), [bốn guide còn lại](../../src/lib/scenario-guide-machine.ts) và [danh mục ca dự kiến](03-danh-muc-tinh-huong.md).

### Tương tác không đồng nghĩa với máy ảo thật

Người dùng tự sửa cấu hình; chẩn đoán chỉ đọc từ cùng trạng thái và không tự sửa máy. Terminal là bộ phân tích các lệnh được cho phép, không phải PowerShell/CMD chạy thật. Thời gian mô phỏng tiến theo thao tác, không phải đồng hồ của hệ điều hành. Minh họa DNS đọc kết quả chẩn đoán có cấu trúc, không chạy mạng thật.

Các giới hạn này có thể phù hợp với đề tài mô phỏng nếu được giảng viên thống nhất, mô tả rõ và đánh giá đúng phạm vi. Không cần bổ sung toàn bộ Windows Server để xóa mọi giới hạn.

## 4. Agent đã có gì và cần làm chặt chẽ hơn?

### Ba thành phần khác nhau

| Thành phần | Cách hoạt động | Có thay thế bằng chứng Agent không? |
| --- | --- | --- |
| Guide XState/focus | Quy trình định trước, kiểm tra thao tác và trạng thái để dẫn bước | Không. Đây là hướng dẫn cố định |
| Trợ lý cục bộ | Quy tắc trong mã đọc trạng thái và trả gợi ý; có nhãn nguồn cục bộ | Không dùng làm kết quả model AI; có thể giữ làm fallback hoặc đối chứng được khai báo |
| Agent dùng model | Model chọn công cụ, đọc quan sát, tìm tri thức và trả đề xuất trong vòng gọi công cụ có giới hạn | Là triển khai Agent cần được thử model thật và đánh giá riêng |

Agent dùng model chỉ được bật khi cấu hình đủ `SUPPORTLAB_AI_ENABLED`, `OPENAI_API_KEY` và `OPENAI_MODEL`. Lượt rà soát không đọc giá trị bí mật và không xác nhận chế độ đang bật trên máy người dùng.

### Bằng chứng hiện có

- API lấy snapshot từ phiên phía server, không tin trạng thái máy do trình duyệt tự gửi.
- Sáu công cụ: `inspect_network`, `inspect_service`, `inspect_system`, `run_diagnostic`, `search_knowledge`, `read_logs`. Không có công cụ tự sửa cấu hình hoặc truy cập hệ điều hành thật; người dùng vẫn tự thao tác.
- Kho tri thức gồm bảy ghi chú có liên kết Microsoft Learn, tìm bằng từ khóa và điểm liên quan. Đây là truy xuất tri thức đơn giản, không phải duyệt Web trực tiếp; chưa cần thêm vector database chỉ để đáp ứng tên công nghệ.
- Có giới hạn vòng gọi/công cụ và timeout; lỗi chuyển về chế độ cục bộ có nhãn. Giao diện hiển thị trace tóm tắt, nguồn và cảnh báo khi revision đã cũ.

Nguồn: [API Agent](../../src/app/api/system-agent/route.ts), [phiên máy chủ](../../src/lib/system-session.ts), [tri thức](../../src/lib/system-knowledge.ts), [giao diện trợ lý](../../src/components/system-assistant.tsx) và [test hợp đồng](../../tests/system-session.test.ts).

### Khoảng trống ưu tiên

1. **Bằng chứng trước kết luận:** hiện mới buộc có công cụ ngoài tra cứu và có gọi `search_knowledge`; `read_logs` cũng đủ cho điều kiện quan sát. Chưa bảo đảm bằng chứng đúng vấn đề, kết quả tra cứu có ích, thứ tự hợp lý hoặc kết luận phù hợp. Một phần quy tắc an toàn mới nằm trong prompt.
2. **Xác minh sau sửa:** công cụ đã có thể kiểm tra lại, nhưng mỗi request chỉ đọc một snapshot cố định. Sau thao tác phải hỏi lại để đọc revision mới; chưa có hồ sơ nhiều lượt buộc kết luận phục hồi gắn với bằng chứng mới.
3. **Tri thức có thể kiểm chứng:** cần phiên bản kho, phiên bản thành phần áp dụng, ngày đối chiếu và đánh giá truy xuất. Có URL nguồn chưa chứng minh từng nội dung đã được kiểm tra trên lab.
4. **Nhật ký và kiểm thử bất lợi:** cần ghi nhận đầy đủ công cụ, lỗi/fallback; bổ sung kiểm tra thiếu/sai bằng chứng, tra cứu rỗng, tham số sai, hướng dẫn không an toàn và dữ liệu chèn chỉ dẫn. Không tuyên bố đã an toàn hoàn toàn chỉ vì có giới hạn công cụ.

## 5. Bằng chứng kiểm thử và bằng chứng nghiên cứu

### Đã xác minh trong lượt rà soát

| Kiểm tra | Kết quả | Ý nghĩa và giới hạn |
| --- | --- | --- |
| `npm test` | 131/131 test đạt | Kiểm tra các quy tắc, hợp đồng và hồi quy được viết trong repo; không phải 131 ca Windows Server đã đối chiếu |
| `npm run typecheck` | Đạt | Kiểm tra kiểu TypeScript, không xác nhận độ đúng nghiệp vụ |

Không chạy lại build hoặc Playwright trong lượt rà soát tài liệu này. Không gọi API model có phí hoặc thực hiện lab Windows Server thật.

Test cloud Agent hiện dùng `fetch` mock. Nó kiểm tra việc gọi công cụ, cấu trúc dữ liệu và không gửi nhãn preset, **không đo độ chính xác model thật**. E2E Agent dùng phản hồi giả để kiểm tra giao diện cũng không thay thế đánh giá model.

### Dữ liệu hiện chưa đủ cho thực nghiệm tái lập

| Thành phần | Hiện trạng | Cần bổ sung phục vụ đo |
| --- | --- | --- |
| Xuất phiên | Chỉ xuất `{schemaVersion, state}`; chưa nhập lại | Manifest phiên bản và hồ sơ lần chạy; phân biệt snapshot với lịch sử thực nghiệm |
| Phiên và lịch sử | Phiên server trong bộ nhớ có TTL; event tối đa 100, terminal tối đa 60 bản; hội thoại ở bộ nhớ giao diện | Kho ghi nhận có thời gian lưu phù hợp; cấu trúc action và thời điểm, không phụ thuộc lịch sử UI |
| Trace Agent | Tên công cụ và summary cắt ngắn | Input/output công cụ đầy đủ, revision, timing, model/config/usage nếu có, nguồn, câu trả lời, lỗi và fallback |
| Đánh giá | Có kế hoạch, chưa tìm thấy bộ kết quả trong phạm vi rà | Bộ ca có phiên bản, oracle độc lập, kết quả lab, lần chạy model thật và dữ liệu người dùng theo protocol |

Phạm vi tìm bằng chứng là mã nguồn, tests, tài liệu dự án, scripts khai báo trong `package.json` và hiện vật trong `output`. Không tìm thấy trong phạm vi này không có nghĩa là người thực hiện chưa từng thử nghiệm bên ngoài repo.

Tham chiếu: [kế hoạch thực nghiệm](05-ke-hoach-thuc-nghiem.md), [xuất phiên](../../src/components/system-lab.tsx), [lịch sử terminal](../../src/lib/system-store.ts) và [API Agent](../../src/app/api/system-agent/route.ts).

## 6. Việc nên làm tiếp: pilot kiểm chứng DNS xuyên suốt

**Đề xuất tiếp theo là chuẩn hóa một bộ pilot nhỏ và hồ sơ ghi nhận, không thêm hiệu ứng DHCP/HTTP.** Pilot là lần chạy thử phương pháp, không phải thực nghiệm chính thức và không thu hẹp khóa luận chỉ còn DNS.

### Bước 1: Chốt hành vi và lab tham chiếu

Chọn một phiên bản/build Windows Server và Windows client, mạng cô lập, DNS zone và A record tương ứng mô hình. Ghi cấu hình, nguồn chính thức, các hành vi cần kiểm tra và sai khác dự kiến. Dùng quyền truy cập/giấy phép hợp lệ; không thao tác trên máy khách hàng hay mạng đang phục vụ công việc.

### Bước 2: Chuẩn hóa một ca chính và các ca đối chứng

Ca chính phù hợp là **DNS service dừng** vì đã có engine, focus và minh họa. Luồng cần kiểm chứng: quan sát triệu chứng → kiểm tra kết nối LAN và DNS → xem dịch vụ trên đúng server → người dùng bật dịch vụ → truy vấn DNS lại → kiểm tra HTTP nếu các lớp khác đúng.

Kèm các ca đối chứng ứng viên: trạng thái bình thường, A record sai, client dùng DNS sai khi dịch vụ vẫn chạy, và link ngắt. Mục đích là kiểm tra Agent có phân biệt nguyên nhân thay vì luôn đoán dịch vụ DNS dừng. Số ca chính thức cần thống nhất sau pilot.

Nếu chọn thêm `NXDOMAIN` do thiếu bản ghi: engine có kiểm thử cho trạng thái này, nhưng chưa có preset và quy trình thêm/xóa bản ghi đầy đủ trong UI. Phải quyết định tạo fixture/công cụ cần thiết hay thu hẹp ca, không ghi là người dùng đã thao tác được trọn luồng.

Mỗi hồ sơ ca cần: mã trung tính, phiên bản, triệu chứng công khai, trạng thái đầu, quan sát dự kiến, thao tác hợp lệ, điều kiện phục hồi, bất biến an toàn, nguồn và trạng thái đối chiếu. Nguyên nhân/oracle phải nằm riêng, không lộ qua tên preset, nhãn UI hoặc payload Agent của phiên đánh giá.

### Bước 3: Định nghĩa chuẩn đối chiếu độc lập

Lập bảng **trước lỗi → kiểm tra → thao tác → sau sửa → sai khác mô hình** và đính kèm bằng chứng lab. Oracle là chuẩn xác nhận kết quả: dịch vụ/đích DNS cần hoạt động đúng, hành vi truy cập phục hồi và cấu hình/dữ liệu không liên quan được giữ an toàn.

Không lấy chính hàm `runSimulationDiagnostic` hoặc phản hồi Agent làm chuẩn duy nhất để tự xác nhận engine đúng. Chấp nhận nhiều cách sửa hợp lệ nếu thỏa mục tiêu và ràng buộc an toàn; không chỉ so khớp một chuỗi thao tác cố định.

### Bước 4: Ghi hồ sơ từng lần chạy

Tối thiểu có `runId`, thời điểm, phiên bản engine/bộ ca/tri thức/prompt/model, cấu hình thử, trạng thái đầu/cuối, structured actions, lệnh chẩn đoán, tool input/output, revision, câu trả lời, nguồn, timing, usage nếu có, lỗi/fallback và kết quả oracle. Nếu worktree còn thay đổi, ghi cả tình trạng đó và định danh bản mã thử, không chỉ ghi commit.

Dữ liệu thô cần lưu riêng và ẩn danh theo kế hoạch; không commit API key, email, thông tin khách hàng hoặc nội dung nhạy cảm. Lần cloud thất bại rồi trả lời cục bộ phải được tính đúng là lỗi/fallback, không gộp thành thành công của model.

### Bước 5: So sánh công bằng và xác minh trên revision mới

Baseline nên là hướng dẫn cố định chung có thể xử lý các ca trong pilot, với cùng tri thức, quyền thao tác và điều kiện thử. Guide focus DNS hiện chỉ dành cho mẫu dịch vụ dừng; không dùng nguyên trạng guide này để so sánh trên mọi biến thể DNS rồi kết luận Agent tốt hơn.

Chạy pilot kỹ thuật trước để sửa rubric/công cụ ghi nhận. Sau đó mới chốt tập phát triển, tập giữ lại, số lần lặp và protocol người dùng. Đánh giá riêng: đúng mô phỏng, đúng/an toàn của Agent, và hiệu quả hỗ trợ thực hành. Phải có quan sát mới sau khi người dùng sửa trước khi xác nhận phục hồi.

### Bước 6: Mở rộng cách kiểm chứng sang ba nhóm còn lại

Áp dụng cùng hồ sơ cho DHCP, IIS, kết nối mạng và lỗi hệ thống theo phạm vi cuối. Chỉ bổ sung hành vi còn thiếu để phục vụ các ca đã chọn. Không suy kết luận cả bốn nhóm từ kết quả pilot DNS, không chạy theo số lượng preset hoặc hiệu ứng.

## 7. Những việc cần xác nhận với giảng viên

1. Mô phỏng trạng thái trên Web với các giới hạn ở mục 3 có phù hợp yêu cầu KLTN không? Chọn phiên bản Windows Server nào để đối chiếu?
2. Các ca nào chính thức thuộc bốn nhóm? Những mục dự kiến như hết pool DHCP, quản lý DNS zone hay IIS physical path cần làm hay được thu hẹp?
3. Cách chọn baseline, chuẩn đối chiếu, tiêu chí đạt, số lần chạy model và cỡ mẫu người dùng là gì? Nếu thiếu người tham gia, phương án thay thế nào được chấp nhận?
4. Có thể bố trí lab tham chiếu, người rà soát kỹ thuật và ngân sách model thật ở mức nào?

Các câu hỏi này không ngăn việc chuẩn bị hồ sơ pilot và công cụ ghi nhận; nhưng chưa được tự ghi rằng phạm vi, ngưỡng đạt hoặc phương pháp đã được giảng viên duyệt.

## 8. Checklist sau rà soát

- [x] Đối chiếu mã nguồn với ba yêu cầu và bốn nhóm nghiệp vụ.
- [x] Phân biệt mô phỏng, focus, trợ lý cục bộ và Agent dùng model.
- [x] Kiểm tra unit/integration và TypeScript; tách khỏi bằng chứng nghiên cứu.
- [ ] Thống nhất phạm vi và điều kiện thực nghiệm với giảng viên.
- [ ] Chuẩn hóa hồ sơ pilot, oracle độc lập và nhật ký lần chạy.
- [ ] Đối chiếu lab, thử model thật và hoàn thành pilot kỹ thuật.
- [ ] Thực nghiệm theo tài liệu 05 cho phạm vi chính thức; phân tích cả thất bại và giới hạn.

Tài liệu này chỉ ghi nhận kết quả rà soát và thứ tự công việc. Chưa thay đổi runtime, chưa tạo dữ liệu đo và chưa commit/push dự án.

## 9. Cập nhật sau rà soát: bộ khung pilot DNS

Ngày 24/10/2026, đã bổ sung [pilot DNS ngoại tuyến](../../experiments/dns-pilot/README.md): năm ca phát triển D01–D05, thao tác sửa tham chiếu viết tay, oracle chỉ kiểm tra trực tiếp trạng thái, kiểm tra bảo toàn sau từng thao tác và xác minh mới sau sửa. CLI `npm run pilot:dns` xuất hồ sơ JSON cục bộ có manifest/hash nguồn, snapshot, lệnh, action, revision, thời điểm và kết quả kiểm tra.

Đã chạy smoke check cả năm ca; 5/5 đạt theo contract hiện tại. Có thêm 17 test pilot, nâng tổng bộ kiểm thử kỹ thuật lên 148 test đạt. Đây là dữ liệu kỹ thuật mới, **không thay đổi kết luận còn thiếu bằng chứng lab, model thật và người dùng**. Năm ca là tập phát triển công khai, chưa phải bộ giữ lại; oracle tách biệt về mã nhưng giả định vẫn cần lab xác nhận. Chưa thu thập trace model thật hoặc kết quả nghiên cứu người dùng; chưa thay đổi runtime Web.

Các checklist về chuẩn hóa hồ sơ, oracle độc lập theo nguồn tham chiếu và thực nghiệm vẫn chưa hoàn tất. Phiếu lab, cách chạy và giới hạn dữ liệu được ghi trong README của pilot.

## 10. Cập nhật 28/10/2026: kiểm tra lại và hồ sơ phiên Web

- Thêm **Kiểm tra lại DNS / website**: phiên bản ngày 28/10 gồm bốn phép kiểm ping, dịch vụ DNS, nslookup mặc định và HTTP theo tên. Kết quả gắn cùng revision; thay đổi cấu hình làm kết quả cũ. Phép kiểm HTTP qua IP và nhận định chi tiết được bổ sung ngày 05/11 ở mục 11.
- Đây là kiểm tra cố định phía hệ thống, không tính là công cụ model tự chọn. Model vẫn phải tự quan sát và truy xuất tri thức. Trợ lý cục bộ giữ nhãn không dùng AI; fallback được ghi riêng với lượt model thất bại.
- **Xuất hồ sơ phiên** tải cấu hình đầu/hiện tại, action trước/sau, chẩn đoán và lượt trợ lý. Trace giữ input/output, origin, revision, thời điểm, thời lượng, lỗi và call ID; usage chỉ ghi khi nhà cung cấp trả về. Không gửi nhãn preset hoặc đáp án riêng cho model.
- Nhật ký chỉ ở RAM, tối đa 256 mục/512 KiB, mỗi mục tối đa 64 KiB; phần bị lược bỏ có đánh dấu. File tải về không nhập lại phiên, chưa có manifest/hash môi trường hoàn chỉnh như bộ pilot và chưa phải kho dữ liệu nghiên cứu bền vững.

Kiểm tra chức năng mới bằng unit/API và trình duyệt, không gọi model có phí. Các điều kiện đối chiếu lab, thử model thật, bộ ca giữ lại và nghiên cứu người dùng vẫn cần thực hiện. Tham khảo cách dùng tại [giải thích phần mềm](../giai-thich-phan-mem.md#kiểm-tra-lại-sau-khi-sửa-dns-hoặc-website).

## 11. Cập nhật 05/11/2026: đối chiếu DNS và hoàn thiện luồng chẩn đoán

- Đã dùng lại log hai VM ngày 02/11, kiểm hash manifest/sáu observations/66 đầu ra gốc và so sánh ba pha với mô phỏng hiện tại. Năm kết quả cùng LAN khớp: ping IP, DNS Running, A đúng, HTTP theo tên và HTTP qua IP. `npm run compare:dns` lưu bản đối chiếu mới cùng hash nguồn, không viết lại bằng chứng cũ hoặc khởi động VM.
- Nút kiểm tra lại dùng protocol `dns-portal-v2` gồm năm phép kiểm. Nhận định dựa trên các quan sát, phân biệt mất mạng, DNS dừng, resolver/bản ghi sai, NXDOMAIN, IIS lỗi và lỗi kết hợp. Sửa DNS riêng không làm một ca DNS + IIS trở thành đạt.
- Cả chẩn đoán DNS thông thường và kiểm tra lại có bộ quan sát cố định. Model vẫn phải tự gọi công cụ liên quan và tìm tri thức phù hợp; các phép kiểm hệ thống không được tính thành công cụ model lựa chọn. Phản hồi cục bộ/fallback tiếp tục ghi rõ không dùng AI.
- Đã chạy 187 kiểm thử kỹ thuật, 96 E2E, TypeScript và production build thành công; lưu một phiên Web ba pha, JSON tải từ giao diện và ảnh. Đây là kiểm thử phần mềm, không phải đánh giá model thật hoặc nghiên cứu người dùng.

Chi tiết: [báo cáo nâng cấp DNS](../bao-cao-nang-cap-dns-2026-11-05.md). Kết quả lab vẫn chờ rà độc lập, giới hạn ở một ca DNS/IIS; các checklist về toàn bộ phạm vi nghiên cứu chưa hoàn tất.
