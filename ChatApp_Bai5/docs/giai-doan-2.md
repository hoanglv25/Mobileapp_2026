# Giai đoạn 2 — AuthContext và điều hướng theo phiên Firebase

## Mục tiêu và kết quả

- AuthContext quản lý currentUser, initializing, login, register, logout. Khôi phục phiên qua listener có unsubscribe.
- Đợi hồ sơ Database hoàn tất trước khi mở Main. Bỏ qua sự kiện auth đến giữa quá trình đăng ký, chặn kết quả đọc hồ sơ cũ và hủy listener khi provider unmount.
- Nếu khôi phục hồ sơ thất bại: hiển thị lỗi, Thử lại và Đăng xuất, không để spinner chạy mãi sau khi yêu cầu thất bại.
- AppNavigator chỉ đăng ký Main/Chat khi có currentUser; chưa đăng nhập chỉ có Login/Register. Không dùng navigation.replace hay reset sau xác thực.
- Form đăng ký kiểm tra họ tên, email, mật khẩu tối thiểu 6 ký tự, xác nhận mật khẩu. Form đăng nhập dùng email/mật khẩu và hiển thị lỗi tiếng Việt. Có loading, khóa gửi lặp và hỗ trợ bàn phím, Dark Mode.
- Settings hiển thị tên/email/avatar thật, đăng xuất qua AuthContext và tự trở về Login.
- AppContext chỉ giữ theme/cài đặt/thông báo mock cùng các hàm hỗ trợ.
- MockChatContext tạm giữ Home/Danh bạ/Chat mẫu đến giai đoạn 3–6. Provider reset theo UID để dữ liệu tạm không truyền sang tài khoản kế tiếp. Chưa có chat realtime trong giai đoạn này.
- Màn hình Thông báo và mockNotifications được giữ nguyên.
- authService bổ sung chuẩn hóa thông báo lỗi và tạo lại hồ sơ còn thiếu khi khôi phục/đăng nhập. Chỉ ghi users/{uid} của chính tài khoản theo rules đã cung cấp. Auth và Database không phải giao dịch chung: nếu đăng ký báo lỗi sau khi tạo Auth, hãy kiểm tra Console và đăng nhập lại để phục hồi hồ sơ, tránh đăng ký lại cùng email.

## Cài đặt/native

Không cài thêm package, không đổi cấu hình native. Các dependency đã có từ giai đoạn 0.

Chạy Metro và build Android ở hai terminal nếu cần:

```powershell
npm.cmd start
```

```powershell
npm.cmd run android
```

Điều kiện: Firebase Authentication đã bật Email/Password; Realtime Database đã Publish rules mới có users/.read cho tài khoản đã xác thực. Có thể xác minh trên Console; chưa xác minh trạng thái Console trong lượt làm việc này.

Jest được cấu hình transform các package React Navigation/native dùng ESM. Test mock lớp service Firebase và các thành phần native cần thiết, không tạo tài khoản thật.

## Kết quả kiểm tra tự động

- npx.cmd tsc --noEmit: thành công.
- ESLint các file thay đổi: thành công, không lỗi/cảnh báo.
- npx.cmd jest --runInBand: 3 suites, 8 tests thành công.
- Các ca: khôi phục phiên chờ hồ sơ và unsubscribe; sự kiện Auth giữa đăng ký; logout thất bại/thành công; retry hồ sơ; hiển thị Login ban đầu; validation đăng ký; chặn gửi lặp và giữ nguyên mật khẩu; lỗi đăng nhập và mở lại nút thử.

Chưa chạy app trên emulator/thiết bị, chưa gọi Firebase thật trong kiểm thử tự động. Cần kiểm tra thủ công bên dưới.

## Nội dung đầy đủ các file

### App.tsx

```tsx
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';

const RootContent: React.FC = () => {
  const { isDarkMode } = useApp();

  return (
    <NavigationContainer>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppNavigator />
    </NavigationContainer>
  );
};

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AuthProvider>
          <RootContent />
        </AuthProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

```

### src/context/AppContext.tsx

```tsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { AppNotification } from '../types';
import { mockNotifications } from '../data/mockData';
import { lightTheme, darkTheme, ThemeColors } from '../theme';

interface AppContextType {
  notifications: AppNotification[];
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  theme: ThemeColors;
  unreadNotificationsCount: number;
  toggleDarkMode: () => void;
  toggleNotificationsEnabled: () => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
}
const AppContext = createContext<AppContextType | undefined>(undefined);
export function AppProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const theme = useMemo(
    () => (isDarkMode ? darkTheme : lightTheme),
    [isDarkMode],
  );
  return (
    <AppContext.Provider
      value={{
        notifications,
        isDarkMode,
        notificationsEnabled,
        theme,
        unreadNotificationsCount: notifications.filter(item => !item.isRead)
          .length,
        toggleDarkMode: () => setIsDarkMode(previous => !previous),
        toggleNotificationsEnabled: () =>
          setNotificationsEnabled(previous => !previous),
        markNotificationAsRead: id =>
          setNotifications(previous =>
            previous.map(item =>
              item.id === id ? { ...item, isRead: true } : item,
            ),
          ),
        markAllNotificationsAsRead: () =>
          setNotifications(previous =>
            previous.map(item => ({ ...item, isRead: true })),
          ),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp phải được bọc trong AppProvider');
  }
  return context;
}

```

