import React from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Spacing } from '../../theme';

interface Props {
  uri: string | null;
  onClose: () => void;
}

/** Xem ảnh toàn màn hình. */
export const ImageViewerModal: React.FC<Props> = ({ uri, onClose }) => (
  <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.container}>
      {!!uri && (
        <Image
          accessibilityLabel="Ảnh toàn màn hình"
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
        />
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Đóng ảnh"
        onPress={onClose}
        style={styles.close}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Icon name="close" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  image: { flex: 1, width: '100%' },
  close: { position: 'absolute', top: Spacing.xxxl, right: Spacing.lg },
});
