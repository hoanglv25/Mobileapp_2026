import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationError,
} from '@react-native-community/geolocation';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

type LocationErrorCode =
  | 'permission-denied'
  | 'permission-blocked'
  | 'unavailable'
  | 'timeout';
export class LocationError extends Error {
  constructor(public code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
  }
}

function nativeError(error: Pick<GeolocationError, 'code'>): LocationError {
  if (error.code === 1) {
    return new LocationError(
      'permission-denied',
      'Bạn chưa cho phép truy cập vị trí. Hãy cấp quyền trong Cài đặt để gửi vị trí.',
    );
  }
  if (error.code === 3) {
    return new LocationError(
      'timeout',
      'Lấy vị trí quá lâu. Hãy kiểm tra GPS, ra nơi thoáng hoặc đặt vị trí giả trên emulator rồi thử lại.',
    );
  }
  return new LocationError(
    'unavailable',
    'Không lấy được vị trí. Hãy bật dịch vụ vị trí/GPS trong Cài đặt và thử lại.',
  );
}

export async function requestLocationPermission(): Promise<void> {
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    authorizationLevel: 'whenInUse',
    enableBackgroundLocationUpdates: false,
  });
  if (Platform.OS === 'android') {
    // Android 12+ cho phép người dùng chỉ cấp quyền gần đúng.
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fine = result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarse =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    if (
      fine === PermissionsAndroid.RESULTS.GRANTED ||
      coarse === PermissionsAndroid.RESULTS.GRANTED
    ) {
      return;
    }
    if (
      fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      coarse === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ) {
      throw new LocationError(
        'permission-blocked',
        'Quyền vị trí đã bị chặn. Hãy mở Cài đặt ứng dụng và cấp quyền Vị trí.',
      );
    }
    throw new LocationError(
      'permission-denied',
      'Bạn đã từ chối quyền vị trí. Cấp quyền khi thử lại hoặc mở Cài đặt ứng dụng.',
    );
  }
  if (Platform.OS === 'ios') {
    // API community/geolocation dùng callback; whenInUse nằm trong configuration.
    await new Promise<void>((resolve, reject) => {
      Geolocation.requestAuthorization(resolve, error =>
        reject(nativeError(error)),
      );
    });
    return;
  }
  throw new LocationError(
    'unavailable',
    'Thiết bị này không hỗ trợ tính năng gửi vị trí.',
  );
}

export async function getCurrentLocation(): Promise<Coordinates> {
  await requestLocationPermission();
  const highAccuracy =
    Platform.OS !== 'android' ||
    (await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (point?: Coordinates, error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      if (point) {
        resolve(point);
      } else {
        reject(error);
      }
    };
    // Giới hạn chờ JS phòng trường hợp native không gọi lại; callback trễ bị bỏ qua.
    const watchdog = setTimeout(
      () => finish(undefined, nativeError({ code: 3 })),
      20000,
    );
    try {
      Geolocation.getCurrentPosition(
        position => {
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          if (!isValidCoordinates(point)) {
            finish(undefined, nativeError({ code: 2 }));
            return;
          }
          finish(point);
        },
        error => finish(undefined, nativeError(error)),
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 0 },
      );
    } catch (error) {
      finish(undefined, error);
    }
  });
}

export function showLocationError(error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : 'Không thể lấy vị trí. Hãy kiểm tra quyền và GPS rồi thử lại.';
  Alert.alert('Không thể gửi vị trí', message, [
    { text: 'Đóng', style: 'cancel' },
    {
      text: 'Mở Cài đặt',
      onPress: () => {
        Linking.openSettings().catch(() =>
          Alert.alert(
            'Không mở được Cài đặt',
            'Hãy mở Cài đặt của thiết bị để kiểm tra quyền Vị trí và GPS.',
          ),
        );
      },
    },
  ]);
}
