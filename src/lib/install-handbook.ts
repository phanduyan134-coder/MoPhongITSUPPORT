export const deviceProfiles = {
  dell: {
    name: "Dell", family: "Laptop / desktop Dell", biosKey: "F2", bootKey: "F12",
    entry: "Bật máy và nhấn F12 nhiều lần khi logo Dell xuất hiện để mở One-Time Boot Menu. F2 thường mở BIOS Setup. Kiểm tra lại tài liệu theo Service Tag nếu thao tác không đúng với máy.",
    storage: "Một số máy Intel dùng RAID On / Intel RST hoặc VMD. Ghi nhận cấu hình ban đầu và ưu tiên nạp driver lưu trữ đúng Service Tag; không tự chuyển RAID On sang AHCI trên Windows đang sử dụng.",
    drivers: "Tra Service Tag hoặc model trong Dell Support. Cài driver được cung cấp cho đúng hệ điều hành và kiểm tra lại trong Device Manager.",
    support: "https://www.dell.com/support/home/", identifier: "Model / Service Tag (tra trên máy)",
  },
  asus: {
    name: "ASUS", family: "Laptop ASUS", biosKey: "F2", bootKey: "Esc (thường gặp)",
    entry: "Tắt máy hoàn toàn, giữ F2 rồi nhấn nút nguồn để vào BIOS. Boot menu trên nhiều laptop ASUS dùng Esc lúc bật máy; cần đối chiếu model. Mainboard ASUS là nhóm khác, không dùng chung mặc định này.",
    storage: "Một số laptop Intel có VMD. Nếu Windows Setup không thấy SSD nhưng firmware nhận ổ, tải và giải nén driver Intel RST/VMD đúng model ra USB rồi chọn Load driver. Không phải máy ASUS nào cũng có VMD.",
    drivers: "Tra model đầy đủ trong ASUS Download Center. Kiểm tra driver chipset, mạng, đồ họa, âm thanh và ASUS System Control Interface nếu model có yêu cầu.",
    support: "https://www.asus.com/support/download-center/", identifier: "Model đầy đủ, ví dụ mã trên tem đáy máy",
  },
  hp: {
    name: "HP", family: "Laptop / desktop HP", biosKey: "Esc → F10", bootKey: "Esc → F9",
    entry: "Bật máy và nhấn Esc nhiều lần để mở Startup Menu. Trên nhiều dòng HP, F9 mở Boot Device Options và F10 mở BIOS Setup. Dòng máy và firmware có thể khác; kiểm tra theo Product Number.",
    storage: "Một số máy Intel cần driver RST/VMD được HP cung cấp. Nếu firmware không nhận SSD, kiểm tra phần cứng hoặc dùng chẩn đoán HP theo model trước; nạp driver trong Windows Setup không sửa được lỗi phần cứng.",
    drivers: "Tra Product Number và phiên bản Windows trong HP Software and Driver Downloads. Kiểm tra Device Manager và các chức năng đặc thù của máy.",
    support: "https://support.hp.com/drivers", identifier: "Model / Product Number (không chỉ tên dòng)",
  },
  pc: {
    name: "PC tự ráp", family: "Theo hãng mainboard", biosKey: "Theo mainboard", bootKey: "Theo mainboard",
    entry: "PC tự ráp không có một bộ phím chung. Xác định hãng, model và revision của mainboard; đọc hướng dẫn Boot Menu / UEFI Setup của đúng bo mạch. Phím hiển thị ở màn hình POST là một điểm kiểm tra.",
    storage: "Xác định nền tảng Intel hay AMD và có RAID thực sự hay không. Chỉ nạp driver Intel RST/VMD khi phần cứng dùng bộ điều khiển đó; hệ thống AMD RAID dùng driver khác. SSD không xuất hiện trong firmware cần được kiểm tra khe cắm, cáp và khả năng tương thích.",
    drivers: "Lấy chipset, LAN/Wi-Fi và âm thanh từ trang hỗ trợ mainboard. Driver GPU lấy từ NVIDIA, AMD hoặc Intel theo card thực tế; không dùng gói driver không rõ nguồn.",
    support: "", identifier: "Hãng + model + revision mainboard",
  },
} as const;
export type DeviceProfileId = keyof typeof deviceProfiles;
export const boards = {
  unknown: { name: "Chưa xác định", bios: "Xem tài liệu mainboard", boot: "Xem tài liệu mainboard", url: "" },
  asus: { name: "ASUS", bios: "Del / F2 (thường gặp)", boot: "F8 (thường gặp)", url: "https://www.asus.com/support/download-center/" },
  msi: { name: "MSI", bios: "Del (thường gặp)", boot: "F11 (thường gặp)", url: "https://www.msi.com/support" },
  gigabyte: { name: "GIGABYTE", bios: "Del (thường gặp)", boot: "F12 (thường gặp)", url: "https://www.gigabyte.com/Support" },
  asrock: { name: "ASRock", bios: "Del / F2 (thường gặp)", boot: "F11 (thường gặp)", url: "https://www.asrock.com/support/" },
} as const;
export type BoardId = keyof typeof boards;
export type InstallMode = "clean" | "preserve";
export type GuideStep = { id: string; title: string; actions: string[]; verify: string; warning?: string };

