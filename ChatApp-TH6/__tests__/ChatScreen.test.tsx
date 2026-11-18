import React from 'react';
import {
  Alert,
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
import { MessageActionsModal } from '../src/components/chat/MessageActionsModal';
import * as chat from '../src/services/chatService';
import * as typingService from '../src/services/typingService';
import { subscribeStatus } from '../src/services/userService';
import { pickImage } from '../src/services/imagePickerService';
import { uploadImage } from '../src/services/uploadService';
import { ChatMessage, ChatScreenProps, ConversationMeta } from '../src/types';

let mockFocused = true;
const mockActivateChat = jest.fn(() => jest.fn());
jest.mock('../src/context/ConversationsContext', () => ({
  useConversations: () => ({ activateChat: mockActivateChat }),
}));
const mockMarkConversationRead = jest.fn();
jest.mock('../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ markConversationRead: mockMarkConversationRead }),
}));
jest.mock('../src/context/UsersContext', () => ({
  useUsers: () => ({
    getName: (uid: string) => ({ alice: 'Alice', bob: 'Bob', carol: 'Carol' }[uid] || uid),
    getAvatar: () => 'avatar.png',
  }),
  groupAvatarUri: (name: string) => `group:${name}`,
}));
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
  subscribeMessages: jest.fn(),
  fetchOlderMessages: jest.fn(),
  subscribeConversationMeta: jest.fn(),
  subscribeReadStatus: jest.fn(),
  subscribeUnreadCount: jest.fn(),
  sendTextMessage: jest.fn(),
  sendLocationMessage: jest.fn(),
  sendImageMessage: jest.fn(),
  recallMessage: jest.fn(),
  toggleReaction: jest.fn(),
  markAsRead: jest.fn(),
  MAX_MESSAGE_LENGTH: 2000,
}));
jest.mock('../src/services/typingService', () => ({
  createTypingController: jest.fn(),
  enterConversation: jest.fn(),
  subscribeTyping: jest.fn(),
  subscribeViewing: jest.fn(),
}));
jest.mock('../src/services/imagePickerService', () => ({ pickImage: jest.fn() }));
jest.mock('../src/services/uploadService', () => ({ uploadImage: jest.fn() }));
jest.mock('../src/services/locationService', () => ({
  getCurrentLocation: jest.fn(),
  showLocationError: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (messages: ChatMessage[]) => void;
let publishTyping: (uids: string[]) => void;
let publishRead: (status: Record<string, number>) => void;
let publishStatus: Parameters<typeof subscribeStatus>[1];
let publishMeta: (meta: ConversationMeta | null) => void;
let changeAppState: (state: AppStateStatus) => void;
const unsubscribers = {
  messages: jest.fn(),
  status: jest.fn(),
  unread: jest.fn(),
  typing: jest.fn(),
  viewing: jest.fn(),
  read: jest.fn(),
  meta: jest.fn(),
};
const typingController = { notify: jest.fn(), stop: jest.fn() };
const leaveConversation = jest.fn();
const removeState = jest.fn();

const directProps = {
  route: {
    params: {
      conversationId: 'alice_bob',
      type: 'direct',
      name: 'Bob',
      avatar: 'bob.png',
      contactId: 'bob',
    },
  },
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
} as unknown as ChatScreenProps;
const groupProps = {
  route: {
    params: { conversationId: 'GRP', type: 'group', name: 'Lớp CNTT', avatar: 'g.png' },
  },
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
} as unknown as ChatScreenProps;
const view = (screenProps = directProps) => (
  <AppProvider>
    <ChatScreen {...screenProps} />
  </AppProvider>
);
const msg = (id: string, senderId: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  senderId,
  type: 'text',
  text: `text ${id}`,
  createdAt: Number(id.replace(/\D/g, '')) * 1000,
  recalled: false,
  reactions: {},
  ...extra,
});
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => [].concat(node.props.children).join(''));
const button = (label: string) =>
  renderer.root
    .findAllByType(TouchableOpacity)
    .find(item => item.props.accessibilityLabel === label)!;

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
  jest.mocked(chat.subscribeMessages).mockImplementation((_id, _start, callback) => {
    publish = callback;
    return unsubscribers.messages;
  });
  jest.mocked(chat.subscribeUnreadCount).mockImplementation((_u, _c, callback) => {
    void callback;
    return unsubscribers.unread;
  });
  jest.mocked(chat.subscribeReadStatus).mockImplementation((_c, callback) => {
    publishRead = callback;
    return unsubscribers.read;
  });
  jest.mocked(chat.subscribeConversationMeta).mockImplementation((_c, callback) => {
    publishMeta = callback;
    return unsubscribers.meta;
  });
  jest.mocked(subscribeStatus).mockImplementation((_uid, callback) => {
    publishStatus = callback;
    return unsubscribers.status;
  });
  jest.mocked(typingService.subscribeTyping).mockImplementation((_c, _u, callback) => {
    publishTyping = callback;
    return unsubscribers.typing;
  });
  jest.mocked(typingService.subscribeViewing).mockReturnValue(unsubscribers.viewing);
  jest.mocked(typingService.createTypingController).mockReturnValue(typingController);
  jest.mocked(typingService.enterConversation).mockReturnValue(leaveConversation);
  jest.mocked(chat.markAsRead).mockResolvedValue(undefined);
  jest.mocked(chat.sendTextMessage).mockResolvedValue(undefined);
  jest.mocked(chat.sendImageMessage).mockResolvedValue(undefined);
  jest.mocked(chat.recallMessage).mockResolvedValue(undefined);
  jest.mocked(chat.toggleReaction).mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});
