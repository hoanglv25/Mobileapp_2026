# Giai đoạn 7 — Hoàn thiện Bài thực hành 5

## Mục tiêu và thay đổi cuối

- Xóa mockCurrentUser, mockContacts, mockConversations và mockMessages khỏi src/data/mockData.ts. Giữ nguyên dữ liệu của cả 8 mockNotifications, đã so sánh giá trị với bản gốc trong Git.
- Xóa model User/Message/Conversation cũ chỉ phục vụ mock. RealtimeConversation dùng lastMessageTime dạng number trực tiếp; ChatMessage dùng UID/timestamp thật.
- Gỡ import Text không dùng khỏi SearchBar để lint toàn dự án hết lỗi.
- Thêm thông báo auth/configuration-not-found bằng tiếng Việt, kèm hướng dẫn khởi tạo Authentication/bật Email/Password đúng project.
- Thêm test authService cho đăng ký, avatar/profile, phục hồi hồ sơ còn thiếu, thứ tự offline trước signOut và các mã lỗi bắt buộc.
- Cập nhật README và tài liệu services. Lưu rules bạn đã cung cấp (với users/.read đã bổ sung) tại docs/database.rules.json để tham chiếu/dán thủ công vào Console. Không deploy hoặc mở thêm quyền.
- Không cài package mới, không thay native ở giai đoạn này. Không xóa dữ liệu/tài khoản trên Firebase.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| npx.cmd tsc --noEmit | Đạt |
| npm.cmd run lint | Đạt, 0 lỗi; còn 3 cảnh báo style có sẵn |
| npm.cmd test -- --runInBand | 14 suites, 70 tests đạt |
| Metro Android production JS bundle | Thành công; sao chép 19 assets vào thư mục tạm |
| Kiểm tra import Firebase bằng TypeScript AST trên 33 file src | Không có import firebase/* ngoài src/services |
| So sánh mockNotifications với bản gốc Git | Giữ nguyên 8 bản ghi |
| Tìm mock user/contact/conversation/message và senderId='me' trong src | Không còn |
| Autolinking Geolocation Android/iOS | Đã xác nhận ở bước 5 |
| Build APK/native iOS và chạy hai thiết bị | Chưa thực hiện trong phiên này |
| Firebase Console, rules trên server, Authentication thật | Chưa truy cập/xác minh trong phiên này |
| Quyền vị trí, GPS và mở Maps thực tế | Cần kiểm thử thủ công |

Ba cảnh báo lint nằm ở inline style có sẵn của Avatar (1) và NotificationItem (2). Không ảnh hưởng exit code của lint. Nội dung/giao diện Thông báo không bị thay đổi để dọn các cảnh báo này.

Bundle kiểm tra nằm trong thư mục TEMP có tên chatapp-stage7-<mã ngẫu nhiên>, không phải APK và không thay thế kiểm thử native. Không có test nào tạo tài khoản thật, gửi tin lên project hoặc xin quyền hệ điều hành thật.

## Đối chiếu yêu cầu đề bài

“Đạt ở code/test” không có nghĩa đã kiểm thử Firebase/native trên thiết bị. Dùng checklist hai tài khoản bên dưới để chốt nghiệm thu.

| Yêu cầu | Đối chiếu hiện tại |
| --- | --- |
| React Native CLI, TypeScript, React Navigation | Đạt; không dùng Expo |
| Firebase JS modular auth/database, toàn bộ code Firebase trong services | Đạt; kiểm tra AST |
| Đăng ký họ tên/email/mật khẩu/xác nhận; tối thiểu 6 ký tự | Đạt ở code/test |
| Đăng nhập Firebase, lỗi tài khoản/mật khẩu tiếng Việt | Đạt ở code/test; kiểm tra project thật |
| Loading, khóa bấm nhiều lần, khôi phục phiên AsyncStorage | Đạt ở code/test; thử khởi động lại app |
| Settings dùng hồ sơ thật, logout tự về Login | Đạt ở code/test; xác nhận trên thiết bị |
| Danh bạ người dùng đăng ký, loại bản thân | Đạt ở code/test; yêu cầu users/.read đã Publish |
| Online/offline qua .info/connected, onDisconnect và AppState | Đạt ở code/test; chờ độ trễ server khi mất mạng |
| Tìm tên/email, online trước và tên sau | Đạt ở code/test |
| Chọn liên hệ mở Chat đúng params | Đạt ở code/test |
| Nhắn tin realtime không tải lại | Listener đã có; xác nhận với hai thiết bị |
| Tin mình phải, người khác trái, mỗi tin có giờ | Đạt ở code/test |
| Chặn tin rỗng, tự cuộn xuống cuối | Đạt ở code/test; thử bàn phím thật |
| Header tên và trạng thái thật | Đạt ở code/test |
| Không tin lặp, reset state khi đổi chat | Snapshot thay thế, push key, cleanup; test đạt |
| Gửi vị trí bằng community/geolocation | Đạt ở code/test; quyền/GPS native chưa xác nhận |
| Alert từ chối quyền/GPS/timeout, hướng dẫn Cài đặt | Đạt ở code/test |
| Card vị trí và Google Maps đúng tọa độ | Đạt ở code/test; thử ứng dụng/trình duyệt thật |
| Tin cuối vị trí = “📍 Vị trí” | Đạt ở code/test |
| Home avatar/tên/tin cuối/thời gian, mới nhất lên đầu | Đạt ở code/test |
| Unread tăng, reset khi mở/nhận tin trong Chat active | Đạt ở code/test; xác nhận Console thực tế |
| Badge tổng Home, không nhấp nháy trong Chat đang đọc | Đạt ở code/test |
| Giờ hôm nay, Hôm qua, dd/MM | Đạt ở code/test |
| Dark Mode theo theme, giữ Spacing/FontSize/BorderRadius | Có trong code; kiểm tra giao diện thủ công |
| Hủy listener/useEffect cleanup | Đã rà soát, có test các luồng chính |
| Thông báo vẫn dùng mockNotifications | Đạt; dữ liệu 8 thông báo giữ nguyên |
| Firebase project, Email/Password, rules đã Publish | Cần bạn xác nhận trên Console |
| Hai thiết bị, quyền Android/iOS và gửi nhận thật | Chưa nghiệm thu thủ công |

## Cấu trúc dữ liệu cuối và quyền đọc/ghi

| Đường dẫn | Dữ liệu chính | Rule cho phép |
| --- | --- | --- |
| users/{uid} | uid, email, displayName, avatar, createdAt | Chủ UID ghi; người đăng nhập đọc; users/.read cho tải danh bạ |
| status/{uid} | isOnline, lastChanged | Chủ UID ghi, gồm onDisconnect; người đăng nhập đọc từng UID |
| messages/{chatId}/{pushKey} | id, senderId, receiverId, type, text, latitude/longitude nếu là vị trí, createdAt | auth != null và chatId chứa auth.uid |
| userChats/{uid}/{partnerUid} | chatId, contactId, name, avatar, lastMessage, lastMessageTime, unreadCount | Chủ uid đọc; mọi người đăng nhập được ghi ở nhánh partner |

Gửi tin dùng một update nhiều đường dẫn với increment(1) người nhận. Không đọc userChats của người khác. Metadata được ghi từng trường, không ghi đè unread của người gửi. Counter thiếu được coi là 0. markAsRead chỉ transaction counter của chính UID mình, không tạo cuộc trò chuyện rỗng khi counter null.

Rules tham chiếu: [database.rules.json](database.rules.json). Chúng giữ nguyên quyền của đề và bản bạn đã sửa users/.read. Quyền ghi userChats hiện rộng, điều kiện chatId là contains, chưa validate senderId/cấu trúc tin. Không coi đây là rules đã được gia cố cho production. Giai đoạn này không tự ý sửa rules của đề.

## Rà soát cleanup

| Nguồn đăng ký | Cleanup |
| --- | --- |
| onAuthStateChanged trong authService | AuthContext gọi unsubscribe khi unmount |
| startPresence: .info/connected và AppState | AuthContext cleanup theo UID/retry/unmount; stopPresence tháo listener trước logout |
| subscribeContacts: users + status từng UID | ContactsScreen unsubscribe khi UID/retry/unmount; gỡ status khi user bị xóa |
| subscribeMessages + subscribeStatus | ChatScreen cleanup khi đổi chat/UID/retry/unmount |
| subscribeUnreadCount | ChatScreen cleanup khi blur/background/lỗi tải/chuyển chat |
| subscribeConversationList: userChats + status | ConversationsProvider cleanup khi UID/retry/unmount; gỡ status khi xóa conversation |
| AppState trong Chat | remove khi nội dung Chat unmount |
| Timer refresh giờ Home | clearInterval khi unmount |
| Timer watchdog vị trí | clearTimeout khi request kết thúc; callback trễ bị bỏ qua |

Vị trí dùng single getCurrentPosition, không có watchPosition. Native request đang chạy không bị hủy bằng stopObserving toàn cục; screen bỏ kết quả nếu đã rời Chat hoặc app xuống nền, không tự gửi tọa độ muộn.

## Lỗi thường gặp và cách xử lý

| Triệu chứng | Cách kiểm tra/sửa |
| --- | --- |
| auth/configuration-not-found | Vào đúng project chatapp-th05 → Authentication → Get started/Bắt đầu → Sign-in method → bật Email/Password → Save. Sau đó thử lại; không sửa Database Rules để chữa lỗi này. |
| auth/operation-not-allowed | Email/Password chưa bật trong project mà apiKey đang trỏ tới. Kiểm tra provider và firebaseConfig cùng project. |
| auth/already-initialized | Dùng duy nhất src/services/firebase.ts, không gọi initializeAuth ở screen/context. File hiện có chỉ fallback getAuth với đúng mã lỗi này. |
| TypeScript không thấy getReactNativePersistence | Giữ paths firebase/auth tới bộ kiểu React Native trong tsconfig.json hiện tại. Khi nâng Firebase cần kiểm tra lại đường dẫn bộ kiểu thực tế, không tắt TypeScript hoặc dùng any để che lỗi. |
| PERMISSION_DENIED ở Danh bạ | Publish rules có users/.read = auth != null. Quyền ở users/$uid không cấp quyền đọc node cha /users. |
| PERMISSION_DENIED ở status/Home/Chat | Xác nhận đã đăng nhập; status chỉ đọc từng UID; Home chỉ userChats/{myUid}; chatId tạo từ đúng hai UID. Không mở quyền root để thử. |
| Thiếu/sai databaseURL | Lấy URL từ đúng Realtime Database instance, kiểm tra src/services/firebase.ts. Project này dùng URL vùng asia-southeast1; không nhầm với Firestore hoặc authDomain. |
| Đăng ký báo lỗi nhưng email đã tồn tại | Authentication và Database không phải giao dịch chung. Kiểm tra Authentication/Users và users/{uid}. Nếu Auth đã tạo, đăng nhập lại để getUserProfile phục hồi hồ sơ DB bị thiếu, thay vì đăng ký lại email đó. |
| Danh sách sai thứ tự/index | lastMessageTime/createdAt phải là number. Hiện sort tại client nên không cần index mới; nếu sau này thêm orderByChild/pagination, bổ sung index ở đúng node sau khi xem rules. |
| Tin bị lặp | Dùng push key làm keyExtractor, thay snapshot thay vì nối toàn bộ mảng, dọn listener và state chat cũ. Không đồng thời thêm tin thủ công vào UI và nhận lại từ listener. |
| Unread không về 0 | Chat phải tải tin thành công, focus và app active; kiểm tra lỗi read/reset và quyền own userChats. Mất mạng có thể chờ ghi lại; badge UI đang đọc được loại khỏi tổng khi không lỗi. |
| Unread tăng trong Console khi Chat đang mở | Counter tăng atomic trước khi client reset được server xác nhận. Badge UI không nhấp nháy; không đòi counter backend luôn bằng 0 trong mọi thời điểm mạng. |
| Metro giữ code cũ | Dừng Metro bằng Ctrl+C ở terminal chạy Metro, chạy npm.cmd start -- --reset-cache rồi Reload app. |
| Geolocation native module chưa có | Build lại npm.cmd run android. Trên macOS chạy bundle exec pod install trong ios rồi build lại; Fast Refresh không đưa module native vào binary cũ. |
| iOS không hỏi quyền vị trí | Kiểm tra NSLocationWhenInUseUsageDescription không rỗng và binary đã build lại. community/geolocation dùng setRNConfiguration whenInUse + requestAuthorization callbacks. |
| Emulator timeout/GPS không có tọa độ | Bật Location, đặt tọa độ ở Extended controls → Location → Set location/Send; thử lại. iOS Simulator dùng Features → Location. |
| Quyền bị từ chối/không hỏi lại | Dùng Mở Cài đặt từ Alert, cấp quyền Vị trí rồi nhấn gửi lại. App không gửi tin khi chưa lấy được tọa độ. |
| Maps không mở | Kiểm tra kết nối và ứng dụng/trình duyệt có thể mở HTTPS. UI có Alert khi Linking thất bại; không cần Maps API key. |
| npm/npx.ps1 bị ExecutionPolicy chặn | Dùng npm.cmd hoặc npx.cmd trong PowerShell như các lệnh trong tài liệu; không cần đổi ExecutionPolicy toàn máy. |
| Offline/logout pending lâu | RTDB giữ lệnh ghi chờ mạng; app ghi offline trước signOut theo đề. Kết nối lại để xác nhận, không bấm lặp và không hiểu pending là đã đăng xuất. |

Nguồn tham khảo chính thức: [Firebase Email/Password](https://firebase.google.com/docs/auth/web/password-auth), [Rules không phải bộ lọc](https://firebase.google.com/docs/database/security/core-syntax), [Realtime Database read/write](https://firebase.google.com/docs/database/web/read-and-write), [Presence/offline](https://firebase.google.com/docs/database/web/offline-capabilities), [Geolocation API](https://github.com/michalchudziak/react-native-geolocation).

## Những phần còn cần nghiệm thu và giới hạn

- Chưa có bằng chứng hai thiết bị kết nối project thật thành công. Authentication phải được bật đúng project; bạn từng gặp configuration-not-found nên kiểm tra mục này trước.
- Chưa build APK hoặc iOS binary trong lượt này. Metro bundle thành công chỉ xác nhận đóng gói JS/assets.
- Chưa kiểm thử quyền hệ điều hành thật, GPS tắt/bật, Maps và bố cục bàn phím trên cả Android/iOS.
- Presence hiện một node mỗi UID: kịch bản hai tài khoản khác nhau phù hợp; cùng UID ở nhiều thiết bị có thể ghi đè trạng thái.
- RTDB JS SDK không cung cấp lưu hàng đợi bền vững qua việc kill app như một cơ sở dữ liệu local riêng. Giữ app mở với yêu cầu pending. Mất mạng/kill app có độ trễ offline ở server.
- Lịch sử mỗi chat và userChats của mình được tải toàn bộ, chưa phân trang.
- Tên/avatar Home lấy metadata userChats cập nhật khi gửi tin; status được theo dõi trực tiếp.
- Thông báo cố ý là mock theo đề, không phải thông báo đẩy cho các tin Firebase.

## Nội dung đầy đủ các file sửa ở giai đoạn 7

### src/data/mockData.ts

````tsx
import { AppNotification } from '../types';

// Thông báo: tối thiểu 8 mục — GIỮ NGUYÊN theo yêu cầu đề bài
export const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    title: 'Tin nhắn mới từ Trần Thị Mai',
    message: 'Hẹn gặp bạn ở quán cà phê chiều nay nhé!',
    timestamp: '10:30',
    isRead: false,
    type: 'message',
  },
  {
    id: 'n2',
    title: 'Lời mời kết bạn',
    message: 'Dương Thành Long đã gửi cho bạn một lời mời kết bạn.',
    timestamp: '08:45',
    isRead: false,
    type: 'friend_request',
  },
  {
    id: 'n3',
    title: 'Cập nhật hệ thống',
    message: 'Phiên bản ChatApp 2.0 đã sẵn sàng với nhiều tính năng mới.',
    timestamp: 'Hôm qua',
    isRead: false,
    type: 'system',
  },
  {
    id: 'n4',
    title: 'Tin nhắn mới từ Bùi Tuấn Anh',
    message: 'Mai nhớ mang tài liệu đi sớm nhé.',
    timestamp: 'Hôm qua',
    isRead: true,
    type: 'message',
  },
  {
    id: 'n5',
    title: 'Bảo mật tài khoản',
    message: 'Tài khoản của bạn vừa đăng nhập trên một thiết bị Android mới.',
    timestamp: '2 ngày trước',
    isRead: true,
    type: 'system',
  },
  {
    id: 'n6',
    title: 'Lời mời kết bạn',
    message: 'Phan Gia Bảo đã chấp nhận lời mời kết bạn của bạn.',
    timestamp: '3 ngày trước',
    isRead: true,
    type: 'friend_request',
  },
  {
    id: 'n7',
    title: 'Tin nhắn mới từ Vũ Thảo Linh',
    message: 'Tối nay nhóm mình có họp không?',
    timestamp: 'T2',
    isRead: false,
    type: 'message',
  },
  {
    id: 'n8',
    title: 'Khuyến mãi thành viên mới',
    message: 'Chào mừng bạn đến với ChatApp! Khám phá thêm bạn bè xung quanh.',
    timestamp: 'Tuần trước',
    isRead: true,
    type: 'system',
  },
];

````

### src/types/index.ts

````tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// ==================== CÁC MODEL DỮ LIỆU CHÍNH ====================

// Tin nhắn Firebase dùng UID thật và thời gian dạng số.
export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  type: 'text' | 'location';
  text: string;
  createdAt: number;
  latitude?: number;
  longitude?: number;
}

export interface RealtimeConversation {
  id: string;
  chatId: string;
  contactId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  isOnline: boolean;
  statusKnown: boolean;
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  email: string;
  isOnline: boolean;
  statusText?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: 'message' | 'friend_request' | 'system';
}

// ==================== NAVIGATION PARAM LISTS ====================

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Chat: {
    contactId: string;
    contactName: string;
    contactAvatar: string;
  };
};

export type MainTabParamList = {
  HomeTab: undefined;
  ContactsTab: undefined;
  NotificationsTab: undefined;
  SettingsTab: undefined;
};

// ==================== TYPED PROPS CHO SCREEN ====================

export type LoginScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Login'
>;
export type RegisterScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Register'
>;
export type ChatScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Chat'
>;

export type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'HomeTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ContactsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ContactsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type NotificationsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'NotificationsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

````

### src/components/common/SearchBar.tsx

````tsx
import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({
  value,
  onChangeText,
  placeholder,
}) => {
  const { theme } = useApp();

  return (
    <View style={[styles.container, { paddingHorizontal: Spacing.lg }]}>
      <View
        style={[
          styles.searchWrapper,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <Icon
          name="search-outline"
          size={18}
          color={theme.textMuted}
          style={styles.icon}
        />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={placeholder || 'Tìm kiếm...'}
          placeholderTextColor={theme.textMuted}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.sm,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.sm,
    paddingVertical: 0,
  },
});

````

### src/services/authService.ts

````tsx
/**
 * authService.ts
 * Toàn bộ logic xác thực: đăng ký, đăng nhập, đăng xuất, lắng nghe trạng thái auth.
 * Screen/Context chỉ gọi các hàm từ file này, KHÔNG import firebase/auth trực tiếp.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { get, ref, set, serverTimestamp } from 'firebase/database';
import { auth, database } from './firebase';
import { stopPresence } from './presenceService';

// ==================== TYPES ====================

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  avatar: string;
}

// ==================== HELPER ====================

/** Danh sách avatar ngẫu nhiên từ pravatar */
const AVATAR_LIST = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=9',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=15',
  'https://i.pravatar.cc/150?img=18',
  'https://i.pravatar.cc/150?img=20',
  'https://i.pravatar.cc/150?img=33',
  'https://i.pravatar.cc/150?img=44',
  'https://i.pravatar.cc/150?img=47',
  'https://i.pravatar.cc/150?img=52',
  'https://i.pravatar.cc/150?img=60',
  'https://i.pravatar.cc/150?img=68',
];

