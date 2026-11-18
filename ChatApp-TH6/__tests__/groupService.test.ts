import { push, set, update } from 'firebase/database';
import { auth } from '../src/services/firebase';
import {
  addGroupMembers,
  createGroup,
  leaveGroup,
  removeGroupMember,
  renameGroup,
} from '../src/services/groupService';

jest.mock('../src/services/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
  database: {},
}));
jest.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path: path || '/' }),
  push: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  increment: jest.fn((value: number) => ({ '.sv': { increment: value } })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

const alice = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'a@x.com',
  avatar: '',
};
let keys: string[];
const changes = (call = 0) =>
  jest.mocked(update).mock.calls[call][1] as Record<string, any>;

beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'alice',
  };
  keys = ['GROUPKEY', 'sys1', 'n1', 'n2', 'n3', 'n4'];
  jest.mocked(push).mockImplementation((() => ({ key: keys.shift() })) as never);
  jest.mocked(set).mockResolvedValue(undefined);
  jest.mocked(update).mockResolvedValue(undefined);
});

test('a group needs a name and at least 2 members besides yourself', async () => {
  await expect(createGroup(alice, '   ', ['bob', 'carol'])).rejects.toThrow(
    'tên nhóm',
  );
  await expect(createGroup(alice, 'Lớp', ['bob'])).rejects.toThrow('ít nhất 2');
  // Chính mình và trùng lặp không được tính.
  await expect(
    createGroup(alice, 'Lớp', ['alice', 'bob', 'bob']),
  ).rejects.toThrow('ít nhất 2');
  expect(set).not.toHaveBeenCalled();
});

test('create group: conversation record first, then ONE multi-path update with system message, userChats and notifications', async () => {
  const id = await createGroup(alice, '  Lớp CNTT ', ['bob', 'carol']);
  expect(id).toBe('GROUPKEY');
  expect(jest.mocked(set).mock.calls[0][1]).toEqual({
    type: 'group',
    name: 'Lớp CNTT',
    members: { alice: true, bob: true, carol: true },
    createdBy: 'alice',
    createdAt: { '.sv': 'timestamp' },
  });
  expect(update).toHaveBeenCalledTimes(1);
  const c = changes();
  expect(c['messages/GROUPKEY/sys1']).toMatchObject({
    senderId: 'alice',
    type: 'system',
    text: 'Alice đã tạo nhóm "Lớp CNTT"',
  });
  ['alice', 'bob', 'carol'].forEach(uid => {
    expect(c[`userChats/${uid}/GROUPKEY/name`]).toBe('Lớp CNTT');
    expect(c[`userChats/${uid}/GROUPKEY/type`]).toBe('group');
  });
  // Mỗi thành viên có số chưa đọc RIÊNG; người tạo thì không.
  expect(c['userChats/bob/GROUPKEY/unread']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(c['userChats/carol/GROUPKEY/unread']).toEqual({
    '.sv': { increment: 1 },
  });
  expect(c['userChats/alice/GROUPKEY/unread']).toBeUndefined();
  // Được thêm vào nhóm → thông báo cho từng người (trừ người tạo).
  expect(c['notifications/bob/n1']).toMatchObject({
    type: 'group_add',
    convId: 'GROUPKEY',
    fromUid: 'alice',
    read: false,
  });
  expect(c['notifications/carol/n2']).toBeDefined();
  expect(
    Object.keys(c).some(key => key.startsWith('notifications/alice')),
  ).toBe(false);
});

test('rename posts a system message and updates the group name for every member', async () => {
  await renameGroup(alice, 'G', ['alice', 'bob', 'carol'], 'Cũ', 'Mới');
  const c = changes();
  expect(c['conversations/G/name']).toBe('Mới');
  expect(c['userChats/bob/G/name']).toBe('Mới');
  expect(c['messages/G/GROUPKEY']).toMatchObject({
    text: 'Alice đã đổi tên nhóm thành "Mới"',
  });
  jest.mocked(update).mockClear();
  await renameGroup(alice, 'G', ['alice'], 'Mới', 'Mới');
  expect(update).not.toHaveBeenCalled();
});

test('leaving removes my membership and chat entry and tells the others "A đã rời nhóm"', async () => {
  await leaveGroup(alice, 'G', 'Lớp', ['alice', 'bob', 'carol'], 'alice');
  const c = changes();
  expect(c['conversations/G/members/alice']).toBeNull();
  expect(c['userChats/alice/G']).toBeNull();
  expect(c['messages/G/GROUPKEY']).toMatchObject({
    type: 'system',
    text: 'Alice đã rời nhóm',
  });
  expect(c['userChats/bob/G/lastMessage']).toBe('Alice đã rời nhóm');
  expect(c['userChats/alice/G/lastMessage']).toBeUndefined();
  // Người tạo rời nhóm thì quyền quản trị chuyển cho người kế tiếp.
  expect(c['conversations/G/createdBy']).toBe('bob');
});

test('admin removes a member: membership and chat entry are cleared', async () => {
  await removeGroupMember(
    alice,
    'G',
    'Lớp',
    ['alice', 'bob', 'carol'],
    'carol',
    'Carol',
  );
  const c = changes();
  expect(c['conversations/G/members/carol']).toBeNull();
  expect(c['userChats/carol/G']).toBeNull();
  expect(c['messages/G/GROUPKEY'].text).toBe('Alice đã xóa Carol khỏi nhóm');
});

test('adding members is two steps (membership first) and notifies only the new people', async () => {
  await addGroupMembers(alice, 'G', 'Lớp', ['alice', 'bob'], ['bob', 'dave'], {
    dave: 'Dave',
  });
  expect(update).toHaveBeenCalledTimes(2);
  expect(changes(0)).toEqual({ 'conversations/G/members/dave': true });
  const second = changes(1);
  expect(second['userChats/dave/G/name']).toBe('Lớp');
  expect(second['messages/G/GROUPKEY'].text).toBe(
    'Alice đã thêm Dave vào nhóm',
  );
  expect(
    Object.keys(second).filter(key => key.startsWith('notifications/')),
  ).toEqual([expect.stringMatching(/^notifications\/dave\//)]);
});

test('operations are refused after the account changed', async () => {
  (auth as unknown as { currentUser: { uid: string } }).currentUser = {
    uid: 'mallory',
  };
  await expect(createGroup(alice, 'Lớp', ['bob', 'carol'])).rejects.toThrow(
    'Phiên đăng nhập',
  );
  await expect(
    leaveGroup(alice, 'G', 'Lớp', ['alice', 'bob'], 'alice'),
  ).rejects.toThrow('Phiên đăng nhập');
});
