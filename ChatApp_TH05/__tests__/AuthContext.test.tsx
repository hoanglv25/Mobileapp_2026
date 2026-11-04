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
