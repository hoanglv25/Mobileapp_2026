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