const mount = async (props = directProps, messages: ChatMessage[] = []) => {
  await act(async () => {
    renderer = create(view(props));
  });
  await act(async () => publish(messages));
};

describe('chat 1-1', () => {
  test('header shows "đang soạn tin…" and clears it when the other person stops', async () => {
    await mount();
    await act(async () => publishStatus({ isOnline: true, lastChanged: 1 }));
    expect(texts()).toContain('Đang hoạt động');
    await act(async () => publishTyping(['bob']));
    expect(texts()).toContain('đang soạn tin…');
    expect(texts()).not.toContain('Đang hoạt động');
    await act(async () => publishTyping([]));
    expect(texts()).toContain('Đang hoạt động');
  });

  test('offline partner shows "Hoạt động X phút trước" instead of plain offline', async () => {
    await mount();
    await act(async () =>
      publishStatus({ isOnline: false, lastChanged: Date.now() - 5 * 60000 - 2000 }),
    );
    expect(texts()).toContain('Hoạt động 5 phút trước');
    expect(texts()).not.toContain('Ngoại tuyến');
  });

  test('last own message shows "Đã gửi" then "Đã xem" with the read time, in real time', async () => {
    const seenAt = new Date(2026, 10, 4, 10, 32).getTime();
    await mount(directProps, [
      msg('m1', 'alice', { createdAt: seenAt - 120000 }),
      msg('m2', 'bob', { createdAt: seenAt - 90000 }),
      msg('m3', 'alice', { createdAt: seenAt - 60000 }),
    ]);
    const statuses = () =>
      renderer.root.findAllByType(MessageBubble).map(item => item.props.statusText);
    // Chỉ tin cuối của MÌNH có trạng thái.
    expect(statuses()).toEqual([undefined, undefined, 'Đã gửi']);
    await act(async () => publishRead({ bob: seenAt - 70000 })); // đọc trước tin cuối
    expect(statuses()[2]).toBe('Đã gửi');
    await act(async () => publishRead({ bob: seenAt }));
    expect(statuses()[2]).toBe('Đã xem 10:32');
  });

  test('typing is announced while typing and stopped on send and on leaving the screen', async () => {
    await mount();
    expect(typingService.createTypingController).toHaveBeenCalledWith('alice_bob', 'alice');
    await act(async () => renderer.root.findByType(TextInput).props.onChangeText('xin'));
    expect(typingController.notify).toHaveBeenLastCalledWith(true);
    await act(async () => renderer.root.findByType(TextInput).props.onChangeText(''));
    expect(typingController.notify).toHaveBeenLastCalledWith(false);
    await act(async () => renderer.root.findByType(TextInput).props.onChangeText('xin chào'));
    typingController.stop.mockClear();
    await act(async () => button('Gửi tin nhắn').props.onPress());
    expect(chat.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(typingController.stop).toHaveBeenCalled();
    typingController.stop.mockClear();
    await act(async () => renderer.unmount());
    expect(typingController.stop).toHaveBeenCalled();
    expect(leaveConversation).toHaveBeenCalled();
    // Cleanup mọi listener.
    Object.values(unsubscribers).forEach(fn => {
      if (fn !== unsubscribers.meta) {
        expect(fn).toHaveBeenCalled();
      }
    });
    renderer = create(view()); // để afterEach có thứ để unmount
  });

  test('losing focus switches typing off', async () => {
    await mount();
    typingController.stop.mockClear();
    mockFocused = false;
    await act(async () => renderer.update(view()));
    expect(typingController.stop).toHaveBeenCalled();
    void changeAppState;
  });
});

describe('message menu', () => {
  const openMenu = async (message: ChatMessage) => {
    await act(async () =>
      renderer.root
        .findAllByType(MessageBubble)
        .find(item => item.props.message.id === message.id)!
        .props.onLongPress(message),
    );
    return renderer.root.findByType(MessageActionsModal);
  };

  test('long press offers recall only for my own messages', async () => {
    const mine = msg('m1', 'alice');
    const theirs = msg('m2', 'bob');
    await mount(directProps, [mine, theirs]);
    let modal = await openMenu(mine);
    const labels = () =>
      modal.findAllByType(Text).map(node => node.props.children);
    expect(labels()).toEqual(expect.arrayContaining(['Thu hồi', 'Sao chép']));
    await act(async () => modal.props.onClose());
    modal = await openMenu(theirs);
    expect(labels()).not.toContain('Thu hồi');
    expect(labels()).toContain('Sao chép');
  });

  test('reaction, recall confirmation and copy call the right services', async () => {
    const mine = msg('m1', 'alice');
    await mount(directProps, [mine]);
    let modal = await openMenu(mine);
    await act(async () => modal.props.onReact(mine, '😂'));
    expect(chat.toggleReaction).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'alice' }),
      'alice_bob',
      mine,
      '😂',
    );
    modal = await openMenu(mine);
    await act(async () => modal.props.onRecall(mine));
    const confirm = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    expect(confirm[0]).toBe('Thu hồi tin nhắn');
    await act(async () => {
      (confirm[2] as { onPress: () => void }[])[1].onPress();
    });
    expect(chat.recallMessage).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'alice' }),
      'alice_bob',
      ['alice', 'bob'],
      mine,
    );
    const Clipboard = require('@react-native-clipboard/clipboard').default;
    modal = await openMenu(mine);
    await act(async () => modal.props.onCopy(mine));
    expect(Clipboard.setString).toHaveBeenCalledWith('text m1');
  });

  test('reply quotes the selected message in the next text message', async () => {
    const theirs = msg('m2', 'bob', { text: 'Mấy giờ họp?' });
    await mount(directProps, [theirs]);
    const modal = await openMenu(theirs);
    await act(async () => modal.props.onReply(theirs));
    expect(texts()).toContain('Trả lời Bob');
    await act(async () => renderer.root.findByType(TextInput).props.onChangeText('9 giờ'));
    await act(async () => button('Gửi tin nhắn').props.onPress());
    expect(chat.sendTextMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '9 giờ',
      { id: 'm2', senderId: 'bob', text: 'Mấy giờ họp?' },
    );
  });
});

