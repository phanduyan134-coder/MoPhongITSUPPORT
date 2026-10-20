export const storageDriverPreparationNotice = "Một số máy cần driver Intel RST/VMD hoặc RAID để Windows Setup nhận SSD, không phải mọi máy đều cần. Tra tài liệu đúng model; nếu cần, tải, giải nén và chép driver vào USB đã tạo bộ cài trước khi cắm sang máy cần cài. Chép vào USB là chuẩn bị tệp; nạp driver là thao tác Load driver trong Windows Setup khi bộ cài chưa nhận SSD.";

export const storageDriverFirmwareNotice = "Trên máy thật, nếu BIOS không nhận SSD, cần kiểm tra kết nối, phần cứng hoặc cấu hình; nạp driver trong Windows Setup không giải quyết được mọi nguyên nhân.";

export const storageDriverSources = [
  { name: "ASUS", url: "https://www.asus.com/support/download-center/", hint: "Tra model đầy đủ của laptop hoặc máy nguyên bộ; chọn hệ điều hành và đọc hướng dẫn driver lưu trữ của model." },
  { name: "Dell", url: "https://www.dell.com/support/home/", hint: "Tra Service Tag hoặc model, kiểm tra bộ điều khiển RAID/RST/VMD và gói driver được Dell cung cấp." },
  { name: "HP", url: "https://support.hp.com/drivers", hint: "Tra Product Number và phiên bản Windows; kiểm tra hướng dẫn trích xuất driver lưu trữ của gói HP." },
  { name: "Mainboard ASUS", url: "https://www.asus.com/support/download-center/", hint: "Tra đúng model và revision mainboard; chỉ dùng driver tương ứng bộ điều khiển và chế độ RAID/VMD thực tế." },
  { name: "Mainboard MSI", url: "https://www.msi.com/support", hint: "Tra model mainboard, phiên bản Windows và mục driver lưu trữ theo hướng dẫn MSI." },
  { name: "Mainboard GIGABYTE", url: "https://www.gigabyte.com/Support", hint: "Đối chiếu model và revision in trên bo mạch trước khi chọn gói driver." },
  { name: "Mainboard ASRock", url: "https://www.asrock.com/support/", hint: "Tra model, nền tảng và hướng dẫn cài driver RAID/lưu trữ nếu cấu hình cần dùng." },
] as const;

export const storageDriverPreparationSteps = [
  {
    title: "Xác định đúng máy và nhu cầu driver",
    detail: "Ghi model đầy đủ, Service Tag/Product Number hoặc model và revision mainboard; xác định CPU, bộ điều khiển lưu trữ, bản Windows và kiến trúc x64/ARM64. Nếu BIOS thấy SSD nhưng Windows Setup không thấy, đối chiếu tài liệu để xác định có cần driver bộ điều khiển hay không. Không mặc định mọi ASUS hay mọi máy Intel đều cần IRST; máy AMD không dùng driver Intel VMD.",
  },
  {
    title: "Tải gói từ trang hỗ trợ chính hãng",
    detail: "Nếu máy đích chưa có Windows hoặc Internet, dùng máy khác đang hoạt động và có mạng. Tra đúng thiết bị, chọn Windows/kiến trúc được hỗ trợ rồi đọc mục chipset, storage, SATA, RAID hoặc IRST; tên mục tùy hãng. Chọn gói F6/preinstall hoặc cách lấy driver cho Windows Setup được hãng hướng dẫn, không chọn gói chỉ vì tên gần giống.",
  },
  {
    title: "Giải nén driver trên máy đang hoạt động",
    detail: "Giải nén ZIP, hoặc làm theo chức năng trích xuất mà hãng công bố cho đúng gói EXE. Giữ nguyên thư mục và các tệp .inf, .sys, .cat thuộc cùng gói, đúng kiến trúc và bộ điều khiển. Không đổi tên, ghép tệp từ gói khác hoặc chạy EXE bất kỳ trong Windows Setup; không có một lệnh giải nén chung cho mọi hãng.",
  },
  {
    title: "Chép thư mục driver sang USB",
    detail: "Tạo USB boot Windows trước, sau đó chép thư mục đã giải nén vào Drivers/Storage trên USB đó nếu còn chỗ, hoặc trên USB thứ hai mà bộ cài có thể đọc. Giữ các thư mục con của gói. Không format hay tạo lại USB boot sau khi chép vì dữ liệu sẽ bị xóa. Đây là lưu tệp driver trên USB để bộ cài đọc, không phải cài driver cho USB.",
  },
  {
    title: "Chọn thư mục trong Windows Setup",
    detail: "Cắm USB chứa driver vào máy đích. Ở màn hình chọn ổ đĩa, chọn Load driver → Browse và trỏ tới thư mục có INF phù hợp, ví dụ Drivers/Storage cùng thư mục con của gói. Chọn bộ điều khiển tương thích theo tài liệu hãng rồi nạp; đối chiếu lại dung lượng và ổ đích khi SSD xuất hiện. Nếu không có driver tương thích hoặc ổ vẫn không hiện, dừng kiểm tra gói, kiến trúc và firmware thay vì ép chọn driver khác.",
  },
] as const;

export const storageDriverNotes = [
  "Nạp driver lưu trữ chỉ giúp bộ cài nhận bộ điều khiển và SSD phù hợp; không sửa SSD mà BIOS không nhận hoặc lỗi phần cứng. Không đổi RAID/VMD/AHCI tùy tiện trên máy có Windows hay RAID.",
  "Driver Wi-Fi/LAN, âm thanh và đồ họa phục vụ Windows sau cài là các gói riêng. Wi-Fi cho bước thiết lập ban đầu cần cách nạp được hãng hỗ trợ, không dùng thay driver lưu trữ trong Load driver.",
  "Các đường dẫn trên là cổng tra cứu chính hãng, chưa xác minh gói cho từng model. Tải, giải nén và chép trong phần mềm này là thao tác mô phỏng; website không tải driver thật, đọc USB hay kiểm tra nội dung INF của máy bạn.",
] as const;
