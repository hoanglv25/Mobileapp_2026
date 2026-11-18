# ChatApp — Bài thực hành 6

Ứng dụng nhắn tin được xây dựng bằng **React Native CLI, TypeScript và Firebase**. Bài 6 phát triển tiếp Bài 5 với các tính năng thường có ở ứng dụng nhắn tin thực tế: **chat nhóm, gửi ảnh, trạng thái "đang soạn tin" và "đã xem", thu hồi tin nhắn**, cùng màn hình **Thông báo dùng dữ liệu thật**.

Trong repository, `ChatApp/` lưu phiên bản Bài 4; **`ChatApp-TH6/` là phiên bản được mô tả trong README này** (Bài 5 và phần mở rộng của Bài 6). Hai phiên bản được lưu ở hai thư mục riêng.

## Chức năng

| Nhóm | Chức năng hiện có |
| --- | --- |
| Tài khoản | Đăng ký, đăng nhập Email/Password, duy trì phiên bằng AsyncStorage, đăng xuất; đổi họ tên và ảnh đại diện |
| Danh bạ | Hiển thị người dùng từ Firebase, tìm kiếm và mở cuộc trò chuyện |
| Trạng thái | Online/offline; offline hiển thị "Hoạt động X phút trước"; `onDisconnect()` để không bị kẹt trạng thái |
| Nhắn tin | Chat 1-1 và **chat nhóm** theo thời gian thực: tin thường, vị trí, ảnh; tải **theo trang 20 tin** |
| Trạng thái chat | Tiêu đề hiện "đang soạn tin…" (tự tắt sau 3 giây); tin cuối của mình hiện "Đã gửi" / "Đã xem hh:mm" |
| Tương tác | Nhấn giữ: thả cảm xúc 👍 ❤️ 😂 😮 😢, Sao chép, Trả lời, **Thu hồi** (chỉ tin của mình) |
| Ảnh | 📷 chụp hoặc chọn từ thư viện, thu nhỏ cạnh dài ≤ 1024px, tải lên Cloudinary, xem toàn màn hình, thử lại khi lỗi |
| Nhóm | Tạo nhóm (tên + tối thiểu 2 thành viên), tên người gửi trong nhóm, số thành viên online, đổi tên / thêm / xóa thành viên / rời nhóm |
| Hội thoại | Home gộp chat 1-1 và nhóm, sắp xếp theo tin mới nhất, mỗi người có số tin chưa đọc riêng; "📷 Hình ảnh", "📍 Vị trí" |
| Thông báo | Dữ liệu thật tại `notifications/{uid}`: tin mới khi không ở trong cuộc trò chuyện, được thêm vào nhóm, có người thả cảm xúc; badge chưa đọc; "Đánh dấu tất cả đã đọc" |
| Giao diện | Điều hướng dạng tab, chế độ sáng/tối, hồ sơ cá nhân và cài đặt |

Chưa tích hợp Firebase Cloud Messaging hoặc thông báo hệ thống khi ứng dụng chạy nền (Notifee/FCM không nằm trong phạm vi hiện tại).

## Công nghệ

- React Native `0.88.0`, React `19.3.0`, TypeScript `6`.
- React Navigation `7`: Native Stack và Bottom Tabs.
- Firebase JavaScript SDK: Authentication và Realtime Database.
- AsyncStorage để lưu phiên Firebase Auth.
- `@react-native-community/geolocation` để lấy vị trí; Ionicons cho biểu tượng.
- `react-native-image-picker` để chụp/chọn ảnh, `@react-native-clipboard/clipboard` để sao chép tin; **Cloudinary** (unsigned upload) lưu ảnh.
- Jest và ESLint để kiểm tra dự án.

Các phiên bản dependency cụ thể được lưu trong [package.json](package.json) và [package-lock.json](package-lock.json).

## Chuẩn bị môi trường