### src/context/AuthContext.tsx

```tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  AuthUser,
  getUserProfile,
  loginUser,
  registerUser,
  logoutUser,
  onAuthChange,
  getCurrentFirebaseUser,
  getAuthErrorMessage,
} from '../services/authService';

interface AuthContextType {
  currentUser: AuthUser | null;
  initializing: boolean;
  sessionError: string;
  retrySession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const mounted = useRef(false);
  const operation = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const unsubscribe = onAuthChange(user => {
      // createUser phát sự kiện trước khi ghi xong hồ sơ: chờ register hoàn tất.
      if (operation.current) {
        return;
      }
      const request = ++revision.current;
      setInitializing(true);
      setCurrentUser(null);
      setSessionError('');
      if (!user) {
        setInitializing(false);
        return;
      }
      getUserProfile(user)
        .then(profile => {
          if (active && revision.current === request) {
            setCurrentUser(profile);
          }
        })
        .catch(error => {
          if (active && revision.current === request) {
            setSessionError(getAuthErrorMessage(error));
          }
        })
        .finally(() => {
          if (active && revision.current === request) {
            setInitializing(false);
          }
        });
    });
    return () => {
      mounted.current = false;
      active = false;
      unsubscribe();
    };
  }, []);

  const authenticate = async (action: () => Promise<AuthUser>) => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      const user = await action();
      if (mounted.current) {
        setCurrentUser(user);
        setSessionError('');
      }
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) {
        setInitializing(false);
      }
    }
  };

  const retrySession = async () => {
    const user = getCurrentFirebaseUser();
    if (!user) {
      setSessionError('');
      setInitializing(false);
      return;
    }
    setInitializing(true);
    try {
      await authenticate(() => getUserProfile(user));
    } catch (error) {
      if (mounted.current) {
        setSessionError(getAuthErrorMessage(error));
      }
    }
  };

  const logout = async () => {
    if (operation.current) {
      throw new Error('Vui lòng chờ thao tác hiện tại hoàn tất.');
    }
    operation.current = true;
    ++revision.current;
    try {
      await logoutUser();
      if (mounted.current) {
        setCurrentUser(null);
        setSessionError('');
      }
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    } finally {
      operation.current = false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        initializing,
        sessionError,
        retrySession,
        login: (email, password) =>
          authenticate(() => loginUser(email, password)),
        register: (name, email, password) =>
          authenticate(() => registerUser(name, email, password)),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được bọc trong AuthProvider');
  }
  return context;
}

```

### src/context/MockChatContext.tsx

```tsx
// Context tạm cho chat mẫu Bài 4, sẽ bỏ sau giai đoạn 3–6.
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Conversation, Contact, Message } from '../types';
import {
  mockContacts,
  mockConversations,
  mockMessages,
} from '../data/mockData';

interface MockChatContextType {
  conversations: Conversation[];
  contacts: Contact[];
  messages: Record<string, Message[]>;
  markConversationAsRead: (contactId: string) => void;
  sendMessage: (contactId: string, text: string) => void;
  getOrCreateConversation: (contact: Contact) => Conversation;
}

const MockChatContext = createContext<MockChatContextType | undefined>(
  undefined,
);

interface MockChatProviderProps {
  children: ReactNode;
}

export const MockChatProvider: React.FC<MockChatProviderProps> = ({
  children,
}) => {
  const [conversations, setConversations] =
    useState<Conversation[]>(mockConversations);
  const [contacts] = useState<Contact[]>(mockContacts);
  const [messages, setMessages] =
    useState<Record<string, Message[]>>(mockMessages);

  // Đánh dấu cuộc trò chuyện đã đọc và reset unread về 0
  const markConversationAsRead = (contactId: string): void => {
    setConversations(prev =>
      prev.map(c => (c.contactId === contactId ? { ...c, unreadCount: 0 } : c)),
    );
  };

  // Gửi tin nhắn mới và cập nhật "tin nhắn gần nhất" ở danh sách Home
  const sendMessage = (contactId: string, text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeFormatted = `${hours}:${minutes}`;

    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      senderId: 'me',
      text: trimmed,
      timestamp: timeFormatted,
      createdAt: Date.now(),
    };

    // 1. Thêm tin nhắn vào danh sách tin nhắn của cuộc trò chuyện
    setMessages(prev => {
      const currentList = prev[contactId] || [];
      return {
        ...prev,
        [contactId]: [...currentList, newMessage],
      };
    });

    // 2. Cập nhật lastMessage ở Home
    setConversations(prev => {
      const exists = prev.some(c => c.contactId === contactId);
      if (exists) {
        return prev.map(c =>
          c.contactId === contactId
            ? {
                ...c,
                lastMessage: trimmed,
                lastMessageTime: timeFormatted,
              }
            : c,
        );
      } else {
        const contact = contacts.find(ct => ct.id === contactId);
        const newConv: Conversation = {
          id: `conv_${Date.now()}`,
          contactId,
          name: contact ? contact.name : 'Người dùng',
          avatar: contact ? contact.avatar : 'https://i.pravatar.cc/150?img=1',
          lastMessage: trimmed,
          lastMessageTime: timeFormatted,
          unreadCount: 0,
          isOnline: contact ? contact.isOnline : false,
        };
        return [newConv, ...prev];
      }
    });
  };

  // Lấy hoặc tạo mới cuộc trò chuyện khi chọn từ Danh bạ
  const getOrCreateConversation = (contact: Contact): Conversation => {
    const existing = conversations.find(c => c.contactId === contact.id);
    if (existing) {
      return existing;
    }
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      contactId: contact.id,
      name: contact.name,
      avatar: contact.avatar,
      lastMessage: 'Bắt đầu cuộc trò chuyện mới',
      lastMessageTime: 'Vừa xong',
      unreadCount: 0,
      isOnline: contact.isOnline,
    };
    setConversations(prev => [newConv, ...prev]);
    return newConv;
  };

  const contextValue: MockChatContextType = {
    conversations,
    contacts,
    messages,
    markConversationAsRead,
    sendMessage,
    getOrCreateConversation,
  };

  return (
    <MockChatContext.Provider value={contextValue}>
      {children}
    </MockChatContext.Provider>
  );
};

export const useMockChat = (): MockChatContextType => {
  const context = useContext(MockChatContext);
  if (!context) {
    throw new Error('useMockChat phải được bọc trong MockChatProvider');
  }
  return context;
};

```

