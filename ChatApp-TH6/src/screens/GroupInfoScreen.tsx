import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ConversationMeta, GroupInfoScreenProps } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../context/UsersContext';
import { Avatar } from '../components/common/Avatar';
import { getAuthErrorMessage } from '../services/authService';
import { subscribeConversationMeta } from '../services/chatService';
import {
  addGroupMembers,
  leaveGroup,
  MAX_GROUP_NAME,
  removeGroupMember,
  renameGroup,
} from '../services/groupService';
import { Spacing, FontSize, BorderRadius } from '../theme';

/** Quản trị nhóm: đổi tên, thêm/xóa thành viên, rời nhóm. */
export const GroupInfoScreen: React.FC<GroupInfoScreenProps> = ({
  route,
  navigation,
}) => {
  const { conversationId } = route.params;
  const { theme } = useApp();
  const { currentUser } = useAuth();
  const { users, getName } = useUsers();
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeConversationMeta(
      conversationId,
      value => {
        if (!active) {
          return;
        }
        setMeta(value);
        setLoading(false);
        if (value) {
          setName(previous => previous || value.name);
        }
      },
      () => active && setLoading(false),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId]);

  const me = currentUser?.uid;
  const isAdmin = !!me && meta?.createdBy === me;
  const candidates = useMemo(
    () =>
      Object.values(users)
        .filter(user => !meta?.members.includes(user.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [users, meta],
  );

  const run = async (action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('Không thực hiện được', getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !meta || !currentUser) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <Text style={{ color: theme.textSecondary }}>
            Bạn không còn trong nhóm này.
          </Text>
        )}
      </SafeAreaView>
    );
  }

  const confirmLeave = () =>
    Alert.alert('Rời nhóm', `Bạn có chắc muốn rời nhóm "${meta.name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await leaveGroup(
              currentUser,
              meta.id,
              meta.name,
              meta.members,
              meta.createdBy,
            );
            navigation.navigate('Main');
          }),
      },
    ]);

  const confirmRemove = (uid: string) =>
    Alert.alert('Xóa thành viên', `Xóa ${getName(uid)} khỏi nhóm?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () =>
          run(() =>
            removeGroupMember(
              currentUser,
              meta.id,
              meta.name,
              meta.members,
              uid,
              getName(uid),
            ),
          ),
      },
    ]);

  const names = Object.fromEntries(
    Object.values(users).map(user => [user.id, user.name]),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Thông tin nhóm</Text>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={{ color: theme.textSecondary }}>Tên nhóm</Text>
        <View style={styles.nameRow}>
          <TextInput
            accessibilityLabel="Tên nhóm"
            value={name}
            onChangeText={setName}
            editable={isAdmin && !busy}
            maxLength={MAX_GROUP_NAME}
            style={[
              styles.nameInput,
              { color: theme.text, backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
          />
          {isAdmin && (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy || !name.trim() || name.trim() === meta.name}
              onPress={() =>
                run(() => renameGroup(currentUser, meta.id, meta.members, meta.name, name))
              }
            >
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Lưu</Text>
            </TouchableOpacity>
          )}
        </View>
        {!isAdmin && (
          <Text style={{ color: theme.textMuted, fontSize: FontSize.xs }}>
            Chỉ người tạo nhóm mới đổi tên hoặc xóa thành viên.
          </Text>
        )}
      </View>

      <View style={styles.membersHeader}>
        <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>
          THÀNH VIÊN ({meta.members.length})
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => setAdding(previous => !previous)}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>
            {adding ? 'Đóng' : '+ Thêm'}
          </Text>
        </TouchableOpacity>
      </View>

      {adding ? (
        <>
          <FlatList
            style={{ flex: 1 }}
            data={candidates}
            keyExtractor={item => item.id}
            extraData={picked}
            ListEmptyComponent={
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Mọi người trong danh bạ đã ở trong nhóm.
              </Text>
            }
            renderItem={({ item }) => {
              const checked = picked.includes(item.id);
              return (
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() =>
                    setPicked(previous =>
                      checked ? previous.filter(id => id !== item.id) : [...previous, item.id],
                    )
                  }
                  style={[styles.row, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
                >
                  <Avatar uri={item.avatar} size={40} />
                  <Text style={[styles.rowName, { color: theme.text }]}>{item.name}</Text>
                  <Icon
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={checked ? theme.primary : theme.textMuted}
                  />
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || picked.length === 0}
            onPress={() =>
              run(async () => {
                await addGroupMembers(currentUser, meta.id, meta.name, meta.members, picked, names);
                setPicked([]);
                setAdding(false);
              })
            }
            style={[
              styles.button,
              { backgroundColor: picked.length ? theme.primary : theme.border },
            ]}
          >
            <Text style={{ color: theme.white, fontWeight: '700' }}>
              Thêm {picked.length || ''} thành viên
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={meta.members}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
              <Avatar uri={users[item]?.avatar || ''} size={40} />
              <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                {getName(item)}
                {item === me ? ' (Bạn)' : ''}
                {item === meta.createdBy ? ' · Quản trị' : ''}
              </Text>
              {isAdmin && item !== me && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ${getName(item)} khỏi nhóm`}
                  onPress={() => confirmRemove(item)}
                >
                  <Icon name="remove-circle-outline" size={24} color={theme.danger} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy}
        onPress={confirmLeave}
        style={[styles.button, { backgroundColor: theme.danger, margin: Spacing.lg }]}
      >
        {busy ? (
          <ActivityIndicator color={theme.white} />
        ) : (
          <Text style={{ color: theme.white, fontWeight: '700' }}>Rời nhóm</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: Spacing.xs, marginRight: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  section: { padding: Spacing.lg, gap: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { flex: 1, fontSize: FontSize.md, fontWeight: '600' },
  hint: { padding: Spacing.lg, textAlign: 'center' },
  button: {
    height: 46,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
