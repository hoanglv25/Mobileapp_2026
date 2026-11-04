import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Contact } from '../../types';
import { Avatar } from '../common/Avatar';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize } from '../../theme';

interface Props {
  contact: Contact;
  onPress: () => void;
}

export const ContactItem: React.FC<Props> = ({ contact, onPress }) => {
  const { theme } = useApp();

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
      accessibilityLabel={`${contact.name}, ${contact.email}, ${
        contact.statusText ||
        (contact.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')
      }`}
      activeOpacity={0.7}
    >
      <Avatar
        uri={contact.avatar}
        size={50}
        showOnline
        isOnline={contact.isOnline}
      />
      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text
          style={[styles.email, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {contact.email}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: contact.isOnline
                  ? theme.online
                  : theme.offline,
              },
            ]}
          />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {contact.statusText ||
              (contact.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  email: { fontSize: FontSize.xs, marginBottom: Spacing.xs },
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
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: FontSize.xs,
  },
});
