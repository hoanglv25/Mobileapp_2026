/**
 * typingService.ts
 * typing/{convId}/{uid}   = true   khi đang gõ
 * viewing/{convId}/{uid}  = true   khi đang MỞ cuộc trò chuyện (để không tạo thông báo thừa)
 *
 * Cả hai đều đăng ký onDisconnect().remove() TRƯỚC khi ghi true, nên nếu app bị tắt
 * đột ngột / mất mạng thì máy chủ tự xóa, trạng thái không bị kẹt.
 */
import { onDisconnect, onValue, ref, remove, set } from 'firebase/database';
import { auth, database } from './firebase';

/** Tự tắt "đang soạn tin" sau 3 giây không gõ. */
export const TYPING_TIMEOUT_MS = 3000;

async function markPresent(path: string): Promise<void> {
  const target = ref(database, path);
  await onDisconnect(target).remove();
  await set(target, true);
}

export interface TypingController {
  /** Gọi mỗi khi nội dung ô nhập thay đổi. */
  notify: (hasText: boolean) => void;
  /** Tắt ngay (khi gửi tin hoặc rời màn hình). */
  stop: () => void;
}

export function createTypingController(
  convId: string,
  uid: string,
  onError?: (error: unknown) => void,
): TypingController {
  const path = `typing/${convId}/${uid}`;
  let on = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const stop = () => {
    clearTimer();
    if (!on) {
      return;
    }
    on = false;
    if (auth.currentUser?.uid === uid) {
      remove(ref(database, path)).catch(error => onError?.(error));
    }
  };
  return {
    stop,
    notify: hasText => {
      if (!hasText) {
        stop();
        return;
      }
      if (!on) {
        on = true;
        markPresent(path).catch(error => {
          on = false;
          onError?.(error);
        });
      }
      clearTimer();
      timer = setTimeout(stop, TYPING_TIMEOUT_MS);
    },
  };
}

/** UID những người KHÁC đang gõ. */
export function subscribeTyping(
  convId: string,
  myUid: string,
  callback: (uids: string[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `typing/${convId}`),
    snapshot => {
      const uids: string[] = [];
      snapshot.forEach(child => {
        if (child.key && child.key !== myUid && child.val() === true) {
          uids.push(child.key);
        }
      });
      callback(uids);
    },
    onError,
  );
}

/** Đánh dấu mình đang mở cuộc trò chuyện; trả về hàm dọn dẹp cho useEffect. */
export function enterConversation(
  convId: string,
  uid: string,
  onError?: (error: unknown) => void,
): () => void {
  const path = `viewing/${convId}/${uid}`;
  markPresent(path).catch(error => onError?.(error));
  return () => {
    if (auth.currentUser?.uid === uid) {
      remove(ref(database, path)).catch(error => onError?.(error));
    }
  };
}

export function subscribeViewing(
  convId: string,
  callback: (uids: string[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `viewing/${convId}`),
    snapshot => {
      const uids: string[] = [];
      snapshot.forEach(child => {
        if (child.key && child.val() === true) {
          uids.push(child.key);
        }
      });
      callback(uids);
    },
    onError,
  );
}
