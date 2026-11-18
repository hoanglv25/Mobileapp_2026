import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatScreenProps, ChatMessage, ConversationMeta } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConversations } from '../context/ConversationsContext';
import { useNotifications } from '../context/NotificationsContext';
import { groupAvatarUri, useUsers } from '../context/UsersContext';
import { Avatar } from '../components/common/Avatar';
import { EmptyState } from '../components/common/EmptyState';
import {
  MessageBubble,
  PendingImageBubble,
  PendingImageStatus,
} from '../components/chat/MessageBubble';
import { MessageActionsModal } from '../components/chat/MessageActionsModal';
import { ImageViewerModal } from '../components/chat/ImageViewerModal';
import { Spacing, FontSize, BorderRadius } from '../theme';
import { getAuthErrorMessage } from '../services/authService';
import { subscribeStatus, UserStatus } from '../services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../services/locationService';
import {
  fetchOlderMessages,
  markAsRead,
  MAX_MESSAGE_LENGTH,
  recallMessage,
  SendTarget,
  sendImageMessage,
  sendLocationMessage,
  sendTextMessage,
  subscribeConversationMeta,
  subscribeMessages,
  subscribeReadStatus,
  subscribeUnreadCount,
  toggleReaction,
} from '../services/chatService';
import {
  createTypingController,
  enterConversation,
  subscribeTyping,
  subscribeViewing,
  TypingController,
} from '../services/typingService';
import { pickImage, ImageSource } from '../services/imagePickerService';
import { LocalImage, uploadImage } from '../services/uploadService';
import { previewOf } from '../utils/messageText';
import { formatLastActive } from '../utils/formatLastActive';
import { formatTime } from '../utils/formatTime';

interface PendingUpload {
  id: string;
  image: LocalImage;
  status: PendingImageStatus;
  error?: string;
}

export function ChatScreen(props: ChatScreenProps) {
  const { currentUser } = useAuth();
  // Đổi cuộc trò chuyện/UID sẽ hủy toàn bộ listener và state của cuộc trò chuyện cũ.
  return (
    <ChatContent
      key={`${currentUser?.uid}_${props.route.params.conversationId}`}
      {...props}
    />
  );
}

