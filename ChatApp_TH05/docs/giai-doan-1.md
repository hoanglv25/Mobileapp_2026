# Giai đoạn 1 — Firebase và Auth services

Mục tiêu: khởi tạo Firebase Auth có AsyncStorage persistence, cung cấp đăng ký, đăng nhập, đọc hồ sơ, đăng xuất và listener có unsubscribe.

Không cài thêm thư viện và không thay cấu hình native trong giai đoạn này.

- Chỉ lấy Auth hiện có nếu lỗi là auth/already-initialized; các lỗi khác được ném lại.
- Đăng ký lưu displayName và photoURL trong Auth, hồ sơ trong users/{uid}.
- Đăng nhập đọc hồ sơ từ Database. getUserProfile dùng lại khi khôi phục phiên ở giai đoạn 2.
- logoutUser ghi offline trước signOut. Nếu ghi lỗi, hàm báo lỗi và chưa đăng xuất. Giai đoạn 3 bổ sung quản lý kết nối và onDisconnect; hiện chưa có presence tự động.
- mapFirebaseAuthError cung cấp thông báo tiếng Việt theo mã; context sẽ gọi mapper khi bắt lỗi ở giai đoạn 2.
- Auth và Database không phải một giao dịch chung: nếu ghi hồ sơ thất bại sau createUser, tài khoản Auth có thể đã tồn tại. Không đăng ký lại ngay; kiểm tra cả Authentication và Database. Cần xử lý phục hồi hồ sơ khi tích hợp AuthContext.

Quyền theo rules đã cung cấp:

| Đường dẫn | Quyền |
| --- | --- |
| users/{uid} | Chủ tài khoản ghi; người đã đăng nhập đọc |
| status/{uid} | Chủ tài khoản ghi; người đã đăng nhập đọc từng UID |
| messages/{chatId} | Người đã đăng nhập có UID nằm trong chatId được đọc/ghi |
| userChats/{uid}/{partnerUid} | Mọi người đã đăng nhập được ghi; chỉ chủ uid được đọc |

Nội dung đầy đủ các file sau khi sửa:

## src/services/firebase.ts

```ts
/**
 * firebase.ts
 * Khởi tạo Firebase app MỘT LẦN DUY NHẤT.
 * Tránh lỗi "auth/already-initialized" khi Fast Refresh bằng cách
 * kiểm tra getApps() trước khi gọi initializeApp().
 */
import { getApps, initializeApp, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseError } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyBiCfQuZnNFCHohw5rqGJA-oTvTYS9ACok',
  authDomain: 'chatapp-th05.firebaseapp.com',
  databaseURL: 'https://chatapp-th05-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'chatapp-th05',
  storageBucket: 'chatapp-th05.firebasestorage.app',
  messagingSenderId: '328990775353',
  appId: '1:328990775353:web:c9d4de7f14e97b7a6355e8',
  measurementId: 'G-ZY25QZRR0S',
};

// Khởi tạo app: chỉ gọi initializeApp nếu chưa có app nào
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Khởi tạo Auth với AsyncStorage persistence:
// - Nếu app vừa được khởi tạo (mới) → dùng initializeAuth
// - Nếu app đã tồn tại (Fast Refresh) → dùng getAuth để tránh lỗi "already-initialized"
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  if (!(error instanceof FirebaseError) || error.code !== 'auth/already-initialized') {
    throw error;
  }
  // Đã được khởi tạo trước đó (Fast Refresh) → lấy instance hiện có
  auth = getAuth(app);
}

// Khởi tạo Realtime Database (dùng databaseURL đã có trong config)
const database = getDatabase(app);

export { app, auth, database };


```

## src/services/authService.ts

```ts
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
    default:
      return `Đã xảy ra lỗi (${errorCode}). Vui lòng thử lại.`;
  }
};

// ==================== SERVICES ====================

/**
 * Đăng ký tài khoản mới.
 * Quy trình: createUser → updateProfile(displayName) → ghi users/{uid} vào Database.
 */
export const registerUser = async (
  name: string,
  email: string,
  password: string
): Promise<AuthUser> => {
  name = name.trim();
  email = email.trim();
  if (!name) {
    throw new Error('Vui lòng nhập họ tên.');
  }
  // 1. Tạo tài khoản Firebase Auth
  const credential = await createUserWithEmailAndPassword(auth, email, password);
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
 * Trả về AuthUser nếu thành công, throw Error có message tiếng Việt nếu thất bại.
 */
export const loginUser = async (
  email: string,
  password: string
): Promise<AuthUser> => {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return getUserProfile(credential.user);
};

/** Đọc đúng hồ sơ khi đăng nhập hoặc khôi phục phiên. Lỗi đọc được chuyển cho UI. */
export const getUserProfile = async (firebaseUser: FirebaseUser): Promise<AuthUser> => {
  const snapshot = await get(ref(database, `users/${firebaseUser.uid}`));
  const profile = snapshot.val() as Partial<AuthUser> | null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: profile?.displayName || firebaseUser.displayName || 'Người dùng',
    avatar: profile?.avatar || firebaseUser.photoURL || AVATAR_LIST[0],
  };
};

/**
 * Đăng xuất khỏi Firebase Auth.
 * Ghi offline khi vẫn còn quyền xác thực, sau đó mới signOut.
 * Nếu ghi thất bại, báo lỗi để người dùng thử lại.
 */
export const logoutUser = async (): Promise<void> => {
  const user = auth.currentUser;
  if (user) {
    // Rules status/$uid chỉ cho chủ tài khoản ghi.
    await set(ref(database, `status/${user.uid}`), {
      isOnline: false,
      lastChanged: serverTimestamp(),
    });
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
  callback: (user: FirebaseUser | null) => void
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
## Cách kiểm tra

1. Chạy `npx.cmd tsc --noEmit` và `npx.cmd eslint src/services/firebase.ts src/services/authService.ts`: cả hai đã thành công trên workspace.
2. Kiểm tra Firebase Console: Email/Password bật, rules đã Publish, databaseURL đúng project.
3. Chưa có kiểm thử mạng Firebase hay kiểm thử thiết bị trong lượt này. App vẫn dùng giao diện mock đến giai đoạn 2.
4. Sau khi tích hợp giai đoạn 2: đăng ký một email mới, kiểm tra tài khoản trong Authentication và hồ sơ users/{uid}; đăng nhập lại phải có đúng tên/avatar; khởi động lại app để kiểm tra persistence; đăng xuất phải ghi status/{uid}/isOnline = false.
5. Fast Refresh không được báo auth/already-initialized; khi thêm presence ở giai đoạn 3 sẽ kiểm tra tiếp online/offline và cleanup.