const getRandomAvatar = (): string => {
  const index = Math.floor(Math.random() * AVATAR_LIST.length);
  return AVATAR_LIST[index];
};

/**
 * Map mã lỗi Firebase Auth sang thông báo tiếng Việt dễ hiểu.
 */
export const mapFirebaseAuthError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.';
    case 'auth/email-already-in-use':
      return 'Email này đã được dùng để đăng ký tài khoản khác.';
    case 'auth/invalid-email':
      return 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại.';
    case 'auth/weak-password':
      return 'Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.';
    case 'auth/network-request-failed':
      return 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet.';
    case 'auth/too-many-requests':
      return 'Quá nhiều lần thử. Tài khoản tạm thời bị khóa. Hãy thử lại sau.';
    case 'auth/user-disabled':
      return 'Tài khoản này đã bị vô hiệu hoá.';
    case 'auth/operation-not-allowed':
      return 'Đăng nhập Email/Password chưa được bật trong Firebase Console.';
    case 'auth/configuration-not-found':
      return 'Firebase Authentication chưa được cấu hình. Hãy mở đúng project trong Firebase Console, nhấn Bắt đầu và bật Email/Password.';
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Không có quyền truy cập dữ liệu. Vui lòng kiểm tra Firebase Rules.';
    default:
      return `Đã xảy ra lỗi (${errorCode}). Vui lòng thử lại.`;
  }
};

