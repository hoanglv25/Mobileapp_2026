import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { subscribeUserMap, UserProfile } from '../services/userService';

interface UsersState {
  users: Record<string, UserProfile>;
  getName: (uid: string) => string;
  getAvatar: (uid: string) => string;
}
const UsersContext = createContext<UsersState | undefined>(undefined);

export function groupAvatarUri(name: string): string {
  return `https://ui-avatars.com/api/?background=0084FF&color=fff&size=150&name=${encodeURIComponent(
    name || 'Nhóm',
  )}`;
}

/** Một listener duy nhất cho users/*: đổi tên/ảnh đại diện cập nhật ở mọi màn hình. */
export function UsersProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [users, setUsers] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    setUsers({});
    if (!uid) {
      return;
    }
    let active = true;
    const unsubscribe = subscribeUserMap(
      value => {
        if (active) {
          setUsers(value);
        }
      },
      () => {
        if (active) {
          setUsers({});
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  const value = useMemo<UsersState>(
    () => ({
      users,
      getName: id =>
        id === uid && currentUser
          ? users[id]?.name || currentUser.displayName
          : users[id]?.name || 'Người dùng',
      getAvatar: id =>
        users[id]?.avatar || (id === uid ? currentUser?.avatar || '' : ''),
    }),
    [users, uid, currentUser],
  );
  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  );
}

export function useUsers(): UsersState {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error('useUsers cần UsersProvider');
  }
  return context;
}
