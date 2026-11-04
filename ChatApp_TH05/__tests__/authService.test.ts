import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { get, set } from 'firebase/database';
import {
  registerUser,
  getUserProfile,
  logoutUser,
  mapFirebaseAuthError,
} from '../src/services/authService';
import { stopPresence } from '../src/services/presenceService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('../src/services/presenceService', () => ({
  stopPresence: jest.fn(),
}));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  get: jest.fn(),
  set: jest.fn(),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(updateProfile).mockResolvedValue(undefined);
  jest.mocked(set).mockResolvedValue(undefined);
  jest.mocked(signOut).mockResolvedValue(undefined);
  jest.mocked(stopPresence).mockResolvedValue(undefined);
});

test('registration writes the new UID profile and matches its Auth avatar', async () => {
  const user = { uid: 'alice', email: 'alice@example.com' };
  jest
    .mocked(createUserWithEmailAndPassword)
    .mockResolvedValue({ user } as Awaited<
      ReturnType<typeof createUserWithEmailAndPassword>
    >);
  const profile = await registerUser(
    ' Alice ',
    ' alice@example.com ',
    ' secret ',
  );
  expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
    expect.anything(),
    'alice@example.com',
    ' secret ',
  );
  expect(updateProfile).toHaveBeenCalledWith(user, {
    displayName: 'Alice',
    photoURL: profile.avatar,
  });
  expect(set).toHaveBeenCalledWith(
    { path: 'users/alice' },
    { ...profile, createdAt: { '.sv': 'timestamp' } },
  );
});

test('a missing database profile is recovered from the Auth profile on login', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce({ exists: () => false, val: () => null } as Awaited<
      ReturnType<typeof get>
    >);
  const user = {
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    photoURL: 'avatar.png',
  };
  const result = await getUserProfile(
    user as Parameters<typeof getUserProfile>[0],
  );
  expect(result).toEqual({
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    avatar: 'avatar.png',
  });
  expect(set).toHaveBeenCalledWith(
    { path: 'users/alice' },
    expect.objectContaining({ displayName: 'Alice' }),
  );
});

test('logout waits for offline confirmation before signOut', async () => {
  let offline!: () => void;
  jest.mocked(stopPresence).mockReturnValueOnce(
    new Promise(resolve => {
      offline = resolve;
    }),
  );
  const pending = logoutUser();
  expect(stopPresence).toHaveBeenCalledWith('alice');
  expect(signOut).not.toHaveBeenCalled();
  offline();
  await pending;
  expect(signOut).toHaveBeenCalledTimes(1);
});

test('failed offline update does not silently sign out', async () => {
  jest
    .mocked(stopPresence)
    .mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
  await expect(logoutUser()).rejects.toThrow('PERMISSION_DENIED');
  expect(signOut).not.toHaveBeenCalled();
});

test.each([
  ['auth/invalid-credential', 'Email hoặc mật khẩu'],
  ['auth/wrong-password', 'Email hoặc mật khẩu'],
  ['auth/user-not-found', 'Email hoặc mật khẩu'],
  ['auth/email-already-in-use', 'Email này đã được dùng'],
  ['auth/invalid-email', 'Địa chỉ email không hợp lệ'],
  ['auth/weak-password', 'ít nhất 6 ký tự'],
  ['auth/network-request-failed', 'Lỗi kết nối mạng'],
  [
    'auth/configuration-not-found',
    'Firebase Authentication chưa được cấu hình',
  ],
  ['PERMISSION_DENIED', 'Không có quyền truy cập'],
])('maps %s into a Vietnamese message', (code, expected) => {
  expect(mapFirebaseAuthError(code)).toContain(expected);
});
