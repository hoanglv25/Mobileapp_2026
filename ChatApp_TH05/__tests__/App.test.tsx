/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
jest.mock('../src/services/locationService', () => ({}));
jest.mock('../src/services/chatService', () => ({}));
jest.mock('../src/services/userService', () => ({
  subscribeContacts: jest.fn(() => jest.fn()),
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
// Kiểm tra giao diện không gọi Firebase thật trong Jest.
jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: (callback: (user: null) => void) => {
    callback(null);
    return jest.fn();
  },
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'Email' }),
  ).not.toHaveLength(0);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
});