### src/navigation/AppNavigator.tsx

```tsx
import React from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { ChatScreen } from '../screens/ChatScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { MockChatProvider } from '../context/MockChatContext';
import { Spacing } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { currentUser, initializing, sessionError, retrySession, logout } =
    useAuth();
  const { theme } = useApp();
  if (initializing || sessionError) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        {initializing ? (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ color: theme.text }}>
              Đang khôi phục phiên đăng nhập…
            </Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="alert" style={{ color: theme.danger }}>
              {sessionError}
            </Text>
            <TouchableOpacity onPress={retrySession} accessibilityRole="button">
              <Text style={{ color: theme.primary }}>Thử lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                logout().catch(error =>
                  Alert.alert('Không thể đăng xuất', error.message),
                );
              }}
            >
              <Text style={{ color: theme.primary }}>Đăng xuất</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }
  return (
    <MockChatProvider key={currentUser?.uid || 'signed-out'}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {currentUser ? (
          <Stack.Group navigationKey={currentUser.uid}>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group navigationKey="guest">
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </MockChatProvider>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
});

```

### src/screens/LoginScreen.tsx

```tsx
import React from 'react';
import { AuthForm } from '../components/common/AuthForm';
import { LoginScreenProps } from '../types';

export function LoginScreen({ navigation }: LoginScreenProps) {
  return (
    <AuthForm mode="login" onSwitch={() => navigation.navigate('Register')} />
  );
}

```

### src/screens/RegisterScreen.tsx

```tsx
import React from 'react';
import { AuthForm } from '../components/common/AuthForm';
import { RegisterScreenProps } from '../types';

export function RegisterScreen({ navigation }: RegisterScreenProps) {
  return <AuthForm mode="register" onSwitch={() => navigation.goBack()} />;
}

```

### src/screens/SettingsScreen.tsx

