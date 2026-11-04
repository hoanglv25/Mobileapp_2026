# Giai đoạn 3 — Presence và Danh bạ realtime

## Mục tiêu và kết quả

- presenceService theo dõi .info/connected, đăng ký onDisconnect offline trước khi ghi online, dùng serverTimestamp cho lastChanged, theo dõi AppState active/background/inactive.
- Các lần ghi được xếp hàng, có kiểm tra UID và phiên hoạt động để tránh tác vụ cũ ghi online sau khi chuyển nền hoặc cleanup. Khi logout, dừng listener trước, ghi offline, hủy đăng ký onDisconnect rồi mới signOut.
- AuthContext khởi động presence theo UID, cleanup khi đổi UID/unmount. Nếu logout thất bại, khởi động lại presence của phiên vẫn còn đăng nhập. Cung cấp connected, presenceError và retryPresence cho giao diện.
- userService cung cấp subscribeUsers, subscribeStatus, subscribeContacts; mọi hàm subscribe trả về cleanup.
- subscribeContacts giữ một listener trạng thái cho mỗi UID khác bản thân, thêm/xóa theo danh sách users, không tạo lại khi chỉ đổi tên/avatar. Callback trễ bị bỏ qua sau cleanup hoặc xóa liên hệ.
- ContactsScreen dùng Firebase thật, bỏ bản thân, tìm theo tên/email, xếp online trước rồi theo tên tiếng Việt, hiển thị loading/rỗng/lỗi và nút Thử lại.
- ContactItem hiển thị email, chấm trạng thái và mô tả trạng thái. Khi không đọc được trạng thái, hiện thông báo thay vì khẳng định user offline.
- Điều hướng giữ params contactId/contactName/contactAvatar. Home và Chat vẫn dùng context mẫu đến giai đoạn 4/6. Việc chọn liên hệ tạm thêm vào Home mẫu để giữ luồng Bài 4; chưa có gửi tin realtime.
- Không thay màn hình Thông báo và mockNotifications.

Không cần cài thư viện hay đổi cấu hình native trong giai đoạn này.

## Đối chiếu rules

| Thao tác | Rule cho phép |
| --- | --- |
| Đọc /users | users/.read = auth != null mà bạn đã bổ sung |
| Đọc /status/{partnerUid} | status/$uid/.read = auth != null |
| Ghi /status/{myUid} online/offline | status/$uid/.write = $uid === auth.uid |
| Đăng ký onDisconnect cho /status/{myUid} | Cùng quyền ghi của chủ UID; được đăng ký trước online |

Không đọc toàn bộ /status. Không thay hoặc Publish rules từ workspace. Phần messages và userChats chưa thêm thao tác Firebase ở giai đoạn này.

Theo tài liệu Firebase, onDisconnect được đăng ký phía server và cần được xác nhận trước khi ghi online; thao tác được đăng ký lại sau mỗi lần kết nối lại. Khi mất mạng/kill app, trạng thái offline phụ thuộc thời điểm server phát hiện mất kết nối, không đảm bảo tức thì. Nguồn: https://firebase.google.com/docs/database/web/offline-capabilities

Giới hạn cấu trúc đề bài: status/{uid} là một trạng thái chung. Nếu cùng một tài khoản đăng nhập nhiều thiết bị, các thiết bị có thể ghi đè trạng thái nhau. Kịch bản bài thực hành dùng hai tài khoản khác nhau trên hai thiết bị. Đăng xuất vẫn đợi ghi offline được server xác nhận; khi mất mạng, Firebase có thể giữ yêu cầu chờ kết nối lại.

## Kiểm tra tự động

- TypeScript: thành công.
- ESLint các file thay đổi và test: thành công, không lỗi/cảnh báo.
- Jest: 6 suites, 18 tests thành công.
- Test mới: đăng ký onDisconnect trước online; background và reconnect; chuyển nền lúc đăng ký onDisconnect đang chờ; stop listener trước offline và bỏ qua callback reconnect trễ; lỗi quyền không được đánh dấu online; loại bản thân và đọc status theo UID; giữ listener khi sửa profile; cleanup/xóa UID; trạng thái thiếu/lỗi; sắp xếp online và tìm email; điều hướng đúng tham số.

