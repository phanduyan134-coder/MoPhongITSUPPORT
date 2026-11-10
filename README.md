# SupportLab · Mô phỏng hệ thống CNTT

**Đề tài khóa luận:** “Nghiên cứu và phát triển nền tảng thực hành mô phỏng cấu hình và xử lý sự cố hệ thống CNTT trên Web với sự hỗ trợ của AI Agent.”

SupportLab dành cho người học cấu hình và xử lý sự cố hệ thống CNTT. Người dùng chọn tình huống, chuyển giữa máy chủ và máy trạm, mở các công cụ quản trị trên desktop mô phỏng rồi tự kiểm tra và sửa cấu hình.

Ứng dụng dùng **dữ liệu trạng thái và các quy tắc xử lý** để tái hiện phản ứng của hệ thống. Thay đổi cấu hình sẽ làm thay đổi kết quả kiểm tra. Windows Server thật chỉ chạy trong máy ảo riêng phục vụ đối chiếu; sử dụng Web không cần bật máy ảo và không thay đổi cấu hình laptop.

**Tài liệu để xem nhanh:** [Cách sử dụng desktop](docs/giao-dien-desktop-mo-phong.md) · [Ma trận chấp nhận bốn nhóm](docs/kiem-chung/ma-tran-chap-nhan.md) · [Tiêu chí đánh giá AI Agent](docs/kiem-chung/danh-gia-agent.md) · [Biên bản đối chiếu DNS D02](docs/lab-tham-chieu/windows-dns/KET-QUA-DOI-CHIEU-D02-2026-11-02.md).

![Desktop máy chủ SRV-01: kiểm tra dịch vụ DNS trong Services, phía trên là sơ đồ CLIENT-01 — SW-01 — SRV-01](docs/images/desktop-dns-services.png)

## Đáp ứng các yêu cầu của đề tài

| Yêu cầu | Cách triển khai trong bản mẫu | Trạng thái và phần còn cần đánh giá |
| --- | --- | --- |
| Mô phỏng tương tác thực chất | Desktop và công cụ quản trị cùng dùng một trạng thái phiên. Thao tác Apply/Start/Stop cập nhật trạng thái; lệnh và trình duyệt đọc cấu hình hiện tại. | Đã có engine, giao diện và kiểm thử kỹ thuật cho bốn nhóm. Mức độ đúng với Windows cần tiếp tục đối chiếu theo từng ca. |
| AI Agent hỗ trợ theo quy trình | Đọc trạng thái qua công cụ, chạy chẩn đoán mô phỏng, truy xuất ghi chú kỹ thuật có nguồn, đề xuất cách sửa và kiểm tra lại. | Đã triển khai vòng gọi công cụ qua API và kiểm thử mock/cục bộ. Chưa có kết quả đánh giá chất lượng model AI thật. |
| Thực nghiệm đánh giá | Có ma trận chấp nhận, xuất hồ sơ JSON, bộ ca DNS và quy trình đối chiếu máy ảo. | Đã có đối chiếu riêng DNS/IIS cùng LAN cho ca D02, chờ rà soát độc lập. Cần đánh giá thêm các ca khác, model thật và hiệu quả hỗ trợ người dùng. |

## Phạm vi bốn nhóm mô phỏng

| Nhóm | Thao tác được hỗ trợ | Ví dụ phản ứng của hệ thống |
| --- | --- | --- |
| DNS / DHCP | Cài role, bật/dừng dịch vụ, sửa một bản ghi A, cấu hình scope/option DHCP và gia hạn lease trên máy trạm. | DNS dừng làm truy vấn tên thất bại trong khi website qua IP vẫn hoạt động. DHCP dừng khiến máy trạm chưa có lease hợp lệ không nhận được cấu hình khi renew; lease còn hiệu lực không tự mất ngay. |
| Web Server IIS | Cài role, đổi cổng binding, bật/dừng website và application pool. | Pool dừng làm HTTP trả 503 dù DNS vẫn phân giải đúng; bật pool rồi truy cập lại sẽ có kết quả mới. |
| Kết nối mạng | Đổi IPv4/prefix/gateway/DNS, nối/ngắt cáp mô phỏng, bật/tắt adapter và chạy chẩn đoán. | Gateway sai ảnh hưởng truy cập khác mạng; kết nối tới máy chủ cùng LAN có thể vẫn hoạt động. |
| Một số lỗi Windows Server | Kiểm tra dung lượng D:, dọn tệp cache được phép, kiểm tra quyền đọc Share/NTFS và Startup Type của dịch vụ mẫu LabWorker qua reboot. | Ổ đầy làm ghi tệp kiểm tra 10 MB thất bại; dọn đúng tệp rồi thử ghi lại xác nhận kết quả. |

