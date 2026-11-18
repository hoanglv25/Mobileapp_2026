import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationsScreenProps, AppNotification } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { groupAvatarUri, useUsers } from '../context/UsersContext';
import { NotificationItem } from '../components/notification/NotificationItem';
import { EmptyState } from '../components/common/EmptyState';
import { getAuthErrorMessage } from '../services/authService';
import { getPartnerUid } from '../utils/conversationId';
import { Spacing, FontSize } from '../theme';

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  navigation,
}) => {
  const { theme } = useApp();
  const { currentUser } = useAuth();
  const { getName, getAvatar } = useUsers();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications();
  const [onlyUnread, setOnlyUnread] = useState<boolean>(false);

  const displayedNotifications = useMemo(
    () =>
      onlyUnread ? notifications.filter(item => !item.read) : notifications,
    [notifications, onlyUnread],
  );

  const reportError = (failure: unknown) =>
    Alert.alert('Không cập nhật được thông báo', getAuthErrorMessage(failure));

  // Nhấn thông báo: đánh dấu đã đọc và mở đúng cuộc trò chuyện.
  const handleOpen = (item: AppNotification) => {
    if (!item.read) {
      markRead([item.id]).catch(reportError);
    }
    if (!item.convId || !currentUser) {
      return;
    }
    // Id 1-1 có dạng "uidA_uidB" chứa uid của mình; id nhóm là push key.
    const partner = getPartnerUid(item.convId, currentUser.uid);
    if (partner) {
      navigation.navigate('Chat', {
        conversationId: item.convId,
        type: 'direct',
        name: getName(partner),
        avatar: getAvatar(partner),
        contactId: partner,
      });
    } else {
      navigation.navigate('Chat', {
        conversationId: item.convId,
        type: 'group',
        name: 'Nhóm',
        avatar: groupAvatarUri('Nhóm'),
      });
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <NotificationItem
      notification={item}
      onPress={() => handleOpen(item)}
      onMarkRead={() => markRead([item.id]).catch(reportError)}
    />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Thông báo
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: unreadCount === 0 }}
          disabled={unreadCount === 0}
          onPress={() => markAllRead().catch(reportError)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={[
              styles.readAllButton,
              { color: unreadCount === 0 ? theme.textMuted : theme.primary },
            ]}
          >
            Đánh dấu tất cả đã đọc
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.filterRow,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.filterLabel, { color: theme.text }]}>
          Chỉ hiện thông báo chưa đọc
        </Text>
        <Switch
          value={onlyUnread}
          onValueChange={setOnlyUnread}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor={theme.white}
        />
      </View>

      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[styles.notice, { color: theme.danger }]}
        >
          {error}
        </Text>
      )}

      <FlatList
        data={displayedNotifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          displayedNotifications.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải thông báo"
              size="large"
              color={theme.primary}
            />
          ) : error ? undefined : (
            <EmptyState
              iconName="notifications-off-outline"
              title="Không có thông báo nào"
              message={
                onlyUnread
                  ? 'Bạn đã xem hết toàn bộ các thông báo mới.'
                  : 'Thông báo về tin nhắn, nhóm và cảm xúc sẽ xuất hiện ở đây.'
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: { padding: Spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.title, fontWeight: '800' },
  readAllButton: { fontSize: FontSize.sm, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterLabel: { fontSize: FontSize.sm, fontWeight: '500' },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
});