export function installationSteps(profileId: DeviceProfileId, mode: InstallMode): GuideStep[] {
  const profile = deviceProfiles[profileId];
  const before: GuideStep[] = [
    { id: "identify", title: "Nhận diện máy và mục tiêu", actions: [
      `Xác định ${profile.identifier.toLowerCase()}, CPU, dung lượng RAM và từng ổ lưu trữ. Có thể mở msinfo32 nếu Windows còn chạy. Không chỉ dựa vào tên hãng.`,
      "Kiểm tra máy có đáp ứng yêu cầu Windows 11 chính thức, gồm CPU được hỗ trợ, RAM, dung lượng, UEFI có khả năng Secure Boot và TPM 2.0. Dùng PC Health Check khi phù hợp; không mặc định mọi máy đều cài được.",
      "Ghi nhận phiên bản Home/Pro, trạng thái kích hoạt và các ứng dụng cần dùng. Kiểm tra yêu cầu quản lý của đơn vị nếu máy thuộc công ty.",
    ], verify: "Có model chính xác, danh sách ổ đĩa và mục tiêu cài đặt được chủ máy xác nhận." },
    { id: "backup", title: "Sao lưu và chuẩn bị khôi phục", actions: [
      "Sao lưu dữ liệu quan trọng sang thiết bị khác; mở thử một số tệp từ bản sao. Không coi phân vùng D trên cùng ổ là bản sao lưu an toàn.",
      "Nếu bật BitLocker/Device Encryption, chủ máy cần lưu và kiểm tra khả năng truy cập recovery key trước khi đổi firmware hoặc cài lại. Không nhập recovery key vào website này.",
      "Ghi lại thiết lập storage/boot hiện tại, thông tin phần mềm và phương án khôi phục. Cắm nguồn ổn định; chuẩn bị driver mạng và lưu trữ đúng model ở thiết bị khác.",
    ], verify: "Đã kiểm tra bản sao lưu, recovery key nếu có và quyền thực hiện trên máy.", warning: "Chưa sao lưu được dữ liệu cần giữ hoặc chưa có recovery key khi cần: dừng thao tác thay đổi ổ đĩa và firmware." },
  ];
  if (mode === "preserve") return [...before,
    { id: "upgrade", title: "Cài lại trong Windows để giữ ứng dụng", actions: [
      "Chỉ tiếp tục nếu Windows còn khởi động được và đường nâng cấp/cài lại được hỗ trợ. Dùng bộ cài Microsoft phù hợp ngôn ngữ, kiến trúc và phiên bản.",
      "Mở bộ cài từ Windows đang chạy, chạy setup.exe và kiểm tra lựa chọn Keep personal files and apps. Nếu lựa chọn này không có, hủy và xác định nguyên nhân tương thích trước.",
      "Không boot USB rồi xóa hoặc format phân vùng nếu mục tiêu là giữ ứng dụng. Nếu Windows không chạy, cần đánh giá khôi phục và sao lưu riêng; không cam kết giữ ứng dụng bằng cài mới.",
    ], verify: "Màn hình xác nhận thể hiện rõ giữ tệp cá nhân và ứng dụng trước khi bắt đầu.", warning: "Giữ dữ liệu không phải là bảo đảm chống mất dữ liệu. Vẫn cần bản sao lưu đã kiểm chứng." },
    ...afterSteps(profileId),
  ];
  return [...before,
    { id: "usb", title: "Tạo USB cài Windows chính thức", actions: [
      "Tải công cụ tạo bộ cài Windows 11 từ Microsoft trên máy hoạt động. Chuẩn bị USB trống tối thiểu 8 GB và chọn chính xác USB cần tạo.",
      "Dùng Media Creation Tool theo hướng dẫn của Microsoft. Với thiết bị ARM, kiểm tra bộ cài và phương thức cài được hỗ trợ cho thiết bị; không dùng mặc định bộ cài x64.",
      "Nếu cần driver lưu trữ cho bộ cài, dùng máy đang hoạt động có Internet để tra đúng model/Service Tag/Product Number hoặc model và revision mainboard trên trang hãng. Đối chiếu CPU, bộ điều khiển, Windows và kiến trúc. Mục tải có thể tên chipset, storage, SATA, RAID hoặc IRST; tên và nhu cầu driver tùy máy.",
      "Tải gói F6/preinstall hoặc trích xuất gói theo tài liệu hãng trên máy đang hoạt động; không tự đoán lệnh giải nén EXE. Giữ nguyên các tệp .inf, .sys, .cat và thư mục con của cùng gói. Chuẩn bị riêng driver mạng cho Windows sau cài nếu cần.",
      "Sau khi USB boot đã tạo xong, chép thư mục driver đã giải nén vào Drivers/Storage trên USB đó hoặc USB thứ hai. Không format hay tạo lại USB sau khi chép. Đây là lưu tệp để bộ cài đọc, không phải cài driver cho USB. Không dùng bản Windows chỉnh sửa hoặc công cụ kích hoạt không rõ nguồn.",
    ], verify: "USB boot đúng kiến trúc; nếu cần driver lưu trữ, có thư mục đã giải nén đúng gói và đọc được từ USB.", warning: "Tạo bộ cài sẽ xóa dữ liệu trên USB được chọn. Tạo USB trước khi chép driver và không tạo lại USB sau đó." },
    { id: "boot", title: `Mở menu khởi động trên ${profile.name}`, actions: [
      profile.entry,
      "Cắm USB và chọn mục USB ở chế độ UEFI trong menu khởi động một lần. Không cần đổi thứ tự boot vĩnh viễn nếu máy hỗ trợ menu này.",
      "Ưu tiên giữ cấu hình bảo mật tương thích với bộ cài chính thức. Nếu không thấy USB, kiểm tra cổng USB, bộ cài và tài liệu firmware theo model; không tắt Secure Boot như bước mặc định.",
    ], verify: "Máy vào Windows Setup từ USB ở chế độ UEFI, không phải ổ Windows cũ." },
    { id: "storage", title: "Kiểm tra SSD và driver lưu trữ", actions: [
      "Kiểm tra BIOS/UEFI có nhận SSD không. Nếu không, dừng quy trình cài và kiểm tra phần cứng/chẩn đoán của hãng.",
      profile.storage,
      "Chỉ khi cần driver đúng bộ điều khiển: tải gói từ trang hỗ trợ thiết bị bằng máy có Internet, giải nén theo tài liệu hãng để giữ .inf, .sys, .cat rồi chép thư mục vào Drivers/Storage trên USB boot đã tạo hoặc USB thứ hai; không format USB sau khi chép. Trong Windows Setup, chọn Load driver → Browse tới thư mục INF phù hợp (có thể nằm trong thư mục con), chọn bộ điều khiển tương thích rồi nạp. Không chạy EXE bất kỳ hoặc ép chọn driver không tương thích; nếu SSD vẫn không hiện, kiểm tra lại gói và cấu hình. Driver Wi-Fi/LAN cho Windows sau cài là gói riêng.",
    ], verify: "Windows Setup hiển thị đúng các ổ với dung lượng phù hợp. Nhận diện ổ đích trước khi sửa phân vùng.", warning: "Không đổi RAID/VMD/AHCI tùy tiện. Thay đổi có thể làm Windows cũ không khởi động hoặc ảnh hưởng cấu hình RAID." },
    { id: "partition", title: "Chọn ổ đích và phân vùng", actions: [
      "Đối chiếu dung lượng, model ổ và các phân vùng với thông tin đã ghi nhận. Ký tự C/D trong môi trường cài đặt có thể khác Windows cũ; Disk 0 không mặc định là ổ được phép xóa.",
      "Chỉ với cài mới toàn bộ ổ và đã được phép xóa: xóa các phân vùng trên đúng ổ đích để có vùng trống rồi chọn vùng đó. Ở chế độ UEFI, Windows Setup có thể tự tạo bố cục GPT cùng EFI, MSR, Windows và Recovery phù hợp.",
      "Nếu cần giữ phân vùng dữ liệu, OEM Recovery hoặc đang có lỗi GPT/MBR: dừng để lập phương án cụ thể. Không dùng diskpart clean hoặc xóa cả ổ theo một hướng dẫn chung.",
    ], verify: "Chọn đúng vùng đích, hiểu rõ phân vùng nào sẽ bị xóa và có bản sao lưu.", warning: "Delete/Format làm mất dữ liệu ở vùng tác động; xóa phân vùng OEM có thể làm mất khả năng khôi phục của hãng. Không có nút hoàn tác đáng tin cậy." },
    { id: "install", title: "Cài đặt và khởi động lần đầu", actions: [
      "Chọn đúng phiên bản Windows phù hợp giấy phép. Nếu chưa nhập khóa trong bộ cài, chỉ chọn bỏ qua khi lựa chọn đó có sẵn và có phương án kích hoạt hợp lệ.",
      "Cho bộ cài sao chép tệp và khởi động lại. Khi chuyển sang hệ điều hành đã cài, boot Windows Boot Manager trên SSD; nếu máy quay lại màn hình cài, dùng boot menu để chọn SSD hoặc tháo USB lúc máy khởi động lại khi phù hợp.",
      "Hoàn tất thiết lập ban đầu theo lựa chọn được bộ cài hỗ trợ. Yêu cầu Internet/tài khoản phụ thuộc phiên bản, edition và chính sách; không mặc định có bước bỏ qua.",
    ], verify: "Vào được desktop và khởi động lại thành công từ Windows Boot Manager khi không dùng USB." },
    ...afterSteps(profileId),
  ];
}
function afterSteps(id: DeviceProfileId): GuideStep[] {
  return [
    { id: "drivers", title: "Cài driver và cập nhật", actions: [deviceProfiles[id].drivers,
      "Chạy Windows Update và xem các cập nhật driver phù hợp. Kiểm tra Device Manager; nếu thiếu driver, đối chiếu Hardware ID với tài liệu và gói driver chính hãng.",
      "Không cập nhật BIOS chỉ vì vừa cài Windows. Chỉ cập nhật khi có lý do, đúng model và theo hướng dẫn hãng, với nguồn điện và phương án BitLocker phù hợp.",
    ], verify: "Không còn thiết bị thiếu driver cần thiết; mạng, hình ảnh, âm thanh và thiết bị đầu vào hoạt động." },
    { id: "handover", title: "Kiểm tra và bàn giao", actions: [
      "Kiểm tra Activation, mạng LAN/Wi-Fi, Bluetooth nếu có, âm thanh, webcam, touchpad, cổng kết nối, sleep/wake và khởi động lại theo phần cứng thực tế.",
      "Khôi phục dữ liệu và phần mềm có bản quyền theo thỏa thuận. Kiểm tra lại trạng thái mã hóa, vị trí lưu recovery key với chủ máy và tình trạng các bản sao lưu.",
      "Ghi biên bản: model, phiên bản Windows, driver quan trọng, thao tác đã làm, kết quả kiểm tra và các vấn đề còn tồn tại. Không ghi mật khẩu hoặc recovery key trong biên bản thông thường.",
    ], verify: "Chủ máy xác nhận dữ liệu, ứng dụng cần thiết và các chức năng đã được kiểm tra." },
  ];
}
