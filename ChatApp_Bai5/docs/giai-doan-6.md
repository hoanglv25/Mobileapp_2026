# Giai đoạn 6 — Home và unread realtime

## Mục tiêu và kết quả

- Home đọc các cuộc trò chuyện thật từ userChats/{myUid}, lấy metadata tên/avatar/tin cuối, giữ thời gian dạng số và sắp mới nhất lên trên. Không dùng Home mẫu nữa.
- chatService thêm subscribeConversations và subscribeConversationList. Chỉ subscribe userChats của tài khoản hiện tại, cộng status/{partnerUid} theo từng UID. Giữ listener status khi chỉ đổi metadata; xóa khi cuộc trò chuyện biến mất; cleanup và chặn callback trễ.
- Chỉ hiển thị node có chatId/contactId đúng với hai UID và có lastMessageTime số, lastMessage chuỗi. Counter thiếu hoặc sai dạng coi là 0; số âm được chuẩn hóa 0. Không tạo cuộc trò chuyện chỉ vì mở Danh bạ/Chat.
- ConversationsProvider cung cấp dữ liệu chung cho Home, tab badge và Chat. Tổng unread cộng các cuộc trò chuyện. Badge Home hiển thị 99+ nếu tổng vượt 99; badge Thông báo giữ riêng mockNotifications.
- Khi Chat đã tải tin thành công, có focus và app active, activateChat loại counter của đối tác đó khỏi badge hiển thị trong lúc server còn xử lý reset. Snapshot mới tăng unread của chat đang mở không tạo badge nhấp nháy. Reset trên server vẫn do markAsRead thực hiện.
- Khi Chat lỗi tải tin hoặc lỗi reset unread, không che counter bằng số 0. Khi blur/background/unmount, cleanup trả lại số liệu server. Token giúp cleanup của Chat cũ không xóa trạng thái Chat mới.
- Chat chỉ đánh dấu đã đọc sau khi tin tải thành công; tránh xóa unread của nội dung chưa đọc được do lỗi quyền.
- Home có tìm theo tên, loading, lỗi và Thử lại, trạng thái rỗng, thông báo mất kết nối. Chạm hàng mở Chat đúng partner, sau đó Chat reset unread theo điều kiện trên.
- ConversationItem hiển thị avatar, chấm online khi status đã biết, tên, tin cuối, giờ/ngày và badge riêng mỗi cuộc trò chuyện.
- formatConversationTime: hôm nay HH:mm, hôm qua Hôm qua, cũ hơn dd/MM theo lịch địa phương của thiết bị. Home làm mới giờ mỗi phút và dọn timer khi unmount.
- Xóa src/context/MockChatContext.tsx vì không còn dùng. Danh bạ không thêm conversation mẫu khi bấm vào người dùng; chỉ tin nhắn thật mới tạo userChats.
- mockData.ts còn các export cũ không dùng; bước 7 sẽ dọn và chỉ giữ mockNotifications. Màn hình Thông báo không đổi.

## Cài đặt/native và rules

Không cài thêm package, không đổi native hoặc Firebase rules.

| Thao tác | Rule cho phép |
| --- | --- |
| Đọc userChats/{myUid} | userChats/$uid/.read = $uid === auth.uid |
| Đọc status/{partnerUid} | status/$uid/.read = auth != null |
| Reset unread của mình | Quyền read của chủ UID và write auth != null ở nhánh partner |
| Cập nhật tin cuối và increment khi gửi | Cùng luồng multi-path update đã có ở bước 4–5 |

Không đọc toàn bộ userChats hoặc status; không yêu cầu user A đọc userChats của B. Sắp xếp tại client nên chưa cần thêm .indexOn.

## Kiểm tra tự động và giới hạn

- TypeScript: thành công.
- ESLint các file thay đổi: thành công, không lỗi/cảnh báo.
- Jest: 13 suites, 57 tests thành công.
- Test mới: parse/sort own userChats; counter mặc định; giữ/xóa status listener; bỏ callback trễ; tổng unread khi active chat nhận snapshot mới; cleanup đúng token; đổi tài khoản không lộ dữ liệu cũ; lỗi/retry subscription; Home tìm kiếm/điều hướng; dọn timer; giờ hôm nay/hôm qua/dd/MM qua tháng/năm; badge tab đổi 0/5/99+ và không lẫn badge Thông báo; lỗi markAsRead hủy việc che counter.
- Test dùng Firebase/native mock, chưa chạy hai thiết bị và chưa xác minh dữ liệu thật trên Console.
- Counter trong Console có thể tăng rồi về 0 khi Chat đang mở vì reset cần server xác nhận. Không nhấp nháy ở đây là hành vi badge giao diện, không phải cam kết counter backend không bao giờ tăng.
- Nếu người dùng rời Chat trước khi reset được server xác nhận, Home phản ánh counter server còn chờ; callback ghi đã gửi có thể hoàn tất sau đó. Mất kết nối được hiển thị, dữ liệu có thể chưa cập nhật.
- Home tải toàn bộ userChats của mình; lịch sử messages vẫn chưa phân trang. Tên/avatar từ metadata của userChats được cập nhật khi gửi tin; status được theo dõi trực tiếp.

## Nội dung đầy đủ các file

### src/context/ConversationsContext.tsx

```tsx
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { RealtimeConversation } from '../types';
import { subscribeConversationList } from '../services/chatService';
import { getAuthErrorMessage } from '../services/authService';

interface ConversationsState {
  conversations: RealtimeConversation[];
  totalUnreadCount: number;
  loading: boolean;
  error: string;
  retry: () => void;
  activateChat: (partnerUid: string) => () => void;
}
const ConversationsContext = createContext<ConversationsState | undefined>(
  undefined,
);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    uid?: string;
    rows: RealtimeConversation[];
    loading: boolean;
    error: string;
  }>({
    rows: [],
    loading: true,
    error: '',
  });
  const [activeChat, setActiveChat] = useState<{
    uid?: string;
    partner: string;
    token: symbol;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setSnapshot({ uid, rows: [], loading: !!uid, error: '' });
    if (!uid) {
      return;
    }
    const unsubscribe = subscribeConversationList(
      uid,
      rows => {
        if (active) {
          setSnapshot({ uid, rows, loading: false, error: '' });
        }
      },
      error => {
        if (active) {
          setSnapshot({
            uid,
            rows: [],
            loading: false,
            error: getAuthErrorMessage(error),
          });
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  const activateChat = useCallback(
    (partner: string) => {
      const token = Symbol('chat');
      setActiveChat({ uid, partner, token });
      // Cleanup của màn hình cũ không được xóa trạng thái màn hình mới.
      return () =>
        setActiveChat(previous =>
          previous?.token === token ? null : previous,
        );
    },
    [uid],
  );
  const retry = useCallback(() => setAttempt(previous => previous + 1), []);
  const conversations = useMemo(() => {
    if (snapshot.uid !== uid) {
      return [];
    }
    return snapshot.rows.map(item =>
      activeChat?.uid === uid && activeChat?.partner === item.contactId
        ? { ...item, unreadCount: 0 }
        : item,
    );
  }, [snapshot, uid, activeChat]);

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        totalUnreadCount: conversations.reduce(
          (sum, item) => sum + item.unreadCount,
          0,
        ),
        loading: !!uid && (snapshot.uid !== uid || snapshot.loading),
        error: snapshot.uid === uid ? snapshot.error : '',
        retry,
        activateChat,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsState {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations cần ConversationsProvider');
  }
  return context;
}

```

### src/services/chatService.ts