export const getAuthErrorMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return mapFirebaseAuthError(error.code);
  }
  return error instanceof Error
    ? error.message
    : 'Đã xảy ra lỗi. Vui lòng thử lại.';
};

// ==================== SERVICES ====================

/**
 * Đăng ký tài khoản mới.
 * Quy trình: createUser → updateProfile(displayName) → ghi users/{uid} vào Database.
 */
export const registerUser = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> => {
  name = name.trim();
  email = email.trim();
  if (!name) {
    throw new Error('Vui lòng nhập họ tên.');
  }
  // 1. Tạo tài khoản Firebase Auth
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const firebaseUser: FirebaseUser = credential.user;

  const avatar = getRandomAvatar();

  // 2. Cập nhật displayName vào profile
  await updateProfile(firebaseUser, { displayName: name, photoURL: avatar });

  // 3. Ghi thông tin user vào Realtime Database (users/{uid})
  //    Luật cho phép: ".write": "$uid === auth.uid"
  const userData = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || email,
    displayName: name,
    avatar,
    createdAt: serverTimestamp(),
  };
  await set(ref(database, `users/${firebaseUser.uid}`), userData);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || email,
    displayName: name,
    avatar,
  };
};

/**
 * Đăng nhập bằng email & password.
 * Trả về AuthUser; AuthContext chuyển lỗi thành thông báo tiếng Việt.
 */
