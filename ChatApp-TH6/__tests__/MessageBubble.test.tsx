import React from 'react';
import { Alert, Linking, Text, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  MessageBubble,
  summarizeReactions,
} from '../src/components/chat/MessageBubble';
import { AppProvider } from '../src/context/AppContext';
import { openLocationInMaps } from '../src/services/mapService';
import { ChatMessage } from '../src/types';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
const message: ChatMessage = {
  id: 'location-1',
  senderId: 'alice',
  type: 'location',
  text: '',
  latitude: -10.75,
  longitude: 106.6,
  createdAt: 1000,
  recalled: false,
  reactions: {},
};
const locationButton = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find(node => String(node.props.accessibilityLabel).includes('vị trí') ||
      String(node.props.accessibilityLabel).includes('Vị trí'))!;
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children);
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert');
});
afterEach(async () => {
  if (renderer) {
    await act(async () => renderer!.unmount());
    renderer = undefined;
  }
  jest.restoreAllMocks();
});

test('location card opens Google Maps with exact signed coordinates', async () => {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={message} isMe />
      </AppProvider>,
    );
  });
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(text => text.props.children === 'Nhấn để mở Google Maps'),
  ).toBe(true);
  await act(async () => {
    await locationButton(renderer!).props.onPress();
  });
  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://www.google.com/maps/search/?api=1&query=-10.75,106.6',
  );
});

test('map launch failure is reported instead of becoming an unhandled rejection', async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No handler'));
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={message} isMe={false} />
      </AppProvider>,
    );
  });
  await act(async () => {
    await locationButton(renderer!).props.onPress();
  });
  expect(Alert.alert).toHaveBeenCalledWith(
    'Không mở được Google Maps',
    expect.any(String),
  );
});

test('invalid coordinates disable the card and cannot launch a URL', async () => {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <MessageBubble message={{ ...message, latitude: 100 }} isMe />
      </AppProvider>,
    );
  });
  expect(locationButton(renderer!).props.disabled).toBe(true);
  await expect(
    openLocationInMaps({ latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(Linking.openURL).not.toHaveBeenCalled();
});

const render = async (node: React.ReactElement) => {
  await act(async () => {
    renderer = create(<AppProvider>{node}</AppProvider>);
  });
  return renderer!;
};

test('recalled message shows the recall notice on every device and hides content', async () => {
  const tree = await render(
    <MessageBubble
      isMe={false}
      message={{
        ...message,
        type: 'text',
        text: '',
        recalled: true,
        reactions: { bob: '❤️' },
      }}
    />,
  );
  expect(texts(tree)).toContain('Tin nhắn đã được thu hồi');
  // Tin đã thu hồi không hiển thị cảm xúc.
  expect(texts(tree)).not.toContain('❤️');
});

test('reactions are grouped with a count when several people react', async () => {
  expect(
    summarizeReactions({ a: '👍', b: '👍', c: '❤️' }),
  ).toEqual([
    ['👍', 2],
    ['❤️', 1],
  ]);
  const tree = await render(
    <MessageBubble
      isMe
      message={{
        ...message,
        type: 'text',
        text: 'hi',
        reactions: { a: '👍', b: '👍', c: '😂' },
      }}
    />,
  );
  expect(texts(tree)).toEqual(expect.arrayContaining(['👍', 2, '😂']));
});

test('group messages from others show the sender name above the bubble', async () => {
  const tree = await render(
    <MessageBubble
      isMe={false}
      senderName="Bob"
      message={{ ...message, type: 'text', text: 'xin chào' }}
    />,
  );
  expect(texts(tree)).toContain('Bob');
  const mine = await render(
    <MessageBubble
      isMe
      senderName="Alice"
      message={{ ...message, type: 'text', text: 'xin chào' }}
    />,
  );
  expect(texts(mine)).not.toContain('Alice');
});

test('image bubble opens the full-screen viewer with its URL', async () => {
  const onPressImage = jest.fn();
  const tree = await render(
    <MessageBubble
      isMe
      onPressImage={onPressImage}
      message={{
        ...message,
        type: 'image',
        imageUrl: 'https://res.cloudinary.com/demo/a.jpg',
      }}
    />,
  );
  const button = tree.root
    .findAllByType(TouchableOpacity)
    .find(node => node.props.accessibilityRole === 'imagebutton')!;
  button.props.onPress();
  expect(onPressImage).toHaveBeenCalledWith(
    'https://res.cloudinary.com/demo/a.jpg',
  );
});

test('long press opens the action menu and status text is shown under the message', async () => {
  const onLongPress = jest.fn();
  const text = { ...message, type: 'text' as const, text: 'hi' };
  const tree = await render(
    <MessageBubble
      isMe
      statusText="Đã xem 10:32"
      onLongPress={onLongPress}
      message={text}
    />,
  );
  expect(texts(tree)).toContain('Đã xem 10:32');
  tree.root
    .findAllByType(TouchableOpacity)[0]
    .props.onLongPress();
  expect(onLongPress).toHaveBeenCalledWith(text);
});

test('system message renders as centered text only', async () => {
  const tree = await render(
    <MessageBubble
      isMe={false}
      message={{ ...message, type: 'system', text: 'An đã rời nhóm' }}
    />,
  );
  expect(texts(tree)).toEqual(['An đã rời nhóm']);
});