Test dùng mock Firebase, chưa xác minh quyền trên server thật hoặc chạy hai emulator.

## Nội dung đầy đủ các file

### src/services/presenceService.ts

```tsx
import { AppState } from 'react-native';
import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
} from 'firebase/database';
import { auth, database } from './firebase';

interface PresenceSession {
  uid: string;
  stop: () => Promise<void>;
}
let session: PresenceSession | undefined;
// Giữ thứ tự ghi qua cả cleanup/Fast Refresh/đổi tài khoản.
let writes: Promise<void> = Promise.resolve();
function enqueue(action: () => Promise<void>): Promise<void> {
  const result = writes.then(action);
  writes = result.catch(() => {});
  return result;
}
const offline = () => ({ isOnline: false, lastChanged: serverTimestamp() });

export function startPresence(
  uid: string,
  onError: (error: unknown) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  session?.stop().catch(onError);
  const statusRef = ref(database, `status/${uid}`);
  const disconnect = onDisconnect(statusRef);
  let disposed = false;
  let connected = false;
  let foreground = AppState.currentState === 'active';
  let revision = 0;
  let stopping: Promise<void> | undefined;

  const update = () => {
    const request = ++revision;
    enqueue(async () => {
      const valid = () =>
        !disposed &&
        connected &&
        request === revision &&
        auth.currentUser?.uid === uid;
      if (!valid()) {
        return;
      }
      if (foreground) {
        // Server phải xác nhận onDisconnect trước khi đánh dấu online.
        await disconnect.set(offline());
        if (!valid() || !foreground) {
          return;
        }
        await set(statusRef, {
          isOnline: true,
          lastChanged: serverTimestamp(),
        });
      } else {
        await set(statusRef, offline());
      }
    }).catch(error => {
      if (!disposed) {
        onError(error);
      }
    });
  };

  const unsubscribe = onValue(
    ref(database, '.info/connected'),
    snapshot => {
      if (disposed) {
        return;
      }
      connected = snapshot.val() === true;
      onConnection(connected);
      update();
    },
    error => {
      if (!disposed) {
        onError(error);
      }
    },
  );
  const appStateSubscription = AppState.addEventListener('change', state => {
    foreground = state === 'active';
    update();
  });

  const current: PresenceSession = {
    uid,
    stop: () => {
      if (stopping) {
        return stopping;
      }
      disposed = true;
      ++revision;
      unsubscribe();
      appStateSubscription.remove();
      if (session === current) {
        session = undefined;
      }
      stopping = enqueue(async () => {
        if (auth.currentUser?.uid !== uid) {
          return;
        }
        await set(statusRef, offline());
        await disconnect.cancel();
      });
      return stopping;
    },
  };
  session = current;
  return () => {
    current.stop().catch(onError);
  };
}

/** Dừng listener trước khi ghi offline để callback reconnect không ghi đè thành online. */
export function stopPresence(uid: string): Promise<void> {
  if (session?.uid === uid) {
    return session.stop();
  }
  return enqueue(async () => {
    if (auth.currentUser?.uid === uid) {
      await set(ref(database, `status/${uid}`), offline());
    }
  });
}

```

### src/services/userService.ts

```tsx
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

```

### src/services/authService.ts

```tsx
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

```

### src/context/AuthContext.tsx

```tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  AuthUser,
  getUserProfile,
  loginUser,
  registerUser,
  logoutUser,
  onAuthChange,
  getCurrentFirebaseUser,
  getAuthErrorMessage,
} from '../services/authService';
import { startPresence } from '../services/presenceService';

interface AuthContextType {
  currentUser: AuthUser | null;
  initializing: boolean;
  sessionError: string;
  retrySession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  connected: boolean | null;
  presenceError: string;
  retryPresence: () => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [presenceError, setPresenceError] = useState('');
  const [presenceAttempt, setPresenceAttempt] = useState(0);
  const mounted = useRef(false);
  const operation = useRef(false);
  const revision = useRef(0);
  const uid = currentUser?.uid;

  useEffect(() => {
    let active = true;
    setConnected(null);
    setPresenceError('');
    if (!uid) {
      return;
    }
    const cleanup = startPresence(
      uid,
      error => {
        if (active) {
          setPresenceError(getAuthErrorMessage(error));
        }
      },
      value => {
        if (active) {
          setConnected(value);
        }
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [uid, presenceAttempt]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const unsubscribe = onAuthChange(user => {
      // createUser phát sự kiện trước khi ghi xong hồ sơ: chờ register hoàn tất.
      if (operation.current) {
        return;
      }
      const request = ++revision.current;
      setInitializing(true);
      setCurrentUser(null);
      setSessionError('');
      if (!user) {
        setInitializing(false);
        return;
      }
      getUserProfile(user)
        .then(profile => {
          if (active && revision.current === request) {
            setCurrentUser(profile);
          }
        })
        .catch(error => {
          if (active && revision.current === request) {
            setSessionError(getAuthErrorMessage(error));
          }
        })
        .finally(() => {
          if (active && revision.current === request) {
            setInitializing(false);
          }
        });
    });
    return () => {
      mounted.current = false;
      active = false;
      unsubscribe();
    };
  }, []);

  const authenticate = async (action: () => Promise<AuthUser>) => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      const user = await action();
      if (mounted.current) {
        setCurrentUser(user);
        setSessionError('');
      }
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) {
        setInitializing(false);
      }
    }
  };

  const retrySession = async () => {
    const user = getCurrentFirebaseUser();
    if (!user) {
      setSessionError('');
      setInitializing(false);
      return;
    }
    setInitializing(true);
    try {
      await authenticate(() => getUserProfile(user));
    } catch (error) {
      if (mounted.current) {
        setSessionError(getAuthErrorMessage(error));
      }
    }
  };

  const logout = async () => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      await logoutUser();
      if (mounted.current) {
        setCurrentUser(null);
        setSessionError('');
      }
    } catch (error) {
      if (mounted.current) {
        setPresenceAttempt(previous => previous + 1);
      }
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        initializing,
        sessionError,
        retrySession,
        login: (email, password) =>
          authenticate(() => loginUser(email, password)),
        register: (name, email, password) =>
          authenticate(() => registerUser(name, email, password)),
        logout,
        connected,
        presenceError,
        retryPresence: () => setPresenceAttempt(previous => previous + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được bọc trong AuthProvider');
  }
  return context;
}

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
import { useMockChat } from '../context/MockChatContext';
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
  const { getOrCreateConversation } = useMockChat();
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

  // Nhấn vào người dùng: mở ChatScreen (tạo mới cuộc trò chuyện nếu chưa tồn tại)
  const handleSelectContact = (contact: Contact) => {
    getOrCreateConversation(contact);
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

### src/components/contact/ContactItem.tsx

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Contact } from '../../types';
import { Avatar } from '../common/Avatar';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize } from '../../theme';

interface Props {
  contact: Contact;
  onPress: () => void;
}

export const ContactItem: React.FC<Props> = ({ contact, onPress }) => {
  const { theme } = useApp();

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
      accessibilityLabel={`${contact.name}, ${contact.email}, ${
        contact.statusText ||
        (contact.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')
      }`}
      activeOpacity={0.7}
    >
      <Avatar
        uri={contact.avatar}
        size={50}
        showOnline
        isOnline={contact.isOnline}
      />
      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text
          style={[styles.email, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {contact.email}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: contact.isOnline
                  ? theme.online
                  : theme.offline,
              },
            ]}
          />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {contact.statusText ||
              (contact.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  email: { fontSize: FontSize.xs, marginBottom: Spacing.xs },
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
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: FontSize.xs,
  },
});

```

### __tests__/App.test.tsx

```tsx
/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
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

### __tests__/AuthContext.test.tsx

```tsx
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import * as service from '../src/services/authService';

jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: jest.fn(),
  getUserProfile: jest.fn(),
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  logoutUser: jest.fn(),
  getCurrentFirebaseUser: jest.fn(),
  getAuthErrorMessage: (error: Error) => error.message,
}));

const profile = {
  uid: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  avatar: 'avatar',
};
let auth: ReturnType<typeof useAuth>;
let notify: Parameters<typeof service.onAuthChange>[0];
let renderer: ReactTestRenderer;
const unsubscribe = jest.fn();

