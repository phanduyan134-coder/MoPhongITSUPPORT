# Ma trận chấp nhận bốn nhóm mô phỏng

Đây là ma trận kỹ thuật để chốt phạm vi. Mỗi ca chỉ được ghi đạt khi có trạng thái trước, thao tác người dùng, trạng thái sau và phép kiểm mới cùng revision.

| Nhóm/ca đề xuất | Trạng thái lỗi | Thao tác người học | Phép kiểm sau sửa | Bất biến cần giữ | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| DNS/DHCP · DNS dừng | DNS trên SRV-01 `Stopped`; IP và IIS vẫn hoạt động | Mở Services → Start DNS | CLIENT-01: `nslookup portal.lab.test`; HTTP theo tên | IP LAN và IIS không đổi | Terminal trước/sau, action, revision, ảnh |
| DNS/DHCP · A record sai | DNS trả `192.168.10.99` | DNS Manager → `portal` → Properties → Apply `192.168.10.10` | nslookup mới và HTTP theo tên | DHCP, gateway, service không đổi | Properties, query trước/sau |
| DNS/DHCP · DHCP dừng | CLIENT-01 không có lease hợp lệ | Start DHCP → Renew DHCP lease | `ipconfig /all`, nslookup mới | DNS option và IP server không đổi | DHCP ACK, lease, revision |
| IIS · pool dừng | DNS đúng; HTTP trả 503 | IIS Manager → Start application pool → Apply | HTTP theo tên trả 200 | DNS/A record không đổi | HTTP 503/200, pool state |
| Kết nối mạng · gateway sai | Ping cùng LAN đạt; mạng khác không đạt | Renew DHCP hoặc sửa option hợp lệ | Ping đích khác mạng đạt | Không đổi IP tĩnh trái quy trình | `ipconfig /all`, ping trước/sau |
| Windows Server · ổ đầy | D: còn 4 MB; ghi 10 MB thất bại | File Explorer xóa tệp cache được phép; ghi thử | Write probe 10 MB đạt | Tệp dữ liệu khách hàng không bị xóa | Dialog xác nhận, output, state |

## Quy tắc nghiệm thu

- Cấu hình nháp không tính là thay đổi cho tới khi bấm Apply/Start/OK tương ứng.
- Kết quả cũ sau khi revision đổi phải được đánh dấu stale và không được dùng để kết luận phục hồi.
- Sửa một thành phần không được tự sửa thành phần khác.
- Lệnh đúng nhưng sai máy, sai revision hoặc sai loại bằng chứng không được hoàn tất hướng dẫn.
- Mô phỏng được phép rút gọn timing, packet và filesystem; mọi rút gọn phải ghi trong cột giới hạn của báo cáo.

## Trạng thái hiện tại

- DNS/DHCP, IIS, network và Windows Server đã có engine, UI và test kỹ thuật.
- Chỉ DNS/IIS cùng LAN đã có đối chiếu VM được lưu; các hàng còn lại cần phiếu lab riêng.
- Không dùng ma trận này để tuyên bố mô phỏng toàn bộ Windows Server.
