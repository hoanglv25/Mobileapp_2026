import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RealtimeConversation } from '../../types';
import { formatConversationTime } from '../../utils/formatConversationTime';
import { Avatar } from '../common/Avatar';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useUsers } from '../../context/UsersContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';

interface Props {
  conversation: RealtimeConversation;
  onPress: () => void;
  now?: number;
}

export const ConversationItem: React.FC<Props> = ({
  conversation,
  onPress,
  now,
}) => {
  const { theme } = useApp();
  const { currentUser } = useAuth();
  const { getName } = useUsers();
  const sender = conversation.lastSenderId;
  // "Bạn: ..." cho tin của mình; trong nhóm hiện tên người gửi. Tin hệ thống không có tiền tố.
  const isSystem = /^(.+ đã (tạo|đổi|thêm|xóa|rời))/.test(conversation.lastMessage);
  const prefix =
    isSystem || !sender
      ? ''
      : sender === currentUser?.uid
      ? 'Bạn: '
      : conversation.type === 'group'
      ? `${getName(sender)}: `
      : '';
  const hasUnread = conversation.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.name}, ${conversation.unreadCount} tin chưa đọc, ${prefix}${conversation.lastMessage}`}
      activeOpacity={0.7}
    >
      <Avatar
        uri={conversation.avatar}
        size={54}
        showOnline={conversation.type === 'direct' && conversation.statusKnown}
        isOnline={conversation.isOnline}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              { color: theme.text },
              hasUnread ? styles.unreadName : styles.readName,
            ]}
            numberOfLines={1}
          >
            {conversation.name}
          </Text>
          <Text
            style={[
              styles.time,
              { color: hasUnread ? theme.primary : theme.textMuted },
            ]}
          >
            {formatConversationTime(conversation.lastMessageTime, now)}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[
              styles.lastMessage,
              {
                color: hasUnread ? theme.text : theme.textSecondary,
              },
              hasUnread ? styles.unreadPreview : styles.readPreview,
            ]}
            numberOfLines={1}
          >
            {prefix}
            {conversation.lastMessage}
          </Text>
          {hasUnread && (
            <View
              style={[styles.badge, { backgroundColor: theme.unreadBadge }]}
            >
              <Text style={[styles.badgeText, { color: theme.white }]}>
                {conversation.unreadCount > 99
                  ? '99+'
                  : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  unreadName: { fontWeight: '700' },
  readName: { fontWeight: '600' },
  unreadPreview: { fontWeight: '600' },
  readPreview: { fontWeight: '400' },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: FontSize.md,
    flex: 1,
    marginRight: Spacing.sm,
  },
  time: {
    fontSize: FontSize.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: FontSize.sm,
    flex: 1,
    marginRight: Spacing.sm,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: BorderRadius.round,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