function Probe() {
  auth = useAuth();
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(service.onAuthChange).mockImplementation(callback => {
    notify = callback;
    return unsubscribe;
  });
  await act(async () => {
    renderer = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('restores session only after profile loads and unsubscribes on unmount', async () => {
  let resolveProfile!: (value: typeof profile) => void;
  jest.mocked(service.getUserProfile).mockReturnValue(
    new Promise(resolve => {
      resolveProfile = resolve;
    }),
  );
  await act(async () =>
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]),
  );
  expect(auth.initializing).toBe(true);
  expect(auth.currentUser).toBeNull();
  await act(async () => {
    resolveProfile(profile);
  });
  expect(auth.currentUser).toEqual(profile);
  expect(auth.initializing).toBe(false);
  await act(async () => renderer.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('does not navigate with a half-written registration profile', async () => {
  await act(async () => notify(null));
  let resolveRegistration!: (value: typeof profile) => void;
  jest.mocked(service.registerUser).mockImplementation(() => {
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]);
    return new Promise(resolve => {
      resolveRegistration = resolve;
    });
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = auth.register('Alice', profile.email, 'secret');
  });
  expect(auth.currentUser).toBeNull();
  expect(service.getUserProfile).not.toHaveBeenCalled();
  await act(async () => {
    resolveRegistration(profile);
    await pending;
  });
  expect(auth.currentUser).toEqual(profile);
});

test('failed logout keeps the authenticated screen; successful logout clears it', async () => {
  jest.mocked(service.loginUser).mockResolvedValue(profile);
  await act(async () => {
    await auth.login(profile.email, 'secret');
  });
  jest
    .mocked(service.logoutUser)
    .mockRejectedValueOnce(new Error('Không có mạng'));
  await act(async () => {
    await expect(auth.logout()).rejects.toThrow('Không có mạng');
  });
  expect(auth.currentUser).toEqual(profile);
  jest.mocked(service.logoutUser).mockResolvedValueOnce(undefined);
  await act(async () => {
    await auth.logout();
  });
  expect(auth.currentUser).toBeNull();
});

test('failed restoration exposes an error and permits retry', async () => {
  jest
    .mocked(service.getUserProfile)
    .mockRejectedValueOnce(new Error('Không đọc được hồ sơ'));
  await act(async () =>
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]),
  );
  expect(auth.initializing).toBe(false);
  expect(auth.currentUser).toBeNull();
  expect(auth.sessionError).toBe('Không đọc được hồ sơ');
  jest
    .mocked(service.getCurrentFirebaseUser)
    .mockReturnValue({ uid: profile.uid } as ReturnType<
      typeof service.getCurrentFirebaseUser
    >);
  jest.mocked(service.getUserProfile).mockResolvedValueOnce(profile);
  await act(async () => {
    await auth.retrySession();
  });
  expect(auth.currentUser).toEqual(profile);
  expect(auth.sessionError).toBe('');
});

```

### __tests__/AuthForm.test.tsx

```tsx
import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthForm } from '../src/components/common/AuthForm';
import { AppProvider } from '../src/context/AppContext';
import { AuthProvider } from '../src/context/AuthContext';
import * as service from '../src/services/authService';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: (callback: (user: null) => void) => {
    callback(null);
    return jest.fn();
  },
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  getAuthErrorMessage: (error: Error) => error.message,
}));

let renderer: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => renderer.unmount());
});

async function render(mode: 'register' | 'login') {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <AuthProvider>
          <AuthForm mode={mode} onSwitch={jest.fn()} />
        </AuthProvider>
      </AppProvider>,
    );
  });
}

async function fill(label: string, value: string) {
  await act(async () => {
    renderer.root
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === label)!
      .props.onChangeText(value);
  });
}

function submitButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityState)!;
}

function visibleText() {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join(' ');
}

test('registration validates each field without calling Firebase', async () => {
  await render('register');
  await fill('Email', 'invalid-email');
  await fill('Mật khẩu', '123');
  await fill('Nhập lại mật khẩu', '456');
  await act(async () => {
    await submitButton().props.onPress();
  });
  expect(visibleText()).toContain('Vui lòng nhập họ tên.');
  expect(visibleText()).toContain('Email không hợp lệ.');
  expect(visibleText()).toContain('Mật khẩu phải có ít nhất 6 ký tự.');
  expect(visibleText()).toContain('Mật khẩu nhập lại không khớp.');
  expect(service.registerUser).not.toHaveBeenCalled();
});

