/**
 * uploadService.ts
 * Tải ảnh lên Cloudinary bằng unsigned upload preset (không dùng API secret).
 * Chỉ URL trả về (secure_url) được lưu vào Realtime Database.
 */
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
} from './cloudinaryConfig';

const UPLOAD_TIMEOUT_MS = 30000;

export interface LocalImage {
  uri: string;
  type: string;
  fileName: string;
}

export function isCloudinaryConfigured(): boolean {
  return (
    !CLOUDINARY_CLOUD_NAME.startsWith('YOUR_') &&
    !CLOUDINARY_UPLOAD_PRESET.startsWith('YOUR_')
  );
}

export async function uploadImage(image: LocalImage): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Chưa cấu hình Cloudinary. Hãy điền cloud name và upload preset trong src/services/cloudinaryConfig.ts.',
    );
  }
  const form = new FormData();
  // React Native chấp nhận object {uri,type,name} làm tệp của FormData.
  form.append('file', {
    uri: image.uri,
    type: image.type || 'image/jpeg',
    name: image.fileName || 'photo.jpg',
  } as unknown as Blob);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: form, signal: controller.signal },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.secure_url !== 'string') {
      throw new Error(
        body?.error?.message
          ? `Cloudinary: ${body.error.message}`
          : 'Tải ảnh lên thất bại. Vui lòng thử lại.',
      );
    }
    return body.secure_url;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tải ảnh quá lâu. Hãy kiểm tra mạng và thử lại.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