```tsx
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { SettingsScreenProps } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { Spacing, FontSize, BorderRadius } from '../theme';

export const SettingsScreen: React.FC<SettingsScreenProps> = () => {
  const { currentUser, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const {
    isDarkMode,
    toggleDarkMode,
    notificationsEnabled,
    toggleNotificationsEnabled,
    theme,
  } = useApp();

  const handleLogout = () => {
    if (logoutPending.current) {
      return;
    }
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?',
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            if (logoutPending.current) {
              return;
            }
            logoutPending.current = true;
            setLoggingOut(true);
            try {
              await logout();
            } catch (error) {
              Alert.alert(
                'Không thể đăng xuất',
                error instanceof Error ? error.message : 'Vui lòng thử lại.',
              );
              setLoggingOut(false);
            } finally {
              logoutPending.current = false;
            }
          },
        },
      ],
    );
  };

  const userAvatar = currentUser?.avatar || 'https://i.pravatar.cc/150?img=68';
  const userName = currentUser?.displayName || 'Người dùng';
  const userEmail = currentUser?.email || '';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Cài đặt
          </Text>
        </View>

        {/* Thẻ thông tin cá nhân */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          <Avatar uri={userAvatar} size={76} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {userName}
            </Text>
            <Text
              style={[styles.profileUsername, { color: theme.textSecondary }]}
            >
              Tài khoản Firebase
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textMuted }]}>
              {userEmail}
            </Text>
          </View>
        </View>

        {/* Khối Cài đặt chung */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          TÙY CHỈNH HỆ THỐNG
        </Text>

        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Chế độ tối */}
          <View
            style={[styles.settingRow, { borderBottomColor: theme.border }]}
          >
            <View style={styles.settingLabelGroup}>
              <View
                style={[
                  styles.settingIconWrapper,
                  isDarkMode ? styles.darkModeIcon : styles.lightModeIcon,
                ]}
              >
                <Icon
                  name={isDarkMode ? 'moon' : 'moon-outline'}
                  size={20}
                  color={isDarkMode ? '#D1C4E9' : '#512DA8'}
                />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                Chế độ tối
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.white}
            />
          </View>

          {/* Bật thông báo */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelGroup}>
              <View
                style={[styles.settingIconWrapper, styles.notificationIcon]}
              >
                <Icon
                  name={
                    notificationsEnabled ? 'notifications' : 'notifications-off'
                  }
                  size={20}
                  color="#2E7D32"
                />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                Bật thông báo
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotificationsEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.white}
            />
          </View>
        </View>

        {/* Thông tin ứng dụng */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          THÔNG TIN ỨNG DỤNG
        </Text>

        <View
          style={[
            styles.settingsGroup,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[styles.settingRow, { borderBottomColor: theme.border }]}
          >
            <View style={styles.settingLabelGroup}>
              <View style={[styles.settingIconWrapper, styles.informationIcon]}>
                <Icon
                  name="information-circle-outline"
                  size={20}
                  color="#0288D1"
                />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                Phiên bản
              </Text>
            </View>
            <Text style={[styles.settingValue, { color: theme.textMuted }]}>
              v1.0.0
            </Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelGroup}>
              <View style={[styles.settingIconWrapper, styles.securityIcon]}>
                <Icon
                  name="shield-checkmark-outline"
                  size={20}
                  color="#F57C00"
                />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                Chính sách bảo mật
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={theme.textMuted} />
          </View>
        </View>

        {/* Nút Đăng xuất */}
        <TouchableOpacity
          style={[
            styles.logoutButton,
            {
              backgroundColor: theme.card,
              borderColor: theme.danger,
            },
          ]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Icon name="log-out-outline" size={22} color={theme.danger} />
          <Text style={[styles.logoutText, { color: theme.danger }]}>
            {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  darkModeIcon: { backgroundColor: '#4A148C' },
  lightModeIcon: { backgroundColor: '#EDE7F6' },
  notificationIcon: { backgroundColor: '#E8F5E9' },
  informationIcon: { backgroundColor: '#E1F5FE' },
  securityIcon: { backgroundColor: '#FFF3E0' },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  profileInfo: {
    marginLeft: Spacing.lg,
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileUsername: {
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: FontSize.xs,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  settingsGroup: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: FontSize.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xxl,
    height: 50,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  logoutText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },
});

```

### src/screens/HomeScreen.tsx

```tsx
import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreenProps, Conversation } from '../types';
import { useApp } from '../context/AppContext';
import { useMockChat } from '../context/MockChatContext';
import { SearchBar } from '../components/common/SearchBar';
import { ConversationItem } from '../components/chat/ConversationItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { theme, isDarkMode } = useApp();
  const { conversations, markConversationAsRead } = useMockChat();
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lọc cuộc trò chuyện theo tên (realtime, không phân biệt hoa/thường)
  const filteredConversations = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return conversations;
    }
    return conversations.filter(item =>
      item.name.toLowerCase().includes(trimmed),
    );
  }, [conversations, searchQuery]);

  // Điều hướng sang ChatScreen và reset badge unread về 0
  const handleOpenChat = (item: Conversation) => {
    markConversationAsRead(item.contactId);
    navigation.navigate('Chat', {
      contactId: item.contactId,
      contactName: item.name,
      contactAvatar: item.avatar,
    });
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <ConversationItem
      conversation={item}
      onPress={() => handleOpenChat(item)}
    />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Header tiêu đề */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Trò chuyện
        </Text>
      </View>

      {/* Thanh tìm kiếm realtime */}
      <View style={{ backgroundColor: theme.card, paddingBottom: Spacing.sm }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm kiếm cuộc trò chuyện..."
        />
      </View>

      {/* Danh sách cuộc trò chuyện */}
      <FlatList
        data={filteredConversations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredConversations.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          <EmptyState
            iconName="chatbubbles-outline"
            title="Không tìm thấy kết quả"
            message={`Không có cuộc trò chuyện nào phù hợp với "${searchQuery}"`}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});

```

### src/screens/ContactsScreen.tsx

```tsx
import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContactsScreenProps, Contact } from '../types';
import { useApp } from '../context/AppContext';
import { useMockChat } from '../context/MockChatContext';
import { SearchBar } from '../components/common/SearchBar';
import { ContactItem } from '../components/contact/ContactItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const ContactsScreen: React.FC<ContactsScreenProps> = ({
  navigation,
}) => {
  const { theme } = useApp();
  const { contacts, getOrCreateConversation } = useMockChat();
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lọc danh bạ theo tên người dùng
  const filteredContacts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return contacts;
    }
    return contacts.filter(contact =>
      contact.name.toLowerCase().includes(trimmed),
    );
  }, [contacts, searchQuery]);

  // Nhấn vào người dùng: mở ChatScreen (tạo mới cuộc trò chuyện nếu chưa tồn tại)
  const handleSelectContact = (contact: Contact) => {
    getOrCreateConversation(contact);
    navigation.navigate('Chat', {
      contactId: contact.id,
      contactName: contact.name,
      contactAvatar: contact.avatar,
    });
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <ContactItem contact={item} onPress={() => handleSelectContact(item)} />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>Danh bạ</Text>
        <Text style={[styles.countBadge, { color: theme.textSecondary }]}>
          {filteredContacts.length} liên hệ
        </Text>
      </View>

      {/* Thanh tìm kiếm */}
      <View style={{ backgroundColor: theme.card, paddingBottom: Spacing.sm }}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm bạn bè theo tên..."
        />
      </View>

      {/* FlatList danh bạ */}
      <FlatList
        data={filteredContacts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredContacts.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          <EmptyState
            iconName="people-outline"
            title="Không tìm thấy liên hệ"
            message={`Không có ai trong danh bạ khớp với "${searchQuery}"`}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  countBadge: {
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});

```

