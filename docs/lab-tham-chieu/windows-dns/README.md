# Lab tham chiếu DNS trên hai máy ảo

Trạng thái ngày 02/11/2026: đã cài Windows Server 2022 Standard Evaluation Desktop Experience và Windows 11 Enterprise Evaluation trong hai VM. Đã cấu hình mạng riêng/DNS/IIS và thu đủ sáu quan sát cho ba giai đoạn bình thường, DNS dừng, DNS khôi phục. DNS được bật lại thành công; raw outputs và hash đã được rà. Xem [báo cáo dễ đọc](BAO-CAO-TIEN-DO-2026-11-02.md) và [biên bản đối chiếu D02](KET-QUA-DOI-CHIEU-D02-2026-11-02.md).

Hai VM đã tắt sau thử nghiệm; mỗi VM có snapshot `dns-reference-complete-20261102`. Đĩa cài đặt ảo đã tháo. `output/labs/windows-dns/final-lab-state.json` ghi trạng thái cuối và UUID snapshot; mở lại VM khi cần xem lab, không cần chạy chúng để dùng Web mô phỏng.

Kết quả có trạng thái `agent-reviewed-awaiting-supervisor`, giới hạn ở hành vi DNS/IIS cùng LAN đã đo. Pilot ngoại tuyến trước đây vẫn giữ `pending-lab`; không dùng ca này để tự xác nhận mọi trạng thái, AI Agent hoặc hiệu quả học tập. ISO client sau phục hồi vùng tải lỗi đã khớp SHA-256 Microsoft trước khi cài. Client Evaluation đang báo trạng thái giấy phép 5/thời gian grace 0; cần giải quyết bằng kích hoạt/giấy phép hợp lệ trước thử nghiệm dài hạn.

## Nguyên tắc đã thống nhất

- Hai máy ảo chạy trên laptop của người thực hiện bằng VirtualBox.
- Chỉ cài DNS/IIS, đặt IP, dừng/bật dịch vụ và tạo lỗi bên trong máy ảo. Không chạy các lệnh cấu hình lab trên Windows thật của laptop.
- Laptop cần phần mềm và driver ảo hóa VirtualBox; đây là thay đổi cần thiết để chạy máy ảo. Cài tối thiểu `VBoxApplication`, không thêm bridged, host-only, USB, Python hoặc Extension Pack cho lab này.
- Mạng thử nghiệm là **Internal Network** tên `SupportLab-DNS`, không NAT hoặc nối bridged ra mạng đang sử dụng. Không cài DHCP vào ca đối chiếu DNS đầu tiên.

## Cấu hình lab

| Thành phần | SRV-01 | CLIENT-01 |
| --- | --- | --- |
| Hệ điều hành | Windows Server 2022 Evaluation, Desktop Experience | Windows 11 Enterprise Evaluation 26H2, x64 |
| RAM trong lượt đối chiếu | 2 GiB (ban đầu cài bằng 4 GiB) | 4 GiB |
| CPU ảo | 2 | 2 |
| Ổ đĩa ảo | 60 GiB, cấp phát động | 64 GiB, cấp phát động |
| Firmware | UEFI | UEFI, TPM ảo 2.0 theo yêu cầu Windows 11 |
| Card mạng | Internal Network `SupportLab-DNS` | Internal Network `SupportLab-DNS` |
| IP trong guest | `192.168.10.10/24` | `192.168.10.100/24` |
| DNS trong guest | `192.168.10.10` | `192.168.10.10` |
| Gateway | Để trống khi lab chỉ có LAN cô lập | Để trống khi lab chỉ có LAN cô lập |

Địa chỉ gateway trống là khác biệt chủ ý với mô hình Web có gateway mô phỏng. Ca này chỉ kiểm chứng kết nối cùng LAN, DNS và HTTP, chưa kiểm chứng định tuyến.

Laptop đã kiểm tra có khoảng 16 GB RAM, CPU hỗ trợ ảo hóa và ổ D còn khoảng 136 GB tại thời điểm khảo sát. Cần giải phóng bộ nhớ trước khi chạy đồng thời hai guest 4 GiB. Ổ động vẫn có thể tăng đến dung lượng tối đa; phải tính thêm ISO và snapshot, theo dõi ổ trống trong quá trình dùng.

## Các bước thực hiện

