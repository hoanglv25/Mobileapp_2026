import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  ConversationsProvider,
  useConversations,
} from '../src/context/ConversationsContext';
import { subscribeConversationList } from '../src/services/chatService';
import { RealtimeConversation } from '../src/types';

let mockUid: string | undefined = 'alice';
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }),
}));
jest.mock('../src/services/chatService', () => ({
  subscribeConversationList: jest.fn(),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));

let state: ReturnType<typeof useConversations>;
let renderer: ReactTestRenderer;
let subscriptions: {
  callback: (rows: RealtimeConversation[]) => void;
  error: (error: Error) => void;
  unsubscribe: jest.Mock;
}[];
const observations: number[] = [];
function Probe() {
  state = useConversations();
  observations.push(state.totalUnreadCount);
  return null;
}
const view = () => (
  <ConversationsProvider>
    <Probe />
  </ConversationsProvider>
);
function row(partner: string, unreadCount: number): RealtimeConversation {
  return {
    id: `alice_${partner}`,
    chatId: `alice_${partner}`,
    contactId: partner,
    name: partner,
    avatar: '',
    lastMessage: 'Hello',
    lastMessageTime: 100,
    unreadCount,
    isOnline: false,
    statusKnown: false,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockUid = 'alice';
  subscriptions = [];
  observations.length = 0;
  jest
    .mocked(subscribeConversationList)
    .mockImplementation((_uid, callback, error) => {
      const entry = { callback, error, unsubscribe: jest.fn() };
      subscriptions.push(entry);
      return entry.unsubscribe;
    });
  await act(async () => {
    renderer = create(view());
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('active chat stays at zero while a new unread snapshot is waiting for server reset', async () => {
  await act(async () =>
    subscriptions[0].callback([row('bob', 3), row('charlie', 2)]),
  );
  expect(state.totalUnreadCount).toBe(5);
  let deactivate!: () => void;
  await act(async () => {
    deactivate = state.activateChat('bob');
  });
  observations.length = 0;
  await act(async () =>
    subscriptions[0].callback([row('bob', 4), row('charlie', 2)]),
  );
  expect(state.conversations[0].unreadCount).toBe(0);
  expect(state.totalUnreadCount).toBe(2);
  expect(observations.every(value => value === 2)).toBe(true);
  await act(async () =>
    subscriptions[0].callback([row('bob', 0), row('charlie', 2)]),
  );
  await act(async () => deactivate());
  expect(state.totalUnreadCount).toBe(2);
});

test('old screen cleanup cannot clear the active state of the next chat', async () => {
  await act(async () =>
    subscriptions[0].callback([row('bob', 3), row('charlie', 2)]),
  );
  let oldCleanup!: () => void;
  let newCleanup!: () => void;
  await act(async () => {
    oldCleanup = state.activateChat('bob');
  });
  await act(async () => {
    newCleanup = state.activateChat('charlie');
  });
  await act(async () => oldCleanup());
  expect(state.totalUnreadCount).toBe(3);
  await act(async () => newCleanup());
  expect(state.totalUnreadCount).toBe(5);
});

test('changing account clears data and ignores callbacks from the previous account', async () => {
  await act(async () => subscriptions[0].callback([row('bob', 3)]));
  mockUid = 'david';
  await act(async () => renderer.update(view()));
  expect(state.conversations).toEqual([]);
  expect(state.totalUnreadCount).toBe(0);
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => subscriptions[0].callback([row('bob', 20)]));
  expect(state.conversations).toEqual([]);
  await act(async () => subscriptions[1].callback([]));
  expect(state.loading).toBe(false);
});

test('permission failure exposes an error and retry replaces the failed listener', async () => {
  await act(async () =>
    subscriptions[0].error(new Error('Không có quyền đọc')),
  );
  expect(state.error).toBe('Không có quyền đọc');
  expect(state.loading).toBe(false);
  await act(async () => state.retry());
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  expect(state.loading).toBe(true);
  await act(async () => subscriptions[1].callback([row('bob', 1)]));
  expect(state.error).toBe('');
  expect(state.totalUnreadCount).toBe(1);
});
