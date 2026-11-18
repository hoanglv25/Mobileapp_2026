/**
 * notificationService.ts
 * notifications/{uid}/{id}: { type, convId, fromUid, fromName, text, createdAt, read }
 *
 * Người gửi tin / người thả cảm xúc / người tạo nhóm ghi thông báo cho người nhận
 * ngay trong lệnh update() đa đường dẫn (các hàm build* bên dưới trả về mục để gộp vào).
 */
import { onValue, ref, serverTimestamp, update } from 'firebase/database';
import { auth, database } from './firebase';
import { AppNotification, NotificationType } from '../types';

const TYPES: NotificationType[] = ['message', 'group_add', 'reaction', 'system'];

/** Mỗi cuộc trò chuyện chỉ giữ một thông báo tin nhắn (ghi đè bằng tin mới nhất). */
export const messageNotificationId = (convId: string) => `msg_${convId}`;
export const reactionNotificationId = (msgId: string, reactorUid: string) =>
  `react_${msgId}_${reactorUid}`;

export function buildNotification(input: {
  type: NotificationType;
  convId: string;
  fromUid: string;
  fromName: string;
  text: string;
}) {
  return {
    ...input,
    text: input.text.slice(0, 200),
    createdAt: serverTimestamp(),
    read: false,
  };
}

export function subscribeNotifications(
  uid: string,
  callback: (list: AppNotification[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `notifications/${uid}`),
    snapshot => {
      const list: AppNotification[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          !child.key ||
          !value ||
          !TYPES.includes(value.type) ||
          typeof value.convId !== 'string' ||
          typeof value.text !== 'string' ||
          !Number.isFinite(value.createdAt)
        ) {
          return;
        }
        list.push({
          id: child.key,
          type: value.type,
          convId: value.convId,
          fromUid: typeof value.fromUid === 'string' ? value.fromUid : '',
          fromName: typeof value.fromName === 'string' ? value.fromName : '',
          text: value.text,
          createdAt: value.createdAt,
          read: value.read === true,
        });
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      callback(list);
    },
    onError,
  );
}

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

/** Đánh dấu đã đọc: chỉ ghi `read` của các thông báo đã tồn tại trong danh sách. */
export async function markNotificationsRead(
  uid: string,
  ids: string[],
): Promise<void> {
  requireUser(uid);
  if (ids.length === 0) {
    return;
  }
  const changes: Record<string, unknown> = {};
  ids.forEach(id => {
    changes[`notifications/${uid}/${id}/read`] = true;
  });
  await update(ref(database), changes);
}