test('valid registration preserves password and blocks duplicate submission', async () => {
  await render('register');
  await fill('Họ tên', ' Alice ');
  await fill('Email', ' alice@example.com ');
  await fill('Mật khẩu', ' secret ');
  await fill('Nhập lại mật khẩu', ' secret ');
  let complete!: (value: service.AuthUser) => void;
  jest.mocked(service.registerUser).mockReturnValue(
    new Promise(resolve => {
      complete = resolve;
    }),
  );
  let pending!: Promise<void>;
  const press = submitButton().props.onPress;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(service.registerUser).toHaveBeenCalledTimes(1);
  expect(service.registerUser).toHaveBeenCalledWith(
    'Alice',
    'alice@example.com',
    ' secret ',
  );
  expect(submitButton().props.disabled).toBe(true);
  await act(async () => {
    complete({
      uid: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatar: 'avatar',
    });
    await pending;
  });
  expect(submitButton().props.disabled).toBe(false);
});

test('login displays authentication failure and allows retry', async () => {
  await render('login');
  await fill('Email', 'alice@example.com');
  await fill('Mật khẩu', 'incorrect');
  jest
    .mocked(service.loginUser)
    .mockRejectedValueOnce(new Error('Email hoặc mật khẩu không đúng.'));
  await act(async () => {
    await submitButton().props.onPress();
  });
  expect(visibleText()).toContain('Email hoặc mật khẩu không đúng.');
  expect(submitButton().props.disabled).toBe(false);
});

```

### __tests__/presenceService.test.ts

```tsx
import { AppState, AppStateStatus } from 'react-native';
import { onDisconnect, onValue, set } from 'firebase/database';
import { auth } from '../src/services/firebase';
import { startPresence, stopPresence } from '../src/services/presenceService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
  set: jest.fn(),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

let connection: (snapshot: { val: () => boolean }) => void;
let changeState: (state: AppStateStatus) => void;
const unsubscribe = jest.fn();
const removeAppState = jest.fn();
const disconnectSet = jest.fn();
const disconnectCancel = jest.fn();
const flush = async () => {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changeState = callback;
      return { remove: removeAppState };
    });
  jest.mocked(onValue).mockImplementation((_ref, callback) => {
    connection = callback as unknown as typeof connection;
    return unsubscribe;
  });
  disconnectSet.mockResolvedValue(undefined);
  disconnectCancel.mockResolvedValue(undefined);
  jest
    .mocked(onDisconnect)
    .mockReturnValue({
      set: disconnectSet,
      cancel: disconnectCancel,
    } as unknown as ReturnType<typeof onDisconnect>);
  jest.mocked(set).mockResolvedValue(undefined);
});

afterEach(async () => {
  await stopPresence('alice');
  jest.restoreAllMocks();
});

test('registers onDisconnect before online, handles background and reconnect', async () => {
  const cleanup = startPresence('alice', jest.fn(), jest.fn());
  connection({ val: () => true });
  await flush();
  expect(disconnectSet).toHaveBeenCalledWith({
    isOnline: false,
    lastChanged: { '.sv': 'timestamp' },
  });
  expect(disconnectSet.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(set).mock.invocationCallOrder[0],
  );
  expect(set).toHaveBeenLastCalledWith(
    { path: 'status/alice' },
    { isOnline: true, lastChanged: { '.sv': 'timestamp' } },
  );
  changeState('background');
  await flush();
  expect(set).toHaveBeenLastCalledWith(
    { path: 'status/alice' },
    { isOnline: false, lastChanged: { '.sv': 'timestamp' } },
  );
  connection({ val: () => false });
  changeState('active');
  connection({ val: () => true });
  await flush();
  expect(disconnectSet).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenLastCalledWith(
    { path: 'status/alice' },
    { isOnline: true, lastChanged: { '.sv': 'timestamp' } },
  );
  cleanup();
  await flush();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
  expect(disconnectCancel).toHaveBeenCalledTimes(1);
});

