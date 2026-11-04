import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize } from '../../theme';

interface Props {
  iconName: string;
  title: string;
  message?: string;
}

export const EmptyState: React.FC<Props> = ({ iconName, title, message }) => {
  const { theme } = useApp();

  return (
    <View style={styles.container}>
      <Icon name={iconName} size={56} color={theme.textMuted} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