```tsx
import {
  get,
  increment,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database';
import { auth, database } from './firebase';
import { AuthUser } from './authService';
import { ChatMessage, RealtimeConversation } from '../types';
import { subscribeStatus, UserStatus } from './userService';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

export const MAX_MESSAGE_LENGTH = 2000;

function validUid(uid: string) {
  return (
    !!uid &&
    [...uid].every(
      character =>
        character.charCodeAt(0) >= 32 &&
        character.charCodeAt(0) !== 127 &&
        !'.#$[]/'.includes(character),
    )
  );
}

export function getChatId(firstUid: string, secondUid: string): string {
  if (!validUid(firstUid) || !validUid(secondUid) || firstUid === secondUid) {
    throw new Error(
      'Người nhận không hợp lệ. Hãy chọn người dùng khác trong Danh bạ.',
    );
  }
  return [firstUid, secondUid].sort().join('_');
}

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

export function subscribeMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `messages/${chatId}`),
    snapshot => {
      const messages: ChatMessage[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          !child.key ||
          !value ||
          typeof value.senderId !== 'string' ||
          typeof value.receiverId !== 'string' ||
          typeof value.text !== 'string' ||
          !Number.isFinite(value.createdAt) ||
          !['text', 'location'].includes(value.type)
        ) {
          return;
        }
        messages.push({
          id: child.key,
          senderId: value.senderId,
          receiverId: value.receiverId,
          type: value.type,
          text: value.text,
          createdAt: value.createdAt,
          ...(typeof value.latitude === 'number'
            ? { latitude: value.latitude }
            : {}),
          ...(typeof value.longitude === 'number'
            ? { longitude: value.longitude }
            : {}),
        });
      });
      // Thay cả snapshot thay vì nối mảng: một push key chỉ tạo một dòng.
      messages.sort(
        (a, b) =>
          a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      callback(messages);
    },
    onError,
  );
}

export async function sendTextMessage(
  sender: AuthUser,
  partnerUid: string,
  text: string,
): Promise<void> {
  requireUser(sender.uid);
  getChatId(sender.uid, partnerUid);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Không thể gửi tin nhắn rỗng.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
  }
  await sendMessage(sender, partnerUid, { type: 'text', text: trimmed });
}

export async function sendLocationMessage(
  sender: AuthUser,
  partnerUid: string,
  point: Coordinates,
): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  await sendMessage(sender, partnerUid, {
    type: 'location',
    text: '📍 Vị trí',
    latitude: point.latitude,
    longitude: point.longitude,
  });
}

async function sendMessage(
  sender: AuthUser,
  partnerUid: string,
  content: {
    type: 'text' | 'location';
    text: string;
    latitude?: number;
    longitude?: number;
  },
): Promise<void> {
  requireUser(sender.uid);
  const chatId = getChatId(sender.uid, partnerUid);
  // Xác nhận hồ sơ người nhận trước khi tạo tin nhắn.
  const partnerSnapshot = await get(ref(database, `users/${partnerUid}`));
  if (!partnerSnapshot.exists()) {
    throw new Error(
      'Người nhận không tồn tại. Hãy chọn tài khoản trong Danh bạ.',
    );
  }
  const partner = partnerSnapshot.val();
  requireUser(sender.uid);
  const messageRef = push(ref(database, `messages/${chatId}`));
  if (!messageRef.key) {
    throw new Error('Không thể tạo tin nhắn. Vui lòng thử lại.');
  }
  const createdAt = serverTimestamp();
  const changes: Record<string, unknown> = {
    [`messages/${chatId}/${messageRef.key}`]: {
      id: messageRef.key,
      senderId: sender.uid,
      receiverId: partnerUid,
      ...content,
      createdAt,
    },
  };
  const participants = [
    {
      owner: sender.uid,
      contact: partnerUid,
      name:
        typeof partner.displayName === 'string'
          ? partner.displayName
          : 'Người dùng',
      avatar: typeof partner.avatar === 'string' ? partner.avatar : '',
    },
    {
      owner: partnerUid,
      contact: sender.uid,
      name: sender.displayName,
      avatar: sender.avatar,
    },
  ];
  participants.forEach(item => {
    const base = `userChats/${item.owner}/${item.contact}`;
    Object.entries({
      chatId,
      contactId: item.contact,
      name: item.name,
      avatar: item.avatar,
      lastMessage: content.text,
      lastMessageTime: createdAt,
    }).forEach(([field, value]) => {
      changes[`${base}/${field}`] = value;
    });
  });
  changes[`userChats/${partnerUid}/${sender.uid}/unreadCount`] = increment(1);
  // Không ghi đè cả userChats node hoặc reset unread của người gửi.
  await update(ref(database), changes);
}

export function subscribeUnreadCount(
  myUid: string,
  partnerUid: string,
  callback: (count: number) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    snapshot => {
      const value = snapshot.val();
      callback(typeof value === 'number' && value > 0 ? value : 0);
    },
    onError,
  );
}

export async function markAsRead(
  myUid: string,
  partnerUid: string,
): Promise<void> {
  requireUser(myUid);
  getChatId(myUid, partnerUid);
  // Transaction chỉ ở counter của mình: không cần quyền đọc nhánh người nhận.
  // null/0 không ghi, tránh tạo cuộc trò chuyện rỗng ngay khi mở Chat.
  await runTransaction(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    count => (typeof count === 'number' && count > 0 ? 0 : undefined),
    { applyLocally: false },
  );
}

export function subscribeConversations(
  myUid: string,
  callback: (conversations: RealtimeConversation[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}`),
    snapshot => {
      const list: RealtimeConversation[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        const partnerUid = child.key;
        if (
          !partnerUid ||
          partnerUid === myUid ||
          !value ||
          typeof value.lastMessage !== 'string' ||
          typeof value.lastMessageTime !== 'number' ||
          !Number.isFinite(value.lastMessageTime)
        ) {
          return;
        }
        let expectedChatId: string;
        try {
          expectedChatId = getChatId(myUid, partnerUid);
        } catch {
          return;
        }
        if (value.chatId !== expectedChatId || value.contactId !== partnerUid) {
          return;
        }
        list.push({
          id: expectedChatId,
          chatId: expectedChatId,
          contactId: partnerUid,
          name: typeof value.name === 'string' ? value.name : 'Người dùng',
          avatar: typeof value.avatar === 'string' ? value.avatar : '',
          lastMessage: value.lastMessage,
          lastMessageTime: value.lastMessageTime,
          unreadCount:
            typeof value.unreadCount === 'number' &&
            Number.isFinite(value.unreadCount)
              ? Math.max(0, Math.floor(value.unreadCount))
              : 0,
          isOnline: false,
          statusKnown: false,
        });
      });
      list.sort(
        (a, b) =>
          b.lastMessageTime - a.lastMessageTime ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      callback(list);
    },
    onError,
  );
}

/** Một listener userChats của mình, cộng status theo UID đối tác theo đúng rules. */
export function subscribeConversationList(
  myUid: string,
  callback: (conversations: RealtimeConversation[]) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let list: RealtimeConversation[] = [];
  const statuses = new Map<
    string,
    { unsubscribe: () => void; value?: UserStatus }
  >();
  const publish = () => {
    if (!active) {
      return;
    }
    callback(
      list.map(item => {
        const status = statuses.get(item.contactId)?.value;
        return {
          ...item,
          statusKnown: !!status,
          isOnline: status?.isOnline === true,
        };
      }),
    );
  };
  const unsubscribe = subscribeConversations(
    myUid,
    value => {
      if (!active) {
        return;
      }
      list = value;
      const ids = new Set(list.map(item => item.contactId));
      statuses.forEach((entry, id) => {
        if (!ids.has(id)) {
          entry.unsubscribe();
          statuses.delete(id);
        }
      });
      list.forEach(item => {
        if (statuses.has(item.contactId)) {
          return;
        }
        const entry: { unsubscribe: () => void; value?: UserStatus } = {
          unsubscribe: () => {},
        };
        statuses.set(item.contactId, entry);
        entry.unsubscribe = subscribeStatus(
          item.contactId,
          status => {
            if (!active || statuses.get(item.contactId) !== entry) {
              return;
            }
            entry.value = status;
            publish();
          },
          () => {
            if (!active || statuses.get(item.contactId) !== entry) {
              return;
            }
            entry.value = undefined;
            publish();
          },
        );
      });
      publish();
    },
    error => {
      if (!active) {
        return;
      }
      statuses.forEach(entry => entry.unsubscribe());
      statuses.clear();
      onError(error);
    },
  );
  return () => {
    active = false;
    unsubscribe();
    statuses.forEach(entry => entry.unsubscribe());
    statuses.clear();
  };
}

```

### src/types/index.ts

```tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// ==================== CÁC MODEL DỮ LIỆU CHÍNH ====================

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Message {
  id: string;
  senderId: string; // 'me' cho người dùng hiện tại, hoặc id của bạn chat
  text: string;
  timestamp: string; // Định dạng hiển thị giờ: "10:30", "Hôm qua"
  createdAt: number;
}

// Tin nhắn Firebase dùng UID thật và thời gian dạng số, tách khỏi mock Bài 4.
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

