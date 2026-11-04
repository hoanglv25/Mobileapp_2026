import React from 'react';
import { FlatList, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ContactsScreen } from '../src/screens/ContactsScreen';
import { AppProvider } from '../src/context/AppContext';
import { ContactItem } from '../src/components/contact/ContactItem';
import { subscribeContacts } from '../src/services/userService';
import { Contact, ContactsScreenProps } from '../src/types';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'alice' },
    connected: true,
    presenceError: '',
    retryPresence: jest.fn(),
  }),
}));
jest.mock('../src/services/authService', () => ({
  getAuthErrorMessage: (error: Error) => error.message,
}));
jest.mock('../src/services/userService', () => ({
  subscribeContacts: jest.fn(),
}));

let renderer: ReactTestRenderer;
let publish: (contacts: Contact[]) => void;
const unsubscribe = jest.fn();
const navigate = jest.fn();
const contacts: Contact[] = [
  {
    id: 'bob',
    name: 'Bob',
    email: 'bob@example.com',
    avatar: 'b',
    isOnline: false,
  },
  {
    id: 'david',
    name: 'David',
    email: 'david@example.com',
    avatar: 'd',
    isOnline: true,
  },
  {
    id: 'charlie',
    name: 'Charlie',
    email: 'special@example.com',
    avatar: 'c',
    isOnline: true,
  },
];

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(subscribeContacts).mockImplementation((_uid, callback) => {
    publish = callback;
    return unsubscribe;
  });
  const props = { navigation: { navigate } } as unknown as ContactsScreenProps;
  await act(async () => {
    renderer = create(
      <AppProvider>
        <ContactsScreen {...props} />
      </AppProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('sorts online contacts first, searches by email and opens the correct chat', async () => {
  await act(async () => publish(contacts));
  expect(
    renderer.root
      .findByType(FlatList)
      .props.data.map((item: Contact) => item.id),
  ).toEqual(['charlie', 'david', 'bob']);
  await act(async () =>
    renderer.root
      .findByType(TextInput)
      .props.onChangeText(' SPECIAL@EXAMPLE.COM '),
  );
  expect(
    renderer.root
      .findByType(FlatList)
      .props.data.map((item: Contact) => item.id),
  ).toEqual(['charlie']);
  await act(async () => renderer.root.findByType(ContactItem).props.onPress());
  expect(navigate).toHaveBeenCalledWith('Chat', {
    contactId: 'charlie',
    contactName: 'Charlie',
    contactAvatar: 'c',
  });
});

test('cleans up the listener and does not apply late data after unmount', async () => {
  await act(async () => renderer.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => publish(contacts));
  expect(subscribeContacts).toHaveBeenCalledTimes(1);
});
