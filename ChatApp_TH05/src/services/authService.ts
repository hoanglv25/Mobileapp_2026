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
    case 'auth/configuration-not-found':
      return 'Firebase Authentication chưa được cấu hình. Hãy mở đúng project trong Firebase Console, nhấn Bắt đầu và bật Email/Password.';
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
