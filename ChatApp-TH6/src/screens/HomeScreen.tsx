import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { HomeScreenProps, RealtimeConversation } from '../types';
import { useApp } from '../context/AppContext';
import { useConversations } from '../context/ConversationsContext';
import { useAuth } from '../context/AuthContext';
import { SearchBar } from '../components/common/SearchBar';
import { ConversationItem } from '../components/chat/ConversationItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { theme, isDarkMode } = useApp();
  const { conversations, loading, error, retry } = useConversations();
  const { connected } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  // ChatScreen đánh dấu đã đọc sau khi tải tin thành công và có focus.
  const handleOpenChat = (item: RealtimeConversation) => {
    navigation.navigate('Chat', {
      conversationId: item.id,
      type: item.type,
      name: item.name,
      avatar: item.avatar,
      contactId: item.contactId,
    });
  };

  const renderItem = ({ item }: { item: RealtimeConversation }) => (
    <ConversationItem
      conversation={item}
      now={now}
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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Tạo nhóm"
          onPress={() => navigation.navigate('CreateGroup')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="people-circle-outline" size={32} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {connected === false && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          Chưa kết nối Firebase. Danh sách có thể chưa cập nhật.
        </Text>
      )}
      {!!error && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử lại
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
        extraData={now}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredConversations.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              accessibilityLabel="Đang tải trò chuyện"
              size="large"
              color={theme.primary}
            />
          ) : error ? undefined : (
            <EmptyState
              iconName="chatbubbles-outline"
              title={
                searchQuery.trim()
                  ? 'Không tìm thấy kết quả'
                  : 'Chưa có cuộc trò chuyện'
              }
              message={
                searchQuery.trim()
                  ? `Không có cuộc trò chuyện nào phù hợp với "${searchQuery}"`
                  : 'Chọn một người trong Danh bạ và gửi tin nhắn đầu tiên.'
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  notice: { padding: Spacing.lg },
  retry: { paddingVertical: Spacing.sm },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
