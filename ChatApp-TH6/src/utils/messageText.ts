import { MessageType } from '../types';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'] as const;
export const RECALLED_TEXT = 'Tin nhắn đã được thu hồi';
export const IMAGE_PREVIEW = '📷 Hình ảnh';
export const LOCATION_PREVIEW = '📍 Vị trí';

/** Nội dung hiển thị ở Home / thông báo / trích dẫn cho một tin. */
export function previewOf(
  type: MessageType,
  text: string,
  recalled = false,
): string {
  if (recalled) {
    return RECALLED_TEXT;
  }
  if (type === 'image') {
    return IMAGE_PREVIEW;
  }
  if (type === 'location') {
    return LOCATION_PREVIEW;
  }
  return text;
}
