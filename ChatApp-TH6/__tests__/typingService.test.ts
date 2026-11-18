import { onDisconnect, remove, set } from 'firebase/database';
import {
  createTypingController,
  enterConversation,
  TYPING_TIMEOUT_MS,
} from '../src/services/typingService';
import { auth } from '../src/services/firebase';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
const order: string[] = [];
jest.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  set: jest.fn(),
  remove: jest.fn(),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  order.length = 0;
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  jest.mocked(onDisconnect).mockImplementation(((target: { path: string }) => ({
    remove: async () => {
      order.push(`onDisconnect.remove ${target.path}`);
    },
  })) as never);
  jest.mocked(set).mockImplementation((async (target: { path: string }) => {
    order.push(`set ${target.path}`);
  }) as never);
  jest.mocked(remove).mockImplementation((async (target: { path: string }) => {
    order.push(`remove ${target.path}`);
  }) as never);
});
afterEach(() => jest.useRealTimers());

test('typing registers onDisconnect().remove() BEFORE writing true so it cannot get stuck', async () => {
  const controller = createTypingController('alice_bob', 'alice');
  controller.notify(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual([
    'onDisconnect.remove typing/alice_bob/alice',
    'set typing/alice_bob/alice',
  ]);
});

test('typing turns itself off after 3 seconds without typing and keeps extending while typing', async () => {
  const controller = createTypingController('alice_bob', 'alice');
  controller.notify(true);
  await jest.advanceTimersByTimeAsync(2000);
  controller.notify(true); // gõ tiếp: gia hạn, không ghi lại
  await jest.advanceTimersByTimeAsync(2000);
  expect(remove).not.toHaveBeenCalled();
  expect(set).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(TYPING_TIMEOUT_MS);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(jest.mocked(remove).mock.calls[0][0]).toEqual({
    path: 'typing/alice_bob/alice',
  });
});

test('clearing the text or stopping (send / leave screen) turns typing off immediately, once', async () => {
  const controller = createTypingController('alice_bob', 'alice');
  controller.notify(true);
  await jest.advanceTimersByTimeAsync(0);
  controller.notify(false);
  controller.stop();
  expect(remove).toHaveBeenCalledTimes(1);
  controller.stop();
  expect(remove).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(TYPING_TIMEOUT_MS * 2);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('viewing flag is set with onDisconnect and removed on cleanup', async () => {
  const leave = enterConversation('alice_bob', 'alice');
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual([
    'onDisconnect.remove viewing/alice_bob/alice',
    'set viewing/alice_bob/alice',
  ]);
  leave();
  expect(jest.mocked(remove).mock.calls[0][0]).toEqual({
    path: 'viewing/alice_bob/alice',
  });
});

test('nothing is written for a different signed-in account', async () => {
  const controller = createTypingController('alice_bob', 'alice');
  controller.notify(true);
  await jest.advanceTimersByTimeAsync(0);
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'mallory',
  };
  controller.stop();
  expect(remove).not.toHaveBeenCalled();
});