### src/screens/ChatScreen.tsx

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatScreenProps, Message } from '../types';
import { useApp } from '../context/AppContext';
import { useMockChat } from '../context/MockChatContext';
import { Avatar } from '../components/common/Avatar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Spacing, FontSize, BorderRadius } from '../theme';

export const ChatScreen: React.FC<ChatScreenProps> = ({
  route,
  navigation,
}) => {
  const { contactId, contactName, contactAvatar } = route.params;
  const { theme } = useApp();
  const { messages, sendMessage } = useMockChat();

  const [inputText, setInputText] = useState<string>('');
  const flatListRef = useRef<FlatList<Message>>(null);

  // Lấy danh sách tin nhắn hiện tại của cuộc trò chuyện này
  const conversationMessages = messages[contactId] || [];

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (conversationMessages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [conversationMessages.length]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      return;
    }
    sendMessage(contactId, trimmed);
    setInputText('');
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.senderId === 'me';
    return <MessageBubble message={item} isMe={isMe} />;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Header tùy chỉnh: Nút back + Avatar + Tên người nhận */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <Avatar uri={contactAvatar} size={40} style={styles.headerAvatar} />

        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {contactName}
          </Text>
          <Text style={[styles.headerStatus, { color: theme.online }]}>
            Đang hoạt động
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerRightAction}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="call-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Khu vực tin nhắn và nhập liệu với KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* Danh sách tin nhắn */}
        <FlatList
          ref={flatListRef}
          data={conversationMessages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Icon
                name="chatbubble-ellipses-outline"
                size={48}
                color={theme.textMuted}
              />
              <Text
                style={[styles.emptyChatText, { color: theme.textSecondary }]}
              >
                Chưa có tin nhắn nào. Hãy gửi lời chào đến {contactName}!
              </Text>
            </View>
          }
        />

        {/* Thanh nhập tin nhắn và nút gửi */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  inputText.trim().length > 0 ? theme.primary : theme.border,
              },
            ]}
            onPress={handleSend}
            disabled={inputText.trim().length === 0}
            activeOpacity={0.8}
          >
            <Icon
              name="send"
              size={18}
              color={
                inputText.trim().length > 0 ? theme.white : theme.textMuted
              }
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  headerAvatar: {
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  headerStatus: {
    fontSize: FontSize.xs - 1,
  },
  headerRightAction: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  chatArea: {
    flex: 1,
  },
  messageList: {
    paddingVertical: Spacing.md,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
    marginTop: Spacing.xxxl * 2,
  },
  emptyChatText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 100,
    minHeight: 40,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: FontSize.md,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
});

```

### src/types/index.ts

```tsx
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// ==================== CÁC MODEL DỮ LIỆU CHÍNH ====================

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Message {
  id: string;
  senderId: string; // 'me' cho người dùng hiện tại, hoặc id của bạn chat
  text: string;
  timestamp: string; // Định dạng hiển thị giờ: "10:30", "Hôm qua"
  createdAt: number;
}

export interface Conversation {
  id: string;
  contactId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  email: string;
  isOnline: boolean;
  statusText?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: 'message' | 'friend_request' | 'system';
}

// ==================== NAVIGATION PARAM LISTS ====================

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Chat: {
    contactId: string;
    contactName: string;
    contactAvatar: string;
  };
};

export type MainTabParamList = {
  HomeTab: undefined;
  ContactsTab: undefined;
  NotificationsTab: undefined;
  SettingsTab: undefined;
};

// ==================== TYPED PROPS CHO SCREEN ====================

export type LoginScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Login'
>;
export type RegisterScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Register'
>;
export type ChatScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Chat'
>;

export type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'HomeTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ContactsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ContactsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type NotificationsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'NotificationsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