export interface Conversation {
  id: string;
  contactId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface RealtimeConversation
  extends Omit<Conversation, 'lastMessageTime'> {
  chatId: string;
  lastMessageTime: number;
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

```

### src/utils/formatConversationTime.ts

```tsx
import { formatTime } from './formatTime';

export function formatConversationTime(
  timestamp: number,
  now = Date.now(),
): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(today.getTime())) {
    return '';
  }
  if (date.toDateString() === today.toDateString()) {
    return formatTime(timestamp);
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}`;
}

```

### src/navigation/AppNavigator.tsx

```tsx
import React from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { ChatScreen } from '../screens/ChatScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ConversationsProvider } from '../context/ConversationsContext';
import { Spacing } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { currentUser, initializing, sessionError, retrySession, logout } =
    useAuth();
  const { theme } = useApp();
  if (initializing || sessionError) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        {initializing ? (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ color: theme.text }}>
              Đang khôi phục phiên đăng nhập…
            </Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="alert" style={{ color: theme.danger }}>
              {sessionError}
            </Text>
            <TouchableOpacity onPress={retrySession} accessibilityRole="button">
              <Text style={{ color: theme.primary }}>Thử lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                logout().catch(error =>
                  Alert.alert('Không thể đăng xuất', error.message),
                );
              }}
            >
              <Text style={{ color: theme.primary }}>Đăng xuất</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }
  return (
    <ConversationsProvider key={currentUser?.uid || 'signed-out'}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {currentUser ? (
          <Stack.Group navigationKey={currentUser.uid}>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group navigationKey="guest">
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </ConversationsProvider>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
});

```

### src/navigation/MainTabs.tsx

```tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { MainTabParamList } from '../types';
import { HomeScreen } from '../screens/HomeScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useApp } from '../context/AppContext';
import { useConversations } from '../context/ConversationsContext';

const Tab = createBottomTabNavigator<MainTabParamList>();

const renderHomeTabIcon = ({
  color,
  size,
  focused,
}: {
  color: string;
  size: number;
  focused: boolean;
}): React.ReactNode => (
  <Icon
    name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
    size={size}
    color={color}
  />
);

const renderContactsTabIcon = ({
  color,
  size,
  focused,
}: {
  color: string;
  size: number;
  focused: boolean;
}): React.ReactNode => (
  <Icon
    name={focused ? 'people' : 'people-outline'}
    size={size}
    color={color}
  />
);

const renderNotificationsTabIcon = ({
  color,
  size,
  focused,
}: {
  color: string;
  size: number;
  focused: boolean;
}): React.ReactNode => (
  <Icon
    name={focused ? 'notifications' : 'notifications-outline'}
    size={size}
    color={color}
  />
);

const renderSettingsTabIcon = ({
  color,
  size,
  focused,
}: {
  color: string;
  size: number;
  focused: boolean;
}): React.ReactNode => (
  <Icon
    name={focused ? 'settings' : 'settings-outline'}
    size={size}
    color={color}
  />
);

export const MainTabs: React.FC = () => {
  const { theme, unreadNotificationsCount } = useApp();
  const { totalUnreadCount } = useConversations();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Trò chuyện',
          tabBarIcon: renderHomeTabIcon,
          tabBarBadge:
            totalUnreadCount > 0
              ? totalUnreadCount > 99
                ? '99+'
                : totalUnreadCount
              : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.unreadBadge },
        }}
      />

      <Tab.Screen
        name="ContactsTab"
        component={ContactsScreen}
        options={{
          tabBarLabel: 'Danh bạ',
          tabBarIcon: renderContactsTabIcon,
        }}
      />

      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Thông báo',
          tabBarBadge:
            unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.unreadBadge,
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: renderNotificationsTabIcon,
        }}
      />

      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Cài đặt',
          tabBarIcon: renderSettingsTabIcon,
        }}
      />
    </Tab.Navigator>
  );
};

```

### src/screens/HomeScreen.tsx

```tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreenProps, RealtimeConversation } from '../types';
import { useApp } from '../context/AppContext';
import { useConversations } from '../context/ConversationsContext';
import { useAuth } from '../context/AuthContext';
import { SearchBar } from '../components/common/SearchBar';
import { ConversationItem } from '../components/chat/ConversationItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { theme, isDarkMode } = useApp();
  const { conversations, loading, error, retry } = useConversations();
  const { connected } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Lọc cuộc trò chuyện theo tên (realtime, không phân biệt hoa/thường)
  const filteredConversations = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return conversations;
    }
    return conversations.filter(item =>
      item.name.toLowerCase().includes(trimmed),
    );
  }, [conversations, searchQuery]);

  // ChatScreen đánh dấu đã đọc sau khi tải tin thành công và có focus.
  const handleOpenChat = (item: RealtimeConversation) => {
    navigation.navigate('Chat', {
      contactId: item.contactId,
      contactName: item.name,
      contactAvatar: item.avatar,
    });
  };

  const renderItem = ({ item }: { item: RealtimeConversation }) => (
    <ConversationItem
      conversation={item}
      now={now}
      onPress={() => handleOpenChat(item)}
    />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Header tiêu đề */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Trò chuyện
        </Text>
      </View>

      {connected === false && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          Chưa kết nối Firebase. Danh sách có thể chưa cập nhật.
        </Text>
      )}
      {!!error && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử lại
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Thanh tìm kiếm realtime */}
      <View style={{ backgroundColor: theme.card, paddingBottom: Spacing.sm }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm kiếm cuộc trò chuyện..."
        />
      </View>

      {/* Danh sách cuộc trò chuyện */}
      <FlatList
        data={filteredConversations}
        extraData={now}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredConversations.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải trò chuyện"
              size="large"
              color={theme.primary}
            />
          ) : error ? undefined : (
            <EmptyState
              iconName="chatbubbles-outline"
              title={
                searchQuery.trim()
                  ? 'Không tìm thấy kết quả'
                  : 'Chưa có cuộc trò chuyện'
              }
              message={
                searchQuery.trim()
                  ? `Không có cuộc trò chuyện nào phù hợp với "${searchQuery}"`
                  : 'Chọn một người trong Danh bạ và gửi tin nhắn đầu tiên.'
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  notice: { padding: Spacing.lg },
  retry: { paddingVertical: Spacing.sm },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});

```

### src/screens/ContactsScreen.tsx

```tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContactsScreenProps, Contact } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { subscribeContacts } from '../services/userService';
import { getAuthErrorMessage } from '../services/authService';
import { SearchBar } from '../components/common/SearchBar';
import { ContactItem } from '../components/contact/ContactItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const ContactsScreen: React.FC<ContactsScreenProps> = ({
  navigation,
}) => {
  const { theme } = useApp();
  const { currentUser, connected, presenceError, retryPresence } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const uid = currentUser?.uid;

  useEffect(() => {
    setContacts([]);
    setLoading(true);
    setError('');
    if (!uid) {
      setLoading(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeContacts(
      uid,
      list => {
        if (!active) {
          return;
        }
        setContacts(list);
        setLoading(false);
        setError('');
      },
      failure => {
        if (!active) {
          return;
        }
        setContacts([]);
        setLoading(false);
        setError(getAuthErrorMessage(failure));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  const retry = () => {
    setAttempt(previous => previous + 1);
    retryPresence();
  };

  // Lọc danh bạ theo tên người dùng
  const filteredContacts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    return contacts
      .filter(
        contact =>
          !trimmed ||
          contact.name.toLowerCase().includes(trimmed) ||
          contact.email.toLowerCase().includes(trimmed),
      )
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          a.name.localeCompare(b.name, 'vi'),
      );
  }, [contacts, searchQuery]);

  // Chỉ mở Chat; cuộc trò chuyện xuất hiện ở Home sau khi có tin nhắn thật.
  const handleSelectContact = (contact: Contact) => {
    navigation.navigate('Chat', {
      contactId: contact.id,
      contactName: contact.name,
      contactAvatar: contact.avatar,
    });
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <ContactItem contact={item} onPress={() => handleSelectContact(item)} />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>Danh bạ</Text>
        <Text style={[styles.countBadge, { color: theme.textSecondary }]}>
          {filteredContacts.length} liên hệ
        </Text>
      </View>

      {/* Thanh tìm kiếm */}
      <View style={{ backgroundColor: theme.card, paddingBottom: Spacing.sm }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm theo tên hoặc email..."
        />
      </View>

      {connected === false && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          Chưa kết nối Firebase. Danh bạ và trạng thái có thể chưa cập nhật.
        </Text>
      )}
      {!!(
        error ||
        presenceError ||
        contacts.some(
          contact => contact.statusText === 'Không đọc được trạng thái',
        )
      ) && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error ||
              presenceError ||
              'Một số trạng thái chưa tải được. Vui lòng thử lại.'}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử lại
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FlatList danh bạ */}
      <FlatList
        data={filteredContacts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredContacts.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyList}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.retry, { color: theme.textSecondary }]}>
                Đang tải danh bạ…
              </Text>
            </View>
          ) : error ? undefined : (
            <EmptyState
              iconName="people-outline"
              title={
                searchQuery.trim()
                  ? 'Không tìm thấy liên hệ'
                  : 'Chưa có liên hệ'
              }
              message={
                searchQuery.trim()
                  ? `Không có ai khớp với "${searchQuery}"`
                  : 'Người dùng khác sẽ xuất hiện sau khi đăng ký tài khoản.'
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  notice: { padding: Spacing.lg },
  retry: { paddingVertical: Spacing.md, textAlign: 'center' },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  countBadge: {
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});

```

### src/screens/ChatScreen.tsx

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatScreenProps, ChatMessage } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConversations } from '../context/ConversationsContext';
import { Avatar } from '../components/common/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Spacing, FontSize, BorderRadius } from '../theme';
import { getAuthErrorMessage } from '../services/authService';
import { subscribeStatus, UserStatus } from '../services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../services/locationService';
import {
  getChatId,
  subscribeMessages,
  sendTextMessage,
  sendLocationMessage,
  markAsRead,
  subscribeUnreadCount,
  MAX_MESSAGE_LENGTH,
} from '../services/chatService';

