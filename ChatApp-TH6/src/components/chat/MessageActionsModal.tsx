import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatMessage } from '../../types';
import { useApp } from '../../context/AppContext';
import { BorderRadius, FontSize, Spacing } from '../../theme';
import { REACTIONS } from '../../utils/messageText';

interface Props {
  message: ChatMessage | null;
  myUid: string;
  onClose: () => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onCopy: (message: ChatMessage) => void;
  onRecall: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
}

/** Menu nhấn giữ: thả cảm xúc, Sao chép, Trả lời, Thu hồi (chỉ tin của mình). */
export const MessageActionsModal: React.FC<Props> = ({
  message,
  myUid,
  onClose,
  onReact,
  onCopy,
  onRecall,
  onReply,
}) => {
  const { theme } = useApp();
  const mine = message?.senderId === myUid;
  const canCopy = !!message && message.type === 'text' && !message.recalled;
  const actions: {
    key: string;
    label: string;
    icon: string;
    danger?: boolean;
    onPress: () => void;
  }[] = [];
  if (message && !message.recalled) {
    actions.push({
      key: 'reply',
      label: 'Trả lời',
      icon: 'arrow-undo-outline',
      onPress: () => onReply(message),
    });
  }
  if (message && canCopy) {
    actions.push({
      key: 'copy',
      label: 'Sao chép',
      icon: 'copy-outline',
      onPress: () => onCopy(message),
    });
  }
  if (message && mine && !message.recalled) {
    actions.push({
      key: 'recall',
      label: 'Thu hồi',
      icon: 'trash-outline',
      danger: true,
      onPress: () => onRecall(message),
    });
  }

  return (
    <Modal
      visible={!!message}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          {!!message && !message.recalled && (
            <View style={styles.reactionRow}>
              {REACTIONS.map(emoji => {
                const selected = message.reactions[myUid] === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`Thả cảm xúc ${emoji}`}
                    accessibilityState={{ selected }}
                    onPress={() => onReact(message, emoji)}
                    style={[
                      styles.reactionButton,
                      selected && { backgroundColor: theme.primaryLight },
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {actions.map(action => (
            <TouchableOpacity
              key={action.key}
              accessibilityRole="button"
              onPress={action.onPress}
              style={[styles.action, { borderTopColor: theme.border }]}
            >
              <Icon
                name={action.icon}
                size={22}
                color={action.danger ? theme.danger : theme.text}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: action.danger ? theme.danger : theme.text },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: Spacing.md,
  },
  reactionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 28 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: FontSize.md, fontWeight: '600' },
});
