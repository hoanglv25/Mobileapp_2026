import React from 'react';
import { Alert, FlatList, Switch, Text, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppProvider } from '../src/context/AppContext';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import { NotificationItem } from '../src/components/notification/NotificationItem';
import {
  AppNotification,
  NotificationsScreenProps,
} from '../src/types';

let mockList: AppNotification[] = [];
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
jest.mock('../src/context/NotificationsContext', () => ({
  useNotifications: () => ({
    notifications: mockList,
    unreadCount: mockList.filter(item => !item.read).length,
    loading: false,
    error: '',
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
  }),
}));
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'alice' } }),
}));
jest.mock('../src/context/UsersContext', () => ({
  useUsers: () => ({
    getName: (uid: string) => (uid === 'bob' ? 'Bob' : uid),
    getAvatar: () => 'bob.png',
  }),
  groupAvatarUri: (name: string) => `group:${name}`,
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');

const navigate = jest.fn();
const props = { navigation: { navigate } } as unknown as NotificationsScreenProps;
let renderer: ReactTestRenderer;
const note = (id: string, extra: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: 'message',
  convId: 'alice_bob',
  fromUid: 'bob',
  fromName: 'Bob',
  text: 'Xin chào',
  createdAt: Date.now(),
  read: false,
  ...extra,
});
const mount = async () => {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <NotificationsScreen {...props} />
      </AppProvider>,
    );
  });
};
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => [].concat(node.props.children).join(''));

beforeEach(() => {
  jest.clearAllMocks();
  mockMarkRead.mockResolvedValue(undefined);
  mockMarkAllRead.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockList = [
    note('msg_alice_bob'),
    note('g1', {
      type: 'group_add',
      convId: 'GRPKEY00000000000000',
      text: 'Bob đã thêm bạn vào nhóm "Lớp"',
      read: true,
    }),
    note('r1', {
      type: 'reaction',
      text: 'Bob đã thả ❤️ vào tin nhắn của bạn',
    }),
  ];
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('shows real notifications (message, group, reaction) instead of mock data', async () => {
  await mount();
  expect(renderer.root.findAllByType(NotificationItem)).toHaveLength(3);
  expect(texts()).toEqual(
    expect.arrayContaining([
      'Tin nhắn mới từ Bob',
      'Bạn được thêm vào nhóm',
      'Cảm xúc mới',
      'Bob đã thả ❤️ vào tin nhắn của bạn',
    ]),
  );
});

test('tapping a direct notification marks it read and opens that exact conversation', async () => {
  await mount();
  await act(async () =>
    renderer.root.findAllByType(NotificationItem)[0].props.onPress(),
  );
  expect(mockMarkRead).toHaveBeenCalledWith(['msg_alice_bob']);
  expect(navigate).toHaveBeenCalledWith('Chat', {
    conversationId: 'alice_bob',
    type: 'direct',
    name: 'Bob',
    avatar: 'bob.png',
    contactId: 'bob',
  });
});

test('tapping a group notification opens the group chat; an already-read one is not marked again', async () => {
  await mount();
  await act(async () =>
    renderer.root.findAllByType(NotificationItem)[1].props.onPress(),
  );
  expect(mockMarkRead).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith(
    'Chat',
    expect.objectContaining({
      conversationId: 'GRPKEY00000000000000',
      type: 'group',
    }),
  );
});

test('"Đánh dấu tất cả đã đọc" marks everything and is disabled when nothing is unread', async () => {
  await mount();
  const readAll = () =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(item => item.props.disabled !== undefined)!;
  expect(texts()).toContain('Đánh dấu tất cả đã đọc');
  expect(readAll().props.disabled).toBe(false);
  await act(async () => readAll().props.onPress());
  expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  mockList = mockList.map(item => ({ ...item, read: true }));
  await act(async () =>
    renderer.update(
      <AppProvider>
        <NotificationsScreen {...props} />
      </AppProvider>,
    ),
  );
  expect(readAll().props.disabled).toBe(true);
});

test('the unread-only switch filters the list', async () => {
  await mount();
  await act(async () =>
    renderer.root.findByType(Switch).props.onValueChange(true),
  );
  expect(renderer.root.findByType(FlatList).props.data.map((item: AppNotification) => item.id)).toEqual([
    'msg_alice_bob',
    'r1',
  ]);
});

test('a failing mark-read is reported instead of being swallowed', async () => {
  mockMarkRead.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
  await mount();
  await act(async () =>
    renderer.root.findAllByType(NotificationItem)[0].props.onMarkRead(),
  );
  expect(Alert.alert).toHaveBeenCalledWith(
    'Không cập nhật được thông báo',
    'PERMISSION_DENIED',
  );
});