export function ChatScreen(props: ChatScreenProps) {
  const { currentUser } = useAuth();
  // Đổi đối tác/UID sẽ hủy toàn bộ listener và state của cuộc trò chuyện cũ.
  return (
    <ChatContent
      key={`${currentUser?.uid}_${props.route.params.contactId}`}
      {...props}
    />
  );
}

function ChatContent({ route, navigation }: ChatScreenProps) {
  const { contactId, contactName, contactAvatar } = route.params;
  const { theme } = useApp();
  const { currentUser, connected } = useAuth();
  const { activateChat } = useConversations();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [locationPhase, setLocationPhase] = useState<
    'locating' | 'sending' | null
  >(null);
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [sendError, setSendError] = useState('');
  const [readError, setReadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const sendLock = useRef(false);
  const ready = useRef({ focused, foreground, connected });
  ready.current = { focused, foreground, connected };
  const list = useRef<FlatList<ChatMessage>>(null);
  const uid = currentUser?.uid;
  let chatId = '';
  try {
    if (uid) {
      chatId = getChatId(uid, contactId);
    }
  } catch {
    /* Hiển thị route lỗi ở dưới. */
  }

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setLoadError('');
    if (!chatId) {
      setLoadError('Cuộc trò chuyện không hợp lệ. Hãy quay lại Danh bạ.');
      setLoading(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeMessages(
      chatId,
      value => {
        if (!active) {
          return;
        }
        setMessages(value);
        setLoading(false);
        setLoadError('');
      },
      error => {
        if (!active) {
          return;
        }
        setLoadError(getAuthErrorMessage(error));
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chatId, attempt]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    let active = true;
    setStatus(null);
    setStatusError('');
    const unsubscribe = subscribeStatus(
      contactId,
      value => {
        if (!active) {
          return;
        }
        setStatus(value);
        setStatusError('');
      },
      error => {
        if (!active) {
          return;
        }
        setStatus(null);
        setStatusError(getAuthErrorMessage(error));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chatId, contactId, attempt]);

  useEffect(() => {
    if (
      !chatId ||
      !focused ||
      !foreground ||
      loading ||
      loadError ||
      readError
    ) {
      return;
    }
    // Home và badge bỏ qua counter đang chờ reset khi nội dung Chat đã hiển thị.
    return activateChat(contactId);
  }, [
    chatId,
    contactId,
    focused,
    foreground,
    loading,
    loadError,
    readError,
    activateChat,
  ]);

  useEffect(() => {
    if (!uid || !chatId || !focused || !foreground || loading || loadError) {
      return;
    }
    let active = true;
    let pending = false;
    let dirty = false;
    const read = async () => {
      dirty = true;
      if (pending) {
        return;
      }
      pending = true;
      try {
        // Nếu counter tăng khi một lần reset còn chờ, xử lý tiếp sau khi hoàn tất.
        while (active && dirty) {
          dirty = false;
          await markAsRead(uid, contactId);
          if (active) {
            setReadError('');
          }
        }
      } catch (error) {
        if (active) {
          setReadError(getAuthErrorMessage(error));
        }
      } finally {
        pending = false;
      }
    };
    read();
    const unsubscribe = subscribeUnreadCount(
      uid,
      contactId,
      count => {
        if (active && count > 0) {
          read();
        }
      },
      error => {
        if (active) {
          setReadError(getAuthErrorMessage(error));
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    uid,
    chatId,
    contactId,
    focused,
    foreground,
    loading,
    loadError,
    attempt,
  ]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (
      !text ||
      !currentUser ||
      !chatId ||
      connected !== true ||
      sendLock.current
    ) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setSendError('');
    try {
      await sendTextMessage(currentUser, contactId, text);
      if (mounted.current) {
        setInputText('');
      }
    } catch (error) {
      if (mounted.current) {
        setSendError(getAuthErrorMessage(error));
      }
    } finally {
      sendLock.current = false;
      if (mounted.current) {
        setSending(false);
      }
    }
  };

  const canSend =
    !!inputText.trim() && !!chatId && connected === true && !sending;
  const canSendLocation = !!chatId && connected === true && !sending;
  const handleLocation = async () => {
    if (!currentUser || !chatId || connected !== true || sendLock.current) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setLocationPhase('locating');
    setSendError('');
    let locating = true;
    try {
      const point = await getCurrentLocation();
      // Người dùng rời Chat trong lúc GPS chạy thì không tự gửi vị trí sau đó.
      if (
        !mounted.current ||
        !ready.current.focused ||
        !ready.current.foreground
      ) {
        return;
      }
      locating = false;
      if (ready.current.connected !== true) {
        setSendError('Đã mất kết nối. Hãy kết nối lại rồi nhấn gửi vị trí.');
        return;
      }
      setLocationPhase('sending');
      await sendLocationMessage(currentUser, contactId, point);
      // Giữ nguyên draft văn bản khi gửi vị trí.
    } catch (failure) {
      if (
        !mounted.current ||
        !ready.current.focused ||
        !ready.current.foreground
      ) {
        return;
      }
      if (locating) {
        showLocationError(failure);
      } else {
        setSendError(getAuthErrorMessage(failure));
      }
    } finally {
      sendLock.current = false;
      if (mounted.current) {
        setSending(false);
        setLocationPhase(null);
      }
    }
  };
  const displayedError = loadError || sendError || readError || statusError;
  const online = status?.isOnline === true;
  const retry = () => {
    setAttempt(previous => previous + 1);
    setSendError('');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Avatar
          uri={contactAvatar}
          size={40}
          style={styles.headerAvatar}
          showOnline={!!status}
          isOnline={online}
        />
        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {contactName}
          </Text>
          <Text
            style={[
              styles.headerStatus,
              { color: online ? theme.online : theme.textSecondary },
            ]}
          >
            {statusError
              ? 'Không đọc được trạng thái'
              : !status
              ? 'Đang cập nhật trạng thái…'
              : online
              ? 'Đang hoạt động'
              : 'Ngoại tuyến'}
          </Text>
        </View>
      </View>
      {connected !== true && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          {sending
            ? 'Mất kết nối. Đang chờ xác nhận gửi; hãy giữ ứng dụng mở.'
            : 'Chưa kết nối Firebase. Bạn có thể soạn tin và gửi khi kết nối lại.'}
        </Text>
      )}
      {!!displayedError && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {displayedError}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử tải lại
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!!locationPhase && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: theme.textSecondary }]}
        >
          {locationPhase === 'locating'
            ? 'Đang lấy vị trí hiện tại…'
            : 'Đang gửi vị trí…'}
        </Text>
      )}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMe={item.senderId === uid} />
          )}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            list.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="large" color={theme.primary} />
            ) : loadError ? undefined : (
              <EmptyState
                iconName="chatbubbles-outline"
                title="Chưa có tin nhắn"
                message={`Hãy gửi lời chào đến ${contactName}!`}
              />
            )
          }
        />
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: theme.card, borderTopColor: theme.border },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Gửi vị trí hiện tại"
            accessibilityState={{
              disabled: !canSendLocation,
              busy: !!locationPhase,
            }}
            style={styles.locationButton}
            disabled={!canSendLocation}
            onPress={handleLocation}
          >
            {locationPhase ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Icon
                name="location-outline"
                size={25}
                color={canSendLocation ? theme.primary : theme.textMuted}
              />
            )}
          </TouchableOpacity>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <TextInput
              accessibilityLabel="Tin nhắn"
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              editable={!sending}
            />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? theme.primary : theme.border },
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {sending && !locationPhase ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Icon
                name="send"
                size={18}
                color={canSend ? theme.white : theme.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  notice: { padding: Spacing.md },
  retry: { paddingVertical: Spacing.sm },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  headerAvatar: {
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  headerStatus: {
    fontSize: FontSize.xs - 1,
  },
  headerRightAction: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  chatArea: {
    flex: 1,
  },
  messageList: {
    paddingVertical: Spacing.md,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
    marginTop: Spacing.xxxl * 2,
  },
  emptyChatText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 100,
    minHeight: 40,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: FontSize.md,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
});

```

### src/components/chat/ConversationItem.tsx

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RealtimeConversation } from '../../types';
import { formatConversationTime } from '../../utils/formatConversationTime';
import { Avatar } from '../common/Avatar';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';

interface Props {
  conversation: RealtimeConversation;
  onPress: () => void;
  now?: number;
}

export const ConversationItem: React.FC<Props> = ({
  conversation,
  onPress,
  now,
}) => {
  const { theme } = useApp();
  const hasUnread = conversation.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.name}, ${conversation.unreadCount} tin chưa đọc, ${conversation.lastMessage}`}
      activeOpacity={0.7}
    >
      <Avatar
        uri={conversation.avatar}
        size={54}
        showOnline={conversation.statusKnown}
        isOnline={conversation.isOnline}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              { color: theme.text },
              hasUnread ? styles.unreadName : styles.readName,
            ]}
            numberOfLines={1}
          >
            {conversation.name}
          </Text>
          <Text
            style={[
              styles.time,
              { color: hasUnread ? theme.primary : theme.textMuted },
            ]}
          >
            {formatConversationTime(conversation.lastMessageTime, now)}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[
              styles.lastMessage,
              {
                color: hasUnread ? theme.text : theme.textSecondary,
              },
              hasUnread ? styles.unreadPreview : styles.readPreview,
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
          {hasUnread && (
            <View
              style={[styles.badge, { backgroundColor: theme.unreadBadge }]}
            >
              <Text style={[styles.badgeText, { color: theme.white }]}>
                {conversation.unreadCount > 99
                  ? '99+'
                  : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  unreadName: { fontWeight: '700' },
  readName: { fontWeight: '600' },
  unreadPreview: { fontWeight: '600' },
  readPreview: { fontWeight: '400' },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: FontSize.md,
    flex: 1,
    marginRight: Spacing.sm,
  },
  time: {
    fontSize: FontSize.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: FontSize.sm,
    flex: 1,
    marginRight: Spacing.sm,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: BorderRadius.round,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});

```

### __tests__/ChatScreen.test.tsx

```tsx
import React from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppProvider } from '../src/context/AppContext';
import { ChatScreen } from '../src/screens/ChatScreen';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import * as chat from '../src/services/chatService';
import { subscribeStatus } from '../src/services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../src/services/locationService';
import { ChatMessage, ChatScreenProps } from '../src/types';

let mockFocused = true;
const mockActivateChat = jest.fn(() => jest.fn());
jest.mock('../src/context/ConversationsContext', () => {
  return { useConversations: () => ({ activateChat: mockActivateChat }) };
});
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      uid: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      avatar: 'alice.png',
    },
    connected: true,
  }),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock('../src/services/userService', () => ({
  subscribeStatus: jest.fn(),
}));
jest.mock('../src/services/chatService', () => ({
  getChatId: (a: string, b: string) => [a, b].sort().join('_'),
  subscribeMessages: jest.fn(),
  subscribeUnreadCount: jest.fn(),
  sendTextMessage: jest.fn(),
  sendLocationMessage: jest.fn(),
  markAsRead: jest.fn(),
  MAX_MESSAGE_LENGTH: 2000,
}));
jest.mock('../src/services/locationService', () => ({
  getCurrentLocation: jest.fn(),
  showLocationError: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (messages: ChatMessage[]) => void;
let unread: (count: number) => void;
let changeAppState: (state: AppStateStatus) => void;
let publishStatus: Parameters<typeof subscribeStatus>[1];
const unsubscribeMessages = jest.fn();
const unsubscribeStatus = jest.fn();
const unsubscribeUnread = jest.fn();
const removeState = jest.fn();
const props = {
  route: {
    params: { contactId: 'bob', contactName: 'Bob', contactAvatar: 'bob.png' },
  },
  navigation: { goBack: jest.fn() },
} as unknown as ChatScreenProps;
const view = (screenProps = props) => (
  <AppProvider>
    <ChatScreen {...screenProps} />
  </AppProvider>
);
function sendButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi tin nhắn')!;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changeAppState = callback;
      return { remove: removeState };
    });
  jest.mocked(chat.subscribeMessages).mockImplementation((_id, callback) => {
    publish = callback;
    return unsubscribeMessages;
  });
  jest
    .mocked(chat.subscribeUnreadCount)
    .mockImplementation((_uid, _partner, callback) => {
      unread = callback;
      return unsubscribeUnread;
    });
  jest.mocked(subscribeStatus).mockImplementation((_uid, callback) => {
    publishStatus = callback;
    return unsubscribeStatus;
  });
  jest.mocked(chat.markAsRead).mockResolvedValue(undefined);
  jest.mocked(chat.sendTextMessage).mockResolvedValue(undefined);
  jest.mocked(chat.sendLocationMessage).mockResolvedValue(undefined);
  await act(async () => {
    renderer = create(view());
  });
  await act(async () => publish([]));
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('repeated snapshots do not duplicate rows and bubble sides use real UIDs', async () => {
  const messages: ChatMessage[] = [
    {
      id: '1',
      senderId: 'alice',
      receiverId: 'bob',
      type: 'text',
      text: 'Hello',
      createdAt: 10,
    },
    {
      id: '2',
      senderId: 'bob',
      receiverId: 'alice',
      type: 'text',
      text: 'Hi',
      createdAt: 20,
    },
  ];
  await act(async () => {
    publish(messages);
    publish(messages);
  });
  expect(renderer.root.findByType(FlatList).props.data).toHaveLength(2);
  expect(
    renderer.root.findAllByType(MessageBubble).map(bubble => bubble.props.isMe),
  ).toEqual([true, false]);
});

test('blocks blank/duplicate sends, trims text and retains draft on a failed write', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('   '),
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText(' Hello '),
  );
  let fail!: (error: Error) => void;
  jest.mocked(chat.sendTextMessage).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const press = sendButton().props.onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(chat.sendTextMessage).toHaveBeenCalledTimes(1);
  expect(chat.sendTextMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    'Hello',
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    fail(new Error('PERMISSION_DENIED'));
    await pending;
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe(' Hello ');
  await act(async () => {
    await sendButton().props.onPress();
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
});

test('resets unread on open/new counter, stops reading on blur and resumes on focus', async () => {
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await act(async () => renderer.update(view()));
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(2));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => renderer.update(view()));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

test('switching partners empties history, cleans subscriptions and ignores late old snapshots', async () => {
  const oldPublish = publish;
  const next = {
    ...props,
    route: {
      ...props.route,
      params: {
        contactId: 'charlie',
        contactName: 'Charlie',
        contactAvatar: 'c.png',
      },
    },
  } as ChatScreenProps;
  await act(async () => renderer.update(view(next)));
  expect(unsubscribeMessages).toHaveBeenCalledTimes(1);
  expect(unsubscribeStatus).toHaveBeenCalledTimes(1);
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  expect(removeState).toHaveBeenCalledTimes(1);
  await act(async () =>
    oldPublish([
      {
        id: 'old',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'Old',
        createdAt: 1,
      },
    ]),
  );
  expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
});

test('background suspends markAsRead and partner status updates the header', async () => {
  await act(async () => publishStatus({ isOnline: false, lastChanged: 1 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Ngoại tuyến'),
  ).toBe(true);
  await act(async () => publishStatus({ isOnline: true, lastChanged: 2 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Đang hoạt động'),
  ).toBe(true);
  await act(async () => changeAppState('background'));
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  await act(async () => changeAppState('active'));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

function locationButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi vị trí hiện tại')!;
}

test('location loading blocks duplicate sends, sends coordinates and preserves text draft', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('Draft'),
  );
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  const press = locationButton().props.onPress;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(getCurrentLocation).toHaveBeenCalledTimes(1);
  expect(locationButton().props.disabled).toBe(true);
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    locate({ latitude: 10.7, longitude: 106.6 });
    await pending;
  });
  expect(chat.sendLocationMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    { latitude: 10.7, longitude: 106.6 },
  );
  expect(renderer.root.findByType(TextInput).props.value).toBe('Draft');
});

test('location refusal shows guidance and never writes a message', async () => {
  const denied = new Error('Quyền vị trí bị từ chối');
  jest.mocked(getCurrentLocation).mockRejectedValueOnce(denied);
  await act(async () => {
    await locationButton().props.onPress();
  });
  expect(showLocationError).toHaveBeenCalledWith(denied);
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
  expect(locationButton().props.disabled).toBe(false);
});

test('leaving Chat while GPS is pending does not send a location later', async () => {
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = locationButton().props.onPress();
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    locate({ latitude: 0, longitude: 0 });
    await pending;
  });
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
});

test('unread reset failure releases badge suppression instead of hiding a server error', async () => {
  const deactivate = mockActivateChat.mock.results[0].value;
  jest
    .mocked(chat.markAsRead)
    .mockRejectedValueOnce(new Error('Không có quyền ghi'));
  await act(async () => unread(1));
  expect(deactivate).toHaveBeenCalledTimes(1);
  await act(async () => unread(2));
  expect(mockActivateChat).toHaveBeenCalledTimes(2);
});

```

### __tests__/ContactsScreen.test.tsx

```tsx
import React from 'react';
import { FlatList, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ContactsScreen } from '../src/screens/ContactsScreen';
import { AppProvider } from '../src/context/AppContext';
import { ContactItem } from '../src/components/contact/ContactItem';
import { subscribeContacts } from '../src/services/userService';
import { Contact, ContactsScreenProps } from '../src/types';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'alice' },
    connected: true,
    presenceError: '',
    retryPresence: jest.fn(),
  }),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock('../src/services/userService', () => ({
  subscribeContacts: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (contacts: Contact[]) => void;
const unsubscribe = jest.fn();
const navigate = jest.fn();
const contacts: Contact[] = [
  {
    id: 'bob',
    name: 'Bob',
    email: 'bob@example.com',
    avatar: 'b',
    isOnline: false,
  },
  {
    id: 'david',
    name: 'David',
    email: 'david@example.com',
    avatar: 'd',
    isOnline: true,
  },
  {
    id: 'charlie',
    name: 'Charlie',
    email: 'special@example.com',
    avatar: 'c',
    isOnline: true,
  },
];

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(subscribeContacts).mockImplementation((_uid, callback) => {
    publish = callback;
    return unsubscribe;
  });
  const props = { navigation: { navigate } } as unknown as ContactsScreenProps;
  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContactsScreen {...props} />
      </AppProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('sorts online contacts first, searches by email and opens the correct chat', async () => {
  await act(async () => publish(contacts));
  expect(
    renderer.root
      .findByType(FlatList)
      .props.data.map((item: Contact) => item.id),
  ).toEqual(['charlie', 'david', 'bob']);
  await act(async () =>
    renderer.root
      .findByType(TextInput)
      .props.onChangeText(' SPECIAL@EXAMPLE.COM '),
  );
  expect(
    renderer.root
      .findByType(FlatList)
      .props.data.map((item: Contact) => item.id),
  ).toEqual(['charlie']);
  await act(async () => renderer.root.findByType(ContactItem).props.onPress());
  expect(navigate).toHaveBeenCalledWith('Chat', {
    contactId: 'charlie',
    contactName: 'Charlie',
    contactAvatar: 'c',
  });
});

test('cleans up the listener and does not apply late data after unmount', async () => {
  await act(async () => renderer.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => publish(contacts));
  expect(subscribeContacts).toHaveBeenCalledTimes(1);
});

```

### __tests__/chatService.test.ts

```tsx
import {
  get,
  increment,
  onValue,
  push,
  runTransaction,
  update,
} from 'firebase/database';
import { auth } from '../src/services/firebase';
import {
  getChatId,
  markAsRead,
  sendTextMessage,
  sendLocationMessage,
  subscribeMessages,
  subscribeConversations,
  subscribeConversationList,
} from '../src/services/chatService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path?: string) => ({ path: path || '/' }),
  get: jest.fn(),
  onValue: jest.fn(),
  push: jest.fn(),
  runTransaction: jest.fn(),
  update: jest.fn(),
  increment: jest.fn((value: number) => ({ '.sv': { increment: value } })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));
const sender = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatar: 'alice.png',
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  jest.mocked(get).mockResolvedValue({
    exists: () => true,
    val: () => ({ displayName: 'Bob', avatar: 'bob.png' }),
  } as unknown as Awaited<ReturnType<typeof get>>);
  jest
    .mocked(push)
    .mockReturnValue({ key: 'push-1' } as ReturnType<typeof push>);
  jest.mocked(update).mockResolvedValue(undefined);
});

