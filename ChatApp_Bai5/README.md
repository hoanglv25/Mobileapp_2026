# ChatApp — Bài thực hành 5

Ứng dụng nhắn tin 1–1 được xây dựng bằng **React Native CLI, TypeScript và Firebase**. Dự án nâng cấp từ giao diện ChatApp ở Bài 4 sang xác thực người dùng, danh bạ, tin nhắn và trạng thái hoạt động theo thời gian thực, đồng thời bổ sung chia sẻ vị trí.

Trong repository, `ChatApp/` lưu phiên bản Bài 4; **`ChatApp_Bai5/` là phiên bản được mô tả trong README này**. Hai phiên bản được lưu ở hai thư mục riêng.

## Chức năng

| Nhóm | Chức năng hiện có |
| --- | --- |
| Tài khoản | Đăng ký, đăng nhập Email/Password, duy trì phiên đăng nhập bằng AsyncStorage, đăng xuất |
| Danh bạ | Hiển thị người dùng từ Firebase, tìm kiếm và mở cuộc trò chuyện |
| Trạng thái | Theo dõi online/offline và thời điểm thay đổi trạng thái |
| Nhắn tin | Chat văn bản 1–1 theo thời gian thực, hiển thị tin gửi/nhận và thời gian |
| Hội thoại | Hiển thị tin cuối, sắp xếp theo thời gian và đếm tin chưa đọc |
| Vị trí | Xin quyền, lấy tọa độ hiện tại, gửi thẻ vị trí và mở Google Maps |
| Giao diện | Điều hướng dạng tab, chế độ sáng/tối, hồ sơ tài khoản và cài đặt |
| Thông báo | Danh sách 8 thông báo mẫu và thao tác đánh dấu đã đọc |

Thông báo hiện dùng dữ liệu mẫu trong ứng dụng; dự án chưa tích hợp Firebase Cloud Messaging hoặc push notification.

## Công nghệ

- React Native `0.88.0`, React `19.3.0`, TypeScript `6`.
- React Navigation `7`: Native Stack và Bottom Tabs.
- Firebase JavaScript SDK: Authentication và Realtime Database.
- AsyncStorage để lưu phiên Firebase Auth.
- `@react-native-community/geolocation` để lấy vị trí; Ionicons cho biểu tượng.
- Jest và ESLint để kiểm tra dự án.

Các phiên bản dependency cụ thể được lưu trong [package.json](package.json) và [package-lock.json](package-lock.json).

## Chuẩn bị môi trường

Hướng dẫn lệnh bên dưới dành cho **Windows PowerShell**, chạy từ thư mục `ChatApp_Bai5`.

- Node.js **từ 22.11.0** và npm.
- JDK, Android Studio, Android SDK; cấu hình `JAVA_HOME`, `ANDROID_HOME` và Android SDK Platform Tools trong `PATH`.
- Android Emulator hoặc thiết bị Android đã bật USB debugging.
- Kết nối Internet để tải dependencies và truy cập Firebase.

Cấu hình Android hiện tại: `minSdk 24`, `compileSdk 37`, `targetSdk 36`, Build Tools `37.0.0`, NDK `27.1.12297006`. Cài các thành phần tương ứng trong SDK Manager; xem [android/build.gradle](android/build.gradle).

Dự án có mã nguồn iOS; việc build iOS cần macOS, Xcode và CocoaPods. Quyền vị trí khi sử dụng ứng dụng đã được khai báo trong `Info.plist`.

## Cài đặt

Clone repository nếu chưa có bản trên máy:

```powershell
git clone https://github.com/ITHoangLV/Mobileapp_2026.git
Set-Location .\Mobileapp_2026\ChatApp_Bai5
npm.cmd ci
```

Nếu đã có repository, mở PowerShell tại `ChatApp_Bai5` rồi chạy `npm.cmd ci`. Dependency, thư mục build và keystore không được đưa lên Git.

### Tạo debug keystore cho Android

Bản Bài 5 không commit keystore. Chạy lệnh sau **một lần khi chưa có** `android/app/debug.keystore`:

```powershell
if (-not (Test-Path .\android\app\debug.keystore)) {
  keytool -genkeypair -storetype PKCS12 -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
}
```

Keystore này chỉ phục vụ chạy thử. Cấu hình release hiện cũng tham chiếu debug signing; cần cấu hình khóa ký riêng trước khi phát hành.

## Cấu hình Firebase