Mạng mô phỏng chính gồm **CLIENT-01 — SW-01 — SRV-01**, máy chủ `192.168.10.10/24`, gateway `192.168.10.1`, đích thử khác mạng `192.168.20.10` và website `portal.lab.test`. Các địa chỉ và lệnh chỉ có tác dụng trong mô hình.

## Trải nghiệm một tình huống

Trang chủ `/` cho chọn nhóm và tình huống. Chọn **Có hướng dẫn** hoặc **Tự khám phá** để vào desktop tại `/system`. Năm tình huống có hướng dẫn hiện gồm DNS, DHCP, IIS, gateway và ổ đĩa đầy; ngoài ra còn có các tình huống tự khám phá.

Ví dụ với **Không phân giải được tên nội bộ**:

1. Trên CLIENT-01, mở PowerShell, chạy `ping 192.168.10.10` rồi `nslookup portal.lab.test` để phân biệt kết nối IP và phân giải tên.
2. Chọn SRV-01 trên sơ đồ, kiểm tra dịch vụ bằng `Get-Service DNS` hoặc cửa sổ Services. Timeout DNS riêng lẻ chưa đủ để kết luận dịch vụ dừng.
3. Khi đã xác nhận DNS ở trạng thái Stopped, tự bấm **Start** trong Services.
4. Quay lại CLIENT-01, chạy lại truy vấn và mở `http://portal.lab.test` trong trình duyệt mô phỏng để xác nhận phục hồi.
5. Mở **Trợ lý AI** để xem chẩn đoán/công cụ, rồi bấm **Xuất hồ sơ phiên** trong bảng trợ lý để lưu JSON có nhật ký và trace.

![Desktop CLIENT-01: trình duyệt mô phỏng nhận HTTP 200 sau khi DNS trên SRV-01 được bật lại](docs/images/desktop-dns-client.png)

Hướng dẫn dùng XState để theo dõi bằng chứng người dùng tự tạo, focus vị trí thao tác và giải thích bước tiếp theo. Người dùng tự chạy lệnh và áp dụng cấu hình. Khi cấu hình đổi, kết quả cũ được đánh dấu cần kiểm tra lại. Hướng dẫn focus hoạt động độc lập với model AI.

## AI Agent hoạt động như thế nào?

Trợ lý tại `/system` tiếp nhận triệu chứng và quan sát **phiên mô phỏng hiện tại trên máy chủ ứng dụng** qua các công cụ:

- `inspect_network`, `inspect_service`, `inspect_system`, `read_logs`: đọc cấu hình và sự kiện liên quan.
- `run_diagnostic`: chạy lệnh chẩn đoán chỉ đọc trong mô hình, trên máy chủ hoặc máy trạm được chọn.
- `search_knowledge`: tìm trong kho ghi chú kỹ thuật có nguồn Microsoft Learn; đây là nội dung đã biên soạn, chưa phải tìm kiếm Web trực tiếp.

Quy trình hỗ trợ là **quan sát → khoanh vùng → tra cứu → hướng dẫn người dùng sửa → kiểm tra lại**. Agent không nhận nhãn nguyên nhân/đáp án tình huống và không có công cụ tự sửa cấu hình. Hồ sơ lưu đầu vào/đầu ra công cụ để xem căn cứ của nhận định.

**Mặc định dùng chế độ “Cục bộ · không dùng AI”.** Khi cấu hình API, model có thể lựa chọn và gọi công cụ. Lỗi API sẽ được ghi nhận và chuyển sang cục bộ có thông báo. Trace phân biệt công cụ model lựa chọn, phép kiểm cố định của ứng dụng và quy tắc cục bộ; kết quả cục bộ không được tính là kết quả đánh giá model AI.

