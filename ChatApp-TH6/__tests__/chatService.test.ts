import {
  get,
  onValue,
  push,
  runTransaction,
  set,
  update,
} from 'firebase/database';
import { auth } from '../src/services/firebase';
import {
  fetchOlderMessages,
  markAsRead,
  PAGE_SIZE,
  parseMessage,
  recallMessage,
  sendImageMessage,
  sendLocationMessage,
  sendTextMessage,
  SendTarget,
  subscribeConversations,
  subscribeMessages,
  toggleReaction,
} from '../src/services/chatService';
import { getDirectConversationId } from '../src/utils/conversationId';
import { ChatMessage } from '../src/types';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
// Query helpers trả về mô tả thao tác để kiểm tra đúng câu truy vấn phân trang.
jest.mock('firebase/database', () => ({
  ref: (_database: unknown, path?: string) => ({ path: path || '/' }),
  query: (base: { path: string }, ...constraints: unknown[]) => ({
    path: base.path,
    constraints,
  }),
  orderByKey: () => ({ orderByKey: true }),
  limitToLast: (n: number) => ({ limitToLast: n }),
  startAt: (key: string) => ({ startAt: key }),
  endBefore: (key: string) => ({ endBefore: key }),
  get: jest.fn(),
  onValue: jest.fn(),
  push: jest.fn(),
  set: jest.fn(),
  runTransaction: jest.fn(),
  update: jest.fn(),
  increment: jest.fn((value: number) => ({ '.sv': { increment: value } })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

const alice = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatar: 'alice.png',
};
const direct: SendTarget = {
  convId: 'alice_bob',
  type: 'direct',
  members: ['alice', 'bob'],
};
const group: SendTarget = {
  convId: 'GRP0000000000000000X',
  type: 'group',
  name: 'Lớp CNTT',
  members: ['alice', 'bob', 'carol'],
  viewing: ['carol'],
};
const changesOf = () =>
  jest.mocked(update).mock.calls[0][1] as Record<string, unknown>;
const snapshot = (entries: [string, unknown][], exists = true) =>
  ({
    exists: () => exists,
    size: entries.length,
    forEach: (callback: (child: unknown) => void) =>
      entries.forEach(([key, value]) =>
        callback({ key, val: () => value }),
      ),
  } as unknown as Awaited<ReturnType<typeof get>>);
const stored = (extra: Record<string, unknown> = {}) => ({
  senderId: 'alice',
  type: 'text',
  text: 'hi',
  createdAt: 1,
  recalled: false,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  // Mặc định: bản ghi conversations đã tồn tại.
  jest.mocked(get).mockResolvedValue(snapshot([], true));
  jest
    .mocked(push)
    .mockReturnValue({ key: 'push-1' } as ReturnType<typeof push>);
  jest.mocked(update).mockResolvedValue(undefined);
  jest.mocked(set).mockResolvedValue(undefined);
});

test('direct conversation id is the same in both directions and invalid routes are rejected', () => {
  expect(getDirectConversationId('bob', 'alice')).toBe('alice_bob');
  expect(getDirectConversationId('alice', 'bob')).toBe('alice_bob');
  expect(() => getDirectConversationId('alice', 'alice')).toThrow();
  expect(() => getDirectConversationId('alice', 'bad/id')).toThrow();
});

test('one multi-path update writes message, lastMessage of all members and unread increment for receivers only', async () => {
  await sendTextMessage(alice, direct, '  Xin chào  ');
  expect(update).toHaveBeenCalledTimes(1);
  const changes = changesOf();
  expect(changes['messages/alice_bob/push-1']).toEqual({
    senderId: 'alice',
    type: 'text',
    text: 'Xin chào',
    createdAt: { '.sv': 'timestamp' },
    recalled: false,
  });
  expect(changes['userChats/alice/alice_bob/lastMessage']).toBe('Xin chào');
  expect(changes['userChats/bob/alice_bob/lastMessage']).toBe('Xin chào');
  expect(changes['userChats/bob/alice_bob/lastSenderId']).toBe('alice');
  expect(changes['userChats/bob/alice_bob/lastMessageId']).toBe('push-1');
  // increment(1) của máy chủ, không đọc giá trị cũ; người gửi không bị tăng.
  expect(changes['userChats/bob/alice_bob/unread']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(changes['userChats/alice/alice_bob/unread']).toBeUndefined();
  expect(runTransaction).not.toHaveBeenCalled();
});

test('first direct message also creates the conversation record in the same update', async () => {
  jest.mocked(get).mockResolvedValueOnce(snapshot([], false));
  await sendTextMessage(alice, { ...direct, convId: 'alice_dave', members: ['alice', 'dave'] }, 'hi');
  expect(changesOf()['conversations/alice_dave']).toMatchObject({
    type: 'direct',
    createdBy: 'alice',
    members: { alice: true, dave: true },
  });
});

test('notification is written only for members who are NOT inside the conversation', async () => {
  await sendTextMessage(alice, group, 'Cả nhóm ơi');
  const changes = changesOf();
  // carol đang mở chat → không có thông báo; bob thì có.
  expect(changes['notifications/carol/msg_GRP0000000000000000X']).toBeUndefined();
  expect(changes['notifications/bob/msg_GRP0000000000000000X']).toMatchObject({
    type: 'message',
    convId: 'GRP0000000000000000X',
    fromUid: 'alice',
    text: 'Alice: Cả nhóm ơi',
    read: false,
  });
  // Nhóm: unread riêng cho từng thành viên, tên nhóm ghi vào userChats.
  expect(changes['userChats/bob/GRP0000000000000000X/unread']).toBeDefined();
  expect(changes['userChats/carol/GRP0000000000000000X/unread']).toBeDefined();
  expect(changes['userChats/carol/GRP0000000000000000X/name']).toBe('Lớp CNTT');
  expect(changes['userChats/carol/GRP0000000000000000X/type']).toBe('group');
});

test('image and location messages store only URL/coordinates and show readable previews', async () => {
  await sendImageMessage(alice, group, 'https://res.cloudinary.com/demo/a.jpg');
  let changes = changesOf();
  expect(changes['messages/GRP0000000000000000X/push-1']).toMatchObject({
    type: 'image',
    imageUrl: 'https://res.cloudinary.com/demo/a.jpg',
    text: '',
  });
  expect(changes['userChats/bob/GRP0000000000000000X/lastMessage']).toBe(
    '📷 Hình ảnh',
  );
  jest.mocked(update).mockClear();
  await sendLocationMessage(alice, group, { latitude: 10.5, longitude: 106.7 });
  changes = changesOf();
  expect(changes['messages/GRP0000000000000000X/push-1']).toMatchObject({
    type: 'location',
    latitude: 10.5,
    longitude: 106.7,
  });
  expect(changes['userChats/bob/GRP0000000000000000X/lastMessage']).toBe(
    '📍 Vị trí',
  );
});

test('invalid image URL, empty text and non-members cannot send', async () => {
  await expect(sendImageMessage(alice, direct, 'file:///x.jpg')).rejects.toThrow(
    'không hợp lệ',
  );
  await expect(sendTextMessage(alice, direct, '   ')).rejects.toThrow('rỗng');
  await expect(
    sendTextMessage(alice, { ...group, members: ['bob', 'carol'] }, 'hi'),
  ).rejects.toThrow('thành viên');
  expect(update).not.toHaveBeenCalled();
});

test('reply keeps a short quote of the original message', async () => {
  await sendTextMessage(alice, direct, 'ok', {
    id: 'm0',
    senderId: 'bob',
    text: 'x'.repeat(300),
  });
  const message = changesOf()['messages/alice_bob/push-1'] as {
    replyTo: { id: string; text: string };
  };
  expect(message.replyTo.id).toBe('m0');
  expect(message.replyTo.text).toHaveLength(120);
});

test('first page uses limitToLast(20); after loading older pages the listener starts at the oldest loaded key', () => {
  jest.mocked(onValue).mockReturnValue(jest.fn());
  subscribeMessages('alice_bob', null, jest.fn(), jest.fn());
  subscribeMessages('alice_bob', 'key-100', jest.fn(), jest.fn());
  const [first, second] = jest.mocked(onValue).mock.calls.map(
    call => call[0] as unknown as { constraints: unknown[] },
  );
  expect(PAGE_SIZE).toBe(20);
  expect(first.constraints).toEqual([{ orderByKey: true }, { limitToLast: 20 }]);
  expect(second.constraints).toEqual([{ orderByKey: true }, { startAt: 'key-100' }]);
});

test('older page is fetched before the oldest key and reports whether more remain', async () => {
  const full = Array.from({ length: 20 }, (_, index) => [
    `k${String(index).padStart(2, '0')}`,
    stored({ createdAt: index + 1 }),
  ]) as [string, unknown][];
  jest.mocked(get).mockResolvedValueOnce(snapshot(full));
  const page = await fetchOlderMessages('alice_bob', 'k50');
  expect(jest.mocked(get).mock.calls[0][0]).toMatchObject({
    constraints: [{ orderByKey: true }, { endBefore: 'k50' }, { limitToLast: 20 }],
  });
  expect(page.messages).toHaveLength(20);
  expect(page.messages[0].id).toBe('k00');
  expect(page.hasMore).toBe(true);
  jest.mocked(get).mockResolvedValueOnce(snapshot(full.slice(0, 5)));
  expect((await fetchOlderMessages('alice_bob', 'k00')).hasMore).toBe(false);
});

test('parseMessage keeps reactions, recalled flag and quote, and drops malformed rows', () => {
  expect(
    parseMessage(
      'm1',
      stored({
        recalled: true,
        reactions: { bob: '❤️', carol: 3 },
        replyTo: { id: 'm0', senderId: 'bob', text: 'cũ' },
      }),
    ),
  ).toMatchObject({
    id: 'm1',
    recalled: true,
    reactions: { bob: '❤️' },
    replyTo: { id: 'm0' },
  });
  expect(parseMessage('m2', { senderId: 'a', type: 'bogus', createdAt: 1 })).toBeNull();
  expect(parseMessage('m3', stored({ createdAt: 'x' }))).toBeNull();
});

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  senderId: 'alice',
  type: 'text',
  text: 'hi',
  createdAt: 1,
  recalled: false,
  reactions: {},
  ...extra,
});

test('recall marks recalled:true without deleting the node and updates Home preview when it was the last message', async () => {
  jest.mocked(get).mockResolvedValueOnce(snapshot([['m1', stored()]]));
  await recallMessage(alice, 'alice_bob', ['alice', 'bob'], message());
  const changes = changesOf();
  expect(changes['messages/alice_bob/m1/recalled']).toBe(true);
  // Nội dung bị xóa nhưng node tin nhắn còn nguyên (không ghi null cho cả node).
  expect(changes['messages/alice_bob/m1']).toBeUndefined();
  expect(changes['messages/alice_bob/m1/text']).toBe('');
  expect(changes['userChats/alice/alice_bob/lastMessage']).toBe('Tin nhắn đã được thu hồi');
  expect(changes['userChats/bob/alice_bob/lastMessage']).toBe('Tin nhắn đã được thu hồi');
});

test('recalling an older message leaves the Home preview alone; others cannot recall your message', async () => {
  jest.mocked(get).mockResolvedValueOnce(snapshot([['m9', stored()]]));
  await recallMessage(alice, 'alice_bob', ['alice', 'bob'], message());
  expect(changesOf()['userChats/bob/alice_bob/lastMessage']).toBeUndefined();
  await expect(
    recallMessage(alice, 'alice_bob', ['alice', 'bob'], message({ senderId: 'bob' })),
  ).rejects.toThrow('chính mình');
});

test('reaction writes only my own uid and notifies the author; removing the same emoji clears both', async () => {
  const bobMessage = message({ senderId: 'bob' });
  await toggleReaction(alice, 'alice_bob', bobMessage, '❤️');
  let changes = changesOf();
  expect(changes['messages/alice_bob/m1/reactions/alice']).toBe('❤️');
  expect(Object.keys(changes).filter(key => key.includes('/reactions/'))).toEqual([
    'messages/alice_bob/m1/reactions/alice',
  ]);
  expect(changes['notifications/bob/react_m1_alice']).toMatchObject({
    type: 'reaction',
    fromUid: 'alice',
    text: 'Alice đã thả ❤️ vào tin nhắn của bạn',
  });
  jest.mocked(update).mockClear();
  await toggleReaction(alice, 'alice_bob', { ...bobMessage, reactions: { alice: '❤️' } }, '❤️');
  changes = changesOf();
  expect(changes['messages/alice_bob/m1/reactions/alice']).toBeNull();
  expect(changes['notifications/bob/react_m1_alice']).toBeNull();
  jest.mocked(update).mockClear();
  // Tự thả cảm xúc vào tin của mình: không tạo thông báo.
  await toggleReaction(alice, 'alice_bob', message(), '😂');
  expect(Object.keys(changesOf()).some(key => key.startsWith('notifications/'))).toBe(false);
});

test('unknown emoji and recalled messages are ignored', async () => {
  await toggleReaction(alice, 'alice_bob', message(), '🔥');
  await toggleReaction(alice, 'alice_bob', message({ recalled: true }), '👍');
  expect(update).not.toHaveBeenCalled();
});

test('markAsRead resets only my own unread counter and records the read time', async () => {
  jest.mocked(runTransaction).mockResolvedValue({} as never);
  await markAsRead('alice', 'alice_bob');
  expect(jest.mocked(runTransaction).mock.calls[0][0]).toEqual({
    path: 'userChats/alice/alice_bob/unread',
  });
  const reducer = jest.mocked(runTransaction).mock.calls[0][1] as (
    value: unknown,
  ) => unknown;
  expect(reducer(4)).toBe(0);
  expect(reducer(0)).toBeUndefined();
  expect(reducer(null)).toBeUndefined();
  expect(jest.mocked(set).mock.calls[0][0]).toEqual({
    path: 'readStatus/alice_bob/alice',
  });
});

test('Home list merges direct and group rows, sorted by newest message', () => {
  jest.mocked(onValue).mockImplementation(((_ref: unknown, callback: (s: unknown) => void) => {
    callback(
      snapshot([
        ['alice_bob', { type: 'direct', lastMessage: 'a', lastSenderId: 'bob', updatedAt: 100, unread: 2 }],
        ['GRP0000000000000000X', { type: 'group', name: 'Lớp', lastMessage: '📷 Hình ảnh', lastSenderId: 'carol', updatedAt: 300, unread: 5 }],
        ['alice_zed', { type: 'direct', lastMessage: 'z', updatedAt: 200 }],
        ['dave_erin', { type: 'direct', lastMessage: 'x', updatedAt: 999 }],
        ['broken', { type: 'group', updatedAt: 1 }],
      ]),
    );
    return jest.fn();
  }) as never);
  const received = jest.fn();
  subscribeConversations('alice', received, jest.fn());
  const rows = received.mock.calls[0][0];
  expect(rows.map((row: { id: string }) => row.id)).toEqual([
    'GRP0000000000000000X',
    'alice_zed',
    'alice_bob',
  ]);
  expect(rows[0]).toMatchObject({ type: 'group', name: 'Lớp', unreadCount: 5 });
  expect(rows[2]).toMatchObject({ type: 'direct', contactId: 'bob', unreadCount: 2 });
});