describe('pagination', () => {
  const page = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) =>
      msg(`k${String(from + index).padStart(3, '0')}`, 'bob'),
    );

  test('loads 20 newest, pins the window at the oldest key, then prepends 20 older without scroll jump', async () => {
    await mount(directProps, page(21, 40));
    // Lần đầu: limitToLast(20) → startKey null; sau snapshot: cố định ở tin cũ nhất.
    expect(jest.mocked(chat.subscribeMessages).mock.calls[0][1]).toBeNull();
    expect(jest.mocked(chat.subscribeMessages).mock.calls.at(-1)![1]).toBe('k021');
    const list = () => renderer.root.findByType(FlatList);
    expect(list().props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
    jest
      .mocked(chat.fetchOlderMessages)
      .mockResolvedValueOnce({ messages: page(1, 20), hasMore: false });
    // Lúc mới mở (chưa kéo) onStartReached không được tự tải trang cũ làm lệch vị trí.
    await act(async () => list().props.onStartReached());
    expect(chat.fetchOlderMessages).not.toHaveBeenCalled();
    await act(async () => list().props.onScrollBeginDrag());
    await act(async () => list().props.onStartReached());
    expect(chat.fetchOlderMessages).toHaveBeenCalledWith('alice_bob', 'k021');
    expect(list().props.data).toHaveLength(40);
    expect(list().props.data[0].id).toBe('k001');
    expect(jest.mocked(chat.subscribeMessages).mock.calls.at(-1)![1]).toBe('k001');
    // Hết tin cũ: kéo tiếp không gọi lại.
    await act(async () => list().props.onStartReached());
    expect(chat.fetchOlderMessages).toHaveBeenCalledTimes(1);
  });

  test('fewer than 20 messages means there is nothing older to fetch', async () => {
    await mount(directProps, page(1, 5));
    await act(async () => renderer.root.findByType(FlatList).props.onScrollBeginDrag());
    await act(async () => renderer.root.findByType(FlatList).props.onStartReached());
    expect(chat.fetchOlderMessages).not.toHaveBeenCalled();
  });
});