## Kiểm chứng đã thực hiện đến đâu?

| Loại kiểm chứng | Nội dung và giới hạn |
| --- | --- |
| Kiểm thử mã và giao diện | Có unit/API test, kiểm thử trạng thái, hướng dẫn, công cụ Agent và Playwright. Các kiểm thử này xác nhận hành vi đã khai báo trong mã. |
| Pilot DNS D01–D05 | Chạy thao tác tham chiếu viết sẵn và kiểm tra trạng thái trước/sau. Không gọi AI, không chạy Windows thật và không phải nghiên cứu người dùng. |
| Đối chiếu ca D02 với máy ảo | Đã đo Windows Server 2022 và Windows 11 ngày 02/11/2026; đối chiếu lại log ngày 05/11. Ba giai đoạn bình thường → DNS dừng → khôi phục khớp năm hành vi DNS/IIS cùng LAN trong phạm vi báo cáo. |
| Đánh giá model AI thật | Chưa có kết quả nghiên cứu; đã có rubric và cách ghi trace/bằng chứng. |
| Đánh giá hiệu quả với người dùng | Chưa thực hiện; cần thiết kế thực nghiệm và điều kiện so sánh với giảng viên. |

Kết quả D02 đang ở trạng thái **đã rà bằng công cụ, chờ giảng viên/người thực hiện kiểm tra độc lập**. Lab dùng IP tĩnh và không gateway, còn Web dùng DHCP/gateway; ca này chưa xác nhận DHCP hoặc định tuyến. Thông báo lỗi, thời gian, mã thoát và HTML cũng có khác biệt được ghi trong [biên bản D02](docs/lab-tham-chieu/windows-dns/KET-QUA-DOI-CHIEU-D02-2026-11-02.md).

[Bộ kiểm chứng](docs/kiem-chung/README.md) liên kết ma trận chấp nhận, rubric Agent và phiếu lab. Nút **Xuất hồ sơ phiên** trong Trợ lý AI tải JSON gồm trạng thái đầu/cuối, thao tác, kết quả chẩn đoán và trace trợ lý. Nút **Xuất trạng thái phiên** trên thanh trên cùng chỉ tải snapshot cấu hình. Nhật ký có giới hạn dung lượng và ghi dấu khi bị lược bỏ; tệp xuất chưa hỗ trợ nhập lại phiên.

Bằng chứng thô, ảnh lab, VM và ISO trong `output/` được lưu riêng trên máy, **không nằm trên GitHub**. Repository chứa mã nguồn, ảnh giới thiệu và báo cáo diễn giải; clone mã nguồn không tự có dữ liệu lab để chạy đối chiếu.

## Cài đặt và chạy

Yêu cầu **Node.js 20.9 trở lên**, npm và Git để clone:

```sh
git clone https://github.com/phanduyan134-coder/MoPhongITSUPPORT.git
cd MoPhongITSUPPORT
npm install
npm run dev
```

Mở địa chỉ Local được in trong terminal, thường là `http://127.0.0.1:3000`. Trang chủ cho chọn tình huống; không cần API key hoặc máy ảo để dùng mô phỏng và hướng dẫn cục bộ.

Chạy bản tối ưu bằng `npm run build`, sau đó `npm start`.

<details>
<summary>Cấu hình model AI tùy chọn</summary>

Tạo `.env.local` dựa trên [.env.example](.env.example), điền khóa riêng và model có hỗ trợ Responses API mà tài khoản được phép dùng:

```dotenv
SUPPORTLAB_AI_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=https://api.openai.com/v1
```

Khởi động lại ứng dụng sau khi cấu hình. Model không được chọn mặc định; khóa chỉ dùng ở máy chủ ứng dụng và không commit vào Git. Xem [rubric đánh giá Agent](docs/kiem-chung/danh-gia-agent.md) để phân biệt đánh giá model thật với chế độ cục bộ.

</details>

## Chạy kiểm thử và các bộ đánh giá

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright dùng cổng `3100`, thư mục `.next-e2e` và trợ lý cục bộ. Bản phát triển dùng `.next-dev`, bản build dùng `.next`.

