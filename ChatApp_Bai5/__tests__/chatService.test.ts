import {
  get,
  increment,
  onValue,
  push,
  runTransaction,
  update,
} from 'firebase/database';
import { auth } from '../src/services/firebase';
import {
  getChatId,
  markAsRead,
  sendTextMessage,
  sendLocationMessage,
  subscribeMessages,
  subscribeConversations,
  subscribeConversationList,
} from '../src/services/chatService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path?: string) => ({ path: path || '/' }),
  get: jest.fn(),
  onValue: jest.fn(),
  push: jest.fn(),
  runTransaction: jest.fn(),
  update: jest.fn(),
  increment: jest.fn((value: number) => ({ '.sv': { increment: value } })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));
const sender = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatar: 'alice.png',
};

beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  jest.mocked(get).mockResolvedValue({
    exists: () => true,
    val: () => ({ displayName: 'Bob', avatar: 'bob.png' }),
  } as unknown as Awaited<ReturnType<typeof get>>);
  jest
    .mocked(push)
    .mockReturnValue({ key: 'push-1' } as ReturnType<typeof push>);
  jest.mocked(update).mockResolvedValue(undefined);
});

test('chat ID is the same in both directions and invalid routes are rejected', () => {
  expect(getChatId('bob', 'alice')).toBe('alice_bob');
  expect(getChatId('alice', 'bob')).toBe('alice_bob');
  expect(() => getChatId('alice', 'alice')).toThrow();
  expect(() => getChatId('alice', 'bad/id')).toThrow();
});

test('one atomic update writes the message, both previews and receiver increment only', async () => {
  await sendTextMessage(sender, 'bob', '  Xin chào  ');
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual({
    id: 'push-1',
    senderId: 'alice',
    receiverId: 'bob',
    type: 'text',
    text: 'Xin chào',
    createdAt: { '.sv': 'timestamp' },
  });
  expect(changes['userChats/alice/bob/name']).toBe('Bob');
  expect(changes['userChats/bob/alice/name']).toBe('Alice');
  expect(changes['userChats/alice/bob/lastMessage']).toBe('Xin chào');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(increment).toHaveBeenCalledWith(1);
  expect(changes).not.toHaveProperty('userChats/alice/bob/unreadCount');
  expect(changes).not.toHaveProperty('userChats/bob/alice');
});

test('blank text, nonexistent recipient and a changed session never write a message', async () => {
  await expect(sendTextMessage(sender, 'bob', ' \n ')).rejects.toThrow('rỗng');
  expect(get).not.toHaveBeenCalled();
  jest
    .mocked(get)
    .mockResolvedValueOnce({ exists: () => false } as Awaited<
      ReturnType<typeof get>
    >);
  await expect(sendTextMessage(sender, 'missing', 'Hello')).rejects.toThrow(
    'không tồn tại',
  );
  jest.mocked(get).mockImplementationOnce(async () => {
    (auth as unknown as { currentUser: { uid: string } }).currentUser = {
      uid: 'charlie',
    };
    return { exists: () => true, val: () => ({}) } as Awaited<
      ReturnType<typeof get>
    >;
  });
  await expect(sendTextMessage(sender, 'bob', 'Hello')).rejects.toThrow(
    'Phiên đăng nhập',
  );
  expect(update).not.toHaveBeenCalled();
});

test('snapshots use push keys as IDs, sort by time, replace history and propagate unsubscribe/errors', () => {
  let listener!: (snapshot: unknown) => void;
  const unsubscribe = jest.fn();
  const report = jest.fn();
  jest.mocked(onValue).mockImplementation((_ref, callback) => {
    listener = callback as unknown as typeof listener;
    return unsubscribe;
  });
  const receive = jest.fn();
  expect(subscribeMessages('alice_bob', receive, report)).toBe(unsubscribe);
  const rows = [
    {
      key: 'b',
      val: () => ({
        id: 'wrong-id',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'second',
        createdAt: 20,
      }),
    },
    {
      key: 'a',
      val: () => ({
        senderId: 'alice',
        receiverId: 'bob',
        type: 'text',
        text: 'first',
        createdAt: 10,
      }),
    },
    { key: 'bad', val: () => ({ text: 'malformed' }) },
  ];
  const snapshot = {
    forEach: (callback: (row: (typeof rows)[number]) => void) =>
      rows.forEach(callback),
  };
  listener(snapshot);
  listener(snapshot);
  expect(
    receive.mock.lastCall[0].map((item: { id: string }) => item.id),
  ).toEqual(['a', 'b']);
  const onError = jest.mocked(onValue).mock.calls[0][2] as (
    error: Error,
  ) => void;
  const denied = new Error('PERMISSION_DENIED');
  onError(denied);
  expect(report).toHaveBeenCalledWith(denied);
});