describe('image messages', () => {
  const image = { uri: 'file:///a.jpg', type: 'image/jpeg', fileName: 'a.jpg' };
  const choose = async (index: number) => {
    await act(async () => button('Gửi ảnh').props.onPress());
    const options = jest.mocked(Alert.alert).mock.calls.at(-1)![2] as {
      onPress: () => void;
    }[];
    await act(async () => options[index].onPress());
  };

  test('picks a photo, shows a temporary bubble, uploads to Cloudinary and stores only the URL', async () => {
    await mount();
    jest.mocked(pickImage).mockResolvedValue(image);
    let finish!: (url: string) => void;
    jest.mocked(uploadImage).mockReturnValue(new Promise(resolve => (finish = resolve)));
    await choose(1);
    expect(pickImage).toHaveBeenCalledWith('library');
    const footer = renderer.root.findByType(FlatList).props.ListFooterComponent;
    expect(footer.props.children[0].props.status).toBe('uploading');
    await act(async () => finish('https://res.cloudinary.com/demo/a.jpg'));
    expect(chat.sendImageMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'https://res.cloudinary.com/demo/a.jpg',
      undefined,
    );
    expect(renderer.root.findByType(FlatList).props.ListFooterComponent).toBeUndefined();
  });

  test('failed upload shows an error and "Thử lại" uploads again', async () => {
    await mount();
    jest.mocked(pickImage).mockResolvedValue(image);
    jest.mocked(uploadImage).mockRejectedValueOnce(new Error('Mất mạng'));
    await choose(0);
    expect(pickImage).toHaveBeenCalledWith('camera');
    const failed = renderer.root.findByType(FlatList).props.ListFooterComponent.props.children[0];
    expect(failed.props.status).toBe('failed');
    expect(failed.props.error).toBe('Mất mạng');
    jest.mocked(uploadImage).mockResolvedValueOnce('https://res.cloudinary.com/demo/b.jpg');
    await act(async () => failed.props.onRetry());
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(chat.sendImageMessage).toHaveBeenCalledTimes(1);
  });

  test('cancelled picker (or denied camera permission) sends nothing', async () => {
    await mount();
    jest.mocked(pickImage).mockResolvedValue(null);
    await choose(0);
    expect(uploadImage).not.toHaveBeenCalled();
  });
});

describe('group chat', () => {
  const meta: ConversationMeta = {
    id: 'GRP',
    type: 'group',
    name: 'Lớp CNTT',
    members: ['alice', 'bob', 'carol'],
    createdBy: 'alice',
    createdAt: 1,
  };

  test('title shows group name and number of members online; others show the sender name', async () => {
    await mount(groupProps, [msg('m1', 'bob'), msg('m2', 'alice')]);
    await act(async () => publishMeta(meta));
    await act(async () => publishStatus({ isOnline: true, lastChanged: 1 }));
    expect(texts()).toContain('Lớp CNTT');
    // Mock chỉ giữ callback của listener cuối (carol) → carol online + bản thân = 2.
    expect(texts()).toContain('3 thành viên · 2 đang online');
    const bubbles = renderer.root.findAllByType(MessageBubble);
    expect(bubbles[0].props.senderName).toBe('Bob');
    expect(texts()).toContain('Bob');
  });

  test('sending in a group targets every member and the typing names are listed', async () => {
    await mount(groupProps);
    await act(async () => publishMeta(meta));
    await act(async () => publishTyping(['bob', 'carol']));
    expect(texts()).toContain('Bob, Carol đang soạn tin…');
    await act(async () => renderer.root.findByType(TextInput).props.onChangeText('Chào cả nhóm'));
    await act(async () => button('Gửi tin nhắn').props.onPress());
    expect(chat.sendTextMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        convId: 'GRP',
        type: 'group',
        members: ['alice', 'bob', 'carol'],
        name: 'Lớp CNTT',
      }),
      'Chào cả nhóm',
      undefined,
    );
  });

  test('group "đã xem" counts the members who have read the last own message', async () => {
    await mount(groupProps, [msg('m1', 'alice', { createdAt: 1000 })]);
    await act(async () => publishMeta(meta));
    await act(async () => publishRead({ bob: 2000, carol: 500 }));
    expect(renderer.root.findAllByType(MessageBubble)[0].props.statusText).toBe(
      'Đã xem bởi 1',
    );
  });

  test('a member who was removed cannot send and sees a notice', async () => {
    await mount(groupProps);
    await act(async () => publishMeta({ ...meta, members: ['bob', 'carol'] }));
    expect(
      texts().some(text => text.includes('không còn là thành viên')),
    ).toBe(true);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });
});