```

### src/components/common/AuthForm.tsx

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { BorderRadius, FontSize, Spacing } from '../../theme';

type Field = 'name' | 'email' | 'password' | 'confirmation';
interface Props {
  mode: 'login' | 'register';
  onSwitch: () => void;
}

export function AuthForm({ mode, onSwitch }: Props) {
  const { theme } = useApp();
  const { login, register } = useAuth();
  const isRegister = mode === 'register';
  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    email: '',
    password: '',
    confirmation: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async () => {
    if (submitting.current) {
      return;
    }
    const next: Partial<Record<Field, string>> = {};
    if (isRegister && !values.name.trim()) {
      next.name = 'Vui lòng nhập họ tên.';
    }
    if (!values.email.trim()) {
      next.email = 'Vui lòng nhập email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Email không hợp lệ.';
    }
    if (!values.password) {
      next.password = 'Vui lòng nhập mật khẩu.';
    } else if (isRegister && values.password.length < 6) {
      next.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    }
    if (isRegister && !values.confirmation) {
      next.confirmation = 'Vui lòng nhập lại mật khẩu.';
    } else if (isRegister && values.confirmation !== values.password) {
      next.confirmation = 'Mật khẩu nhập lại không khớp.';
    }
    setErrors(next);
    setAuthError('');
    if (Object.keys(next).length) {
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      if (isRegister) {
        await register(
          values.name.trim(),
          values.email.trim(),
          values.password,
        );
      } else {
        await login(values.email.trim(), values.password);
      }
    } catch (error) {
      if (mounted.current) {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Không thể xác thực. Vui lòng thử lại.',
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  const fields: { key: Field; label: string; placeholder: string }[] = [
    ...(isRegister
      ? [{ key: 'name' as const, label: 'Họ tên', placeholder: 'Nhập họ tên' }]
      : []),
    { key: 'email', label: 'Email', placeholder: 'ban@example.com' },
    {
      key: 'password',
      label: 'Mật khẩu',
      placeholder: isRegister ? 'Ít nhất 6 ký tự' : 'Nhập mật khẩu',
    },
    ...(isRegister
      ? [
          {
            key: 'confirmation' as const,
            label: 'Nhập lại mật khẩu',
            placeholder: 'Nhập lại mật khẩu',
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Icon name="chatbubbles" size={52} color={theme.primary} />
            <Text style={[styles.title, { color: theme.primary }]}>
              ChatApp
            </Text>
            <Text style={{ color: theme.textSecondary }}>
              {isRegister ? 'Tạo tài khoản mới' : 'Đăng nhập để trò chuyện'}
            </Text>
          </View>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {!!authError && (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: theme.danger }]}
              >
                {authError}
              </Text>
            )}
            {fields.map(field => (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {field.label}
                </Text>
                <TextInput
                  accessibilityLabel={field.label}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBackground,
                      borderColor: errors[field.key]
                        ? theme.danger
                        : theme.border,
                    },
                  ]}
                  placeholder={field.placeholder}
                  placeholderTextColor={theme.textMuted}
                  value={values[field.key]}
                  onChangeText={text => {
                    setValues(previous => ({ ...previous, [field.key]: text }));
                    setErrors(previous => ({ ...previous, [field.key]: '' }));
                    setAuthError('');
                  }}
                  editable={!loading}
                  autoCapitalize={field.key === 'name' ? 'words' : 'none'}
                  autoCorrect={false}
                  keyboardType={
                    field.key === 'email' ? 'email-address' : 'default'
                  }
                  secureTextEntry={
                    (field.key === 'password' ||
                      field.key === 'confirmation') &&
                    !visible
                  }
                  textContentType={
                    field.key === 'email'
                      ? 'emailAddress'
                      : field.key === 'name'
                      ? 'name'
                      : isRegister
                      ? 'newPassword'
                      : 'password'
                  }
                />
                {!!errors[field.key] && (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.fieldError, { color: theme.danger }]}
                  >
                    {errors[field.key]}
                  </Text>
                )}
              </View>
            ))}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={() => setVisible(previous => !previous)}
            >
              <Text style={[styles.link, { color: theme.primary }]}>
                {visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[
                styles.button,
                { backgroundColor: theme.primary },
                loading && styles.disabled,
              ]}
              disabled={loading}
              onPress={submit}
            >
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel="Đang xử lý"
                  color={theme.white}
                />
              ) : (
                <Text style={[styles.buttonText, { color: theme.white }]}>
                  {isRegister ? 'Đăng ký' : 'Đăng nhập'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={onSwitch}
            >
              <Text style={[styles.link, { color: theme.primary }]}>
                {isRegister
                  ? 'Đã có tài khoản? Đăng nhập'
                  : 'Chưa có tài khoản? Đăng ký'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.sm },
  title: { fontSize: FontSize.title, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: BorderRadius.xl, padding: Spacing.xl },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
  },
  error: { marginBottom: Spacing.md, fontSize: FontSize.sm },
  fieldError: { marginTop: Spacing.xs, fontSize: FontSize.sm },
  button: {
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonText: { fontSize: FontSize.lg, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  link: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontSize: FontSize.sm,
  },
});

```

### src/services/authService.ts