1. Tải bộ cài VirtualBox từ Oracle; đối chiếu SHA-256 và chữ ký nhà phát hành. Cài tối thiểu sau khi người dùng xác nhận cửa sổ UAC nếu Windows yêu cầu.
2. Chuẩn bị ISO đánh giá từ Microsoft. Đã tìm được đường dẫn ISO trên các trang download công khai của Microsoft, không gửi biểu mẫu. Nếu trang tải yêu cầu đăng ký, người thực hiện tự điền thông tin trên trang chính thức. Không dùng ISO chia sẻ không rõ nguồn.
3. Tạo hai VM, kiểm tra card mạng chỉ thuộc Internal Network; cài hệ điều hành và ghi lại edition/build thực tế. Cấu hình tài khoản quản trị trong guest, không lưu mật khẩu vào Git hoặc báo cáo.
4. Trong SRV-01, cài role DNS và IIS; tạo zone `lab.test`, bản ghi A `portal` trỏ `192.168.10.10`, cấu hình website trả HTTP 200. Chỉ mở cổng cần thiết trong firewall của guest cho mạng lab, không tắt toàn bộ firewall.
5. Trong CLIENT-01, cấu hình IP và DNS như bảng. Không thêm DNS dự phòng, bản ghi hosts hay proxy làm thay đổi đường kiểm tra.
6. Ghi kết quả ba giai đoạn: bình thường, DNS dừng, DNS khởi động lại. Trong mỗi giai đoạn, ghi trạng thái dịch vụ phía server và kết quả quan sát phía client.
7. Lưu đầu ra gốc, ảnh màn hình VM, thông tin phiên bản và bảng sai khác. Chỉ cập nhật trạng thái đối chiếu khi thật sự thực hiện xong.

Các bản Evaluation có thời hạn (Server 180 ngày, client 90 ngày) và có yêu cầu kích hoạt. Nếu cài/kích hoạt cần Internet, chỉ nối NAT tạm cho guest rồi tháo trước giai đoạn thử; vẫn không chỉnh IP/DNS host hoặc dùng bridged. Thời điểm bắt đầu sử dụng client cần phù hợp lịch đánh giá, không mặc định bản đánh giá kéo dài tới hết kỳ khóa luận.

Installer Oracle đã đối chiếu SHA-256 và chữ ký `Oracle America, Inc.` hợp lệ trước khi chạy. Hai VM đã kiểm tra dùng một Internal Network, không NAT/bridged và không card phụ. Script tạo VM ở `output/labs/windows-dns/prepare-vms.ps1` chỉ tạo ổ VDI mới, không khởi động guest hay cấu hình mạng host; script từ chối ghi đè VM sẵn có.

## Phép kiểm tra tối thiểu

### Công cụ đã chuẩn bị

| Tệp | Chạy ở đâu | Chức năng |
| --- | --- | --- |
| [Assert-LabGuest.ps1](scripts/Assert-LabGuest.ps1) | Trong guest | Kiểm VirtualBox, UUID, tên máy, OS và card mạng trước khi cho phép cấu hình |
| [Initialize-LabServer.ps1](scripts/Initialize-LabServer.ps1) | SRV-01, PowerShell quản trị | Đặt IP máy chủ, triển khai DNS/IIS, tạo zone và bản ghi A trong phạm vi lab |
| [Initialize-LabClient.ps1](scripts/Initialize-LabClient.ps1) | CLIENT-01, PowerShell quản trị | Đặt IP máy trạm và DNS nội bộ, không gateway |
| [Capture-LabObservation.ps1](scripts/Capture-LabObservation.ps1) | Từng guest, PowerShell quản trị 64-bit | Ghi phiên bản, cấu hình và đầu ra lệnh thực, kể cả lỗi/timeout; không tự kết luận đúng với mô phỏng |
| [Build-LabToolsIso.ps1](host/Build-LabToolsIso.ps1) | Laptop | Đóng gói bốn script guest vào ISO dữ liệu; không chạy chúng hay thay đổi mạng host |
| [Download-LabMedia.ps1](host/Download-LabMedia.ps1) | Laptop | Tải tiếp ISO Microsoft từ `.part`, giữ dữ liệu nếu lỗi; kiểm kích thước và hash trước khi đổi thành `.iso` |
| [Download-LabClientClean.ps1](host/Download-LabClientClean.ps1) | Laptop | Tải client độc lập theo vùng byte, kiểm Content-Range/kích thước rồi hash toàn bộ; không sử dụng ISO chưa khớp hash |
| [Stage-LabInstaller.ps1](host/Stage-LabInstaller.ps1) | Laptop | Chờ ISO hoàn chỉnh, kiểm lại và gắn DVD vào VM đang tắt có đúng UUID/VDI/Internal Network; không khởi động hay cài Windows |
| [Prepare-LabUnattended.ps1](host/Prepare-LabUnattended.ps1) | Laptop | Chuẩn bị bộ cài tự động cho VDI mới, chọn edition theo tên thực tế trong ISO, lưu mật khẩu VM vào thư mục hạn chế quyền; không tự boot |
| [Invoke-DnsReference.ps1](host/Invoke-DnsReference.ps1) | Laptop, khi cả hai guest đã cấu hình xong | Thu sáu quan sát, dừng/bật DNS chỉ ở Server, xuất đầu ra và hash; đã chạy lượt D02 ngày 02/11 |
| [Show-LabRecordedObservation.ps1](scripts/Show-LabRecordedObservation.ps1) | Console đúng guest | Kiểm hash rồi hiển thị trích đoạn kết quả đã lưu để chụp ảnh; không thực hiện phép đo mới |

