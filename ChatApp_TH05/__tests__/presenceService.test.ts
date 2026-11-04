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
