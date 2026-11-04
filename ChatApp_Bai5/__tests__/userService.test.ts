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