Đã kiểm tra cú pháp PowerShell và chạy riêng hàm kiểm tra chỉ đọc trên laptop: cả hai vai trò đều bị từ chối với thông báo không phải guest VirtualBox; không gọi lệnh cấu hình trên host. Đã chạy hai initializer trong đúng guest và `Invoke-DnsReference.ps1` cho lượt `D02-reference-20261102-01`, thu đủ sáu quan sát. Bảng công cụ giữ hướng dẫn để tái lập; kết quả cụ thể và giới hạn nằm trong biên bản riêng.

ISO công cụ mới nhất đã tạo tại `output/labs/windows-dns/tools-20261102T132004677Z/supportlab-guest-tools.iso`. Bản này sửa trường hợp card mạng guest không còn IPv4 sau khi tắt DHCP và bổ sung HTTP theo IP trong protocol thu thập v2. Không dùng bản ISO công cụ cũ cho lần đo mới. File `build.json` cạnh ISO lưu hash từng nguồn và hash ISO. Chỉ đưa vào ISO bốn script được liệt kê, không kèm tài liệu cá nhân hoặc thông tin đăng nhập. Nếu sửa script, cần đóng gói lại; build mới có thư mục riêng.

Hai lệnh sau chạy **trên laptop** để tải tiếp một bộ cài và gắn vào đúng VM đang tắt. Dùng `-Role client` cho máy trạm. Không khởi chạy thêm bản tải thủ công khi worker cùng vai trò đang chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/lab-tham-chieu/windows-dns/host/Download-LabMedia.ps1 -Role server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/lab-tham-chieu/windows-dns/host/Stage-LabInstaller.ps1 -Role server -Watch -WaitMinutes 360
```

`download-server.json`, `download-client.json` và `stage-*.json` trong `output/labs/windows-dns/` lưu trạng thái công việc. Trạng thái cũ không chứng minh tiến trình còn chạy: đối chiếu `workerPid` và `updatedAt`; tiến độ tải trực tiếp nằm ở `stage-*.json` khi worker chờ còn hoạt động. Công cụ kiểm chứng lại SHA-256 Windows client theo giá trị Microsoft công bố. Với ISO Server, đã có nguồn HTTPS Microsoft và kích thước dự kiến, còn SHA-256 được tính để ghi nhận; **chưa có hash độc lập để xác nhận tương ứng**. `staged` chỉ có nghĩa ISO đã gắn vào VM tắt, không có nghĩa Windows được cài hay DNS đã đo.

Sau khi cài Windows, đổi tên máy **bên trong đúng guest** thành `SRV-01` hoặc `CLIENT-01`, khởi động lại guest rồi mới dùng script. Khi thay ISO cài Windows bằng ISO công cụ, sao chép bốn file vào `C:\SupportLab\scripts` bên trong guest. Các script từ chối UUID/hostname khác; không bỏ kiểm tra để chạy trên laptop.

Ví dụ trong PowerShell quản trị của **SRV-01**, tại thư mục script:

```powershell
.\Initialize-LabServer.ps1
.\Capture-LabObservation.ps1 -Role server -Phase healthy
```

Trên CLIENT-01, dùng `Initialize-LabClient.ps1` và `-Role client`. Ba nhãn thu thập là `healthy`, `dns-stopped`, `restored`; chúng chỉ là nhãn người thực hiện, không tự xác nhận trạng thái. Script không tự dừng/bật DNS. Ghi đủ quan sát từ cả hai guest ở mỗi giai đoạn, sau đó hoàn thành [phiếu đối chiếu](PHIEU-DOI-CHIEU.md).

### Lệnh đối chiếu trong guest

Trên **SRV-01**, mở PowerShell quản trị trong máy ảo:

```powershell
Get-Service DNS
```

Trong từng giai đoạn, trên **CLIENT-01**:

```powershell
ipconfig /all
ping 192.168.10.10
nslookup -type=A portal.lab.test
nslookup -type=A portal.lab.test 192.168.10.10
ipconfig /flushdns
curl.exe --noproxy "*" http://portal.lab.test
curl.exe --noproxy "*" http://192.168.10.10
```

`nslookup` trực tiếp hỏi máy chủ; xóa cache trước phép thử HTTP giúp tránh dùng địa chỉ đã lưu. Dùng `curl.exe` để không nhầm alias PowerShell. Timeout DNS chưa đủ kết luận nguyên nhân: cần cả bằng chứng dịch vụ ở SRV-01. Windows có thể trả thông báo, số lần thử hoặc thời gian khác mô phỏng; phải ghi nhận thay vì sửa log cho giống nhau.

HTTP theo IP là phép kiểm soát bổ sung để xác nhận IIS có còn phục vụ khi DNS dừng. Journal D02 ngoại tuyến cũ chưa ghi lệnh này. D02 có hai nhãn trước/sau khi sửa, còn lab có thêm giai đoạn bình thường trước khi gây lỗi; so sánh hành vi theo từng phép thử, không coi ba giai đoạn là cấu trúc có sẵn của journal. Lab cũng dùng IP tĩnh và không có DHCP/gateway nên chỉ hỗ trợ kết luận về DNS cùng LAN, chưa kiểm chứng toàn bộ trạng thái DHCP/định tuyến trong D02.

## Lưu bằng chứng

- Installer, ISO và VM: `output/labs/windows-dns/`.
- Kết quả đối chiếu thực tế sau khi chạy: `output/evidence/windows-dns/<ngay-lan-chay>/`.
- Giữ nguyên bằng chứng pilot ngoại tuyến và phiên mô phỏng Web đã có; không đổi nhãn của chúng thành kết quả Windows thật.
- Toàn bộ `output/` đã được Git bỏ qua. Cần sao lưu VM và bằng chứng quan trọng bên ngoài Git trước khi dọn ổ.

## Nguồn chuẩn bị

- [Oracle VirtualBox Downloads](https://www.virtualbox.org/wiki/Downloads).
- [Cài VirtualBox trên Windows](https://www.virtualbox.org/manual/ch02.html).
- [Các chế độ mạng VirtualBox](https://www.virtualbox.org/manual/ch06.html).
- [Lệnh VBoxManage](https://www.virtualbox.org/manual/ch08.html).
- [Windows Server 2022 Evaluation](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-server-2022).
- [Windows 11 Enterprise Evaluation](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise).
- [Trang ISO Windows Server 2022 công khai](https://www.microsoft.com/en-us/evalcenter/download-windows-server-2022).
- [Trang ISO Windows 11 Enterprise công khai](https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise).
- [Đối chiếu SHA-256 Windows 11 Enterprise Evaluation](https://support.microsoft.com/en-us/servicing/os/windows/docs/2026/09/verify-the-authenticity-of-a-windows-11-enterprise-evaluation-iso-file).

Không dùng mù template unattended mặc định của VirtualBox: phiên bản đã rà có cấu hình bỏ qua kiểm tra phần cứng và tự đăng nhập. Đã chuẩn bị template riêng trong `host/templates/`, không bỏ qua kiểm tra phần cứng, chỉ đăng nhập tự động một lần; bước sau cài sẽ tắt tự đăng nhập trước khi cài Guest Additions. Template có kiểm tra UUID/tên guest để từ chối chạy nhầm trên laptop. Kiểm tra cú pháp chưa chứng minh Windows đã cài thành công.

Khi ISO hoàn chỉnh, dùng `VBoxManage unattended detect --iso=<duong-dan-ISO> --machine-readable` để đọc tên edition, rồi mới truyền tên chính xác cho `Prepare-LabUnattended.ps1 -Role server -EditionName '<ten edition trong ISO>'`. Chỉ chọn bản Server **Desktop Experience**. Công cụ từ chối VDI đã có dữ liệu, VM bật, card mạng phụ hoặc thư mục chuẩn bị đã tồn tại; không dùng để cài đè một guest đang làm việc.

Mật khẩu ngẫu nhiên riêng cho guest, XML và media sinh ra nằm trong `output/labs/windows-dns/private/<vai-tro>/`, chỉ cấp quyền cho người chạy, SYSTEM và nhóm quản trị. Không đưa thư mục này vào GitHub hoặc hồ sơ thực nghiệm; XML/media có chứa mật khẩu. Sau khi chuẩn bị, phải rà edition, XML và mạng VM trước khi tự khởi động **từng máy ảo một**. `prepared-not-booted` không phải kết quả cài Windows hoặc đối chiếu DNS.

README này hướng dẫn cách chuẩn bị và tái lập lab. Dữ liệu thực nghiệm ngày 02/11/2026 và phần rà soát được ghi riêng trong báo cáo/biên bản liên kết ở đầu trang.
