/**
 * imagePickerService.ts
 * Chụp ảnh / chọn ảnh từ thư viện bằng react-native-image-picker.
 * Ảnh được thu nhỏ ngay khi chọn: cạnh dài ≤ 1024px (maxWidth/maxHeight giữ tỉ lệ).
 */
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import {
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
  CameraOptions,
} from 'react-native-image-picker';
import { LocalImage } from './uploadService';

export const MAX_IMAGE_EDGE = 1024;
export type ImageSource = 'camera' | 'library';

const options: CameraOptions = {
  mediaType: 'photo',
  maxWidth: MAX_IMAGE_EDGE,
  maxHeight: MAX_IMAGE_EDGE,
  quality: 0.8,
  includeBase64: false,
  saveToPhotos: false,
};

function showCameraDenied(blocked: boolean) {
  Alert.alert(
    'Không có quyền camera',
    'Ứng dụng cần quyền camera để chụp ảnh. Hãy cấp quyền trong Cài đặt rồi thử lại.',
    blocked
      ? [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
        ]
      : [{ text: 'Đã hiểu' }],
  );
}

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true; // iOS hỏi quyền khi mở camera (NSCameraUsageDescription).
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Quyền camera',
      message: 'ChatApp cần dùng camera để chụp ảnh gửi cho bạn bè.',
      buttonPositive: 'Cho phép',
      buttonNegative: 'Từ chối',
    },
  );
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    showCameraDenied(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    return false;
  }
  return true;
}

function toLocalImage(response: ImagePickerResponse): LocalImage | null {
  if (response.didCancel) {
    return null;
  }
  if (response.errorCode) {
    if (response.errorCode === 'permission') {
      showCameraDenied(true);
      return null;
    }
    throw new Error(response.errorMessage || 'Không mở được ảnh.');
  }
  const asset = response.assets?.[0];
  if (!asset?.uri) {
    return null;
  }
  return {
    uri: asset.uri,
    type: asset.type || 'image/jpeg',
    fileName: asset.fileName || `photo_${Date.now()}.jpg`,
  };
}

/** Trả về null nếu người dùng hủy hoặc từ chối quyền. */
export async function pickImage(
  source: ImageSource,
): Promise<LocalImage | null> {
  if (source === 'camera') {
    if (!(await ensureCameraPermission())) {
      return null;
    }
    return toLocalImage(await launchCamera(options));
  }
  return toLocalImage(await launchImageLibrary(options));
}