```tsx
/**
 * authService.ts
 * Toàn bộ logic xác thực: đăng ký, đăng nhập, đăng xuất, lắng nghe trạng thái auth.
 * Screen/Context chỉ gọi các hàm từ file này, KHÔNG import firebase/auth trực tiếp.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { get, ref, set, serverTimestamp } from 'firebase/database';
import { auth, database } from './firebase';

// ==================== TYPES ====================

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  avatar: string;
}

// ==================== HELPER ====================

/** Danh sách avatar ngẫu nhiên từ pravatar */
const AVATAR_LIST = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=9',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=15',
  'https://i.pravatar.cc/150?img=18',
  'https://i.pravatar.cc/150?img=20',
  'https://i.pravatar.cc/150?img=33',
  'https://i.pravatar.cc/150?img=44',
  'https://i.pravatar.cc/150?img=47',
  'https://i.pravatar.cc/150?img=52',
  'https://i.pravatar.cc/150?img=60',
  'https://i.pravatar.cc/150?img=68',
];

const getRandomAvatar = (): string => {
  const index = Math.floor(Math.random() * AVATAR_LIST.length);
  return AVATAR_LIST[index];
};

/**
 * Map mã lỗi Firebase Auth sang thông báo tiếng Việt dễ hiểu.
 */
export const mapFirebaseAuthError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.';
    case 'auth/email-already-in-use':
      return 'Email này đã được dùng để đăng ký tài khoản khác.';
    case 'auth/invalid-email':
      return 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại.';
    case 'auth/weak-password':
      return 'Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.';
    case 'auth/network-request-failed':
      return 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet.';
    case 'auth/too-many-requests':
      return 'Quá nhiều lần thử. Tài khoản tạm thời bị khóa. Hãy thử lại sau.';
    case 'auth/user-disabled':
      return 'Tài khoản này đã bị vô hiệu hoá.';
    case 'auth/operation-not-allowed':
      return 'Đăng nhập Email/Password chưa được bật trong Firebase Console.';
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Không có quyền truy cập dữ liệu. Vui lòng kiểm tra Firebase Rules.';
    default:
      return `Đã xảy ra lỗi (${errorCode}). Vui lòng thử lại.`;
  }
};

export const getAuthErrorMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return mapFirebaseAuthError(error.code);
  }
  return error instanceof Error
    ? error.message
    : 'Đã xảy ra lỗi. Vui lòng thử lại.';
};

// ==================== SERVICES ====================

/**
 * Đăng ký tài khoản mới.
 * Quy trình: createUser → updateProfile(displayName) → ghi users/{uid} vào Database.
 */
export const registerUser = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> => {
  name = name.trim();
  email = email.trim();
  if (!name) {
    throw new Error('Vui lòng nhập họ tên.');
  }
  // 1. Tạo tài khoản Firebase Auth
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const firebaseUser: FirebaseUser = credential.user;

  const avatar = getRandomAvatar();

  // 2. Cập nhật displayName vào profile
  await updateProfile(firebaseUser, { displayName: name, photoURL: avatar });

  // 3. Ghi thông tin user vào Realtime Database (users/{uid})
  //    Luật cho phép: ".write": "$uid === auth.uid"
  const userData = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || email,
    displayName: name,
    avatar,
    createdAt: serverTimestamp(),
  };
  await set(ref(database, `users/${firebaseUser.uid}`), userData);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || email,
    displayName: name,
    avatar,
  };
};

/**
 * Đăng nhập bằng email & password.
 * Trả về AuthUser; AuthContext chuyển lỗi thành thông báo tiếng Việt.
 */
export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthUser> => {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );
  return getUserProfile(credential.user);
};

/** Đọc đúng hồ sơ khi đăng nhập hoặc khôi phục phiên. Lỗi đọc được chuyển cho UI. */
export const getUserProfile = async (
  firebaseUser: FirebaseUser,
): Promise<AuthUser> => {
  const snapshot = await get(ref(database, `users/${firebaseUser.uid}`));
  const profile = snapshot.val() as Partial<AuthUser> | null;
  const user = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName:
      profile?.displayName || firebaseUser.displayName || 'Người dùng',
    avatar: profile?.avatar || firebaseUser.photoURL || AVATAR_LIST[0],
  };
  // Khôi phục hồ sơ nếu lần đăng ký trước tạo Auth thành công nhưng ghi DB thất bại.
  if (!snapshot.exists()) {
    await set(ref(database, `users/${firebaseUser.uid}`), {
      ...user,
      createdAt: serverTimestamp(),
    });
  }
  return user;
};

/**
 * Đăng xuất khỏi Firebase Auth.
 * Ghi offline khi vẫn còn quyền xác thực, sau đó mới signOut.
 * Nếu ghi thất bại, báo lỗi để người dùng thử lại.
 */
export const logoutUser = async (): Promise<void> => {
  const user = auth.currentUser;
  if (user) {
    // Rules status/$uid chỉ cho chủ tài khoản ghi.
    await set(ref(database, `status/${user.uid}`), {
      isOnline: false,
      lastChanged: serverTimestamp(),
    });
  }
  await signOut(auth);
};

/**
 * Lắng nghe thay đổi trạng thái đăng nhập.
 * Trả về hàm unsubscribe để cleanup trong useEffect.
 *
 * @param callback - Nhận null nếu chưa đăng nhập, FirebaseUser nếu đã đăng nhập
 */
export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void,
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Lấy user hiện tại (đồng bộ, không lắng nghe thay đổi).
 */
export const getCurrentFirebaseUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

```

### jest.config.js

```js
module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-vector-icons|@react-native-vector-icons|@react-native-masked-view)/)',
  ],
};

```

### __tests__/App.test.tsx

```tsx
/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
// Kiểm tra giao diện không gọi Firebase thật trong Jest.
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

```

### __tests__/AuthContext.test.tsx

