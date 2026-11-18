import { onValue, ref } from 'firebase/database';
import { database } from './firebase';
import { Contact } from '../types';

export interface UserStatus {
  isOnline: boolean;
  lastChanged: number | null;
}

export function subscribeUsers(
  myUid: string,
  callback: (users: Contact[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, 'users'),
    snapshot => {
      const users: Contact[] = [];
      snapshot.forEach(child => {
        if (!child.key || child.key === myUid) {
          return;
        }
        const value = child.val();
        if (!value || typeof value !== 'object') {
          return;
        }
        users.push({
          id: child.key,
          name:
            typeof value.displayName === 'string'
              ? value.displayName
              : 'Người dùng',
          email: typeof value.email === 'string' ? value.email : '',
          avatar: typeof value.avatar === 'string' ? value.avatar : '',
          isOnline: false,
        });
      });
      callback(users);
    },
    onError,
  );
}

// Rules chỉ cho đọc từng status/$uid; không subscribe cả /status.
export function subscribeStatus(
  uid: string,
  callback: (status: UserStatus) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `status/${uid}`),
    snapshot => {
      const value = snapshot.val();
      callback({
        isOnline: value?.isOnline === true,
        lastChanged:
          typeof value?.lastChanged === 'number' ? value.lastChanged : null,
      });
    },
    onError,
  );
}

/** Giữ listener trạng thái của UID còn trong danh bạ, không tạo lại khi đổi tên/avatar. */
export function subscribeContacts(
  myUid: string,
  callback: (contacts: Contact[]) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let users: Contact[] = [];
  const listeners = new Map<
    string,
    {
      unsubscribe: () => void;
      status?: UserStatus;
      failed?: boolean;
    }
  >();
  const publish = () => {
    if (!active) {
      return;
    }
    callback(
      users.map(user => {
        const entry = listeners.get(user.id);
        return {
          ...user,
          isOnline: entry?.status?.isOnline === true,
          statusText: entry?.failed
            ? 'Không đọc được trạng thái'
            : !entry?.status
            ? 'Đang cập nhật trạng thái…'
            : undefined,
        };
      }),
    );
  };
  const unsubscribeUsers = subscribeUsers(
    myUid,
    list => {
      if (!active) {
        return;
      }
      users = list;
      const ids = new Set(users.map(user => user.id));
      listeners.forEach((entry, id) => {
        if (!ids.has(id)) {
          entry.unsubscribe();
          listeners.delete(id);
        }
      });
      users.forEach(user => {
        if (listeners.has(user.id)) {
          return;
        }
        const entry: {
          unsubscribe: () => void;
          status?: UserStatus;
          failed?: boolean;
        } = {
          unsubscribe: () => {},
        };
        listeners.set(user.id, entry);
        entry.unsubscribe = subscribeStatus(
          user.id,
          status => {
            if (!active || listeners.get(user.id) !== entry) {
              return;
            }
            entry.status = status;
            entry.failed = false;
            publish();
          },
          () => {
            if (!active || listeners.get(user.id) !== entry) {
              return;
            }
            entry.status = undefined;
            entry.failed = true;
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
      listeners.forEach(entry => entry.unsubscribe());
      listeners.clear();
      onError(error);
    },
  );
  return () => {
    active = false;
    unsubscribeUsers();
    listeners.forEach(entry => entry.unsubscribe());
    listeners.clear();
  };
}

// ==================== BẢN ĐỒ NGƯỜI DÙNG (kể cả bản thân) ====================

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  email: string;
}

/** Tất cả hồ sơ users/*; đổi tên/ảnh đại diện được đẩy tới mọi màn hình ngay lập tức. */
export function subscribeUserMap(
  callback: (users: Record<string, UserProfile>) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, 'users'),
    snapshot => {
      const users: Record<string, UserProfile> = {};
      snapshot.forEach(child => {
        const value = child.val();
        if (!child.key || !value || typeof value !== 'object') {
          return;
        }
        users[child.key] = {
          id: child.key,
          name:
            typeof value.displayName === 'string' && value.displayName
              ? value.displayName
              : 'Người dùng',
          avatar: typeof value.avatar === 'string' ? value.avatar : '',
          email: typeof value.email === 'string' ? value.email : '',
        };
      });
      callback(users);
    },
    onError,
  );
}