export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthUser> => {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );
  return getUserProfile(credential.user);
};

/** Đọc đúng hồ sơ khi đăng nhập hoặc khôi phục phiên. Lỗi đọc được chuyển cho UI. */
export const getUserProfile = async (
  firebaseUser: FirebaseUser,
): Promise<AuthUser> => {
  const snapshot = await get(ref(database, `users/${firebaseUser.uid}`));
  const profile = snapshot.val() as Partial<AuthUser> | null;
  const user = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName:
      profile?.displayName || firebaseUser.displayName || 'Người dùng',
    avatar: profile?.avatar || firebaseUser.photoURL || AVATAR_LIST[0],
  };
  // Khôi phục hồ sơ nếu lần đăng ký trước tạo Auth thành công nhưng ghi DB thất bại.
  if (!snapshot.exists()) {
    await set(ref(database, `users/${firebaseUser.uid}`), {
      ...user,
      createdAt: serverTimestamp(),
    });
  }
  return user;
};

/**
 * Đăng xuất khỏi Firebase Auth.
 * Ghi offline khi vẫn còn quyền xác thực, sau đó mới signOut.
 * Nếu ghi thất bại, báo lỗi để người dùng thử lại.
 */
export const logoutUser = async (): Promise<void> => {
  const user = auth.currentUser;
  if (user) {
    await stopPresence(user.uid);
  }
  await signOut(auth);
};