test('chat ID is the same in both directions and invalid routes are rejected', () => {
  expect(getChatId('bob', 'alice')).toBe('alice_bob');
  expect(getChatId('alice', 'bob')).toBe('alice_bob');
  expect(() => getChatId('alice', 'alice')).toThrow();
  expect(() => getChatId('alice', 'bad/id')).toThrow();
});

test('one atomic update writes the message, both previews and receiver increment only', async () => {
  await sendTextMessage(sender, 'bob', '  Xin chào  ');
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual({
    id: 'push-1',
    senderId: 'alice',
    receiverId: 'bob',
    type: 'text',
    text: 'Xin chào',
    createdAt: { '.sv': 'timestamp' },
  });
  expect(changes['userChats/alice/bob/name']).toBe('Bob');
  expect(changes['userChats/bob/alice/name']).toBe('Alice');
  expect(changes['userChats/alice/bob/lastMessage']).toBe('Xin chào');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(increment).toHaveBeenCalledWith(1);
  expect(changes).not.toHaveProperty('userChats/alice/bob/unreadCount');
  expect(changes).not.toHaveProperty('userChats/bob/alice');
});

test('blank text, nonexistent recipient and a changed session never write a message', async () => {
  await expect(sendTextMessage(sender, 'bob', ' \n ')).rejects.toThrow('rỗng');
  expect(get).not.toHaveBeenCalled();
  jest
    .mocked(get)
    .mockResolvedValueOnce({ exists: () => false } as Awaited<
      ReturnType<typeof get>
    >);
  await expect(sendTextMessage(sender, 'missing', 'Hello')).rejects.toThrow(
    'không tồn tại',
  );
  jest.mocked(get).mockImplementationOnce(async () => {
    (auth as unknown as { currentUser: { uid: string } }).currentUser = {
      uid: 'charlie',
    };
    return { exists: () => true, val: () => ({}) } as Awaited<
      ReturnType<typeof get>
    >;
  });
  await expect(sendTextMessage(sender, 'bob', 'Hello')).rejects.toThrow(
    'Phiên đăng nhập',
  );
  expect(update).not.toHaveBeenCalled();
});

