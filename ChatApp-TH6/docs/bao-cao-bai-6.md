# Báo cáo ngắn — Luật bảo mật (Security Rules) Bài 6

Tệp luật: [database.rules.json](database.rules.json). Mặc định mọi đường dẫn bị khóa (`".read": false, ".write": false` ở gốc); từng nhánh bên dưới mở đúng phần cần thiết.

## 1. Các luật đã viết

| Yêu cầu | Luật |
| --- | --- |
| **Chỉ thành viên đọc/ghi tin nhắn** | `messages/$convId` có `.read` và `.write` kiểm tra *thành viên*: `root.child('conversations/$convId/members/'+auth.uid).exists()`, hoặc (chat 1-1) `$convId` bắt đầu/kết thúc bằng `auth.uid + '_'`. Nhờ vậy tin đầu tiên của chat 1-1 có thể ghi cùng lúc với bản ghi `conversations`, vì `root` là dữ liệu *trước* khi ghi. Cùng cách kiểm tra áp dụng cho `readStatus`, `typing`, `viewing`, `conversations` (đọc). |
| **Chỉ người gửi mới thu hồi tin của mình** | `messages/$convId/$msgId` có `.write`: tạo mới khi `senderId == auth.uid`; sửa khi `data.child('senderId').val() == auth.uid && newData.exists()` (không xóa được node). `recalled` có `.validate` chỉ cho đi từ `false` sang `true`. `senderId`, `type`, `createdAt` không đổi được sau khi tạo. Người không phải người gửi **không có** quyền ghi vào `recalled`, `text`, `imageUrl`. |
| **Mỗi người chỉ ghi trạng thái đang gõ và cảm xúc của chính mình** | `typing/$convId/$uid`, `viewing/$convId/$uid`, `readStatus/$convId/$uid` và `messages/.../reactions/$uid` đều có `.write` yêu cầu `$uid === auth.uid` (và là thành viên). Cảm xúc là chuỗi ≤ 8 ký tự; `typing`/`viewing` chỉ nhận `true`. Vì `reactions/$uid` có quy tắc riêng nên thành viên không phải người gửi vẫn thả được cảm xúc nhưng **không** sửa được `recalled`/`text`. |
| Dữ liệu nhóm | `conversations/$convId` chỉ tạo mới được (`!data.exists()`), người tạo phải là thành viên; 1-1 = mọi thành viên phải là UID nằm trong `convId` (tối đa 2 người), nhóm = id 20 ký tự và có thành viên. Realtime Database Rules không có hàm đếm số phần tử (`numChildren()` không tồn tại), nên yêu cầu "tối thiểu 2 người ngoài bản thân" do ứng dụng kiểm tra, không phải do rules. Đổi tên và xóa thành viên khác: chỉ `createdBy`. Thành viên được tự rời nhóm và thêm người vào nhóm. |
| `userChats` | Chỉ chủ sở hữu đọc. Ghi: chủ sở hữu hoặc thành viên cùng cuộc trò chuyện (cần cho `update()` đa đường dẫn). Có `.validate` kiểu dữ liệu từng trường, `unread` là số ≥ 0, `$other` bị chặn. |
| `notifications/$uid` | Chỉ chủ nhân đọc/đánh dấu đã đọc. Người khác chỉ **tạo** thông báo có `fromUid == auth.uid` cho người cùng cuộc trò chuyện và chỉ xóa thông báo do chính họ tạo (bỏ cảm xúc). |

## 2. Chứng minh một thao tác bị từ chối (Rules Playground)

Vào **Realtime Database → Rules → Rules Playground**, dán rules rồi **Publish**. Giả sử `alice_bob` là cuộc trò chuyện, tin `m1` do `alice` gửi (`recalled: false`).

1. *Simulation type*: **set**, *Location*: `/messages/alice_bob/m1/recalled`, *Authenticated* bật, *Provider* Custom, UID **`bob`**, dữ liệu `true`.
2. Nhấn **Run** → kết quả **Simulated set denied** (dòng `.write` tại `$msgId` đánh dấu đỏ vì `data.child('senderId').val() === auth.uid` sai).
3. Đổi UID thành **`alice`** → **Simulated set allowed**.

Các thử nghiệm từ chối khác cần chụp thêm nếu muốn: bob ghi `/typing/alice_bob/alice` (đóng giả người khác); bob ghi `/messages/alice_bob/m1/reactions/alice`; một UID `mallory` đọc `/messages/alice_bob`; đổi `recalled` từ `true` về `false`.

Trong ứng dụng, lỗi tương ứng hiển thị thành `PERMISSION_DENIED` ("Không có quyền truy cập dữ liệu. Vui lòng kiểm tra Firebase Rules.").

> **Lưu ý trung thực:** ảnh chụp Playground/Console phải do người nộp bài tự chụp. Luật chưa được chạy trên Firebase Emulator trong repo này, nên cần kiểm tra bằng Playground sau khi Publish; nếu một thao tác bị từ chối ngoài ý muốn, kiểm tra lại biểu thức `MEMBER` ở đầu các nhánh.

## 3. Giới hạn đã biết

Không có Cloud Functions, nên các thao tác ghi chéo do máy khách thực hiện. Rules kiểm tra được quyền và hình dạng dữ liệu nhưng không kiểm tra tính đúng của phép cộng `unread`; thành viên cùng cuộc trò chuyện có thể sửa `lastMessage`/`unread` của nhau. Đây là đánh đổi để gửi tin trong **một** lệnh `update()` đa đường dẫn theo yêu cầu.
