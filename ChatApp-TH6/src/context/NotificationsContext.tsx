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
import { AppNotification } from '../types';
import {
  markNotificationsRead,
  subscribeNotifications,
} from '../services/notificationService';
import { getAuthErrorMessage } from '../services/authService';

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Đánh dấu đã đọc các thông báo tin nhắn của một cuộc trò chuyện (khi mở chat). */
  markConversationRead: (convId: string) => void;
}
const NotificationsContext = createContext<NotificationsState | undefined>(
  undefined,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [state, setState] = useState<{
    uid?: string;
    list: AppNotification[];
    loading: boolean;
    error: string;
  }>({ list: [], loading: true, error: '' });

  useEffect(() => {
    setState({ uid, list: [], loading: !!uid, error: '' });
    if (!uid) {
      return;
    }
    let active = true;
    const unsubscribe = subscribeNotifications(
      uid,
      list => active && setState({ uid, list, loading: false, error: '' }),
      error =>
        active &&
        setState({
          uid,
          list: [],
          loading: false,
          error: getAuthErrorMessage(error),
        }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  const notifications = useMemo(
    () => (state.uid === uid ? state.list : []),
    [state.uid, state.list, uid],
  );
  const unreadCount = useMemo(
    () => notifications.filter(item => !item.read).length,
    [notifications],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (uid && ids.length > 0) {
        await markNotificationsRead(uid, ids);
      }
    },
    [uid],
  );
  const markAllRead = useCallback(
    () =>
      markRead(notifications.filter(item => !item.read).map(item => item.id)),
    [markRead, notifications],
  );
  const markConversationRead = useCallback(
    (convId: string) => {
      const ids = notifications
        .filter(
          item =>
            !item.read && item.convId === convId && item.type === 'message',
        )
        .map(item => item.id);
      markRead(ids).catch(() => {});
    },
    [markRead, notifications],
  );

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading: !!uid && (state.uid !== uid || state.loading),
        error: state.uid === uid ? state.error : '',
        markRead,
        markAllRead,
        markConversationRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsState {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications cần NotificationsProvider');
  }
  return context;
}
