import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContactsScreenProps, Contact } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { subscribeContacts } from '../services/userService';
import { getAuthErrorMessage } from '../services/authService';
import { getDirectConversationId } from '../utils/conversationId';
import { SearchBar } from '../components/common/SearchBar';
import { ContactItem } from '../components/contact/ContactItem';
import { EmptyState } from '../components/common/EmptyState';
import { Spacing, FontSize } from '../theme';

export const ContactsScreen: React.FC<ContactsScreenProps> = ({
  navigation,
}) => {
  const { theme } = useApp();
  const { currentUser, connected, presenceError, retryPresence } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const uid = currentUser?.uid;

  useEffect(() => {
    setContacts([]);
    setLoading(true);
    setError('');
    if (!uid) {
      setLoading(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeContacts(
      uid,
      list => {
        if (!active) {
          return;
        }
        setContacts(list);
        setLoading(false);
        setError('');
      },
      failure => {
        if (!active) {
          return;
        }
        setContacts([]);
        setLoading(false);
        setError(getAuthErrorMessage(failure));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  const retry = () => {
    setAttempt(previous => previous + 1);
    retryPresence();
  };

  // Lọc danh bạ theo tên người dùng
  const filteredContacts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    return contacts
      .filter(
        contact =>
          !trimmed ||
          contact.name.toLowerCase().includes(trimmed) ||
          contact.email.toLowerCase().includes(trimmed),
      )
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          a.name.localeCompare(b.name, 'vi'),
      );
  }, [contacts, searchQuery]);

  // Chỉ mở Chat; cuộc trò chuyện xuất hiện ở Home sau khi có tin nhắn thật.
  const handleSelectContact = (contact: Contact) => {
    if (!uid) {
      return;
    }
    navigation.navigate('Chat', {
      conversationId: getDirectConversationId(uid, contact.id),
      type: 'direct',
      name: contact.name,
      avatar: contact.avatar,
      contactId: contact.id,
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
          placeholder="Tìm theo tên hoặc email..."
        />
      </View>

      {connected === false && (
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          Chưa kết nối Firebase. Danh bạ và trạng thái có thể chưa cập nhật.
        </Text>
      )}
      {!!(
        error ||
        presenceError ||
        contacts.some(
          contact => contact.statusText === 'Không đọc được trạng thái',
        )
      ) && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error ||
              presenceError ||
              'Một số trạng thái chưa tải được. Vui lòng thử lại.'}
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}>
            <Text style={[styles.retry, { color: theme.primary }]}>
              Thử lại
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FlatList danh bạ */}
      <FlatList
        data={filteredContacts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredContacts.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyList}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.retry, { color: theme.textSecondary }]}>
                Đang tải danh bạ…
              </Text>
            </View>
          ) : error ? undefined : (
            <EmptyState
              iconName="people-outline"
              title={
                searchQuery.trim()
                  ? 'Không tìm thấy liên hệ'
                  : 'Chưa có liên hệ'
              }
              message={
                searchQuery.trim()
                  ? `Không có ai khớp với "${searchQuery}"`
                  : 'Người dùng khác sẽ xuất hiện sau khi đăng ký tài khoản.'
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
  retry: { paddingVertical: Spacing.md, textAlign: 'center' },
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
