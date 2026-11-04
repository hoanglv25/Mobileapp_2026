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
    <ConversationsProvider key={currentUser?.uid || 'signed-out'}>
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
    </ConversationsProvider>
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
