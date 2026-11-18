# Giai đoạn 4 — Chat 1-1 realtime

## Mục tiêu và kết quả

- Thêm chatService với getChatId, subscribeMessages, sendTextMessage, subscribeUnreadCount và markAsRead. Mọi lời gọi Firebase nằm trong src/services.
- chatId = [uid1, uid2].sort().join('_'). Không cho tự chat hoặc dùng UID chứa ký tự đường dẫn không hợp lệ.
- subscribeMessages dùng onValue thay toàn bộ snapshot, lấy push key làm id, lọc bản ghi sai cấu trúc, sắp theo createdAt và push key. Không nối snapshot vào mảng cũ nên không nhân đôi tin.
- sendTextMessage trim, chặn rỗng/tối đa 2000 ký tự, xác nhận UID đang đăng nhập và người nhận có hồ sơ thật. Một update ở root ghi message, metadata từng trường của userChats hai bên và increment(1) counter người nhận.
- Metadata người gửi không ghi đè unreadCount: tránh vô tình xóa unread khi hai bên gửi đồng thời. Với nhánh mới chưa có unreadCount, phía đọc coi thiếu counter là 0; khi nhận tin counter sẽ được tạo bởi increment.
- createdAt và lastMessageTime dùng serverTimestamp để lưu số thời gian server. UI dùng formatTime từ createdAt.
- markAsRead dùng transaction ở userChats/{myUid}/{partnerUid}/unreadCount, applyLocally=false; chỉ reset số dương, không tạo cuộc trò chuyện rỗng khi counter còn null.
- ChatScreen có header trạng thái đối phương thật, spinner tải/gửi, hiển thị lỗi và thử tải lại, tự cuộn xuống cuối, chặn bấm gửi lặp, giữ draft nếu server từ chối.
- Tin của UID mình bên phải, UID đối phương bên trái. Không dùng senderId='me' cho dữ liệu Firebase.
- Đánh dấu đã đọc khi mở Chat và khi counter tăng trong lúc màn hình có focus, app active. Một lượt reset còn chờ sẽ xử lý tiếp counter tăng mới. Khi blur/background sẽ hủy listener unread, không bắt đầu lần reset mới. Yêu cầu đã gửi trước lúc blur vẫn có thể hoàn tất.
- Đổi người chat/UID remount phần nội dung, dọn listener messages/status/unread/AppState và xóa state cũ. Callback trễ bị bỏ qua sau cleanup.
- iOS KeyboardAvoidingView dùng padding và offset 0 cho header tùy chỉnh nằm ngoài vùng nhập; Android dùng adjustResize đã có trong Manifest.
- Home vẫn dùng mock tới giai đoạn 6. Hãy mở Chat từ Danh bạ thật; ID liên hệ mẫu không có hồ sơ Firebase sẽ bị chặn khi gửi. Chat không dùng mockMessages nữa.
- Thông báo vẫn giữ mockNotifications. Chưa thêm gửi vị trí trong giai đoạn này.

Không cài thêm thư viện hoặc thay cấu hình native.

## Cấu trúc dữ liệu được ghi

messages/{chatId}/{pushKey}: id, senderId, receiverId, type='text', text, createdAt.

userChats/{A}/{B}: chatId, contactId=B, name/avatar của B, lastMessage, lastMessageTime. Counter của A được giữ nguyên.

userChats/{B}/{A}: chatId, contactId=A, name/avatar của A, lastMessage, lastMessageTime, unreadCount tăng 1.

## Đối chiếu rules hiện tại

| Thao tác | Quyền theo rules của bạn |
| --- | --- |
| Đọc hồ sơ users/{B} trước gửi | users/.read = auth != null, hoặc users/$uid/.read = auth != null |
| Đọc messages/{chatId} | messages/$chatId/.read yêu cầu đăng nhập và chatId chứa auth.uid |
| Ghi messages/{chatId}/{pushKey} | messages/$chatId/.write với cùng điều kiện |
| Ghi metadata userChats/{A}/{B} | userChats/$uid/$partnerUid/.write = auth != null |
| Ghi metadata và increment unread ở userChats/{B}/{A} | Cùng rule write = auth != null; không cần đọc userChats của B |
| Đọc và transaction unread của A | userChats/$uid/.read yêu cầu $uid === auth.uid, write ở nhánh partner cho người đã xác thực |
| Đọc trạng thái B | status/$uid/.read = auth != null |