/**
 * Lắng nghe thay đổi trạng thái đăng nhập.
 * Trả về hàm unsubscribe để cleanup trong useEffect.
 *
 * @param callback - Nhận null nếu chưa đăng nhập, FirebaseUser nếu đã đăng nhập
 */
export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void,
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Lấy user hiện tại (đồng bộ, không lắng nghe thay đổi).
 */
export const getCurrentFirebaseUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

````

### __tests__/authService.test.ts

````tsx
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { get, set } from 'firebase/database';
import {
  registerUser,
  getUserProfile,
  logoutUser,
  mapFirebaseAuthError,
} from '../src/services/authService';
import { stopPresence } from '../src/services/presenceService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('../src/services/presenceService', () => ({
  stopPresence: jest.fn(),
}));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  get: jest.fn(),
  set: jest.fn(),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(updateProfile).mockResolvedValue(undefined);
  jest.mocked(set).mockResolvedValue(undefined);
  jest.mocked(signOut).mockResolvedValue(undefined);
  jest.mocked(stopPresence).mockResolvedValue(undefined);
});

test('registration writes the new UID profile and matches its Auth avatar', async () => {
  const user = { uid: 'alice', email: 'alice@example.com' };
  jest
    .mocked(createUserWithEmailAndPassword)
    .mockResolvedValue({ user } as Awaited<
      ReturnType<typeof createUserWithEmailAndPassword>
    >);
  const profile = await registerUser(
    ' Alice ',
    ' alice@example.com ',
    ' secret ',
  );
  expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
    expect.anything(),
    'alice@example.com',
    ' secret ',
  );
  expect(updateProfile).toHaveBeenCalledWith(user, {
    displayName: 'Alice',
    photoURL: profile.avatar,
  });
  expect(set).toHaveBeenCalledWith(
    { path: 'users/alice' },
    { ...profile, createdAt: { '.sv': 'timestamp' } },
  );
});