```tsx
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import * as service from '../src/services/authService';

jest.mock('../src/services/authService', () => ({
  onAuthChange: jest.fn(),
  getUserProfile: jest.fn(),
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  logoutUser: jest.fn(),
  getCurrentFirebaseUser: jest.fn(),
  getAuthErrorMessage: (error: Error) => error.message,
}));

const profile = {
  uid: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  avatar: 'avatar',
};
let auth: ReturnType<typeof useAuth>;
let notify: Parameters<typeof service.onAuthChange>[0];
let renderer: ReactTestRenderer;
const unsubscribe = jest.fn();

function Probe() {
  auth = useAuth();
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(service.onAuthChange).mockImplementation(callback => {
    notify = callback;
    return unsubscribe;
  });
  await act(async () => {
    renderer = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('restores session only after profile loads and unsubscribes on unmount', async () => {
  let resolveProfile!: (value: typeof profile) => void;
  jest.mocked(service.getUserProfile).mockReturnValue(
    new Promise(resolve => {
      resolveProfile = resolve;
    }),
  );
  await act(async () =>
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]),
  );
  expect(auth.initializing).toBe(true);
  expect(auth.currentUser).toBeNull();
  await act(async () => {
    resolveProfile(profile);
  });
  expect(auth.currentUser).toEqual(profile);
  expect(auth.initializing).toBe(false);
  await act(async () => renderer.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('does not navigate with a half-written registration profile', async () => {
  await act(async () => notify(null));
  let resolveRegistration!: (value: typeof profile) => void;
  jest.mocked(service.registerUser).mockImplementation(() => {
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]);
    return new Promise(resolve => {
      resolveRegistration = resolve;
    });
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = auth.register('Alice', profile.email, 'secret');
  });
  expect(auth.currentUser).toBeNull();
  expect(service.getUserProfile).not.toHaveBeenCalled();
  await act(async () => {
    resolveRegistration(profile);
    await pending;
  });
  expect(auth.currentUser).toEqual(profile);
});

test('failed logout keeps the authenticated screen; successful logout clears it', async () => {
  jest.mocked(service.loginUser).mockResolvedValue(profile);
  await act(async () => {
    await auth.login(profile.email, 'secret');
  });
  jest
    .mocked(service.logoutUser)
    .mockRejectedValueOnce(new Error('Không có mạng'));
  await act(async () => {
    await expect(auth.logout()).rejects.toThrow('Không có mạng');
  });
  expect(auth.currentUser).toEqual(profile);
  jest.mocked(service.logoutUser).mockResolvedValueOnce(undefined);
  await act(async () => {
    await auth.logout();
  });
  expect(auth.currentUser).toBeNull();
});

test('failed restoration exposes an error and permits retry', async () => {
  jest
    .mocked(service.getUserProfile)
    .mockRejectedValueOnce(new Error('Không đọc được hồ sơ'));
  await act(async () =>
    notify({ uid: profile.uid } as Parameters<typeof notify>[0]),
  );
  expect(auth.initializing).toBe(false);
  expect(auth.currentUser).toBeNull();
  expect(auth.sessionError).toBe('Không đọc được hồ sơ');
  jest
    .mocked(service.getCurrentFirebaseUser)
    .mockReturnValue({ uid: profile.uid } as ReturnType<
      typeof service.getCurrentFirebaseUser
    >);
  jest.mocked(service.getUserProfile).mockResolvedValueOnce(profile);
  await act(async () => {
    await auth.retrySession();
  });
  expect(auth.currentUser).toEqual(profile);
  expect(auth.sessionError).toBe('');
});

```

### __tests__/AuthForm.test.tsx

```tsx
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

```
## Cách kiểm tra

1. Khi chưa có phiên, mở app phải thấy Login email/mật khẩu trống, không còn admin/123456. Trong lúc khôi phục phiên có loading.
2. Mở Đăng ký: thử để trống họ tên, sai định dạng email, mật khẩu dưới 6 ký tự, nhập lại không khớp. Phải thấy lỗi ở từng ô và không gửi đăng ký.
3. Đăng ký tài khoản A hợp lệ. Phải tự vào Main. Kiểm tra Authentication/Users có email A; Database/users/{uidA} có uid, email, displayName, avatar, createdAt.
4. Vào Cài đặt: tên/email/avatar khớp hồ sơ. Bật Dark Mode, kiểm tra các màn hình. Màn hình Thông báo vẫn hiển thị dữ liệu mock.
5. Đóng hẳn app, mở lại: chờ khôi phục, tự vào Main, không cần đăng nhập lại. Fast Refresh không được báo auth/already-initialized.
6. Đăng xuất trong Cài đặt: tự về Login; nút Back không quay lại Main. Kiểm tra Database/status/{uidA}/isOnline là false.
7. Đăng nhập sai mật khẩu: hiện thông báo tiếng Việt, nút hết loading để thử lại. Đăng nhập đúng: vào Main. Đăng ký lại cùng email: hiện lỗi email đã sử dụng.
8. Tắt mạng và thử đăng nhập: phải hiện lỗi khi Firebase trả lỗi mạng. Khi ghi Realtime Database không có kết nối, SDK có thể giữ yêu cầu chờ kết nối lại; đây chưa phải kiểm chứng timeout của mạng. Đăng xuất hiện chờ ghi offline thành công trước signOut.
9. Thử tài khoản B trên thiết bị thứ hai: kiểm tra đăng ký, đăng nhập và thông tin Cài đặt độc lập. Chưa kiểm tra gửi/nhận giữa A/B vì chat realtime ở giai đoạn 4.
10. Khi ổn, gõ “tiếp tục” để sang giai đoạn 3: presenceService và Danh bạ realtime.
