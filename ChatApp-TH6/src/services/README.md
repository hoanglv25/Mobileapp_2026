# Services

| File | Trách nhiệm |
| --- | --- |
| firebase.ts | Firebase app/Auth persistence/Realtime Database dùng modular API |
| authService.ts | Đăng ký, đăng nhập, hồ sơ, đổi tên/ảnh đại diện, lỗi tiếng Việt và đăng xuất sau offline |
| presenceService.ts | .info/connected, onDisconnect, AppState và thứ tự ghi trạng thái online |
| userService.ts | Danh bạ, bản đồ người dùng và status theo UID |
| chatService.ts | Tin nhắn có phân trang, gửi (multi-path update), thu hồi, cảm xúc, đã xem, danh sách Home |
| groupService.ts | Tạo nhóm, đổi tên, thêm/xóa thành viên, rời nhóm |
| typingService.ts | `typing/` và `viewing/` với onDisconnect, tự tắt sau 3 giây |
| notificationService.ts | `notifications/{uid}`: đăng ký, build thông báo, đánh dấu đã đọc |
| uploadService.ts | Tải ảnh lên Cloudinary bằng unsigned preset (không có API secret) |
| cloudinaryConfig.ts | Cloud name và tên upload preset |
| imagePickerService.ts | Chụp/chọn ảnh, xin quyền camera, thu nhỏ ≤ 1024px |
| locationService.ts | Quyền vị trí, current position, timeout và Alert hướng dẫn |
| mapService.ts | Mở Google Maps bằng URL HTTPS |

Screen/context không import firebase/*; chỉ gọi service. Các hàm subscribe trả unsubscribe và được gọi từ cleanup của useEffect. startPresence dọn listener Firebase/AppState; stopPresence dừng callback trước khi ghi offline/signOut. Lấy vị trí là một request, không dùng watchPosition.

Rules tham chiếu: [database.rules.json](../../docs/database.rules.json); báo cáo giải thích: [bao-cao-bai-6.md](../../docs/bao-cao-bai-6.md). Chưa có thao tác deploy rules tự động trong dự án.
