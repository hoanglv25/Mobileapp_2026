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
import { ConversationsProvider } from '../context/ConversationsContext';
import { UsersProvider } from '../context/UsersContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { GroupInfoScreen } from '../screens/GroupInfoScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
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
    <UsersProvider key={currentUser?.uid || 'signed-out'}>
      <ConversationsProvider>
        <NotificationsProvider>
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
                <Stack.Screen
                  name="CreateGroup"
                  component={CreateGroupScreen}
                />
                <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
              </Stack.Group>
            ) : (
              <Stack.Group navigationKey="guest">
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
              </Stack.Group>
            )}
          </Stack.Navigator>
        </NotificationsProvider>
      </ConversationsProvider>
    </UsersProvider>
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
