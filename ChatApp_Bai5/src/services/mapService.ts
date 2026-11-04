import { Linking } from 'react-native';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

export async function openLocationInMaps(point: Coordinates): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  // URL HTTPS hoạt động cả khi không cài ứng dụng Google Maps.
  await Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`,
  );
}
