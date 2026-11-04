import React from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppProvider } from '../src/context/AppContext';
import { ChatScreen } from '../src/screens/ChatScreen';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import * as chat from '../src/services/chatService';
import { subscribeStatus } from '../src/services/userService';
import {
  getCurrentLocation,
  showLocationError,
} from '../src/services/locationService';
import { ChatMessage, ChatScreenProps } from '../src/types';

let mockFocused = true;
const mockActivateChat = jest.fn(() => jest.fn());
jest.mock('../src/context/ConversationsContext', () => {
  return { useConversations: () => ({ activateChat: mockActivateChat }) };
});
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      uid: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      avatar: 'alice.png',
    },
    connected: true,
  }),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock('../src/services/userService', () => ({
  subscribeStatus: jest.fn(),
}));
jest.mock('../src/services/chatService', () => ({
  getChatId: (a: string, b: string) => [a, b].sort().join('_'),
  subscribeMessages: jest.fn(),
  subscribeUnreadCount: jest.fn(),
  sendTextMessage: jest.fn(),
  sendLocationMessage: jest.fn(),
  markAsRead: jest.fn(),
  MAX_MESSAGE_LENGTH: 2000,
}));
jest.mock('../src/services/locationService', () => ({
  getCurrentLocation: jest.fn(),
  showLocationError: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (messages: ChatMessage[]) => void;
let unread: (count: number) => void;
let changeAppState: (state: AppStateStatus) => void;
let publishStatus: Parameters<typeof subscribeStatus>[1];
const unsubscribeMessages = jest.fn();
const unsubscribeStatus = jest.fn();
const unsubscribeUnread = jest.fn();
const removeState = jest.fn();
const props = {
  route: {
    params: { contactId: 'bob', contactName: 'Bob', contactAvatar: 'bob.png' },
  },
  navigation: { goBack: jest.fn() },
} as unknown as ChatScreenProps;
const view = (screenProps = props) => (
  <AppProvider>
    <ChatScreen {...screenProps} />
  </AppProvider>
);
function sendButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi tin nhắn')!;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocused = true;
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changeAppState = callback;
      return { remove: removeState };
    });
  jest.mocked(chat.subscribeMessages).mockImplementation((_id, callback) => {
    publish = callback;
    return unsubscribeMessages;
  });
  jest
    .mocked(chat.subscribeUnreadCount)
    .mockImplementation((_uid, _partner, callback) => {
      unread = callback;
      return unsubscribeUnread;
    });
  jest.mocked(subscribeStatus).mockImplementation((_uid, callback) => {
    publishStatus = callback;
    return unsubscribeStatus;
  });
  jest.mocked(chat.markAsRead).mockResolvedValue(undefined);
  jest.mocked(chat.sendTextMessage).mockResolvedValue(undefined);
  jest.mocked(chat.sendLocationMessage).mockResolvedValue(undefined);
  await act(async () => {
    renderer = create(view());
  });
  await act(async () => publish([]));
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('repeated snapshots do not duplicate rows and bubble sides use real UIDs', async () => {
  const messages: ChatMessage[] = [
    {
      id: '1',
      senderId: 'alice',
      receiverId: 'bob',
      type: 'text',
      text: 'Hello',
      createdAt: 10,
    },
    {
      id: '2',
      senderId: 'bob',
      receiverId: 'alice',
      type: 'text',
      text: 'Hi',
      createdAt: 20,
    },
  ];
  await act(async () => {
    publish(messages);
    publish(messages);
  });
  expect(renderer.root.findByType(FlatList).props.data).toHaveLength(2);
  expect(
    renderer.root.findAllByType(MessageBubble).map(bubble => bubble.props.isMe),
  ).toEqual([true, false]);
});

test('blocks blank/duplicate sends, trims text and retains draft on a failed write', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('   '),
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText(' Hello '),
  );
  let fail!: (error: Error) => void;
  jest.mocked(chat.sendTextMessage).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const press = sendButton().props.onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(chat.sendTextMessage).toHaveBeenCalledTimes(1);
  expect(chat.sendTextMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    'Hello',
  );
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    fail(new Error('PERMISSION_DENIED'));
    await pending;
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe(' Hello ');
  await act(async () => {
    await sendButton().props.onPress();
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
});

test('resets unread on open/new counter, stops reading on blur and resumes on focus', async () => {
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await act(async () => renderer.update(view()));
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(2));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => renderer.update(view()));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

test('switching partners empties history, cleans subscriptions and ignores late old snapshots', async () => {
  const oldPublish = publish;
  const next = {
    ...props,
    route: {
      ...props.route,
      params: {
        contactId: 'charlie',
        contactName: 'Charlie',
        contactAvatar: 'c.png',
      },
    },
  } as ChatScreenProps;
  await act(async () => renderer.update(view(next)));
  expect(unsubscribeMessages).toHaveBeenCalledTimes(1);
  expect(unsubscribeStatus).toHaveBeenCalledTimes(1);
  expect(unsubscribeUnread).toHaveBeenCalledTimes(1);
  expect(removeState).toHaveBeenCalledTimes(1);
  await act(async () =>
    oldPublish([
      {
        id: 'old',
        senderId: 'bob',
        receiverId: 'alice',
        type: 'text',
        text: 'Old',
        createdAt: 1,
      },
    ]),
  );
  expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
});

test('background suspends markAsRead and partner status updates the header', async () => {
  await act(async () => publishStatus({ isOnline: false, lastChanged: 1 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Ngoại tuyến'),
  ).toBe(true);
  await act(async () => publishStatus({ isOnline: true, lastChanged: 2 }));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Đang hoạt động'),
  ).toBe(true);
  await act(async () => changeAppState('background'));
  jest.mocked(chat.markAsRead).mockClear();
  await act(async () => unread(1));
  expect(chat.markAsRead).not.toHaveBeenCalled();
  await act(async () => changeAppState('active'));
  expect(chat.markAsRead).toHaveBeenCalledWith('alice', 'bob');
});

function locationButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityLabel === 'Gửi vị trí hiện tại')!;
}

