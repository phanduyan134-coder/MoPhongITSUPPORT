# Phiếu đối chiếu ca DNS dừng trên Windows Server

**Trạng thái: chưa đo (`not-run` / `pending-lab`).** Đây là mẫu ghi nhận, chưa phải kết quả thực nghiệm. Không thay ô kết quả thực tế bằng kết quả dự kiến.

## 1. Định danh lần đối chiếu

| Hạng mục | Giá trị thực tế |
| --- | --- |
| Nhãn lần chạy dùng chung cho hai guest, ví dụ `D02-reference-01` | Chưa ghi |
| Người thực hiện, người rà soát và ngày thực hiện | Chưa ghi |
| Phiên bản/build/edition Windows Server và Windows client | Chưa đo |
| Phiên bản VirtualBox và cấu hình RAM/CPU/ổ ảo | Chưa ghi |
| UUID VM, tên máy, snapshot trước thử | Chưa ghi |
| Tên Internal Network, IP/prefix/DNS của hai guest | Chưa đo |
| Zone, bản ghi A, IIS site/binding và firewall guest | Chưa đo |
| Bộ pilot mô phỏng được đối chiếu: case/run ID, commit, trạng thái dirty và source hashes | Chưa ghi |
| Phiên bản protocol và hash các script thu thập | Chưa ghi; lấy từ `observation.json` |

Ca mục tiêu tương ứng D02: dịch vụ DNS dừng, trong khi kết nối LAN và IIS được giữ nguyên. Máy trạm dùng IP tĩnh để không thêm DHCP vào nguyên nhân. Gateway để trống vì chỉ thử LAN; đây là khác biệt chủ ý với mô hình Web có gateway mô phỏng.

## 2. Thu thập ba giai đoạn trong máy ảo

Chép cả thư mục `scripts` vào hai guest. Các lệnh dưới đây chạy bằng **Windows PowerShell quản trị bên trong đúng máy ảo**, không chạy trên laptop. Guard từ chối sai VM/UUID/hostname hoặc cấu hình mạng chưa đúng.

Trong SRV-01, tại thư mục script:

```powershell
.\Capture-LabObservation.ps1 -Role server -Phase healthy -RunLabel D02-reference-01
```

Trong CLIENT-01, cùng nhãn lần chạy:

```powershell
.\Capture-LabObservation.ps1 -Role client -Phase healthy -RunLabel D02-reference-01
```

Sau khi đã xác nhận DNS và website hoạt động bình thường, dừng **chỉ dịch vụ DNS trên SRV-01 trong máy ảo** bằng Services hoặc thao tác được kiểm soát. Không thay IP, bản ghi hoặc IIS trong giai đoạn này. Chạy lại script trên cả hai guest với `-Phase dns-stopped`. Sau đó bật lại DNS trên SRV-01, giữ nguyên các thành phần khác và chạy cả hai guest với `-Phase restored`.

Mỗi lần gọi tạo thư mục mới tại `C:\SupportLab\evidence\D02-reference-01\` trong guest, có `observation.json` cùng các tệp stdout/stderr của lệnh thật. Script ghi exit code, thời lượng và timeout; không tự kết luận đạt. `phaseLabel` là nhãn người thực hiện chọn, không phải kết quả quan sát đã được xác minh.

Exit code không thay thế việc đọc kết quả: `Get-Service DNS` có thể chạy thành công và báo dịch vụ `Stopped`; `curl.exe` có thể trả exit code 0 nhưng HTTP là 503. Phải đối chiếu trạng thái dịch vụ và mã HTTP trong đầu ra thực tế.

Phía client gồm ping, `nslookup` dùng DNS mặc định, `nslookup` chỉ định `.10` và HTTP bằng `curl.exe`. Trước HTTP, script ghi nhận `ipconfig /flushdns` để hạn chế cache; thao tác này không khắc phục dịch vụ DNS. Phía server ghi `Get-Service DNS`, truy vấn bản ghi A và cấu hình IIS. Khi dịch vụ dừng, một số lệnh quản lý DNS có thể trả lỗi; phải giữ cả đầu ra lỗi.

## 3. Bảng đối chiếu hành vi

| Quan sát | Bình thường: thực tế | DNS dừng: thực tế | DNS bật lại: thực tế | So với mô phỏng / khác biệt |
| --- | --- | --- | --- | --- |
| `Get-Service DNS` trên SRV-01 | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| IP/prefix/DNS máy trạm | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| Ping máy chủ qua IP | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| Truy vấn A qua DNS mặc định | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| Truy vấn A chỉ định `192.168.10.10` | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| Địa chỉ A trả về, nếu có | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| HTTP theo tên sau bước xóa cache | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |
| HTTP theo IP (phép kiểm soát IIS, không cần DNS) | Chưa đo | Chưa đo | Chưa đo | Bổ sung trong lab; journal D02 cũ chưa có lệnh này |
| Trạng thái IIS và cấu hình không liên quan | Chưa đo | Chưa đo | Chưa đo | Chưa đối chiếu |

Không ép Windows trả đúng chuỗi mô phỏng. Timeout, lỗi phản hồi, số lần thử, reverse lookup tên DNS server, thời gian và bộ nhớ đệm có thể khác. Timeout từ client chưa chứng minh DNS Server dừng; cần đầu ra phía server tương ứng. Nếu HTTP còn thành công khi DNS dừng, kiểm tra cache, hosts, proxy, DNS dự phòng hoặc dịch vụ phân giải khác và ghi nguyên hiện tượng.

## 4. Ảnh màn hình và lưu hồ sơ

Lưu cả ảnh thật của màn hình guest ở ba giai đoạn, thể hiện tên VM, trạng thái dịch vụ hoặc đầu ra lệnh. Không dùng ảnh mockup hay ảnh mô phỏng Web làm ảnh Windows thật.

Có thể chụp console guest bằng VBoxManage **trên laptop**; lệnh này chỉ chụp VM, không cấu hình DNS/IP host. Thư mục đích phải tồn tại và tên ảnh phải mới:

```powershell
& 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe' controlvm 'SupportLab-SRV-01' screenshotpng 'D:\KhoaLuan\output\evidence\windows-dns\D02-reference-01\healthy-server.png'
```

Sau khi thu đủ sáu bộ quan sát (server và client cho mỗi giai đoạn), sao chép nguyên các thư mục từ guest về `output/evidence/windows-dns/D02-reference-01/` trên laptop. Giữ riêng nguồn `server/`, `client/`, ảnh và bản phiếu điền; không ghi đè JSON pilot hoặc đổi nhãn `pending-lab` của bằng chứng cũ.

## 5. Kết luận sau rà soát

| Hạng mục | Kết quả |
| --- | --- |
| Đã đủ ba giai đoạn và hai phía server/client chưa? | Chưa đánh giá |
| Trạng thái thực tế có phù hợp giả định ca D02 không? | Chưa đánh giá |
| Các điểm mô phỏng khớp trong phạm vi lựa chọn | Chưa đánh giá |
| Các sai khác và tác động đến kết luận | Chưa đánh giá |
| Cần sửa engine, ca tham chiếu hay giới hạn phát biểu? | Chưa đánh giá |
| Người rà soát, ngày rà soát và bằng chứng kèm theo | Chưa ghi |
| Trạng thái đối chiếu cuối | `pending-lab` |

Một ca đối chiếu thành công chỉ hỗ trợ kết luận cho hành vi đã đo. Nó chưa chứng minh mọi nhóm tình huống, độ chính xác của AI Agent hoặc hiệu quả học tập.