Không đọc /messages ở root hoặc userChats của đối phương. Không đổi/Publish rules trong giai đoạn này.

Firebase xác nhận multi-path update là atomic: tất cả thành công hoặc tất cả thất bại. Nguồn: https://firebase.google.com/docs/database/web/read-and-write

## Giới hạn cần biết

- Listener tải toàn bộ lịch sử của một chat; chưa phân trang. Không dùng orderByChild nên chưa cần thêm .indexOn để chạy giai đoạn này.
- Nếu mất mạng sau khi đã gửi yêu cầu, Firebase có thể giữ pending đến khi kết nối lại; nút gửi bị khóa để không tạo thêm tin trùng. Hãy giữ app mở chờ xác nhận. Lỗi bị server từ chối giữ lại nội dung draft.
- Listener Firebase có thể phản ánh tin gửi cục bộ trước xác nhận server; nếu ghi thất bại, Firebase hoàn tác snapshot. Không có nhãn đã gửi/đã nhận trong giai đoạn này.
- Reset unread cần đi tới server; không thể đảm bảo counter trên Console luôn bằng 0 tức thời khi mạng trễ. Home/badge realtime và xử lý hiển thị khi Chat đang mở sẽ làm ở giai đoạn 6; hiện chưa có badge Firebase để đánh giá nhấp nháy.
- Các rules đã cho cho phép mọi tài khoản đăng nhập ghi userChats của người khác và cho người có UID nằm trong chatId ghi toàn bộ chat. Code này tuân theo quyền đó; rules không xác thực chặt cấu trúc hoặc senderId.

## Kết quả kiểm tra tự động

- npx.cmd tsc --noEmit: thành công.
- ESLint các file thay đổi: thành công, không lỗi/cảnh báo.
- npx.cmd jest --runInBand: 8 suites, 28 tests thành công.
- Test mới bao gồm chatId hai chiều; atomic update và increment; giữ unread người gửi; chặn tin rỗng/người nhận không tồn tại/phiên thay đổi; snapshot lặp và sort; transaction chỉ trên counter của mình; bong bóng trái/phải; trim và chống gửi trùng; giữ draft khi lỗi; reset unread khi focus; dừng đọc khi blur/background; trạng thái header; cleanup và bỏ callback chat cũ.

Chưa chạy hai emulator/thiết bị và chưa gọi Firebase thật trong test. Cần xác minh rules/độ trễ mạng theo phần Cách kiểm tra.

## Nội dung đầy đủ các file

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
import { ChatMessage } from '../types';

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
  const chatId = getChatId(sender.uid, partnerUid);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Không thể gửi tin nhắn rỗng.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
  }
  // Không tạo dữ liệu Firebase cho contact ID mẫu còn ở Home của giai đoạn trước.
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
      type: 'text',
      text: trimmed,
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
      lastMessage: trimmed,
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
import { Avatar } from '../components/common/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Spacing, FontSize, BorderRadius } from '../theme';
import { getAuthErrorMessage } from '../services/authService';
import { subscribeStatus, UserStatus } from '../services/userService';
import {
  getChatId,
  subscribeMessages,
  sendTextMessage,
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
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [sendError, setSendError] = useState('');
  const [readError, setReadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const sendLock = useRef(false);
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
    if (!uid || !chatId || !focused || !foreground) {
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
  }, [uid, chatId, contactId, focused, foreground, attempt]);

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
            {sending ? (
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

### src/components/chat/MessageBubble.tsx

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';

interface Props {
  message: ChatMessage;
  isMe: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, isMe }) => {
  const { theme } = useApp();

  return (
    <View
      style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}
    >
      <View
        style={[
          styles.bubble,
          isMe
            ? [styles.bubbleMe, { backgroundColor: theme.myBubble }]
            : [styles.bubbleOther, { backgroundColor: theme.otherBubble }],
        ]}
      >
        <Text
          style={[
            styles.messageText,
            { color: isMe ? theme.myBubbleText : theme.otherBubbleText },
          ]}
        >
          {message.text}
        </Text>
        <Text
          style={[
            styles.timestamp,
            isMe
              ? styles.myTimestamp
              : [styles.otherTimestamp, { color: theme.textMuted }],
          ]}
        >
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  myTimestamp: { color: 'rgba(255, 255, 255, 0.75)', textAlign: 'right' },
  otherTimestamp: { textAlign: 'left' },
  wrapper: {
    marginVertical: 4,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
  },
  wrapperMe: {
    justifyContent: 'flex-end',
  },
  wrapperOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: FontSize.xs - 1,
    marginTop: 4,
  },
});

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

