import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatMessage } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { useApp } from '../../context/AppContext';
import { Spacing, FontSize, BorderRadius } from '../../theme';
import { isValidCoordinates } from '../../utils/coordinates';
import { openLocationInMaps } from '../../services/mapService';

interface Props {
  message: ChatMessage;
  isMe: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, isMe }) => {
  const { theme } = useApp();
  const point = { latitude: message.latitude, longitude: message.longitude };
  const validLocation = isValidCoordinates(point);
  const textColor = isMe ? theme.myBubbleText : theme.otherBubbleText;
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

  return (
    <View
      style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}
    >
      <View
        style={[
          styles.bubble,
          isMe
            ? [styles.bubbleMe, { backgroundColor: theme.myBubble }]
            : [styles.bubbleOther, { backgroundColor: theme.otherBubble }],
        ]}
      >
        {message.type === 'location' ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              validLocation
                ? 'Mở vị trí trên Google Maps'
                : 'Vị trí không hợp lệ'
            }
            disabled={!validLocation}
            onPress={openMap}
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
        ) : (
          <Text
            style={[
              styles.messageText,
              { color: isMe ? theme.myBubbleText : theme.otherBubbleText },
            ]}
          >
            {message.text}
          </Text>
        )}
        <Text
          style={[
            styles.timestamp,
            isMe
              ? styles.myTimestamp
              : [styles.otherTimestamp, { color: theme.textMuted }],
          ]}
        >
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    maxWidth: '78%',
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