function ChatContent({ route, navigation }: ChatScreenProps) {
  const { conversationId: convId, type, name, avatar, contactId } = route.params;
  const isGroup = type === 'group';
  const { theme } = useApp();
  const { currentUser, connected } = useAuth();
  const { activateChat } = useConversations();
  const { markConversationRead } = useNotifications();
  const { getName, getAvatar } = useUsers();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [windowStart, setWindowStart] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [memberOnline, setMemberOnline] = useState<Record<string, boolean>>({});
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const [viewingUids, setViewingUids] = useState<string[]>([]);
  const [readStatus, setReadStatus] = useState<Record<string, number>>({});
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
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const mounted = useRef(false);
  const sendLock = useRef(false);
  const ready = useRef({ focused, foreground, connected });
  ready.current = { focused, foreground, connected };
  const list = useRef<FlatList<ChatMessage>>(null);
  const typing = useRef<TypingController | null>(null);
  const windowStartRef = useRef<string | null>(null);
  windowStartRef.current = windowStart;
  const lastIdRef = useRef('');
  const initialScroll = useRef(true);
  const stickToBottom = useRef(true);
  const userDragged = useRef(false);
  const uid = currentUser?.uid;

  // Thành viên: 1-1 = hai người; nhóm = lấy từ conversations/{id}/members.
  const members = useMemo(() => {
    if (!uid) {
      return [] as string[];
    }
    if (!isGroup) {
      return contactId ? [uid, contactId] : [];
    }
    return meta?.members || [];
  }, [uid, isGroup, contactId, meta]);
  const memberKey = members.join(',');
  const groupName = meta?.name || name;
  const removed =
    isGroup && !!uid && (metaError || (!!meta && !meta.members.includes(uid)));
  const canUseConversation =
    !!uid && !removed && (isGroup ? !!meta : !!contactId);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      mounted.current = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  // ---- Thông tin nhóm (tên, thành viên) ----
  useEffect(() => {
    if (!isGroup) {
      return;
    }
    let active = true;
    setMetaError(false);
    const unsubscribe = subscribeConversationMeta(
      convId,
      value => {
        if (active) {
          setMeta(value);
          setMetaError(false);
        }
      },
      () => {
        if (active) {
          setMetaError(true);
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [convId, isGroup, attempt]);

  // ---- Tin nhắn: trang đầu limitToLast(20), sau đó startAt(tin cũ nhất đã tải) ----
  useEffect(() => {
    if (removed) {
      setLoading(false);
      return;
    }
    setLoadError('');
    let active = true;
    const unsubscribe = subscribeMessages(
      convId,
      windowStart,
      value => {
        if (!active) {
          return;
        }
        setMessages(value);
        setLoading(false);
        setLoadError('');
        if (windowStartRef.current === null && value.length > 0) {
          // Cố định cửa sổ ở tin cũ nhất của trang đầu để tin mới không đẩy tin cũ ra khỏi danh sách.
          setHasMore(value.length >= 20);
          setWindowStart(value[0].id);
        }
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
  }, [convId, windowStart, attempt, removed]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0 || removed) {
      return;
    }
    setLoadingOlder(true);
    try {
      const older = await fetchOlderMessages(convId, messages[0].id);
      if (!mounted.current) {
        return;
      }
      if (older.messages.length > 0) {
        setMessages(previous => {
          const known = new Set(previous.map(item => item.id));
          return [...older.messages.filter(item => !known.has(item.id)), ...previous];
        });
        setWindowStart(older.messages[0].id);
      }
      setHasMore(older.hasMore && older.messages.length > 0);
    } catch (error) {
      if (mounted.current) {
        setLoadError(getAuthErrorMessage(error));
      }
    } finally {
      if (mounted.current) {
        setLoadingOlder(false);
      }
    }
  }, [convId, hasMore, loadingOlder, messages, removed]);

  // ---- Trạng thái online / lần cuối hoạt động ----
  useEffect(() => {
    if (isGroup || !contactId) {
      return;
    }
    let active = true;
    setStatus(null);
    setStatusError('');
    const unsubscribe = subscribeStatus(
      contactId,
      value => {
        if (active) {
          setStatus(value);
          setStatusError('');
        }
      },
      error => {
        if (active) {
          setStatus(null);
          setStatusError(getAuthErrorMessage(error));
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isGroup, contactId, attempt]);

  useEffect(() => {
    if (!isGroup || !uid) {
      return;
    }
    let active = true;
    const others = memberKey.split(',').filter(id => id && id !== uid);
    const unsubscribers = others.map(id =>
      subscribeStatus(
        id,
        value =>
          active &&
          setMemberOnline(previous => ({ ...previous, [id]: value.isOnline })),
        () =>
          active && setMemberOnline(previous => ({ ...previous, [id]: false })),
      ),
    );
    return () => {
      active = false;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [isGroup, uid, memberKey]);

  // ---- Đang soạn tin / đang xem / đã xem ----
  useEffect(() => {
    if (!uid || !canUseConversation) {
      return;
    }
    let active = true;
    const unsubscribers = [
      subscribeTyping(
        convId,
        uid,
        value => active && setTypingUids(value),
        () => active && setTypingUids([]),
      ),
      subscribeViewing(
        convId,
        value => active && setViewingUids(value),
        () => active && setViewingUids([]),
      ),
      subscribeReadStatus(
        convId,
        value => active && setReadStatus(value),
        () => active && setReadStatus({}),
      ),
    ];
    return () => {
      active = false;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [uid, convId, canUseConversation, attempt]);

  useEffect(() => {
    if (!uid || !canUseConversation) {
      return;
    }
    const controller = createTypingController(convId, uid);
    typing.current = controller;
    return () => {
      // Rời màn hình: tắt "đang soạn tin" ngay.
      controller.stop();
      typing.current = null;
    };
  }, [uid, convId, canUseConversation]);

  useEffect(() => {
    if (!focused || !foreground) {
      typing.current?.stop();
    }
  }, [focused, foreground]);

  // Báo "đang mở cuộc trò chuyện" để người khác không tạo thông báo thừa cho tôi.
  useEffect(() => {
    if (!uid || !canUseConversation || !focused || !foreground) {
      return;
    }
    return enterConversation(convId, uid);
  }, [uid, convId, canUseConversation, focused, foreground]);

  useEffect(() => {
    if (!canUseConversation || !focused || !foreground || loading || loadError) {
      return;
    }
    markConversationRead(convId);
    // Home và badge bỏ qua counter đang chờ reset khi nội dung Chat đã hiển thị.
    return activateChat(convId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canUseConversation,
    convId,
    focused,
    foreground,
    loading,
    loadError,
    activateChat,
  ]);

  // ---- Đặt unread của mình về 0 + ghi mốc "đã xem" ----
  useEffect(() => {
    if (
      !uid ||
      !canUseConversation ||
      !focused ||
      !foreground ||
      loading ||
      loadError
    ) {
      return;
    }
    let active = true;
    let busy = false;
    let dirty = false;
    const read = async () => {
      dirty = true;
      if (busy) {
        return;
      }
      busy = true;
      try {
        while (active && dirty) {
          dirty = false;
          await markAsRead(uid, convId);
          if (active) {
            setReadError('');
          }
        }
      } catch (error) {
        if (active) {
          setReadError(getAuthErrorMessage(error));
        }
      } finally {
        busy = false;
      }
    };
    read();
    const unsubscribe = subscribeUnreadCount(
      uid,
      convId,
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
  }, [uid, convId, canUseConversation, focused, foreground, loading, loadError, attempt]);

  // ---- Cuộn xuống cuối khi có tin mới ở cuối (không cuộn khi tải trang cũ) ----
  useEffect(() => {
    const last = messages[messages.length - 1]?.id || '';
    if (last && last !== lastIdRef.current) {
      const animated = !initialScroll.current;
      initialScroll.current = false;
      requestAnimationFrame(() =>
        list.current?.scrollToEnd({ animated }),
      );
    }
    lastIdRef.current = last;
  }, [messages]);

  const target: SendTarget | null = useMemo(
    () =>
      canUseConversation
        ? {
            convId,
            type,
            members,
            name: isGroup ? groupName : undefined,
            viewing: viewingUids,
          }
        : null,
    [canUseConversation, convId, type, members, isGroup, groupName, viewingUids],
  );

  const replyPayload = replyTo
    ? {
        id: replyTo.id,
        senderId: replyTo.senderId,
        text: previewOf(replyTo.type, replyTo.text, replyTo.recalled),
      }
    : undefined;

  const handleChangeText = (value: string) => {
    setInputText(value);
    typing.current?.notify(value.trim().length > 0);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !currentUser || !target || connected !== true || sendLock.current) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setSendError('');
    typing.current?.stop();
    try {
      await sendTextMessage(currentUser, target, text, replyPayload);
      if (mounted.current) {
        setInputText('');
        setReplyTo(null);
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
    !!inputText.trim() && !!target && connected === true && !sending;
  const canSendLocation = !!target && connected === true && !sending;
  const handleLocation = async () => {
    if (!currentUser || !target || connected !== true || sendLock.current) {
      return;
    }
    sendLock.current = true;
    setSending(true);
    setLocationPhase('locating');
    setSendError('');
    let locating = true;
    try {
      const point = await getCurrentLocation();
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
      await sendLocationMessage(currentUser, target, point);
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

  // ---- Gửi ảnh: chọn → (đã thu nhỏ ≤1024px) → Cloudinary → lưu URL ----
  const runUpload = useCallback(
    async (item: PendingUpload) => {
      if (!currentUser || !target) {
        return;
      }
      setPending(previous =>
        previous.map(value =>
          value.id === item.id
            ? { ...value, status: 'uploading', error: undefined }
            : value,
        ),
      );
      try {
        const url = await uploadImage(item.image);
        await sendImageMessage(currentUser, target, url, replyPayload);
        if (mounted.current) {
          setPending(previous => previous.filter(value => value.id !== item.id));
          setReplyTo(null);
        }
      } catch (error) {
        if (mounted.current) {
          setPending(previous =>
            previous.map(value =>
              value.id === item.id
                ? {
                    ...value,
                    status: 'failed',
                    error: getAuthErrorMessage(error),
                  }
                : value,
            ),
          );
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, target, replyTo],
  );

  const handlePick = async (source: ImageSource) => {
    try {
      const image = await pickImage(source);
      if (!image || !mounted.current) {
        return;
      }
      const item: PendingUpload = {
        id: `${Date.now()}`,
        image,
        status: 'uploading',
      };
      setPending(previous => [...previous, item]);
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      runUpload(item);
    } catch (error) {
      Alert.alert('Không mở được ảnh', getAuthErrorMessage(error));
    }
  };

  const handleCamera = () => {
    if (!canSendLocation) {
      return;
    }
    Alert.alert('Gửi ảnh', 'Chọn nguồn ảnh', [
      { text: 'Chụp ảnh', onPress: () => handlePick('camera') },
      { text: 'Chọn từ thư viện', onPress: () => handlePick('library') },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  // ---- Menu nhấn giữ ----
  const handleReact = (message: ChatMessage, emoji: string) => {
    setActionMessage(null);
    if (currentUser) {
      toggleReaction(currentUser, convId, message, emoji).catch(error =>
        setSendError(getAuthErrorMessage(error)),
      );
    }
  };
  const handleCopy = (message: ChatMessage) => {
    setActionMessage(null);
    Clipboard.setString(message.text);
  };
  const handleRecall = (message: ChatMessage) => {
    setActionMessage(null);
    if (!currentUser) {
      return;
    }
    Alert.alert('Thu hồi tin nhắn', 'Tin nhắn sẽ bị thu hồi với mọi người.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Thu hồi',
        style: 'destructive',
        onPress: () =>
          recallMessage(currentUser, convId, members, message).catch(error =>
            setSendError(getAuthErrorMessage(error)),
          ),
      },
    ]);
  };
  const handleReply = (message: ChatMessage) => {
    setActionMessage(null);
    setReplyTo(message);
  };

  const handleGoToReply = (messageId: string) => {
    const index = visibleMessages.findIndex(item => item.id === messageId);
    if (index < 0) {
      Alert.alert(
        'Chưa tải tin gốc',
        'Hãy kéo lên đầu danh sách để tải thêm tin cũ rồi thử lại.',
      );
      return;
    }
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    setHighlightId(messageId);
    setTimeout(() => mounted.current && setHighlightId(null), 1500);
  };

  // ---- Tiêu đề: đang soạn tin / online / Hoạt động X phút trước ----
  const typingNames = typingUids.map(id => getName(id));
  const onlineCount = Object.values(memberOnline).filter(Boolean).length + 1;
  let subtitle: string;
  let subtitleColor = theme.textSecondary;
  if (removed) {
    subtitle = 'Bạn không còn trong nhóm';
  } else if (typingUids.length > 0) {
    subtitle = isGroup
      ? `${typingNames.join(', ')} đang soạn tin…`
      : 'đang soạn tin…';
    subtitleColor = theme.primary;
  } else if (isGroup) {
    subtitle = `${members.length} thành viên · ${onlineCount} đang online`;
  } else if (statusError) {
    subtitle = 'Không đọc được trạng thái';
  } else if (!status) {
    subtitle = 'Đang cập nhật trạng thái…';
  } else if (status.isOnline) {
    subtitle = 'Đang hoạt động';
    subtitleColor = theme.online;
  } else {
    subtitle = formatLastActive(status.lastChanged, now);
  }

  // ---- "Đã gửi" / "Đã xem" dưới tin cuối của mình ----
  const lastMineId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (item.senderId === uid && item.type !== 'system' && !item.recalled) {
        return item.id;
      }
    }
    return '';
  }, [messages, uid]);
  const lastMine = messages.find(item => item.id === lastMineId);
  let statusText = '';
  if (lastMine) {
    const seenBy = members
      .filter(id => id !== uid)
      .map(id => readStatus[id])
      .filter(value => typeof value === 'number' && value >= lastMine.createdAt);
    if (seenBy.length === 0) {
      statusText = 'Đã gửi';
    } else if (isGroup) {
      statusText = `Đã xem bởi ${seenBy.length}`;
    } else {
      statusText = `Đã xem ${formatTime(Math.max(...seenBy))}`;
    }
  }

  const visibleMessages = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!searching || !query) {
      return messages;
    }
    return messages.filter(
      item => !item.recalled && item.text.toLowerCase().includes(query),
    );
  }, [messages, searching, searchText]);

  const displayedError = removed
    ? ''
    : loadError || sendError || readError || statusError;
  const retry = () => {
    setAttempt(previous => previous + 1);
    setSendError('');
  };
  const headerAvatar = isGroup
    ? groupAvatarUri(groupName)
    : (contactId && getAvatar(contactId)) || avatar;
  const headerName = isGroup ? groupName : (contactId && getName(contactId)) || name;

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <MessageBubble
      message={item}
      isMe={item.senderId === uid}
      senderName={isGroup ? getName(item.senderId) : undefined}
      statusText={item.id === lastMineId ? statusText : undefined}
      replyName={item.replyTo ? getName(item.replyTo.senderId) : undefined}
      highlighted={item.id === highlightId}
      onLongPress={setActionMessage}
      onPressImage={setViewerUri}
      onPressReply={handleGoToReply}
    />
  );

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
          uri={headerAvatar}
          size={40}
          style={styles.headerAvatar}
          showOnline={!isGroup && !!status}
          isOnline={status?.isOnline === true}
        />
        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {headerName}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.headerStatus, { color: subtitleColor }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Tìm trong cuộc trò chuyện"
          onPress={() => {
            setSearching(previous => !previous);
            setSearchText('');
          }}
          style={styles.headerRightAction}
        >
          <Icon name="search-outline" size={22} color={theme.text} />
        </TouchableOpacity>
        {isGroup && !removed && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Thông tin nhóm"
            onPress={() => navigation.navigate('GroupInfo', { conversationId: convId })}
            style={styles.headerRightAction}
          >
            <Icon name="information-circle-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>
      {searching && (
        <View
          style={[
            styles.searchRow,
            { backgroundColor: theme.card, borderBottomColor: theme.border },
          ]}
        >
          <TextInput
            autoFocus
            accessibilityLabel="Tìm tin nhắn"
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Tìm trong các tin đã tải…"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
          />
          <Text style={{ color: theme.textMuted }}>
            {searchText.trim() ? visibleMessages.length : ''}
          </Text>
        </View>
      )}
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
          data={visibleMessages}
          extraData={`${statusText}|${highlightId}|${now}`}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          // Tải thêm 20 tin cũ khi kéo lên đầu; giữ nguyên vị trí đang xem (không nhảy).
          // Chỉ tải khi NGƯỜI DÙNG đã kéo: lúc mới mở, onStartReached bắn ngay khi bố cục chưa
          // cuộn xuống đáy và sẽ tự tải trang cũ rồi làm lệch vị trí.
          onStartReached={() => {
            if (userDragged.current) {
              loadOlder();
            }
          }}
          onStartReachedThreshold={0.3}
          onScrollBeginDrag={() => {
            userDragged.current = true;
            stickToBottom.current = false;
          }}
          onContentSizeChange={() => {
            // Bám đáy cho tới khi người dùng chủ động kéo (các bong bóng đo kích thước dần).
            if (stickToBottom.current) {
              list.current?.scrollToEnd({ animated: false });
            }
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScrollToIndexFailed={info =>
            list.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            })
          }
          onLayout={() => {
            if (initialScroll.current) {
              list.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={
            loadingOlder ? (
              <ActivityIndicator
                accessibilityLabel="Đang tải tin cũ"
                color={theme.primary}
                style={styles.olderSpinner}
              />
            ) : undefined
          }
          ListFooterComponent={
            pending.length > 0 ? (
              <View>
                {pending.map(item => (
                  <PendingImageBubble
                    key={item.id}
                    uri={item.image.uri}
                    status={item.status}
                    error={item.error}
                    onRetry={() => runUpload(item)}
                    onCancel={() =>
                      setPending(previous =>
                        previous.filter(value => value.id !== item.id),
                      )
                    }
                  />
                ))}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="large" color={theme.primary} />
            ) : loadError || removed ? undefined : (
              <EmptyState
                iconName="chatbubbles-outline"
                title={searching && searchText.trim() ? 'Không có kết quả' : 'Chưa có tin nhắn'}
                message={
                  searching && searchText.trim()
                    ? 'Không có tin nào khớp trong các tin đã tải.'
                    : `Hãy gửi lời chào đến ${headerName}!`
                }
              />
            )
          }
        />
        {removed ? (
          <Text
            style={[
              styles.notice,
              styles.removedNotice,
              { color: theme.textSecondary, borderTopColor: theme.border },
            ]}
          >
            Bạn không còn là thành viên của nhóm này nên không thể xem hoặc gửi tin.
          </Text>
        ) : (
          <>
            {!!replyTo && (
              <View
                style={[
                  styles.replyBar,
                  { backgroundColor: theme.card, borderTopColor: theme.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.primary, fontWeight: '700' }} numberOfLines={1}>
                    Trả lời {getName(replyTo.senderId)}
                  </Text>
                  <Text style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {previewOf(replyTo.type, replyTo.text, replyTo.recalled)}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Hủy trả lời"
                  onPress={() => setReplyTo(null)}
                >
                  <Icon name="close" size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: theme.card, borderTopColor: theme.border },
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Gửi ảnh"
                accessibilityState={{ disabled: !canSendLocation }}
                style={styles.iconButton}
                disabled={!canSendLocation}
                onPress={handleCamera}
              >
                <Text style={[styles.cameraEmoji, { opacity: canSendLocation ? 1 : 0.4 }]}>
                  📷
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Gửi vị trí hiện tại"
                accessibilityState={{
                  disabled: !canSendLocation,
                  busy: !!locationPhase,
                }}
                style={styles.iconButton}
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
                  onChangeText={handleChangeText}
                  onBlur={() => typing.current?.stop()}
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
          </>
        )}
      </KeyboardAvoidingView>
      <MessageActionsModal
        message={actionMessage}
        myUid={uid || ''}
        onClose={() => setActionMessage(null)}
        onReact={handleReact}
        onCopy={handleCopy}
        onRecall={handleRecall}
        onReply={handleReply}
      />
      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  cameraEmoji: { fontSize: 22 },
  olderSpinner: { paddingVertical: Spacing.md },
  notice: { padding: Spacing.md },
  removedNotice: { textAlign: 'center', borderTopWidth: StyleSheet.hairlineWidth },
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
    fontSize: FontSize.xs,
  },
  headerRightAction: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.sm },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatArea: {
    flex: 1,
  },
  messageList: {
    paddingVertical: Spacing.md,
    flexGrow: 1,
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
