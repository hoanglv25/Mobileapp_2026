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
import { groupAvatarUri, useUsers } from './UsersContext';

interface ConversationsState {
  conversations: RealtimeConversation[];
  totalUnreadCount: number;
  loading: boolean;
  error: string;
  retry: () => void;
  /** Đánh dấu đang mở cuộc trò chuyện `convId` (Home/badge bỏ qua unread đang chờ reset). */
  activateChat: (convId: string) => () => void;
}
const ConversationsContext = createContext<ConversationsState | undefined>(
  undefined,
);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { users } = useUsers();
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
    convId: string;
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
    (convId: string) => {
      const token = Symbol('chat');
      setActiveChat({ uid, convId, token });
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
    return snapshot.rows.map(item => {
      const partner = item.contactId ? users[item.contactId] : undefined;
      const enriched: RealtimeConversation =
        item.type === 'group'
          ? { ...item, avatar: groupAvatarUri(item.name) }
          : {
              ...item,
              name: partner?.name || 'Người dùng',
              avatar: partner?.avatar || '',
            };
      return activeChat?.uid === uid && activeChat?.convId === item.id
        ? { ...enriched, unreadCount: 0 }
        : enriched;
    });
  }, [snapshot, uid, activeChat, users]);

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