test('a missing database profile is recovered from the Auth profile on login', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce({ exists: () => false, val: () => null } as Awaited<
      ReturnType<typeof get>
    >);
  const user = {
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    photoURL: 'avatar.png',
  };
  const result = await getUserProfile(
    user as Parameters<typeof getUserProfile>[0],
  );
  expect(result).toEqual({
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    avatar: 'avatar.png',
  });
  expect(set).toHaveBeenCalledWith(
    { path: 'users/alice' },
    expect.objectContaining({ displayName: 'Alice' }),
  );
});

test('logout waits for offline confirmation before signOut', async () => {
  let offline!: () => void;
  jest.mocked(stopPresence).mockReturnValueOnce(
    new Promise(resolve => {
      offline = resolve;
    }),
  );
  const pending = logoutUser();
  expect(stopPresence).toHaveBeenCalledWith('alice');
  expect(signOut).not.toHaveBeenCalled();
  offline();
  await pending;
  expect(signOut).toHaveBeenCalledTimes(1);
});

test('failed offline update does not silently sign out', async () => {
  jest
    .mocked(stopPresence)
    .mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
  await expect(logoutUser()).rejects.toThrow('PERMISSION_DENIED');
  expect(signOut).not.toHaveBeenCalled();
});

test.each([
  ['auth/invalid-credential', 'Email hoặc mật khẩu'],
  ['auth/wrong-password', 'Email hoặc mật khẩu'],
  ['auth/user-not-found', 'Email hoặc mật khẩu'],
  ['auth/email-already-in-use', 'Email này đã được dùng'],
  ['auth/invalid-email', 'Địa chỉ email không hợp lệ'],
  ['auth/weak-password', 'ít nhất 6 ký tự'],
  ['auth/network-request-failed', 'Lỗi kết nối mạng'],
  [
    'auth/configuration-not-found',
    'Firebase Authentication chưa được cấu hình',
  ],
  ['PERMISSION_DENIED', 'Không có quyền truy cập'],
])('maps %s into a Vietnamese message', (code, expected) => {
  expect(mapFirebaseAuthError(code)).toContain(expected);
});