test('snapshots use push keys as IDs, sort by time, replace history and propagate unsubscribe/errors', () => {
  let listener!: (snapshot: unknown) => void;
  const unsubscribe = jest.fn();
  const report = jest.fn();
  jest.mocked(onValue).mockImplementation((_ref, callback) => {
    listener = callback as unknown as typeof listener;
    return unsubscribe;
  });
  const receive = jest.fn();
  expect(subscribeMessages('alice_bob', receive, report)).toBe(unsubscribe);
  const rows = [
    {
      key: 'b',
      val: () => ({
        id: 'wrong-id',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'second',
        createdAt: 20,
      }),
    },
    {
      key: 'a',
      val: () => ({
        senderId: 'alice',
        receiverId: 'bob',
        type: 'text',
        text: 'first',
        createdAt: 10,
      }),
    },
    { key: 'bad', val: () => ({ text: 'malformed' }) },
  ];
  const snapshot = {
    forEach: (callback: (row: (typeof rows)[number]) => void) =>
      rows.forEach(callback),
  };
  listener(snapshot);
  listener(snapshot);
  expect(
    receive.mock.lastCall[0].map((item: { id: string }) => item.id),
  ).toEqual(['a', 'b']);
  const onError = jest.mocked(onValue).mock.calls[0][2] as (
    error: Error,
  ) => void;
  const denied = new Error('PERMISSION_DENIED');
  onError(denied);
  expect(report).toHaveBeenCalledWith(denied);
});

