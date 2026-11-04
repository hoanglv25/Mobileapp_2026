import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, {
  GeolocationResponse,
} from '@react-native-community/geolocation';
import {
  getCurrentLocation,
  requestLocationPermission,
  showLocationError,
} from '../src/services/locationService';

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
    [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success =>
    success({
      coords: { latitude: 10.7, longitude: 106.6 },
    } as GeolocationResponse),
  );
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('Android asks both permissions and returns current coordinates', async () => {
  await expect(getCurrentLocation()).resolves.toEqual({
    latitude: 10.7,
    longitude: 106.6,
  });
  expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
  expect(jest.getTimerCount()).toBe(0);
});

test('approximate Android permission is accepted without requesting precise GPS', async () => {
  jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValueOnce({
    [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
      PermissionsAndroid.RESULTS.DENIED,
    [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
      PermissionsAndroid.RESULTS.GRANTED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.mocked(PermissionsAndroid.check).mockResolvedValueOnce(false);
  await getCurrentLocation();
  expect(
    jest.mocked(Geolocation.getCurrentPosition).mock.calls[0][2]
      ?.enableHighAccuracy,
  ).toBe(false);
});

test.each([
  [PermissionsAndroid.RESULTS.DENIED, 'permission-denied'],
  [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'permission-blocked'],
])(
  'permission result %s prevents any location lookup',
  async (result, code) => {
    jest.mocked(PermissionsAndroid.requestMultiple).mockResolvedValueOnce({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: result,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: result,
    } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
    await expect(getCurrentLocation()).rejects.toMatchObject({ code });
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
  },
);

test('iOS configures whenInUse and uses the community callback API', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest
    .mocked(Geolocation.requestAuthorization)
    .mockImplementation(success => success?.());
  await requestLocationPermission();
  expect(Geolocation.setRNConfiguration).toHaveBeenCalledWith(
    expect.objectContaining({
      authorizationLevel: 'whenInUse',
      skipPermissionRequests: true,
      enableBackgroundLocationUpdates: false,
    }),
  );
  expect(Geolocation.requestAuthorization).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
  );
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
});

test.each([
  [1, 'permission-denied'],
  [2, 'unavailable'],
  [3, 'timeout'],
])(
  'native location code %s becomes an actionable error',
  async (code, expected) => {
    jest
      .mocked(Geolocation.getCurrentPosition)
      .mockImplementation((_success, failure) =>
        failure?.({
          code,
          message: 'Native error',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        }),
      );
    await expect(getCurrentLocation()).rejects.toMatchObject({
      code: expected,
    });
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('watchdog settles a silent native request and ignores a late result', async () => {
  let late!: Parameters<typeof Geolocation.getCurrentPosition>[0];
  jest.mocked(Geolocation.getCurrentPosition).mockImplementation(success => {
    late = success;
  });
  const pending = getCurrentLocation();
  await Promise.all([
    expect(pending).rejects.toMatchObject({ code: 'timeout' }),
    jest.advanceTimersByTimeAsync(20000),
  ]);
  late({ coords: { latitude: 0, longitude: 0 } } as GeolocationResponse);
  expect(jest.getTimerCount()).toBe(0);
});

test('permission guidance offers Settings and handles a failed Settings link', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  jest
    .spyOn(Linking, 'openSettings')
    .mockRejectedValueOnce(new Error('No settings'));
  showLocationError(new Error('Quyền bị từ chối'));
  const buttons = alert.mock.calls[0][2]!;
  const settings = buttons.find(button => button.text === 'Mở Cài đặt')!;
  settings.onPress?.();
  await Promise.resolve();
  expect(Linking.openSettings).toHaveBeenCalled();
  expect(alert).toHaveBeenLastCalledWith(
    'Không mở được Cài đặt',
    expect.any(String),
  );
});