````

### docs/database.rules.json

````json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    },
    "status": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    },
    "messages": {
      "$chatId": {
        ".read": "auth != null && ($chatId.contains(auth.uid))",
        ".write": "auth != null && ($chatId.contains(auth.uid))"
      }
    },
    "userChats": {
      "$uid": {
        ".read": "$uid === auth.uid",
        "$partnerUid": {
          ".read": "$uid === auth.uid",
          ".write": "auth != null"
        }
      }
    }
  }
}

````

### README.md

````markdown
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

````

### src/services/README.md

````markdown
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

````
## Cách kiểm tra

### Chạy lại kiểm tra tự động

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test -- --runInBand
```

### Chuẩn bị hai thiết bị/tài khoản

- [ ] Thiết bị/emulator 1 và 2 cùng có Internet; bật Location và đặt vị trí giả nếu dùng emulator.
- [ ] Firebase project chatapp-th05: Authentication đã Get started và Email/Password Enabled; Realtime Database Rules đã Publish như docs/database.rules.json.
- [ ] Mở Metro bằng npm.cmd start; build/chạy npm.cmd run android hoặc build iOS trên macOS sau pod install.
- [ ] Tạo tài khoản A và B khác email qua màn hình Đăng ký, mỗi mật khẩu ít nhất 6 ký tự. Không dùng admin/123456.

### Kịch bản nghiệm thu (đánh dấu sau khi thực hiện thật)

| Đã thử | Ca kiểm thử | Kết quả mong đợi |
| --- | --- | --- |
| [ ] | Đăng ký bỏ trống tên/email/password/xác nhận | Có lỗi ở đúng ô, không tạo tài khoản |
| [ ] | Mật khẩu dưới 6 ký tự hoặc xác nhận không khớp | Chặn gửi và hiện lỗi |
| [ ] | Đăng ký A/B hợp lệ | Vào Main; Auth có tài khoản và users/{uid} có hồ sơ tương ứng |
| [ ] | Đăng ký lại email đã có | Lỗi email đã sử dụng, hết loading để thử lại |
| [ ] | Đăng nhập sai email/mật khẩu | Thông báo tiếng Việt, không vào Main |
| [ ] | Đăng nhập đúng, kill/mở lại app | Khôi phục phiên; Cài đặt đúng tên/email/avatar |
| [ ] | A/B mở Danh bạ | Không thấy bản thân, thấy đối phương, tìm được theo tên/email |
| [ ] | B background/active | A thấy offline/online cập nhật; kiểm tra status/{uidB} |
| [ ] | B mất mạng hoặc kill app | A thấy offline sau khi server phát hiện mất kết nối |
| [ ] | Mở Chat mà chưa gửi | Home không tạo hàng trò chuyện rỗng |
| [ ] | A gửi text, B trả lời | Tin đến realtime; UID/phía bong bóng/giờ đúng, không tải lại |
| [ ] | Gửi chuỗi trắng, bấm Gửi nhiều lần khi pending | Tin trắng bị chặn; không tạo nhiều tin cho một lần đang gửi |
| [ ] | Thoát/vào Chat và Fast Refresh nhiều lần | Không có tin lặp; chuyển đối tác không lẫn lịch sử |
| [ ] | B không ở Chat A, A gửi 2 tin | Home/tổng badge của B tăng 2 từ mốc 0; Console counter tương ứng |
| [ ] | B mở Chat A | Tin tải thành công, counter server về 0; badge được reset |
| [ ] | A gửi khi B đang focus Chat A | B thấy tin, badge không nhấp nháy trong lúc reset |
| [ ] | B xuống nền trong Chat, A gửi tiếp | Unread tăng, chỉ reset sau khi B active lại |
| [ ] | Bấm vị trí rồi từ chối quyền | Alert hướng dẫn, không tạo tin location |
| [ ] | Chặn quyền và bấm lại | Có hướng dẫn Mở Cài đặt; cấp lại quyền thì thử được |
| [ ] | Cho phép quyền chính xác/gần đúng | Có loading rồi gửi card tọa độ phù hợp với quyền hệ điều hành |
| [ ] | Tắt GPS/emulator không tọa độ | Thông báo unavailable/timeout; nút được mở lại |
| [ ] | Rời Chat trong lúc GPS đang chạy | Không gửi tọa độ muộn sau khi rời màn hình |
| [ ] | B nhận card và bấm mở Maps | Maps/trình duyệt mở đúng tọa độ gốc |
| [ ] | Gửi vị trí khi đang có draft text | Draft giữ nguyên; Home có preview 📍 Vị trí |
| [ ] | Home có nhiều đối tác, tin mới đến | Mới nhất lên đầu, tìm theo tên, avatar/tin cuối/giờ đúng |
| [ ] | Thời gian hôm nay/hôm qua/cũ hơn | HH:mm, Hôm qua, dd/MM đúng lịch thiết bị |
| [ ] | Dark Mode, màn hình nhỏ và bàn phím | Màu đọc được, form cuộn được, ô nhập/nút Gửi không bị che |
| [ ] | Đăng xuất A, đăng nhập B trên cùng thiết bị | Về Login, Back không vào Main cũ, không lộ Home/badge A |
| [ ] | Thông báo và badge Thông báo | Vẫn 8 mockNotifications, thao tác đọc/lọc hoạt động như Bài 4 |
| [ ] | Kiểm tra Console sau gửi/đọc/logout | Message UID thật, timestamp số, userChats đúng đối tác, status offline trước signOut |

Sau khi các ca bắt buộc đạt trên thiết bị, bài thực hành mới được coi là đã nghiệm thu end-to-end. Nếu một ca lỗi, ghi rõ tài khoản/thiết bị, thao tác, mã lỗi và đường dẫn Console liên quan để sửa đúng nguyên nhân.
