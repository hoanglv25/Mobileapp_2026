import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';

// ==================== CÁC MODEL DỮ LIỆU CHÍNH ====================

export type ConversationType = 'direct' | 'group';
export type MessageType = 'text' | 'image' | 'location' | 'system';

/** Tin được trích dẫn khi trả lời (reply/quote). */
export interface ReplyRef {
  id: string;
  senderId: string;
  text: string;
}

// Tin nhắn Firebase dùng UID thật và thời gian dạng số.
export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  text: string;
  createdAt: number;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
  recalled: boolean;
  /** uid -> emoji */
  reactions: Record<string, string>;
  replyTo?: ReplyRef;
}

/** conversations/{convId} */
export interface ConversationMeta {
  id: string;
  type: ConversationType;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: number;
}

/** Một dòng ở màn hình Home (userChats/{uid}/{convId} + hồ sơ đối tác). */
export interface RealtimeConversation {
  id: string;
  type: ConversationType;
  /** Chỉ có với chat 1-1: UID người kia. */
  contactId?: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastSenderId: string;
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

export type NotificationType = 'message' | 'group_add' | 'reaction' | 'system';

/** notifications/{uid}/{id} */
export interface AppNotification {
  id: string;
  type: NotificationType;
  convId: string;
  fromUid: string;
  fromName: string;
  text: string;
  createdAt: number;
  read: boolean;
}

// ==================== NAVIGATION PARAM LISTS ====================

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Chat: {
    conversationId: string;
    type: ConversationType;
    name: string;
    avatar: string;
    /** Chỉ có với chat 1-1. */
    contactId?: string;
  };
  CreateGroup: undefined;
  GroupInfo: { conversationId: string };
  Profile: undefined;
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
export type CreateGroupScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateGroup'
>;
export type GroupInfoScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'GroupInfo'
>;
export type ProfileScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Profile'
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
