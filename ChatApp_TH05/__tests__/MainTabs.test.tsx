import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MainTabs } from '../src/navigation/MainTabs';

let mockTotal = 0;
jest.mock('../src/context/ConversationsContext', () => ({
  useConversations: () => ({ totalUnreadCount: mockTotal }),
}));
jest.mock('../src/context/AppContext', () => ({
  useApp: () => ({ theme: {}, unreadNotificationsCount: 2 }),
}));
jest.mock('../src/screens/HomeScreen', () => ({ HomeScreen: () => null }));
jest.mock('../src/screens/ContactsScreen', () => ({
  ContactsScreen: () => null,
}));
jest.mock('../src/screens/NotificationsScreen', () => ({
  NotificationsScreen: () => null,
}));
jest.mock('../src/screens/SettingsScreen', () => ({
  SettingsScreen: () => null,
}));
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/bottom-tabs', () => {
  const TestReact = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) =>
        TestReact.createElement('Tabs', null, children),
      Screen: (props: unknown) => TestReact.createElement('Tab', props),
    }),
  };
});

test('Home tab badge follows the live total and stays separate from mock notifications', async () => {
  let renderer!: ReactTestRenderer;
  mockTotal = 0;
  await act(async () => {
    renderer = create(<MainTabs />);
  });
  const options = (name: string) =>
    renderer.root.find(
      node => typeof node.type === 'string' && node.props.name === name,
    ).props.options;
  expect(options('HomeTab').tabBarBadge).toBeUndefined();
  mockTotal = 5;
  await act(async () => renderer.update(<MainTabs />));
  expect(options('HomeTab').tabBarBadge).toBe(5);
  expect(options('NotificationsTab').tabBarBadge).toBe(2);
  mockTotal = 105;
  await act(async () => renderer.update(<MainTabs />));
  expect(options('HomeTab').tabBarBadge).toBe('99+');
  await act(async () => renderer.unmount());
});