Hướng dẫn lệnh bên dưới dành cho **Windows PowerShell**, chạy từ thư mục `ChatApp-TH6`.

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
Set-Location .\Mobileapp_2026\ChatApp-TH6
npm.cmd ci
```

Nếu đã có repository, mở PowerShell tại `ChatApp-TH6` rồi chạy `npm.cmd ci`. Dependency, thư mục build và keystore không được đưa lên Git.

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

## Cấu hình Cloudinary

Ảnh được tải lên **Cloudinary**; Realtime Database chỉ lưu URL ảnh. Ứng dụng dùng **unsigned upload preset** nên **không có API secret trong mã nguồn**.

1. Đăng ký tài khoản Cloudinary miễn phí và ghi lại **Cloud name** ở Dashboard.
2. Vào **Settings → Upload → Upload presets → Add upload preset**.
3. Đặt **Signing Mode = Unsigned**, đặt tên preset (ví dụ `chatapp_unsigned`), có thể giới hạn thư mục và định dạng ảnh, rồi **Save**.
4. Mở [src/services/cloudinaryConfig.ts](src/services/cloudinaryConfig.ts) và điền:

   ```ts
   export const CLOUDINARY_CLOUD_NAME = 'ten-cloud-cua-ban';
   export const CLOUDINARY_UPLOAD_PRESET = 'chatapp_unsigned';
   ```

5. **Không** đặt `API Key`/`API Secret` vào ứng dụng. Nếu chưa điền, bong bóng ảnh tạm báo "Chưa cấu hình Cloudinary" kèm nút **Thử lại**.

Ảnh được thu nhỏ ngay khi chọn (`maxWidth`/`maxHeight` = 1024, giữ tỉ lệ) trước khi tải lên. Quyền camera: Android khai báo `CAMERA` trong `AndroidManifest.xml` và xin quyền lúc chạy; iOS dùng `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`. Nếu người dùng từ chối quyền camera, ứng dụng hiển thị thông báo hướng dẫn mở Cài đặt.

> Sau khi cài `react-native-image-picker` và `@react-native-clipboard/clipboard`, cần **build lại** ứng dụng (`npm.cmd run android`); iOS chạy thêm `pod install` trong `ios/`.

## Security Rules

Luật bảo mật nằm ở [docs/database.rules.json](docs/database.rules.json). Dán vào **Realtime Database → Rules → Publish** (file trong Git không tự triển khai). Báo cáo giải thích luật: [docs/bao-cao-bai-6.md](docs/bao-cao-bai-6.md). Tóm tắt:

- `conversations`, `messages`, `readStatus`, `typing`, `viewing`: **chỉ thành viên** mới đọc/ghi.
- `messages/{conv}/{msg}`: chỉ người gửi tạo tin (`senderId == auth.uid`) và chỉ người gửi sửa tin (thu hồi); `recalled` chỉ đi một chiều `false → true`; không xóa được node tin.
- `reactions/{uid}`, `typing/{conv}/{uid}`, `viewing/{conv}/{uid}`, `readStatus/{conv}/{uid}`: mỗi người chỉ ghi được phần của **chính mình**.
- `userChats/{uid}`: chỉ chủ sở hữu đọc; thành viên cùng cuộc trò chuyện được cập nhật `lastMessage`/`unread` (cần cho multi-path update khi gửi tin).
- `notifications/{uid}`: chỉ chủ nhân đọc/đánh dấu đã đọc; người khác chỉ tạo thông báo có `fromUid == mình` cho người cùng cuộc trò chuyện.

> Rules chưa được chạy trên Firebase Emulator trong dự án này. Hãy kiểm tra bằng **Rules Playground** (xem báo cáo) sau khi Publish.

## Chạy trên Android

Mở emulator hoặc kết nối điện thoại, sau đó kiểm tra:

```powershell
adb devices
```

Mở hai terminal tại `ChatApp-TH6`.

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

## Kiểm thử với hai (hoặc ba) tài khoản

1. Chạy ứng dụng trên hai/ba emulator hoặc điện thoại; kết nối với Metro. Đăng ký tài khoản A, B, C.
2. **Chat nhóm**: ở Home nhấn biểu tượng nhóm, nhập tên, chọn ≥ 2 người → B, C nhận tin nhắn hệ thống, thông báo "được thêm vào nhóm" và số chưa đọc riêng.
3. **Đang soạn tin / Đã xem**: A gõ trong chat với B → tiêu đề của B hiện "đang soạn tin…" và tắt sau 3 giây; B mở chat → tin cuối của A đổi từ "Đã gửi" sang "Đã xem hh:mm".
4. **Thu hồi / cảm xúc**: nhấn giữ một tin → thả cảm xúc, Sao chép, Thu hồi. Tin thu hồi hiện "Tin nhắn đã được thu hồi" ở mọi máy và Home cập nhật tin cuối.
5. **Gửi ảnh**: nhấn 📷, chọn ảnh; bong bóng tạm có vòng loading; thử tắt mạng để thấy nút "Thử lại"; chạm ảnh để xem toàn màn hình.
6. **Thông báo**: để B ở màn hình khác rồi A nhắn → tab Thông báo của B có badge; nhấn thông báo mở đúng cuộc trò chuyện và trừ badge; thử "Đánh dấu tất cả đã đọc".
7. **Phân trang**: gửi > 40 tin rồi mở chat; kéo lên đầu để tải thêm 20 tin cũ, danh sách không bị nhảy.
8. Cho một ứng dụng xuống nền hoặc tắt đột ngột để kiểm tra online/offline và "đang soạn tin" không bị kẹt (do `onDisconnect()`; server có thể mất vài chục giây để phát hiện ngắt kết nối).
9. Thử gửi vị trí, từ chối quyền camera/vị trí, đổi sáng/tối và đăng xuất/đăng nhập lại.

Trên Android Emulator, bật Location và đặt tọa độ tại **Extended controls (⋮) → Location** trước khi thử gửi vị trí.

## Kiểm tra mã nguồn

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test -- --runInBand
```

