import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { BorderRadius, FontSize, Spacing } from '../../theme';

type Field = 'name' | 'email' | 'password' | 'confirmation';
interface Props {
  mode: 'login' | 'register';
  onSwitch: () => void;
}

export function AuthForm({ mode, onSwitch }: Props) {
  const { theme } = useApp();
  const { login, register } = useAuth();
  const isRegister = mode === 'register';
  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    email: '',
    password: '',
    confirmation: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async () => {
    if (submitting.current) {
      return;
    }
    const next: Partial<Record<Field, string>> = {};
    if (isRegister && !values.name.trim()) {
      next.name = 'Vui lòng nhập họ tên.';
    }
    if (!values.email.trim()) {
      next.email = 'Vui lòng nhập email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Email không hợp lệ.';
    }
    if (!values.password) {
      next.password = 'Vui lòng nhập mật khẩu.';
    } else if (isRegister && values.password.length < 6) {
      next.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    }
    if (isRegister && !values.confirmation) {
      next.confirmation = 'Vui lòng nhập lại mật khẩu.';
    } else if (isRegister && values.confirmation !== values.password) {
      next.confirmation = 'Mật khẩu nhập lại không khớp.';
    }
    setErrors(next);
    setAuthError('');
    if (Object.keys(next).length) {
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      if (isRegister) {
        await register(
          values.name.trim(),
          values.email.trim(),
          values.password,
        );
      } else {
        await login(values.email.trim(), values.password);
      }
    } catch (error) {
      if (mounted.current) {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Không thể xác thực. Vui lòng thử lại.',
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  const fields: { key: Field; label: string; placeholder: string }[] = [
    ...(isRegister
      ? [{ key: 'name' as const, label: 'Họ tên', placeholder: 'Nhập họ tên' }]
      : []),
    { key: 'email', label: 'Email', placeholder: 'ban@example.com' },
    {
      key: 'password',
      label: 'Mật khẩu',
      placeholder: isRegister ? 'Ít nhất 6 ký tự' : 'Nhập mật khẩu',
    },
    ...(isRegister
      ? [
          {
            key: 'confirmation' as const,
            label: 'Nhập lại mật khẩu',
            placeholder: 'Nhập lại mật khẩu',
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Icon name="chatbubbles" size={52} color={theme.primary} />
            <Text style={[styles.title, { color: theme.primary }]}>
              ChatApp
            </Text>
            <Text style={{ color: theme.textSecondary }}>
              {isRegister ? 'Tạo tài khoản mới' : 'Đăng nhập để trò chuyện'}
            </Text>
          </View>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {!!authError && (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: theme.danger }]}
              >
                {authError}
              </Text>
            )}
            {fields.map(field => (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {field.label}
                </Text>
                <TextInput
                  accessibilityLabel={field.label}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBackground,
                      borderColor: errors[field.key]
                        ? theme.danger
                        : theme.border,
                    },
                  ]}
                  placeholder={field.placeholder}
                  placeholderTextColor={theme.textMuted}
                  value={values[field.key]}
                  onChangeText={text => {
                    setValues(previous => ({ ...previous, [field.key]: text }));
                    setErrors(previous => ({ ...previous, [field.key]: '' }));
                    setAuthError('');
                  }}
                  editable={!loading}
                  autoCapitalize={field.key === 'name' ? 'words' : 'none'}
                  autoCorrect={false}
                  keyboardType={
                    field.key === 'email' ? 'email-address' : 'default'
                  }
                  secureTextEntry={
                    (field.key === 'password' ||
                      field.key === 'confirmation') &&
                    !visible
                  }
                  textContentType={
                    field.key === 'email'
                      ? 'emailAddress'
                      : field.key === 'name'
                      ? 'name'
                      : isRegister
                      ? 'newPassword'
                      : 'password'
                  }
                />
                {!!errors[field.key] && (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.fieldError, { color: theme.danger }]}
                  >
                    {errors[field.key]}
                  </Text>
                )}
              </View>
            ))}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={() => setVisible(previous => !previous)}
            >
              <Text style={[styles.link, { color: theme.primary }]}>
                {visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[
                styles.button,
                { backgroundColor: theme.primary },
                loading && styles.disabled,
              ]}
              disabled={loading}
              onPress={submit}
            >
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel="Đang xử lý"
                  color={theme.white}
                />
              ) : (
                <Text style={[styles.buttonText, { color: theme.white }]}>
                  {isRegister ? 'Đăng ký' : 'Đăng nhập'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={onSwitch}
            >
              <Text style={[styles.link, { color: theme.primary }]}>
                {isRegister
                  ? 'Đã có tài khoản? Đăng nhập'
                  : 'Chưa có tài khoản? Đăng ký'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.sm },
  title: { fontSize: FontSize.title, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: BorderRadius.xl, padding: Spacing.xl },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
  },
  error: { marginBottom: Spacing.md, fontSize: FontSize.sm },
  fieldError: { marginTop: Spacing.xs, fontSize: FontSize.sm },
  button: {
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonText: { fontSize: FontSize.lg, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  link: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontSize: FontSize.sm,
  },
});
