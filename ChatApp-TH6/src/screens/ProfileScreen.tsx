import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ProfileScreenProps } from '../types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { getAuthErrorMessage } from '../services/authService';
import { pickImage } from '../services/imagePickerService';
import { uploadImage } from '../services/uploadService';
import { Spacing, FontSize, BorderRadius } from '../theme';

/** Hồ sơ cá nhân: đổi họ tên và ảnh đại diện (Cloudinary). Ảnh mới hiện ở Danh bạ, Home, Chat. */
export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { theme } = useApp();
  const { currentUser, updateProfile, connected } = useAuth();
  const [name, setName] = useState(currentUser?.displayName || '');
  const [busy, setBusy] = useState<'avatar' | 'name' | null>(null);
  const lock = useRef(false);

  const run = async (kind: 'avatar' | 'name', action: () => Promise<void>) => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      Alert.alert('Không cập nhật được', getAuthErrorMessage(error));
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const changeAvatar = () =>
    run('avatar', async () => {
      const image = await pickImage('library');
      if (!image) {
        return;
      }
      const url = await uploadImage(image);
      await updateProfile({ avatar: url });
    });

  const saveName = () =>
    run('name', async () => {
      await updateProfile({ displayName: name });
    });

  const unchanged = name.trim() === currentUser?.displayName;

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
        <Text style={[styles.title, { color: theme.text }]}>Hồ sơ cá nhân</Text>
      </View>
      <View style={styles.body}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Đổi ảnh đại diện"
          disabled={busy !== null || connected !== true}
          onPress={changeAvatar}
        >
          <Avatar uri={currentUser?.avatar || ''} size={110} />
          <View style={[styles.camera, { backgroundColor: theme.primary }]}>
            {busy === 'avatar' ? (
              <ActivityIndicator color={theme.white} size="small" />
            ) : (
              <Icon name="camera" size={18} color={theme.white} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={{ color: theme.textSecondary }}>{currentUser?.email}</Text>
        <TextInput
          accessibilityLabel="Họ tên"
          value={name}
          onChangeText={setName}
          maxLength={50}
          placeholder="Họ tên"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.inputBackground, borderColor: theme.border },
          ]}
        />
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy !== null || !name.trim() || unchanged || connected !== true}
          onPress={saveName}
          style={[
            styles.button,
            {
              backgroundColor:
                busy !== null || !name.trim() || unchanged || connected !== true
                  ? theme.border
                  : theme.primary,
            },
          ]}
        >
          {busy === 'name' ? (
            <ActivityIndicator color={theme.white} />
          ) : (
            <Text style={{ color: theme.white, fontWeight: '700' }}>Lưu họ tên</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: Spacing.xs, marginRight: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  body: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.lg },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
  },
  button: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