test('markAsRead only resets the current user counter, without creating empty chats', async () => {
  jest
    .mocked(runTransaction)
    .mockResolvedValue({ committed: true } as Awaited<
      ReturnType<typeof runTransaction>
    >);
  await markAsRead('alice', 'bob');
  const [reference, change, options] =
    jest.mocked(runTransaction).mock.calls[0];
  expect(reference).toEqual({ path: 'userChats/alice/bob/unreadCount' });
  expect(change(4)).toBe(0);
  expect(change(0)).toBeUndefined();
  expect(change(null)).toBeUndefined();
  expect(options).toEqual({ applyLocally: false });
  await expect(markAsRead('bob', 'alice')).rejects.toThrow('Phiên đăng nhập');
});

test('location uses the atomic message path and location preview for both participants', async () => {
  await sendLocationMessage(sender, 'bob', { latitude: 0, longitude: 106.6 });
  expect(update).toHaveBeenCalledTimes(1);
  const changes = jest.mocked(update).mock.calls[0][1] as Record<
    string,
    unknown
  >;
  expect(changes['messages/alice_bob/push-1']).toEqual(
    expect.objectContaining({
      type: 'location',
      text: '📍 Vị trí',
      latitude: 0,
      longitude: 106.6,
    }),
  );
  expect(changes['userChats/alice/bob/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/lastMessage']).toBe('📍 Vị trí');
  expect(changes['userChats/bob/alice/unreadCount']).toEqual({
    '.sv': { increment: 1 },
  });
});

test('invalid coordinates cannot create a Firebase write', async () => {
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 91, longitude: 0 }),
  ).rejects.toThrow('Tọa độ');
  await expect(
    sendLocationMessage(sender, 'bob', { latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(update).not.toHaveBeenCalled();
});

test('subscribes only to own userChats, normalizes unread and sorts newest first', () => {
  let receiveSnapshot!: (snapshot: unknown) => void;
  const cleanup = jest.fn();
  jest.mocked(onValue).mockImplementation((_reference, callback) => {
    receiveSnapshot = callback as unknown as typeof receiveSnapshot;
    return cleanup;
  });
  const receive = jest.fn();
  expect(subscribeConversations('alice', receive, jest.fn())).toBe(cleanup);
  expect(jest.mocked(onValue).mock.calls[0][0]).toEqual({
    path: 'userChats/alice',
  });
  const data = {
    bob: {
      chatId: 'alice_bob',
      contactId: 'bob',
      lastMessage: 'Older',
      lastMessageTime: 10,
      unreadCount: 3.8,
    },
    charlie: {
      chatId: 'alice_charlie',
      contactId: 'charlie',
      lastMessage: '📍 Vị trí',
      lastMessageTime: 20,
    },
    bad: {
      chatId: 'someone_else',
      contactId: 'bad',
      lastMessage: 'Bad',
      lastMessageTime: 30,
    },
    empty: { unreadCount: 0 },
  };
  receiveSnapshot({
    forEach: (callback: (child: unknown) => void) =>
      Object.entries(data).forEach(([key, value]) =>
        callback({ key, val: () => value }),
      ),
  });
  expect(
    receive.mock.lastCall[0].map(
      (item: { contactId: string }) => item.contactId,
    ),
  ).toEqual(['charlie', 'bob']);
  expect(
    receive.mock.lastCall[0].map(
      (item: { unreadCount: number }) => item.unreadCount,
    ),
  ).toEqual([0, 3]);
});

test('conversation status listeners are reused, removed and cleaned up without reading /status', () => {
  const listeners = new Map<
    string,
    { value: (snapshot: unknown) => void; unsubscribe: jest.Mock }
  >();
  jest.mocked(onValue).mockImplementation((reference, callback) => {
    const entry = {
      value: callback as unknown as (snapshot: unknown) => void,
      unsubscribe: jest.fn(),
    };
    listeners.set((reference as unknown as { path: string }).path, entry);
    return entry.unsubscribe;
  });
  const receive = jest.fn();
  const cleanup = subscribeConversationList('alice', receive, jest.fn());
  const snapshot = (name: string) => ({
    forEach: (callback: (child: unknown) => void) =>
      callback({
        key: 'bob',
        val: () => ({
          chatId: 'alice_bob',
          contactId: 'bob',
          name,
          lastMessage: 'Hi',
          lastMessageTime: 10,
        }),
      }),
  });
  listeners.get('userChats/alice')!.value(snapshot('Bob'));
  listeners
    .get('status/bob')!
    .value({ val: () => ({ isOnline: true, lastChanged: 100 }) });
  listeners.get('userChats/alice')!.value(snapshot('Bobby'));
  expect(onValue).toHaveBeenCalledTimes(2);
  expect(listeners.has('status')).toBe(false);
  expect(receive.mock.lastCall[0][0]).toEqual(
    expect.objectContaining({
      name: 'Bobby',
      isOnline: true,
      statusKnown: true,
    }),
  );
  const oldStatus = listeners.get('status/bob')!;
  listeners.get('userChats/alice')!.value({ forEach: () => {} });
  expect(oldStatus.unsubscribe).toHaveBeenCalledTimes(1);
  const calls = receive.mock.calls.length;
  oldStatus.value({ val: () => ({ isOnline: true }) });
  expect(receive).toHaveBeenCalledTimes(calls);
  cleanup();
  expect(listeners.get('userChats/alice')!.unsubscribe).toHaveBeenCalledTimes(
    1,
  );
});
