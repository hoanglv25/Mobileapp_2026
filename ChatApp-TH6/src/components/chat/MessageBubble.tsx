import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatMessage } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';
import { isValidCoordinates } from '../../utils/coordinates';
import { openLocationInMaps } from '../../services/mapService';
import { RECALLED_TEXT } from '../../utils/messageText';

export const IMAGE_BUBBLE_SIZE = 220;

interface Props {
  message: ChatMessage;
  isMe: boolean;
  /** Tên người gửi hiển thị phía trên bong bóng (chỉ dùng trong nhóm, tin của người khác). */
  senderName?: string;
  /** Trạng thái dưới tin cuối của mình: "Đã gửi" / "Đã xem 10:32". */
  statusText?: string;
  /** Tên người gửi tin được trích dẫn. */
  replyName?: string;
  highlighted?: boolean;
  onLongPress?: (message: ChatMessage) => void;
  onPressImage?: (url: string) => void;
  onPressReply?: (messageId: string) => void;
}

/** Gom cảm xúc: [['👍', 2], ['❤️', 1]]. */
export function summarizeReactions(
  reactions: Record<string, string>,
): [string, number][] {
  const counts = new Map<string, number>();
  Object.values(reactions).forEach(emoji =>
    counts.set(emoji, (counts.get(emoji) || 0) + 1),
  );
  return [...counts.entries()];
}

