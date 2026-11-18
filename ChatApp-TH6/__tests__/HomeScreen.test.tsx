import React from 'react';
import { FlatList, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { AppProvider } from '../src/context/AppContext';
import { ConversationItem } from '../src/components/chat/ConversationItem';
import { formatConversationTime } from '../src/utils/formatConversationTime';
import { HomeScreenProps, RealtimeConversation } from '../src/types';

let mockRows: RealtimeConversation[] = [];
let mockLoading = false;
let mockError = '';
const mockRetry = jest.fn();
jest.mock('../src/context/ConversationsContext', () => ({
  useConversations: () => ({
    conversations: mockRows,
    loading: mockLoading,
    error: mockError,
    retry: mockRetry,
  }),
}));
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ connected: true, currentUser: { uid: 'alice' } }),
}));
jest.mock('../src/context/UsersContext', () => ({
  useUsers: () => ({ getName: (uid: string) => (uid === 'bob' ? 'Bob' : uid) }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
let renderer: ReactTestRenderer;
const navigate = jest.fn();
const props = { navigation: { navigate } } as unknown as HomeScreenProps;
const view = () => (
  <AppProvider>
    <HomeScreen {...props} />
  </AppProvider>
);
const now = new Date(2026, 10, 4, 14, 0).getTime();
let intervals: jest.SpyInstance;
let clearIntervals: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(now);
  intervals = jest.spyOn(globalThis, 'setInterval');
  clearIntervals = jest.spyOn(globalThis, 'clearInterval');
  mockRows = [
    {
      id: 'alice_bob',
      type: 'direct',
      contactId: 'bob',
      name: 'Bob',
      avatar: 'b.png',
      lastMessage: '📍 Vị trí',
      lastSenderId: 'bob',
      lastMessageTime: now,
      unreadCount: 3,
      isOnline: true,
      statusKnown: true,
    },
    {
      id: 'alice_charlie',
      type: 'direct',
      contactId: 'charlie',
      name: 'Charlie',
      avatar: 'c.png',
      lastMessage: 'Hi',
      lastSenderId: 'alice',
      lastMessageTime: now - 86400000,
      unreadCount: 0,
      isOnline: false,
      statusKnown: true,
    },
  ];
  mockLoading = false;
  mockError = '';
  await act(async () => {
    renderer = create(view());
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('Home shows real previews, searches names and opens the correct chat', async () => {
  expect(renderer.root.findByType(FlatList).props.data[0].lastMessage).toBe(
    '📍 Vị trí',
  );
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText(' BOB '),
  );
  expect(renderer.root.findByType(FlatList).props.data).toHaveLength(1);
  expect(
    renderer.root.findByType(ConversationItem).props.conversation.unreadCount,
  ).toBe(3);
  await act(async () =>
    renderer.root.findByType(ConversationItem).props.onPress(),
  );
  expect(navigate).toHaveBeenCalledWith('Chat', {
    conversationId: 'alice_bob',
    type: 'direct',
    name: 'Bob',
    avatar: 'b.png',
    contactId: 'bob',
  });
});

test('error state offers retry and unmount clears the time refresh timer', async () => {
  mockRows = [];
  mockError = 'PERMISSION_DENIED';
  await act(async () => renderer.update(view()));
  const retryButton = renderer.root
    .findAllByType(TouchableOpacity)
    .find(
      button =>
        button.props.accessibilityRole === 'button' &&
        !button.props.accessibilityLabel,
    )!;
  await act(async () => retryButton.props.onPress());
  expect(mockRetry).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  const clockIndex = intervals.mock.calls.findIndex(call => call[1] === 60000);
  expect(clockIndex).toBeGreaterThanOrEqual(0);
  expect(clearIntervals).toHaveBeenCalledWith(
    intervals.mock.results[clockIndex].value,
  );
});

test('conversation time uses today, yesterday, and dd/MM across month/year boundaries', () => {
  expect(
    formatConversationTime(new Date(2026, 10, 4, 9, 5).getTime(), now),
  ).toBe('09:05');
  expect(
    formatConversationTime(new Date(2026, 10, 3, 23, 0).getTime(), now),
  ).toBe('Hôm qua');
  expect(formatConversationTime(new Date(2026, 9, 30).getTime(), now)).toBe(
    '30/10',
  );
  expect(
    formatConversationTime(
      new Date(2025, 11, 31, 23).getTime(),
      new Date(2026, 0, 1, 1).getTime(),
    ),
  ).toBe('Hôm qua');
  expect(formatConversationTime(Number.NaN, now)).toBe('');
});

test('Home lists groups with 1-1 chats, shows previews for image/recalled and opens a group chat', async () => {
  mockRows = [
    {
      id: 'groupKey',
      type: 'group',
      name: 'Lớp CNTT',
      avatar: 'g.png',
      lastMessage: '📷 Hình ảnh',
      lastSenderId: 'bob',
      lastMessageTime: now,
      unreadCount: 2,
      isOnline: false,
      statusKnown: false,
    },
    ...mockRows,
  ];
  await act(async () => renderer.update(view()));
  const items = renderer.root.findAllByType(ConversationItem);
  expect(items).toHaveLength(3);
  // Tin cuối trong nhóm có tên người gửi; chat 1-1 tin của mình có "Bạn:".
  const flatten = (node: ReturnType<typeof items[0]['findAllByType']>) =>
    node.map(text => [].concat(text.props.children).join(''));
  expect(
    flatten(items[0].findAllByType(require('react-native').Text)).some(text =>
      text.includes('Bob: 📷 Hình ảnh'),
    ),
  ).toBe(true);
  expect(
    flatten(items[2].findAllByType(require('react-native').Text)).some(text =>
      text.includes('Bạn: Hi'),
    ),
  ).toBe(true);
  await act(async () => items[0].props.onPress());
  expect(navigate).toHaveBeenCalledWith('Chat', {
    conversationId: 'groupKey',
    type: 'group',
    name: 'Lớp CNTT',
    avatar: 'g.png',
    contactId: undefined,
  });
});