test('markAsRead only resets the current user counter, without creating empty chats', async () => {
  jest
    .mocked(runTransaction)
    .mockResolvedValue({ committed: true } as Awaited<
      ReturnType<typeof runTransaction>
    >);
  await markAsRead('alice', 'bob');
  const [reference, change, options] =
    jest.mocked(runTransaction).mock.calls[0];
  expect(reference).toEqual({ path: 'userChats/alice/bob/unreadCount' });
  expect(change(4)).toBe(0);
  expect(change(0)).toBeUndefined();
  expect(change(null)).toBeUndefined();
  expect(options).toEqual({ applyLocally: false });
  await expect(markAsRead('bob', 'alice')).rejects.toThrow('Phiên đăng nhập');
});

test('location uses the atomic message path and location preview for both participants', async () => {
  await sendLocationMessage(sender, 'bob', { latitude: 0, longitude: 106.6 });
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual(
    expect.objectContaining({
      type: 'location',
      text: '📍 Vị trí',
      latitude: 0,
      longitude: 106.6,
    }),
  );
  expect(changes['userChats/alice/bob/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
});

test('invalid coordinates cannot create a Firebase write', async () => {
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 91, longitude: 0 }),
  ).rejects.toThrow('Tọa độ');
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(update).not.toHaveBeenCalled();
});

test('subscribes only to own userChats, normalizes unread and sorts newest first', () => {
  let receiveSnapshot!: (snapshot: unknown) => void;
  const cleanup = jest.fn();
  jest.mocked(onValue).mockImplementation((_reference, callback) => {
    receiveSnapshot = callback as unknown as typeof receiveSnapshot;
    return cleanup;
  });
  const receive = jest.fn();
  expect(subscribeConversations('alice', receive, jest.fn())).toBe(cleanup);
  expect(jest.mocked(onValue).mock.calls[0][0]).toEqual({
    path: 'userChats/alice',
  });
  const data = {
    bob: {
      chatId: 'alice_bob',
      contactId: 'bob',
      lastMessage: 'Older',
      lastMessageTime: 10,
      unreadCount: 3.8,
    },
    charlie: {
      chatId: 'alice_charlie',
      contactId: 'charlie',
      lastMessage: '📍 Vị trí',
      lastMessageTime: 20,
    },
    bad: {
      chatId: 'someone_else',
      contactId: 'bad',
      lastMessage: 'Bad',
      lastMessageTime: 30,
    },
    empty: { unreadCount: 0 },
  };
  receiveSnapshot({
    forEach: (callback: (child: unknown) => void) =>
      Object.entries(data).forEach(([key, value]) =>
        callback({ key, val: () => value }),
      ),
  });
  expect(
    receive.mock.lastCall[0].map(
      (item: { contactId: string }) => item.contactId,
    ),
  ).toEqual(['charlie', 'bob']);
  expect(
    receive.mock.lastCall[0].map(
      (item: { unreadCount: number }) => item.unreadCount,
    ),
  ).toEqual([0, 3]);
});

test('conversation status listeners are reused, removed and cleaned up without reading /status', () => {
  const listeners = new Map<
    string,
    { value: (snapshot: unknown) => void; unsubscribe: jest.Mock }
  >();
  jest.mocked(onValue).mockImplementation((reference, callback) => {
    const entry = {
      value: callback as unknown as (snapshot: unknown) => void,
      unsubscribe: jest.fn(),
    };
    listeners.set((reference as unknown as { path: string }).path, entry);
    return entry.unsubscribe;
  });
  const receive = jest.fn();
  const cleanup = subscribeConversationList('alice', receive, jest.fn());
  const snapshot = (name: string) => ({
    forEach: (callback: (child: unknown) => void) =>
      callback({
        key: 'bob',
        val: () => ({
          chatId: 'alice_bob',
          contactId: 'bob',
          name,
          lastMessage: 'Hi',
          lastMessageTime: 10,
        }),
      }),
  });
  listeners.get('userChats/alice')!.value(snapshot('Bob'));
  listeners
    .get('status/bob')!
    .value({ val: () => ({ isOnline: true, lastChanged: 100 }) });
  listeners.get('userChats/alice')!.value(snapshot('Bobby'));
  expect(onValue).toHaveBeenCalledTimes(2);
  expect(listeners.has('status')).toBe(false);
  expect(receive.mock.lastCall[0][0]).toEqual(
    expect.objectContaining({
      name: 'Bobby',
      isOnline: true,
      statusKnown: true,
    }),
  );
  const oldStatus = listeners.get('status/bob')!;
  listeners.get('userChats/alice')!.value({ forEach: () => {} });
  expect(oldStatus.unsubscribe).toHaveBeenCalledTimes(1);
  const calls = receive.mock.calls.length;
  oldStatus.value({ val: () => ({ isOnline: true }) });
  expect(receive).toHaveBeenCalledTimes(calls);
  cleanup();
  expect(listeners.get('userChats/alice')!.unsubscribe).toHaveBeenCalledTimes(
    1,
  );
});

```

### __tests__/ConversationsContext.test.tsx

```tsx
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  ConversationsProvider,
  useConversations,
} from '../src/context/ConversationsContext';
import { subscribeConversationList } from '../src/services/chatService';
import { RealtimeConversation } from '../src/types';