Ứng dụng dùng **Firebase JavaScript SDK**. Luồng hiện tại không yêu cầu `google-services.json` hoặc `GoogleService-Info.plist`.

1. Mở Firebase Console và chọn project cần sử dụng. Mã nguồn hiện cấu hình project `chatapp-th05`.
2. Vào **Authentication → Sign-in method**, bật **Email/Password** và lưu. Nếu chưa khởi tạo Authentication, chọn **Get started** trước.
3. Tạo **Realtime Database**, lấy đúng Database URL.
4. Mở [src/services/firebase.ts](src/services/firebase.ts) và kiểm tra `firebaseConfig`, đặc biệt `projectId`, `apiKey` và `databaseURL` đều thuộc cùng project.
5. Trong **Realtime Database → Rules**, dán nội dung [docs/database.rules.json](docs/database.rules.json), rồi chọn **Publish**. File rules trong Git không tự triển khai lên Firebase.
6. Chạy ứng dụng và đăng ký tài khoản bằng email, mật khẩu của bạn. Không có tài khoản mặc định được cung cấp trong mã nguồn.

Nếu dùng project riêng, tham khảo [firebaseConfig.example.ts](src/services/firebaseConfig.example.ts) và thay cấu hình trong `firebase.ts`. File mẫu không được ứng dụng tự động nạp. Có thể tách cấu hình sang `firebaseConfig.local.ts` đã được ignore, nhưng phải sửa import trong `firebase.ts` và cung cấp file đó trên từng máy chạy.

Firebase client config được đóng gói trong ứng dụng. Quyền truy cập dữ liệu phụ thuộc Authentication và Database Security Rules; không đưa service account, private key, token quản trị hoặc mật khẩu vào mã nguồn.

Rules đi kèm phục vụ bài thực hành. Quyền ghi `userChats` hiện cho phép mọi tài khoản đã đăng nhập và dữ liệu chưa được kiểm tra đầy đủ bằng validation rules; cần siết quyền trước khi dùng với dữ liệu thực tế.

## Chạy trên Android

Mở emulator hoặc kết nối điện thoại, sau đó kiểm tra:

```powershell
adb devices
```

Mở hai terminal tại `ChatApp_Bai5`.

**Terminal 1 — Metro:**

```powershell
npm.cmd start
```

**Terminal 2 — build và cài ứng dụng:**

```powershell
npm.cmd run android
```

Nếu có nhiều thiết bị, liệt kê tùy chọn của CLI rồi chọn thiết bị cần chạy:

```powershell
npx.cmd react-native run-android --help
npx.cmd react-native run-android --list-devices
```

Khi cần kết nối Metro qua USB/ADB, thay `<device-id>` bằng ID trong `adb devices`:

```powershell
adb -s <device-id> reverse tcp:8081 tcp:8081
```

Ứng dụng dùng application ID `com.chatapp`, giống Bài 4. Cài hai bản lên cùng thiết bị sẽ dùng chung application ID; bản cài sau có thể cập nhật bản trước hoặc báo xung đột chữ ký nếu dùng keystore khác. Giữ hai thư mục mã nguồn không đồng nghĩa có hai ứng dụng cài song song.

## Kiểm thử với hai tài khoản

1. Chạy ứng dụng trên hai emulator hoặc một emulator và một điện thoại; kết nối cả hai với Metro.
2. Đăng ký hai tài khoản khác nhau, đăng nhập tài khoản A trên thiết bị thứ nhất và B trên thiết bị thứ hai.
3. Kiểm tra danh bạ: A nhìn thấy B và B nhìn thấy A.
4. Từ danh bạ, mở cuộc trò chuyện và gửi tin hai chiều; kiểm tra nội dung và thời gian cập nhật.
5. Cho B rời màn hình chat, sau đó A gửi tin. Kiểm tra tin cuối, thứ tự hội thoại và badge chưa đọc trên B; mở lại chat để kiểm tra đánh dấu đã đọc.
6. Cho một ứng dụng xuống nền rồi mở lại để kiểm tra online/offline. Khi mất kết nối đột ngột, trạng thái có thể cập nhật trễ do server cần phát hiện ngắt kết nối.
7. Gửi vị trí, cấp quyền khi được hỏi và chạm thẻ vị trí để mở bản đồ.
8. Thử từ chối quyền vị trí, tắt GPS, đổi sáng/tối và đăng xuất/đăng nhập lại.

Trên Android Emulator, bật Location và đặt tọa độ tại **Extended controls (⋮) → Location** trước khi thử gửi vị trí. Ứng dụng chỉ lấy vị trí theo thao tác gửi, không theo dõi vị trí nền.