| Lệnh | Mục đích | Điều kiện và tài liệu |
| --- | --- | --- |
| `npm run pilot:dns` | Kiểm tra D01–D05 trong engine theo thao tác tham chiếu. | Không cần API/VM. [Pilot DNS](experiments/dns-pilot/README.md). |
| `npm run compare:dns` | So sánh mô phỏng hiện tại với log lab D02 đã lưu. | Cần bản sao bằng chứng cục bộ trong `output/`; lệnh dừng nếu thiếu dữ liệu, không khởi động VM. [Đối chiếu DNS](experiments/dns-reference/README.md). |
| `npm run evaluate:agent` | Kiểm tra phản hồi và trace của trợ lý quy tắc cục bộ. | Không gọi model AI thật. [Đánh giá cục bộ](experiments/agent-evaluation/README.md). |

## Kiến trúc và giới hạn

**Công nghệ:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Lucide React, Zustand, Zod, XState và Motion for React; kiểm thử bằng Node.js Test Runner/tsx và Playwright.

| Thành phần | Vai trò |
| --- | --- |
| [Engine mô phỏng](src/lib/system-simulator.ts) | Trạng thái hệ thống, thao tác cấu hình và kết quả chẩn đoán. |
| [API mô phỏng](src/app/api/simulation/route.ts) và [phiên](src/lib/system-session.ts) | Giữ trạng thái chính trên máy chủ ứng dụng; kiểm tra revision để từ chối thao tác trên dữ liệu cũ. |
| [Store giao diện](src/lib/system-store.ts) và [desktop](src/components/device-desktop.tsx) | Phản chiếu cùng phiên, quản lý cửa sổ và thao tác từng máy. |
| [API Agent](src/app/api/system-agent/route.ts) và [kho tri thức](src/lib/system-knowledge.ts) | Công cụ quan sát, chẩn đoán và truy xuất ghi chú kỹ thuật. |
| [Hồ sơ phiên](src/lib/system-evidence.ts) | Cấu trúc JSON cho thao tác, quan sát và trace trợ lý. |

Bản mẫu giới hạn IPv4, một bản ghi DNS, một scope DHCP, IIS HTTP, quyền đọc Share/NTFS cho danh tính mẫu, ổ dữ liệu D: và LabWorker. Chưa có AD DS/domain, DNS zone/cache/forwarder đầy đủ, HTTPS hoặc toàn bộ giao diện Windows. Lệnh PowerShell và trình duyệt chỉ hỗ trợ các thao tác mô phỏng đã định nghĩa. Chất lượng mô phỏng ngoài ca D02 còn cần đối chiếu thêm.

Phiên lưu trong RAM của một tiến trình, hết hạn sau 2 giờ không hoạt động, tối đa 200 phiên. Tải lại trang hoặc tạo phiên mới đặt lại dữ liệu; chưa có tài khoản, lưu phiên bền vững, nhập lại JSON hay lưu trữ phiên dùng chung giữa nhiều instance.

## Tài liệu bổ sung và mô-đun cũ

- [Giải thích phần mềm cho người mới](docs/giai-thich-phan-mem.md).
- [Hướng dẫn desktop và các công cụ](docs/giao-dien-desktop-mo-phong.md).
- [Kế hoạch chỉnh sửa theo góp ý giảng viên](docs/ke-hoach-chinh-sua/README.md).
- [Lab tham chiếu Windows DNS](docs/lab-tham-chieu/windows-dns/README.md).
- [Mô-đun cài Windows trước đây](docs/mo-dun-cai-windows.md): cách dùng `/pc`, BIOS, USB/driver, sổ tay và hồ sơ ASUS. Nội dung được giữ để tham khảo, nằm ngoài trọng tâm bốn nhóm của bản hiện tại.

Luồng chính luôn mở desktop mới. Giao diện classic chỉ giữ tại `/system?workspace=classic` để đối chiếu kỹ thuật và đã ẩn liên kết khỏi trang chủ. Tài liệu Word/Excel cá nhân, API key, thư viện cài đặt, bản build và dữ liệu `output/` được loại khỏi repository bằng `.gitignore`.