Test tự động mock Firebase và các native module (xem [jest.setup.js](jest.setup.js)). Cần thực hiện thêm kịch bản nhiều thiết bị để kiểm tra kết nối Firebase, Security Rules và quyền hệ điều hành thực tế.

## Cấu trúc mã nguồn

```text
ChatApp-TH6/
├── App.tsx                 # Điểm vào và các provider
├── android/                # Dự án Android native
├── ios/                    # Dự án iOS native
├── src/
│   ├── components/         # Thành phần giao diện dùng chung
│   ├── context/            # Phiên đăng nhập, giao diện, người dùng, hội thoại, thông báo
│   ├── navigation/         # Stack và Bottom Tabs
│   ├── screens/            # Login, Home, Contacts, Chat, CreateGroup, GroupInfo, Notifications, Profile, Settings...
│   ├── services/           # Firebase, auth, users, presence, chat, group, typing, notification, upload, image picker, location, Maps
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
| `users/{uid}` | Hồ sơ người dùng (`displayName`, `avatar`, `email`) |
| `status/{uid}` | `isOnline`, `lastChanged` |
| `conversations/{convId}` | `type` (`direct`/`group`), `name`, `members: {uid: true}`, `createdBy`, `createdAt` |
| `messages/{convId}/{msgId}` | `senderId`, `type` (`text`/`image`/`location`/`system`), `text`, `imageUrl`, `latitude`, `longitude`, `createdAt`, `recalled`, `reactions: {uid: emoji}`, `replyTo` |
| `userChats/{uid}/{convId}` | `type`, `name` (nhóm), `lastMessage`, `lastMessageId`, `lastSenderId`, `updatedAt`, `unread` |
| `readStatus/{convId}/{uid}` | Thời điểm đọc cuối |
| `typing/{convId}/{uid}` | `true` khi đang gõ (xóa bằng `onDisconnect`) |
| `viewing/{convId}/{uid}` | `true` khi đang mở cuộc trò chuyện (để không tạo thông báo thừa) |
| `notifications/{uid}/{id}` | `type`, `convId`, `fromUid`, `fromName`, `text`, `createdAt`, `read` |

- `convId` 1-1 = hai UID sắp xếp rồi nối bằng `_`; `convId` nhóm = push key của Firebase.
- **Gửi tin = một lệnh `update()` đa đường dẫn**: tin nhắn, `lastMessage` của mọi thành viên, `unread` của người nhận (`increment(1)`, không đọc rồi cộng) và thông báo. Chat 1-1 gửi tin đầu tiên cũng tạo `conversations/{convId}` trong cùng lệnh.
- Tạo nhóm / thêm thành viên cần **hai bước** vì luật bảo mật kiểm tra thành viên theo dữ liệu **trước** khi ghi: (1) ghi `conversations/.../members`, (2) mới ghi `userChats`, tin hệ thống và thông báo.
- Thông báo tin nhắn dùng id cố định `msg_{convId}` (mỗi cuộc trò chuyện một dòng, ghi đè bằng tin mới nhất); cảm xúc dùng `react_{msgId}_{uid}` để thả đi thả lại không tạo trùng.
- Phân trang: lần đầu `orderByKey().limitToLast(20)`; kéo lên đầu → `endBefore(oldestKey).limitToLast(20)`; sau đó listener chuyển sang `startAt(oldestLoadedKey)` để cảm xúc/thu hồi của tin cũ vẫn realtime.

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

- Chưa có tệp đính kèm khác ngoài ảnh, cuộc gọi, push notification/thông báo nền (Notifee, FCM).
- Không có Cloud Functions: các thao tác ghi chéo (cập nhật `userChats` của người khác, tạo thông báo) do **máy khách** thực hiện, nên rules chỉ kiểm tra được quyền và hình dạng dữ liệu, không kiểm tra số học (ví dụ một thành viên có thể sửa `unread` của người khác trong cùng cuộc trò chuyện).
- Tìm kiếm tin nhắn chỉ tìm trong các tin **đã tải** (phân trang theo 20 tin).
- Presence dùng một node cho mỗi UID; nhiều thiết bị cùng đăng nhập một tài khoản có thể ghi đè trạng thái nhau.
- Thao tác Firebase đang chờ mạng, gồm ghi offline trước khi đăng xuất, có thể chờ kết nối lại.
- Security Rules chưa được kiểm tra bằng Firebase Emulator trong repo; hãy kiểm tra bằng Rules Playground sau khi Publish.

Xem [tài liệu services](src/services/README.md), [rules tham chiếu](docs/database.rules.json) và [kịch bản kiểm tra cuối](docs/giai-doan-7.md). Các tài liệu giai đoạn 1–6 lưu lại tiến trình thực hành; mã trong `src/` là phiên bản hiện tại.