## Kiểm tra mã nguồn

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test -- --runInBand
```

Test tự động mock Firebase và các native module. Cần thực hiện thêm kịch bản hai thiết bị để kiểm tra kết nối Firebase, Security Rules và quyền hệ điều hành thực tế.

## Cấu trúc mã nguồn

```text
ChatApp_Bai5/
├── App.tsx                 # Điểm vào và các provider
├── android/                # Dự án Android native
├── ios/                    # Dự án iOS native
├── src/
│   ├── components/         # Thành phần giao diện dùng chung
│   ├── context/            # Phiên đăng nhập, giao diện, hội thoại và badge
│   ├── data/               # Dữ liệu thông báo mẫu
│   ├── navigation/         # Stack và Bottom Tabs
│   ├── screens/            # Login, Register, Home, Contacts, Chat, Settings...
│   ├── services/           # Firebase, auth, users, presence, chat, location, Maps
│   ├── theme/              # Màu sắc, khoảng cách và kiểu chữ
│   ├── types/              # Kiểu dữ liệu và tham số điều hướng
│   └── utils/              # Định dạng thời gian và kiểm tra tọa độ
├── __tests__/              # Unit và component tests
└── docs/                   # Rules và tài liệu từng giai đoạn
```

Screen và context gọi các service; thao tác Firebase được tập trung trong `src/services`. Các subscription trả hàm hủy để dọn listener khi màn hình hoặc provider kết thúc vòng đời.

## Dữ liệu Realtime Database

| Đường dẫn | Dữ liệu |
| --- | --- |
| `users/{uid}` | Hồ sơ người dùng |
| `status/{uid}` | `isOnline`, `lastChanged` |
| `messages/{chatId}/{messageId}` | Người gửi/nhận, loại tin, nội dung, thời gian và tọa độ nếu có |
| `userChats/{uid}/{partnerUid}` | Thông tin đối tác, tin cuối, thời gian và `unreadCount` |

`chatId` được tạo bằng cách sắp xếp hai UID rồi nối bằng `_`. Gửi tin sử dụng multi-path update để ghi tin và cập nhật metadata của hai phía; số tin chưa đọc của người nhận tăng bằng `increment(1)`. Đánh dấu đã đọc chỉ cập nhật counter của tài khoản hiện tại.

## Lỗi thường gặp

| Hiện tượng | Cách kiểm tra |
| --- | --- |
| `auth/configuration-not-found` | Kiểm tra đúng Firebase project, khởi tạo Authentication và bật Email/Password |
| `PERMISSION_DENIED` | Kiểm tra đăng nhập, Database URL và rules đã Publish; quyền đọc `/users` cần đặt ở cấp collection để tải danh bạ |
| Thiếu `debug.keystore` | Tạo debug keystore theo hướng dẫn phía trên |
| Không kết nối Metro | Kiểm tra Metro chạy tại cổng 8081, thiết bị trong `adb devices` và cấu hình `adb reverse` |
| Không lấy được vị trí | Bật GPS, cấp quyền trong cài đặt ứng dụng và đặt tọa độ cho emulator |
| Lỗi native module sau khi thêm thư viện | Build và cài lại ứng dụng; Fast Refresh không cập nhật binary native |
| TypeScript không tìm thấy `getReactNativePersistence` | Chạy `npm.cmd ci`, giữ cấu hình `paths` cho `firebase/auth` trong `tsconfig.json`, rồi chạy lại TypeScript |

## Phạm vi và giới hạn

- Tin nhắn hiện gồm văn bản và vị trí; chưa có gửi ảnh, tệp, chat nhóm hoặc cuộc gọi.
- Lịch sử chat được tải toàn bộ, chưa có phân trang.
- Presence dùng một node cho mỗi UID; nhiều thiết bị cùng đăng nhập một tài khoản có thể ghi đè trạng thái nhau.
- Thao tác Firebase đang chờ mạng, gồm ghi offline trước khi đăng xuất, có thể chờ kết nối lại.
- Thông báo và công tắc thông báo hiện thuộc giao diện dữ liệu mẫu, chưa gửi thông báo hệ thống.

Xem [tài liệu services](src/services/README.md), [rules tham chiếu](docs/database.rules.json) và [kịch bản kiểm tra cuối](docs/giai-doan-7.md). Các tài liệu giai đoạn 1–6 lưu lại tiến trình thực hành; mã trong `src/` là phiên bản hiện tại.