test('background while disconnect registration is pending never marks online', async () => {
  let registered!: () => void;
  disconnectSet.mockReturnValueOnce(
    new Promise<void>(resolve => {
      registered = resolve;
    }),
  );
  startPresence('alice', jest.fn(), jest.fn());
  connection({ val: () => true });
  await flush();
  changeState('background');
  registered();
  await flush();
  expect(
    jest
      .mocked(set)
      .mock.calls.some(
        ([, value]) => (value as { isOnline: boolean }).isOnline === true,
      ),
  ).toBe(false);
});

test('stop removes listeners before offline and suppresses late reconnect callbacks', async () => {
  startPresence('alice', jest.fn(), jest.fn());
  connection({ val: () => true });
  await flush();
  jest.mocked(set).mockClear();
  const stopped = stopPresence('alice');
  connection({ val: () => true });
  await stopped;
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenLastCalledWith(
    { path: 'status/alice' },
    { isOnline: false, lastChanged: { '.sv': 'timestamp' } },
  );
});

test('failed onDisconnect is reported and does not publish online', async () => {
  const error = new Error('PERMISSION_DENIED');
  const report = jest.fn();
  disconnectSet.mockRejectedValueOnce(error);
  startPresence('alice', report, jest.fn());
  connection({ val: () => true });
  await flush();
  expect(report).toHaveBeenCalledWith(error);
  expect(set).not.toHaveBeenCalled();
});

```

### __tests__/userService.test.ts

```tsx
import { onValue } from 'firebase/database';
import {
  subscribeContacts,
  subscribeStatus,
} from '../src/services/userService';

jest.mock('../src/services/firebase', () => ({ database: {} }));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  onValue: jest.fn(),
}));

