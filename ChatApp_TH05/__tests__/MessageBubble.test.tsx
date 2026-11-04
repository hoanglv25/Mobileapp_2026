import React from 'react';
import { Alert, Linking, Text, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MessageBubble } from '../src/components/chat/MessageBubble';
import { AppProvider } from '../src/context/AppContext';
import { openLocationInMaps } from '../src/services/mapService';
import { ChatMessage } from '../src/types';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
const message: ChatMessage = {
  id: 'location-1',
  senderId: 'alice',
  receiverId: 'bob',
  type: 'location',
  text: '📍 Vị trí',
  latitude: -10.75,
  longitude: 106.6,
  createdAt: 1000,
};
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
    await renderer!.root.findByType(TouchableOpacity).props.onPress();
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
    await renderer!.root.findByType(TouchableOpacity).props.onPress();
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
  expect(renderer!.root.findByType(TouchableOpacity).props.disabled).toBe(true);
  await expect(
    openLocationInMaps({ latitude: 0, longitude: Number.NaN }),
  ).rejects.toThrow('Tọa độ');
  expect(Linking.openURL).not.toHaveBeenCalled();
});