export const MessageBubble: React.FC<Props> = ({
  message,
  isMe,
  senderName,
  statusText,
  replyName,
  highlighted,
  onLongPress,
  onPressImage,
  onPressReply,
}) => {
  const { theme } = useApp();

  if (message.type === 'system') {
    return (
      <Text
        accessibilityRole="text"
        style={[styles.system, { color: theme.textMuted }]}
      >
        {message.text}
      </Text>
    );
  }

  const point = { latitude: message.latitude, longitude: message.longitude };
  const validLocation = isValidCoordinates(point);
  const textColor = isMe ? theme.myBubbleText : theme.otherBubbleText;
  const reactions = message.recalled ? [] : summarizeReactions(message.reactions);
  const openMap = async () => {
    if (!isValidCoordinates(point)) {
      return;
    }
    try {
      await openLocationInMaps(point);
    } catch {
      Alert.alert(
        'Không mở được Google Maps',
        'Vui lòng kiểm tra kết nối hoặc trình duyệt và thử lại.',
      );
    }
  };

  const renderBody = () => {
    if (message.recalled) {
      return (
        <Text style={[styles.recalled, { color: theme.textMuted }]}>
          {RECALLED_TEXT}
        </Text>
      );
    }
    if (message.type === 'image' && message.imageUrl) {
      return (
        <TouchableOpacity
          accessibilityRole="imagebutton"
          accessibilityLabel="Xem ảnh toàn màn hình"
          onPress={() => onPressImage?.(message.imageUrl as string)}
          onLongPress={() => onLongPress?.(message)}
        >
          <Image
            source={{ uri: message.imageUrl }}
            style={[styles.image, { backgroundColor: theme.border }]}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    }
    if (message.type === 'location') {
      return (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            validLocation
              ? 'Mở vị trí trên Google Maps'
              : 'Vị trí không hợp lệ'
          }
          disabled={!validLocation}
          onPress={openMap}
          onLongPress={() => onLongPress?.(message)}
          style={styles.locationCard}
        >
          <View style={styles.locationHeading}>
            <Icon name="location" size={25} color={textColor} />
            <Text style={[styles.locationTitle, { color: textColor }]}>
              Vị trí đã chia sẻ
            </Text>
          </View>
          <Text style={[styles.messageText, { color: textColor }]}>
            {validLocation
              ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
              : 'Tọa độ không hợp lệ'}
          </Text>
          {validLocation && (
            <Text style={[styles.mapHint, { color: textColor }]}>
              Nhấn để mở Google Maps
            </Text>
          )}
        </TouchableOpacity>
      );
    }
    return (
      <Text style={[styles.messageText, { color: textColor }]}>
        {message.text}
      </Text>
    );
  };

  return (
    <View
      style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}
    >
      <View style={styles.column}>
        {!!senderName && !isMe && (
          <Text
            style={[styles.senderName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {senderName}
          </Text>
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          delayLongPress={300}
          onLongPress={() => onLongPress?.(message)}
          accessibilityHint="Nhấn giữ để thả cảm xúc, sao chép hoặc thu hồi"
          style={[
            styles.bubble,
            message.recalled
              ? [styles.bubbleRecalled, { borderColor: theme.border }]
              : isMe
              ? [styles.bubbleMe, { backgroundColor: theme.myBubble }]
              : [styles.bubbleOther, { backgroundColor: theme.otherBubble }],
            message.type === 'image' && !message.recalled && styles.bubbleImage,
            highlighted && { borderWidth: 2, borderColor: theme.warning },
          ]}
        >
          {!!message.replyTo && !message.recalled && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Đi tới tin nhắn gốc"
              onPress={() => onPressReply?.(message.replyTo!.id)}
              style={[
                styles.quote,
                { borderLeftColor: isMe ? theme.white : theme.primary },
              ]}
            >
              <Text
                style={[styles.quoteName, { color: textColor }]}
                numberOfLines={1}
              >
                {replyName || 'Người dùng'}
              </Text>
              <Text
                style={[styles.quoteText, { color: textColor }]}
                numberOfLines={2}
              >
                {message.replyTo.text}
              </Text>
            </TouchableOpacity>
          )}
          {renderBody()}
          <Text
            style={[
              styles.timestamp,
              isMe && !message.recalled
                ? styles.myTimestamp
                : [styles.otherTimestamp, { color: theme.textMuted }],
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>
        </TouchableOpacity>
        {reactions.length > 0 && (
          <View
            style={[
              styles.reactions,
              isMe ? styles.reactionsMe : styles.reactionsOther,
            ]}
          >
            {reactions.map(([emoji, count]) => (
              <View
                key={emoji}
                style={[
                  styles.reactionChip,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && (
                  <Text style={[styles.reactionCount, { color: theme.text }]}>
                    {count}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
        {!!statusText && (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: theme.textMuted }]}
          >
            {statusText}
          </Text>
        )}
      </View>
    </View>
  );
};

export type PendingImageStatus = 'uploading' | 'failed';

interface PendingProps {
  uri: string;
  status: PendingImageStatus;
  error?: string;
  onRetry: () => void;
  onCancel: () => void;
}

/** Bong bóng tạm: ảnh đang tải lên (vòng loading) hoặc lỗi (nút "Thử lại"). */
export const PendingImageBubble: React.FC<PendingProps> = ({
  uri,
  status,
  error,
  onRetry,
  onCancel,
}) => {
  const { theme } = useApp();
  return (
    <View style={[styles.wrapper, styles.wrapperMe]}>
      <View style={styles.column}>
        <View style={[styles.bubble, styles.bubbleMe, styles.bubbleImage]}>
          <Image
            source={{ uri }}
            style={[styles.image, { backgroundColor: theme.border }]}
            resizeMode="cover"
          />
          <View style={styles.overlay}>
            {status === 'uploading' ? (
              <ActivityIndicator
                accessibilityLabel="Đang tải ảnh lên"
                size="large"
                color={theme.white}
              />
            ) : (
              <>
                <Icon name="alert-circle" size={28} color={theme.white} />
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={[styles.retryButton, { backgroundColor: theme.white }]}
                >
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>
                    Thử lại
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" onPress={onCancel}>
                  <Text style={styles.cancelText}>Hủy</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        {status === 'failed' && !!error && (
          <Text style={[styles.status, { color: theme.danger }]}>{error}</Text>
        )}
        {status === 'uploading' && (
          <Text style={[styles.status, { color: theme.textMuted }]}>
            Đang tải ảnh lên…
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  system: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  column: { maxWidth: '78%' },
  senderName: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: Spacing.sm,
  },
  recalled: { fontSize: FontSize.md, fontStyle: 'italic' },
  bubbleRecalled: { borderWidth: StyleSheet.hairlineWidth },
  bubbleImage: { padding: 3 },
  image: {
    width: IMAGE_BUBBLE_SIZE,
    height: IMAGE_BUBBLE_SIZE,
    borderRadius: BorderRadius.md,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    margin: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.round,
  },
  cancelText: { color: '#FFFFFF', textDecorationLine: 'underline' },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.xs,
    opacity: 0.85,
  },
  quoteName: { fontSize: FontSize.xs, fontWeight: '700' },
  quoteText: { fontSize: FontSize.sm },
  reactions: { flexDirection: 'row', marginTop: -6, gap: 4 },
  reactionsMe: { justifyContent: 'flex-end', marginRight: Spacing.sm },
  reactionsOther: { justifyContent: 'flex-start', marginLeft: Spacing.sm },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.round,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reactionEmoji: { fontSize: FontSize.sm },
  reactionCount: { fontSize: FontSize.xs, marginLeft: 2, fontWeight: '600' },
  status: {
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginTop: 2,
    marginRight: Spacing.xs,
  },
  locationCard: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  locationHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  locationTitle: { fontSize: FontSize.md, fontWeight: '700', flexShrink: 1 },
  mapHint: { fontSize: FontSize.sm, textDecorationLine: 'underline' },
  myTimestamp: { color: 'rgba(255, 255, 255, 0.75)', textAlign: 'right' },
  otherTimestamp: { textAlign: 'left' },
  wrapper: {
    marginVertical: 4,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
  },
  wrapperMe: {
    justifyContent: 'flex-end',
  },
  wrapperOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: FontSize.xs - 1,
    marginTop: 4,
  },
});