interface Listener {
  value: (snapshot: unknown) => void;
  error: (error: Error) => void;
  unsubscribe: jest.Mock;
}
let listeners: Map<string, Listener>;
function usersSnapshot(users: Record<string, unknown>) {
  return {
    forEach: (
      callback: (child: { key: string; val: () => unknown }) => void,
    ) => {
      Object.entries(users).forEach(([key, value]) =>
        callback({ key, val: () => value }),
      );
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners = new Map();
  jest.mocked(onValue).mockImplementation((reference, value, error) => {
    const listener: Listener = {
      value: value as unknown as Listener['value'],
      error: error as Listener['error'],
      unsubscribe: jest.fn(),
    };
    listeners.set((reference as unknown as { path: string }).path, listener);
    return listener.unsubscribe;
  });
});

test('excludes self, reads each status and reuses listeners when a profile changes', () => {
  const callback = jest.fn();
  const cleanup = subscribeContacts('alice', callback, jest.fn());
  listeners.get('users')!.value(
    usersSnapshot({
      alice: { displayName: 'Alice' },
      bob: { displayName: 'Bob', email: 'bob@example.com' },
    }),
  );
  expect(listeners.has('status/alice')).toBe(false);
  expect(listeners.has('status')).toBe(false);
  listeners
    .get('status/bob')!
    .value({ val: () => ({ isOnline: true, lastChanged: 123 }) });
  expect(callback.mock.lastCall[0]).toEqual([
    expect.objectContaining({ id: 'bob', name: 'Bob', isOnline: true }),
  ]);
  listeners
    .get('users')!
    .value(usersSnapshot({ bob: { displayName: 'Bobby' } }));
  expect(onValue).toHaveBeenCalledTimes(2);
  expect(callback.mock.lastCall[0][0]).toEqual(
    expect.objectContaining({ name: 'Bobby', isOnline: true }),
  );
  const oldStatus = listeners.get('status/bob')!;
  listeners.get('users')!.value(usersSnapshot({}));
  expect(oldStatus.unsubscribe).toHaveBeenCalledTimes(1);
  const calls = callback.mock.calls.length;
  oldStatus.value({ val: () => ({ isOnline: true }) });
  expect(callback).toHaveBeenCalledTimes(calls);
  cleanup();
  expect(listeners.get('users')!.unsubscribe).toHaveBeenCalledTimes(1);
});

test('cleanup removes all subscriptions and ignores callbacks arriving afterwards', () => {
  const callback = jest.fn();
  const cleanup = subscribeContacts('alice', callback, jest.fn());
  listeners.get('users')!.value(usersSnapshot({ bob: { displayName: 'Bob' } }));
  cleanup();
  const calls = callback.mock.calls.length;
  listeners.get('status/bob')!.value({ val: () => ({ isOnline: true }) });
  listeners
    .get('users')!
    .value(usersSnapshot({ charlie: { displayName: 'Charlie' } }));
  expect(callback).toHaveBeenCalledTimes(calls);
  listeners.forEach(listener =>
    expect(listener.unsubscribe).toHaveBeenCalledTimes(1),
  );
});

test('missing status is offline and unreadable status is shown as unknown', () => {
  const callback = jest.fn();
  const cleanup = subscribeContacts('alice', callback, jest.fn());
  listeners.get('users')!.value(usersSnapshot({ bob: { displayName: 'Bob' } }));
  listeners.get('status/bob')!.value({ val: () => null });
  expect(callback.mock.lastCall[0][0].isOnline).toBe(false);
  listeners.get('status/bob')!.error(new Error('PERMISSION_DENIED'));
  expect(callback.mock.lastCall[0][0].statusText).toBe(
    'Không đọc được trạng thái',
  );
  cleanup();
});

test('subscribeStatus returns the Firebase unsubscribe directly', () => {
  const cleanup = subscribeStatus('bob', jest.fn(), jest.fn());
  expect(cleanup).toBe(listeners.get('status/bob')!.unsubscribe);
});

```

### __tests__/ContactsScreen.test.tsx

```tsx
import React from 'react';
import { FlatList, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ContactsScreen } from '../src/screens/ContactsScreen';
import { AppProvider } from '../src/context/AppContext';
import { MockChatProvider } from '../src/context/MockChatContext';
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
        <MockChatProvider>
          <ContactsScreen {...props} />
        </MockChatProvider>
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
## Cách kiểm tra

1. Đảm bảo Firebase Console đã bật Email/Password và Publish rules mới có users/.read = auth != null. Không cần mở quyền đọc toàn bộ status.
2. Chạy npm.cmd start; ở terminal khác chạy npm.cmd run android. Dùng hai emulator/thiết bị với hai tài khoản A và B khác nhau.
3. Mở Danh bạ ở A: có B, không có A và không còn danh bạ mẫu. Ở B tương tự.
4. Kiểm tra Database/status/{uidA}, status/{uidB}: app đang active có isOnline true, lastChanged là số thời gian từ server.
5. Đưa B xuống nền: A thấy B Ngoại tuyến khi ghi tới server. Mở lại B: A thấy B Đang hoạt động và B được xếp lên trước người offline.
6. Tắt mạng B hoặc kill app: chờ server phát hiện mất kết nối rồi A phải thấy B offline. Bật lại mạng/mở app: trạng thái cập nhật lại. Không yêu cầu offline tức thì khi rút mạng vì có độ trễ phát hiện kết nối.
7. Tìm B bằng một phần tên hoặc email, thử chữ hoa và khoảng trắng đầu/cuối. Thử chuỗi không khớp: hiện trạng thái rỗng.
8. Đăng ký C từ thiết bị thứ hai hoặc sửa displayName của B trong Console: danh bạ A cập nhật mà không tải lại màn hình.
9. Nhấn B: mở Chat với tên/avatar đúng. Tin nhắn và header trạng thái của Chat vẫn thuộc giai đoạn 4, chưa dùng để đánh giá presence giai đoạn này.
10. Đăng xuất B: kiểm tra status/{uidB}/isOnline false và A thấy B offline; callback kết nối không được ghi lại true sau đăng xuất.
11. Chuyển tab, vào/ra màn hình và Fast Refresh nhiều lần: mỗi liên hệ chỉ hiện một hàng. Cleanup đã được kiểm tra bằng unit test.
12. Chạy npx.cmd tsc --noEmit và npx.cmd jest --runInBand nếu muốn kiểm tra lại. Khi ổn, gõ “tiếp tục” để sang giai đoạn 4: Chat 1-1 realtime.