### src/utils/formatTime.ts

```tsx
export function formatTime(createdAt: number): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

```

### __tests__/App.test.tsx

```tsx
/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
jest.mock('../src/services/chatService', () => ({}));
jest.mock('../src/services/userService', () => ({
  subscribeContacts: jest.fn(() => jest.fn()),
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
// Kiểm tra giao diện không gọi Firebase thật trong Jest.
jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: (callback: (user: null) => void) => {
    callback(null);
    return jest.fn();
  },
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'Email' }),
  ).not.toHaveLength(0);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
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
  subscribeMessages,
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
  jest
    .mocked(get)
    .mockResolvedValue({
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
import { ChatMessage, ChatScreenProps } from '../src/types';

let mockFocused = true;
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
  markAsRead: jest.fn(),
  MAX_MESSAGE_LENGTH: 2000,
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
  await act(async () => {
    renderer = create(view());
  });
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

```
## Cách kiểm tra

1. Chạy npm.cmd start; ở terminal khác npm.cmd run android. Đăng nhập tài khoản A và B trên hai thiết bị/emulator, Firebase rules phải được Publish như đã thống nhất.
2. Ở cả A và B, mở Chat từ Danh bạ với người kia. Chưa dùng liên hệ mẫu trên Home.
3. A gửi “Xin chào B”, B trả lời. Cả hai thấy ngay, mỗi tin có giờ; tin của mình bên phải. Không cần quay ra/tải lại.
4. Firebase Console phải có đúng một messages/{chatId}/{pushKey} cho mỗi lần gửi, UID thật, type text, createdAt là số. userChats của hai bên có tin cuối và lastMessageTime là số, name/avatar của đúng đối tác.
5. Nhập toàn khoảng trắng: nút Gửi không dùng được. Bấm Gửi nhanh nhiều lần: một yêu cầu trong lúc pending. Khi lỗi ghi thật, draft vẫn còn để gửi lại.
6. B thoát Chat về Danh bạ/Home, A gửi 2 tin: kiểm tra userChats/{uidB}/{uidA}/unreadCount tăng 2 nếu ban đầu bằng 0. Mở Chat B: counter về 0 sau xác nhận server.
7. Giữ Chat B đang focus và active, A gửi tiếp: B thấy tin và counter trở về 0. Đưa B xuống nền khi Chat vẫn đang mở, A gửi tin: counter phải tăng và không bị tự reset cho đến khi B active lại.
8. Cho A/B cùng gửi: kiểm tra metadata cả hai bên cập nhật, không nhân đôi message. Gửi của một bên không tự reset counter của bên đó ngoài logic đọc khi Chat active.
9. Thay đổi online/offline B (đưa xuống nền/mở lại): header Chat ở A đổi theo status thật.
10. Thoát/vào Chat và Fast Refresh nhiều lần: lịch sử không nhân đôi. Mở Chat với người khác: lịch sử cũ không xuất hiện.
11. Bật bàn phím trên Android/iOS: ô nhập/nút Gửi vẫn nhìn thấy, danh sách cuộn xuống tin mới. Mất mạng: có thông báo; nút Gửi chỉ khả dụng lại khi connected=true, draft còn nguyên.
12. TypeScript/Jest có thể kiểm tra lại bằng npx.cmd tsc --noEmit và npx.cmd jest --runInBand. Khi chạy ổn, gõ “tiếp tục” để làm giai đoạn 5: Gửi vị trí.
