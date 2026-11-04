import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthForm } from '../src/components/common/AuthForm';
import { AppProvider } from '../src/context/AppContext';
import { AuthProvider } from '../src/context/AuthContext';
import * as service from '../src/services/authService';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/services/presenceService', () => ({
  startPresence: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/authService', () => ({
  onAuthChange: (callback: (user: null) => void) => {
    callback(null);
    return jest.fn();
  },
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  getAuthErrorMessage: (error: Error) => error.message,
}));

let renderer: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => renderer.unmount());
});

async function render(mode: 'register' | 'login') {
  await act(async () => {
    renderer = create(
      <AppProvider>
        <AuthProvider>
          <AuthForm mode={mode} onSwitch={jest.fn()} />
        </AuthProvider>
      </AppProvider>,
    );
  });
}

async function fill(label: string, value: string) {
  await act(async () => {
    renderer.root
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === label)!
      .props.onChangeText(value);
  });
}

function submitButton() {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find(button => button.props.accessibilityState)!;
}

function visibleText() {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join(' ');
}

test('registration validates each field without calling Firebase', async () => {
  await render('register');
  await fill('Email', 'invalid-email');
  await fill('Mật khẩu', '123');
  await fill('Nhập lại mật khẩu', '456');
  await act(async () => {
    await submitButton().props.onPress();
  });
  expect(visibleText()).toContain('Vui lòng nhập họ tên.');
  expect(visibleText()).toContain('Email không hợp lệ.');
  expect(visibleText()).toContain('Mật khẩu phải có ít nhất 6 ký tự.');
  expect(visibleText()).toContain('Mật khẩu nhập lại không khớp.');
  expect(service.registerUser).not.toHaveBeenCalled();
});

test('valid registration preserves password and blocks duplicate submission', async () => {
  await render('register');
  await fill('Họ tên', ' Alice ');
  await fill('Email', ' alice@example.com ');
  await fill('Mật khẩu', ' secret ');
  await fill('Nhập lại mật khẩu', ' secret ');
  let complete!: (value: service.AuthUser) => void;
  jest.mocked(service.registerUser).mockReturnValue(
    new Promise(resolve => {
      complete = resolve;
    }),
  );
  let pending!: Promise<void>;
  const press = submitButton().props.onPress;
  await act(async () => {
    pending = press();
    await press();
  });
  expect(service.registerUser).toHaveBeenCalledTimes(1);
  expect(service.registerUser).toHaveBeenCalledWith(
    'Alice',
    'alice@example.com',
    ' secret ',
  );
  expect(submitButton().props.disabled).toBe(true);
  await act(async () => {
    complete({
      uid: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatar: 'avatar',
    });
    await pending;
  });
  expect(submitButton().props.disabled).toBe(false);
});

test('login displays authentication failure and allows retry', async () => {
  await render('login');
  await fill('Email', 'alice@example.com');
  await fill('Mật khẩu', 'incorrect');
  jest
    .mocked(service.loginUser)
    .mockRejectedValueOnce(new Error('Email hoặc mật khẩu không đúng.'));
  await act(async () => {
    await submitButton().props.onPress();
  });
  expect(visibleText()).toContain('Email hoặc mật khẩu không đúng.');
  expect(submitButton().props.disabled).toBe(false);
});
