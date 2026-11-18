import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { CreateGroupScreenProps } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { groupAvatarUri, useUsers } from '../context/UsersContext';
import { Avatar } from '../components/common/Avatar';
import { SearchBar } from '../components/common/SearchBar';
import { EmptyState } from '../components/common/EmptyState';
import { getAuthErrorMessage } from '../services/authService';
import {
  createGroup,
  MAX_GROUP_NAME,
  MIN_OTHER_MEMBERS,
} from '../services/groupService';
import { Spacing, FontSize, BorderRadius } from '../theme';

export const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({
  navigation,
}) => {
  const { theme } = useApp();
  const { currentUser, connected } = useAuth();
  const { users } = useUsers();
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const contacts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return Object.values(users)
      .filter(user => user.id !== currentUser?.uid)
      .filter(
        user =>
          !text ||
          user.name.toLowerCase().includes(text) ||
          user.email.toLowerCase().includes(text),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [users, query, currentUser]);

  const toggle = (id: string) =>
    setSelected(previous =>
      previous.includes(id)
        ? previous.filter(value => value !== id)
        : [...previous, id],
    );

  const enough = selected.length >= MIN_OTHER_MEMBERS;
  const canCreate =
    !!groupName.trim() && enough && connected === true && !creating;

  const handleCreate = async () => {
    if (!currentUser || !canCreate || lock.current) {
      return;
    }
    lock.current = true;
    setCreating(true);
    setError('');
    try {
      const name = groupName.trim();
      const convId = await createGroup(currentUser, name, selected);
      navigation.replace('Chat', {
        conversationId: convId,
        type: 'group',
        name,
        avatar: groupAvatarUri(name),
      });
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
      setCreating(false);
    } finally {
      lock.current = false;
    }
  };

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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Tạo nhóm</Text>
      </View>

      <View style={[styles.nameBox, { backgroundColor: theme.card }]}>
        <TextInput
          accessibilityLabel="Tên nhóm"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={MAX_GROUP_NAME}
          placeholder="Tên nhóm"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.nameInput,
            {
              color: theme.text,
              backgroundColor: theme.inputBackground,
              borderColor: theme.border,
            },
          ]}
        />
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: enough ? theme.success : theme.textSecondary }}
        >
          Đã chọn {selected.length} người
          {enough ? '' : ` (cần tối thiểu ${MIN_OTHER_MEMBERS} người ngoài bạn)`}
        </Text>
      </View>
      <View style={{ backgroundColor: theme.card, paddingBottom: Spacing.sm }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm trong danh bạ..."
        />
      </View>

      {!!error && (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      )}

      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        extraData={selected}
        contentContainerStyle={contacts.length === 0 ? styles.empty : undefined}
        ListEmptyComponent={
          <EmptyState
            iconName="people-outline"
            title="Không có liên hệ"
            message="Cần có người dùng khác trong danh bạ để tạo nhóm."
          />
        }
        renderItem={({ item }) => {
          const checked = selected.includes(item.id);
          return (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={item.name}
              onPress={() => toggle(item.id)}
              style={[
                styles.row,
                { backgroundColor: theme.card, borderBottomColor: theme.border },
              ]}
            >
              <Avatar uri={item.avatar} size={44} />
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: FontSize.xs }} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
              <Icon
                name={checked ? 'checkbox' : 'square-outline'}
                size={26}
                color={checked ? theme.primary : theme.textMuted}
              />
            </TouchableOpacity>
          );
        }}
      />

      <View
        style={[
          styles.footer,
          { backgroundColor: theme.card, borderTopColor: theme.border },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate, busy: creating }}
          disabled={!canCreate}
          onPress={handleCreate}
          style={[
            styles.createButton,
            { backgroundColor: canCreate ? theme.primary : theme.border },
          ]}
        >
          {creating ? (
            <ActivityIndicator color={theme.white} />
          ) : (
            <Text style={{ color: canCreate ? theme.white : theme.textMuted, fontWeight: '700' }}>
              Tạo nhóm
            </Text>
          )}
        </TouchableOpacity>
        {connected !== true && (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.xs }}>
            Chưa kết nối Firebase.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: Spacing.xs, marginRight: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  nameBox: { padding: Spacing.lg, gap: Spacing.sm },
  nameInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md,
  },
  error: { padding: Spacing.lg },
  empty: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, marginHorizontal: Spacing.md },
  rowName: { fontSize: FontSize.md, fontWeight: '600' },
  footer: { padding: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  createButton: {
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