test('location loading blocks duplicate sends, sends coordinates and preserves text draft', async () => {
  await act(async () =>
    renderer.root.findByType(TextInput).props.onChangeText('Draft'),
  );
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  const press = locationButton().props.onPress;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(getCurrentLocation).toHaveBeenCalledTimes(1);
  expect(locationButton().props.disabled).toBe(true);
  expect(sendButton().props.disabled).toBe(true);
  await act(async () => {
    locate({ latitude: 10.7, longitude: 106.6 });
    await pending;
  });
  expect(chat.sendLocationMessage).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'alice' }),
    'bob',
    { latitude: 10.7, longitude: 106.6 },
  );
  expect(renderer.root.findByType(TextInput).props.value).toBe('Draft');
});

test('location refusal shows guidance and never writes a message', async () => {
  const denied = new Error('Quyền vị trí bị từ chối');
  jest.mocked(getCurrentLocation).mockRejectedValueOnce(denied);
  await act(async () => {
    await locationButton().props.onPress();
  });
  expect(showLocationError).toHaveBeenCalledWith(denied);
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
  expect(locationButton().props.disabled).toBe(false);
});

test('leaving Chat while GPS is pending does not send a location later', async () => {
  let locate!: (point: { latitude: number; longitude: number }) => void;
  jest.mocked(getCurrentLocation).mockReturnValueOnce(
    new Promise(resolve => {
      locate = resolve;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = locationButton().props.onPress();
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    locate({ latitude: 0, longitude: 0 });
    await pending;
  });
  expect(chat.sendLocationMessage).not.toHaveBeenCalled();
});

test('unread reset failure releases badge suppression instead of hiding a server error', async () => {
  const deactivate = mockActivateChat.mock.results[0].value;
  jest
    .mocked(chat.markAsRead)
    .mockRejectedValueOnce(new Error('Không có quyền ghi'));
  await act(async () => unread(1));
  expect(deactivate).toHaveBeenCalledTimes(1);
  await act(async () => unread(2));
  expect(mockActivateChat).toHaveBeenCalledTimes(2);
});
