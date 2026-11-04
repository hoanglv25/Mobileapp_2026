# Services

| File | Trách nhiệm |
| --- | --- |
| firebase.ts | Firebase app/Auth persistence/Realtime Database dùng modular API |
| authService.ts | Đăng ký, đăng nhập, hồ sơ, lỗi tiếng Việt và đăng xuất sau offline |
| presenceService.ts | .info/connected, onDisconnect, AppState và thứ tự ghi trạng thái |
| userService.ts | Danh bạ và status theo UID |
| chatService.ts | Tin nhắn và userChats atomic, unread và subscription Home |
| locationService.ts | Quyền vị trí, current position, timeout và Alert hướng dẫn |
| mapService.ts | Mở Google Maps bằng URL HTTPS |

Screen/context không import firebase/*; chỉ gọi service. Các hàm subscribe trả unsubscribe và được gọi từ cleanup của useEffect. startPresence dọn listener Firebase/AppState; stopPresence dừng callback trước khi ghi offline/signOut. Lấy vị trí là một request, không dùng watchPosition.

Rules tham chiếu: [database.rules.json](../../docs/database.rules.json). Hướng dẫn cuối: [giai-doan-7.md](../../docs/giai-doan-7.md). Chưa có thao tác deploy rules tự động trong dự án.
