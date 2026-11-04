# ChatApp — Bài thực hành 5

Ứng dụng React Native CLI + TypeScript, React Navigation, Firebase JS SDK và @react-native-community/geolocation. Có đăng ký/đăng nhập Email/Password, danh bạ và online/offline realtime, chat 1-1, gửi vị trí, Home và badge unread. Thông báo dùng đúng 8 mockNotifications của Bài 4.

## Chuẩn bị

- Node.js >= 22.11.0 theo package.json, Android Studio/Android SDK và emulator hoặc thiết bị Android.
- iOS cần macOS, Xcode, Ruby/Bundler và CocoaPods.
- Cài dependency bằng npm ci (trong PowerShell có thể dùng npm.cmd ci).
- Không dùng admin/123456. Tạo hai tài khoản khác nhau qua màn hình Đăng ký để kiểm thử.

## Firebase

1. Mở đúng project chatapp-th05 trong Firebase Console.
2. Authentication → Get started nếu chưa bật → Sign-in method → Email/Password → Enable → Save.
3. Tạo Realtime Database. Cấu hình đang nằm trong src/services/firebase.ts, có databaseURL của vùng asia-southeast1.
4. Dán nội dung [docs/database.rules.json](docs/database.rules.json) vào Realtime Database → Rules → Publish. Đây là rules bạn đã cung cấp, có bổ sung users/.read để tải danh bạ. File trong repo không tự cập nhật Console.
5. Nếu đổi Firebase project, sao chép firebaseConfig từ Web App của project mới, gồm databaseURL, vào src/services/firebase.ts.

Tài liệu Firebase: [Email/Password](https://firebase.google.com/docs/auth/web/password-auth), [Realtime Database](https://firebase.google.com/docs/database/web/start).

## Chạy Android

Terminal 1:

```powershell
npm.cmd start
```

Terminal 2:

```powershell
npm.cmd run android
```

Để thử vị trí trên emulator, bật Location và vào Extended controls (⋮) → Location → đặt điểm → Set location/Send. Cần build lại binary khi thêm native module; Fast Refresh không thay thế bước build.

## Chạy iOS trên macOS

```sh
bundle install
cd ios
bundle exec pod install
cd ..
npm run ios
```

Đặt vị trí giả qua Simulator → Features → Location. Info.plist đã có mô tả quyền when-in-use. App không xin vị trí nền.

## Kiểm tra

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test -- --runInBand
```

Kết quả và giới hạn kiểm chứng được ghi trong [bước 7](docs/giai-doan-7.md). Unit test mock Firebase/native, không tự tạo tài khoản hoặc thử quyền hệ điều hành thật.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| src/services | Firebase init/auth/presence/users/chat; vị trí và Maps |
| src/context | Auth, theme/thông báo, conversations/badge |
| src/screens | Login, Register, Home, Contacts, Chat, Notifications, Settings |
| src/components | Các thành phần giao diện dùng theme |
| src/types | Model UID/timestamp và navigation params |
| src/utils | Thời gian và kiểm tra tọa độ |
| src/data/mockData.ts | Chỉ mockNotifications |
| __tests__ | Unit/component tests |
| docs | Các giai đoạn, rules tham chiếu và kịch bản kiểm thử cuối |

## Dữ liệu và unread

- users/{uid}: hồ sơ; status/{uid}: isOnline/lastChanged.
- messages/{chatId}/{pushKey}: tin text/location; chatId ghép hai UID sau khi sort.
- userChats/{uid}/{partnerUid}: tin cuối, metadata đối tác và unreadCount.
- Gửi tin dùng multi-path update và increment(1) người nhận. Đọc chỉ reset counter của mình.
- Chat tải tin thành công, focus và foreground sẽ được loại khỏi tổng badge trong lúc reset server còn chờ. Lỗi đọc/reset không bị che bằng unread=0.
- Status một node/UID phù hợp kịch bản hai tài khoản trên hai thiết bị; cùng tài khoản trên nhiều thiết bị có thể ghi đè presence.
- Khi mạng mất đột ngột, offline phụ thuộc độ trễ server phát hiện. Ghi Firebase đang pending có thể chờ kết nối lại, gồm bước ghi offline trước đăng xuất.
- Hiện tải toàn bộ lịch sử mỗi chat và userChats của mình; chưa phân trang. Các rules thực hành còn rộng và chưa validate sender/message; không tự ý mở rộng rules để sửa PERMISSION_DENIED.

Xem [bước 7](docs/giai-doan-7.md) để đối chiếu yêu cầu, sửa lỗi thường gặp và kiểm thử hai tài khoản trước khi nộp bài. Các tài liệu bước 1–6 lưu code tại thời điểm từng giai đoạn; mã trong src là phiên bản cuối.

## Ban Bai 5 duoc luu rieng trong repository

Thu muc `ChatApp_Bai5/` la ban Firebase nang cap, nam canh `ChatApp/` (Bai 4).
Cai dependencies bang `npm ci`. Khong copy `node_modules`, build artifacts, Pods,
file `.env`, native Firebase config, hoac keystore vao Git.

Ung dung hien dung Firebase JavaScript SDK va public client configuration trong
`src/services/firebase.ts`. Client API key khong thay the Firebase Authentication
va Database Security Rules. Khong dua service account/private key vao client.
`src/services/firebaseConfig.example.ts` la mau de thay bang project cua ban.
Neu tach cau hinh rieng, dung `firebaseConfig.local.ts` (da ignore), import no tu
`firebase.ts` va cung cap file nay tren may can build.

Debug keystore khong duoc commit trong ban sao nay. Truoc khi build Android lan dau,
chay PowerShell tai goc `ChatApp_Bai5/` (can JDK/keytool):

```powershell
keytool -genkeypair -storetype PKCS12 -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
npm run android
```

Khong dung debug keystore de phat hanh production. File ky release can duoc luu
rieng va khong commit.