let mockUid: string | undefined = 'alice';
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }),
}));
jest.mock('../src/services/chatService', () => ({
  subscribeConversationList: jest.fn(),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));

let state: ReturnType<typeof useConversations>;
let renderer: ReactTestRenderer;
let subscriptions: {
  callback: (rows: RealtimeConversation[]) => void;
  error: (error: Error) => void;
  unsubscribe: jest.Mock;
}[];
const observations: number[] = [];
function Probe() {
  state = useConversations();
  observations.push(state.totalUnreadCount);
  return null;
}
const view = () => (
  <ConversationsProvider>
    <Probe />
  </ConversationsProvider>
);
function row(partner: string, unreadCount: number): RealtimeConversation {
  return {
    id: `alice_${partner}`,
    chatId: `alice_${partner}`,
    contactId: partner,
    name: partner,
    avatar: '',
    lastMessage: 'Hello',
    lastMessageTime: 100,
    unreadCount,
    isOnline: false,
    statusKnown: false,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockUid = 'alice';
  subscriptions = [];
  observations.length = 0;
  jest
    .mocked(subscribeConversationList)
    .mockImplementation((_uid, callback, error) => {
      const entry = { callback, error, unsubscribe: jest.fn() };
      subscriptions.push(entry);
      return entry.unsubscribe;
    });
  await act(async () => {
    renderer = create(view());
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('active chat stays at zero while a new unread snapshot is waiting for server reset', async () => {
  await act(async () =>
    subscriptions[0].callback([row('bob', 3), row('charlie', 2)]),
  );
  expect(state.totalUnreadCount).toBe(5);
  let deactivate!: () => void;
  await act(async () => {
    deactivate = state.activateChat('bob');
  });
  observations.length = 0;
  await act(async () =>
    subscriptions[0].callback([row('bob', 4), row('charlie', 2)]),
  );
  expect(state.conversations[0].unreadCount).toBe(0);
  expect(state.totalUnreadCount).toBe(2);
  expect(observations.every(value => value === 2)).toBe(true);
  await act(async () =>
    subscriptions[0].callback([row('bob', 0), row('charlie', 2)]),
  );
  await act(async () => deactivate());
  expect(state.totalUnreadCount).toBe(2);
});

test('old screen cleanup cannot clear the active state of the next chat', async () => {
  await act(async () =>
    subscriptions[0].callback([row('bob', 3), row('charlie', 2)]),
  );
  let oldCleanup!: () => void;
  let newCleanup!: () => void;
  await act(async () => {
    oldCleanup = state.activateChat('bob');
  });
  await act(async () => {
    newCleanup = state.activateChat('charlie');
  });
  await act(async () => oldCleanup());
  expect(state.totalUnreadCount).toBe(3);
  await act(async () => newCleanup());
  expect(state.totalUnreadCount).toBe(5);
});

test('changing account clears data and ignores callbacks from the previous account', async () => {
  await act(async () => subscriptions[0].callback([row('bob', 3)]));
  mockUid = 'david';
  await act(async () => renderer.update(view()));
  expect(state.conversations).toEqual([]);
  expect(state.totalUnreadCount).toBe(0);
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => subscriptions[0].callback([row('bob', 20)]));
  expect(state.conversations).toEqual([]);
  await act(async () => subscriptions[1].callback([]));
  expect(state.loading).toBe(false);
});

test('permission failure exposes an error and retry replaces the failed listener', async () => {
  await act(async () =>
    subscriptions[0].error(new Error('Không có quyền đọc')),
  );
  expect(state.error).toBe('Không có quyền đọc');
  expect(state.loading).toBe(false);
  await act(async () => state.retry());
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(state.loading).toBe(true);
  await act(async () => subscriptions[1].callback([row('bob', 1)]));
  expect(state.error).toBe('');
  expect(state.totalUnreadCount).toBe(1);
});

```

### __tests__/HomeScreen.test.tsx

```tsx
import React from 'react';
import { FlatList, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { AppProvider } from '../src/context/AppContext';
import { ConversationItem } from '../src/components/chat/ConversationItem';
import { formatConversationTime } from '../src/utils/formatConversationTime';
import { HomeScreenProps, RealtimeConversation } from '../src/types';

let mockRows: RealtimeConversation[] = [];
let mockLoading = false;
let mockError = '';
const mockRetry = jest.fn();
jest.mock('../src/context/ConversationsContext', () => ({
  useConversations: () => ({
    conversations: mockRows,
    loading: mockLoading,
    error: mockError,
    retry: mockRetry,
  }),
}));
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ connected: true }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
let renderer: ReactTestRenderer;
const navigate = jest.fn();
const props = { navigation: { navigate } } as unknown as HomeScreenProps;
const view = () => (
  <AppProvider>
    <HomeScreen {...props} />
  </AppProvider>
);
const now = new Date(2026, 10, 4, 14, 0).getTime();
let intervals: jest.SpyInstance;
let clearIntervals: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(now);
  intervals = jest.spyOn(globalThis, 'setInterval');
  clearIntervals = jest.spyOn(globalThis, 'clearInterval');
  mockRows = [
    {
      id: 'alice_bob',
      chatId: 'alice_bob',
      contactId: 'bob',
      name: 'Bob',
      avatar: 'b.png',
      lastMessage: '📍 Vị trí',
      lastMessageTime: now,
      unreadCount: 3,
      isOnline: true,
      statusKnown: true,
    },
    {
      id: 'alice_charlie',
      chatId: 'alice_charlie',
      contactId: 'charlie',
      name: 'Charlie',
      avatar: 'c.png',
      lastMessage: 'Hi',
      lastMessageTime: now - 86400000,
      unreadCount: 0,
      isOnline: false,
      statusKnown: true,
    },
  ];
  mockLoading = false;
  mockError = '';
  await act(async () => {
    renderer = create(view());
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('Home shows real previews, searches names and opens the correct chat', async () => {
  expect(renderer.root.findByType(FlatList).props.data[0].lastMessage).toBe(
    '📍 Vị trí',
  );
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText(' BOB '),
  );
  expect(renderer.root.findByType(FlatList).props.data).toHaveLength(1);
  expect(
    renderer.root.findByType(ConversationItem).props.conversation.unreadCount,
  ).toBe(3);
  await act(async () =>
    renderer.root.findByType(ConversationItem).props.onPress(),
  );
  expect(navigate).toHaveBeenCalledWith('Chat', {
    contactId: 'bob',
    contactName: 'Bob',
    contactAvatar: 'b.png',
  });
});

test('error state offers retry and unmount clears the time refresh timer', async () => {
  mockRows = [];
  mockError = 'PERMISSION_DENIED';
  await act(async () => renderer.update(view()));
  const retryButton = renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityRole === 'button')!;
  await act(async () => retryButton.props.onPress());
  expect(mockRetry).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  const clockIndex = intervals.mock.calls.findIndex(call => call[1] === 60000);
  expect(clockIndex).toBeGreaterThanOrEqual(0);
  expect(clearIntervals).toHaveBeenCalledWith(
    intervals.mock.results[clockIndex].value,
  );
});

test('conversation time uses today, yesterday, and dd/MM across month/year boundaries', () => {
  expect(
    formatConversationTime(new Date(2026, 10, 4, 9, 5).getTime(), now),
  ).toBe('09:05');
  expect(
    formatConversationTime(new Date(2026, 10, 3, 23, 0).getTime(), now),
  ).toBe('Hôm qua');
  expect(formatConversationTime(new Date(2026, 9, 30).getTime(), now)).toBe(
    '30/10',
  );
  expect(
    formatConversationTime(
      new Date(2025, 11, 31, 23).getTime(),
      new Date(2026, 0, 1, 1).getTime(),
    ),
  ).toBe('Hôm qua');
  expect(formatConversationTime(Number.NaN, now)).toBe('');
});

```

### __tests__/MainTabs.test.tsx

```tsx
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MainTabs } from '../src/navigation/MainTabs';

let mockTotal = 0;
jest.mock('../src/context/ConversationsContext', () => ({
  useConversations: () => ({ totalUnreadCount: mockTotal }),
}));
jest.mock('../src/context/AppContext', () => ({
  useApp: () => ({ theme: {}, unreadNotificationsCount: 2 }),
}));
jest.mock('../src/screens/HomeScreen', () => ({ HomeScreen: () => null }));
jest.mock('../src/screens/ContactsScreen', () => ({
  ContactsScreen: () => null,
}));
jest.mock('../src/screens/NotificationsScreen', () => ({
  NotificationsScreen: () => null,
}));
jest.mock('../src/screens/SettingsScreen', () => ({
  SettingsScreen: () => null,
}));
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/bottom-tabs', () => {
  const TestReact = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) =>
        TestReact.createElement('Tabs', null, children),
      Screen: (props: unknown) => TestReact.createElement('Tab', props),
    }),
  };
});

test('Home tab badge follows the live total and stays separate from mock notifications', async () => {
  let renderer!: ReactTestRenderer;
  mockTotal = 0;
  await act(async () => {
    renderer = create(<MainTabs />);
  });
  const options = (name: string) =>
    renderer.root.find(
      node => typeof node.type === 'string' && node.props.name === name,
    ).props.options;
  expect(options('HomeTab').tabBarBadge).toBeUndefined();
  mockTotal = 5;
  await act(async () => renderer.update(<MainTabs />));
  expect(options('HomeTab').tabBarBadge).toBe(5);
  expect(options('NotificationsTab').tabBarBadge).toBe(2);
  mockTotal = 105;
  await act(async () => renderer.update(<MainTabs />));
  expect(options('HomeTab').tabBarBadge).toBe('99+');
  await act(async () => renderer.unmount());
});

```
## Cách kiểm tra

1. Chạy npm.cmd start và npm.cmd run android nếu app chưa mở. Dùng hai tài khoản A/B trên hai thiết bị, Authentication và rules đã cấu hình như trước.
2. Với tài khoản chưa có tin, Home phải trống, không còn người dùng/tin mẫu. Mở Danh bạ rồi vào Chat nhưng không gửi: không tạo hàng conversation rỗng.
3. A gửi tin cho B: Home cả hai xuất hiện đúng đối tác, avatar, tin cuối và thời gian. Gửi tiếp cho người C: cuộc trò chuyện có tin gần nhất nằm trên cùng.
4. Gửi vị trí: Home hiển thị “📍 Vị trí”. Bấm hàng mở đúng Chat, card vẫn mở Google Maps như bước 5.
5. Giữ B ở Home hoặc Danh bạ, A gửi nhiều tin: badge hàng A và tab Home của B tăng ngay. Kiểm tra userChats/{uidB}/{uidA}/unreadCount trên Console tương ứng.
6. B mở Chat A: sau khi tải tin, badge của A được loại khỏi tổng và counter server trở về 0. Giữ Chat B active, A gửi thêm: badge không nhấp nháy trên các snapshot trong lúc reset.
7. Đưa B xuống nền khi vẫn ở Chat, A gửi: unread tăng. Mở lại B: tin hiển thị và unread được reset. Chuyển B sang cuộc Chat khác: unread từ A phải được tính lại bình thường.
8. Tìm tên theo chữ hoa/thường và khoảng trắng đầu/cuối. Không có kết quả phải hiện EmptyState. Tìm kiếm không làm thay đổi tổng badge trên tab.
9. Đưa A xuống nền/mở lại: chấm online trong hàng Home của B thay đổi khi status được server cập nhật.
10. Kiểm tra hiển thị HH:mm cho tin hôm nay, Hôm qua cho hôm qua và dd/MM cho tin cũ. Có thể dùng dữ liệu thử trong Console của project thực hành để kiểm tra các mốc.
11. Đăng xuất A rồi đăng nhập tài khoản khác trên cùng thiết bị: Home/badge không giữ dữ liệu A. Tắt mạng: có thông báo dữ liệu có thể cũ; kết nối lại phải cập nhật.
12. Chạy npx.cmd tsc --noEmit và npx.cmd jest --runInBand để kiểm tra lại. Khi ổn, gõ “tiếp tục” để làm bước 7: rà soát yêu cầu, dọn mock và kịch bản kiểm thử hoàn thiện.
