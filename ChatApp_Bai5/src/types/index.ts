import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// ==================== CÁC MODEL DỮ LIỆU CHÍNH ====================

// Tin nhắn Firebase dùng UID thật và thời gian dạng số.
export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  type: 'text' | 'location';
  text: string;
  createdAt: number;
  latitude?: number;
  longitude?: number;
}

export interface RealtimeConversation {
  id: string;
  chatId: string;
  contactId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  isOnline: boolean;
  statusKnown: boolean;
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
