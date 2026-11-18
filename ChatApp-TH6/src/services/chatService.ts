/**
 * chatService.ts
 * Tin nhắn, thu hồi, cảm xúc, đã xem, danh sách cuộc trò chuyện (1-1 và nhóm).
 *
 * Dữ liệu (xem docs/database.rules.json):
 *   conversations/{convId}      { type, name, members:{uid:true}, createdBy, createdAt }
 *   messages/{convId}/{msgId}   { senderId, type, text, imageUrl, lat, lng, createdAt, recalled, reactions }
 *   userChats/{uid}/{convId}    { type, name?, lastMessage, lastMessageId, lastSenderId, updatedAt, unread }
 *   readStatus/{convId}/{uid}   thời điểm đọc cuối
 *
 * Gửi tin = MỘT lệnh update() đa đường dẫn: tin nhắn + lastMessage của mọi thành viên
 * + unread của người nhận (increment(1), không đọc-rồi-cộng) + thông báo.
 */
import {
  endBefore,
  get,
  increment,
  limitToLast,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  startAt,
  update,
} from 'firebase/database';
import { auth, database } from './firebase';
import { AuthUser } from './authService';
import {
  ChatMessage,
  ConversationMeta,
  ConversationType,
  MessageType,
  RealtimeConversation,
  ReplyRef,
} from '../types';
import { subscribeStatus, UserStatus } from './userService';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';
import {
  getDirectConversationId,
  getPartnerUid,
} from '../utils/conversationId';
import {
  IMAGE_PREVIEW,
  LOCATION_PREVIEW,
  previewOf,
  RECALLED_TEXT,
  REACTIONS,
} from '../utils/messageText';
import {
  buildNotification,
  messageNotificationId,
  reactionNotificationId,
} from './notificationService';

export const MAX_MESSAGE_LENGTH = 2000;
/** Số tin mỗi trang (lần đầu và mỗi lần kéo lên đầu danh sách). */
export const PAGE_SIZE = 20;
export { REACTIONS, RECALLED_TEXT, IMAGE_PREVIEW, LOCATION_PREVIEW, previewOf };

export { getDirectConversationId as getChatId };

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

// ==================== ĐỌC TIN NHẮN (có phân trang) ====================

export function parseMessage(key: string | null, value: any): ChatMessage | null {
  if (
    !key ||
    !value ||
    typeof value.senderId !== 'string' ||
    !['text', 'image', 'location', 'system'].includes(value.type) ||
    !Number.isFinite(value.createdAt)
  ) {
    return null;
  }
  const reactions: Record<string, string> = {};
  if (value.reactions && typeof value.reactions === 'object') {
    Object.entries(value.reactions).forEach(([uid, emoji]) => {
      if (typeof emoji === 'string') {
        reactions[uid] = emoji;
      }
    });
  }
  const reply = value.replyTo;
  return {
    id: key,
    senderId: value.senderId,
    type: value.type,
    text: typeof value.text === 'string' ? value.text : '',
    createdAt: value.createdAt,
    recalled: value.recalled === true,
    reactions,
    ...(typeof value.imageUrl === 'string' ? { imageUrl: value.imageUrl } : {}),
    ...(typeof value.latitude === 'number' ? { latitude: value.latitude } : {}),
    ...(typeof value.longitude === 'number'
      ? { longitude: value.longitude }
      : {}),
    ...(reply &&
    typeof reply.id === 'string' &&
    typeof reply.senderId === 'string' &&
    typeof reply.text === 'string'
      ? { replyTo: { id: reply.id, senderId: reply.senderId, text: reply.text } }
      : {}),
  };
}

function collect(snapshot: { forEach: (cb: (c: any) => void) => void }) {
  const messages: ChatMessage[] = [];
  snapshot.forEach(child => {
    const message = parseMessage(child.key, child.val());
    if (message) {
      messages.push(message);
    }
  });
  // Push key tăng dần theo thời gian: sắp theo key để ổn định.
  messages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return messages;
}

/**
 * Listener realtime.
 *  - startKey = null  → 20 tin mới nhất (limitToLast(20)).
 *  - startKey = "k"   → từ tin "k" đến tin mới nhất (sau khi đã tải thêm trang cũ),
 *                        nên phản ứng/thu hồi của tin cũ vẫn cập nhật realtime.
 * Trả về hàm hủy listener (gọi trong cleanup của useEffect).
 */
export function subscribeMessages(
  convId: string,
  startKey: string | null,
  callback: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): () => void {
  const base = ref(database, `messages/${convId}`);
  const q = startKey
    ? query(base, orderByKey(), startAt(startKey))
    : query(base, orderByKey(), limitToLast(PAGE_SIZE));
  return onValue(q, snapshot => callback(collect(snapshot)), onError);
}

/** Tải 20 tin cũ hơn tin `beforeKey`. */
export async function fetchOlderMessages(
  convId: string,
  beforeKey: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const snapshot = await get(
    query(
      ref(database, `messages/${convId}`),
      orderByKey(),
      endBefore(beforeKey),
      limitToLast(PAGE_SIZE),
    ),
  );
  const messages = collect(snapshot);
  return { messages, hasMore: snapshot.size >= PAGE_SIZE };
}

// ==================== THÔNG TIN CUỘC TRÒ CHUYỆN ====================

export function subscribeConversationMeta(
  convId: string,
  callback: (meta: ConversationMeta | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `conversations/${convId}`),
    snapshot => {
      const value = snapshot.val();
      if (!value || typeof value !== 'object') {
        callback(null);
        return;
      }
      callback({
        id: convId,
        type: value.type === 'group' ? 'group' : 'direct',
        name: typeof value.name === 'string' ? value.name : '',
        members: Object.keys(value.members || {}),
        createdBy: typeof value.createdBy === 'string' ? value.createdBy : '',
        createdAt: Number.isFinite(value.createdAt) ? value.createdAt : 0,
      });
    },
    onError,
  );
}

export function subscribeReadStatus(
  convId: string,
  callback: (status: Record<string, number>) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `readStatus/${convId}`),
    snapshot => {
      const status: Record<string, number> = {};
      snapshot.forEach(child => {
        if (child.key && Number.isFinite(child.val())) {
          status[child.key] = child.val();
        }
      });
      callback(status);
    },
    onError,
  );
}

// ==================== GỬI TIN ====================

export interface SendTarget {
  convId: string;
  type: ConversationType;
  /** Mọi thành viên, kể cả người gửi. */
  members: string[];
  /** Tên nhóm (chỉ nhóm). */
  name?: string;
  /** Thành viên đang mở đúng cuộc trò chuyện này → không cần thông báo. */
  viewing?: string[];
}

interface Content {
  type: MessageType;
  text: string;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
}

/** Cuộc trò chuyện 1-1 chỉ cần tạo bản ghi `conversations/{id}` một lần. */
const knownConversations = new Set<string>();

async function ensureDirectRecord(
  sender: AuthUser,
  target: SendTarget,
  changes: Record<string, unknown>,
) {
  if (target.type !== 'direct' || knownConversations.has(target.convId)) {
    return;
  }
  const exists = (await get(ref(database, `conversations/${target.convId}`)))
    .exists();
  if (exists) {
    knownConversations.add(target.convId);
    return;
  }
  changes[`conversations/${target.convId}`] = {
    type: 'direct',
    name: '',
    members: Object.fromEntries(target.members.map(uid => [uid, true])),
    createdBy: sender.uid,
    createdAt: serverTimestamp(),
  };
}

export async function sendMessage(
  sender: AuthUser,
  target: SendTarget,
  content: Content,
  replyTo?: ReplyRef,
): Promise<string> {
  requireUser(sender.uid);
  if (!target.members.includes(sender.uid) || target.members.length < 2) {
    throw new Error('Bạn không còn là thành viên của cuộc trò chuyện này.');
  }
  const messageRef = push(ref(database, `messages/${target.convId}`));
  const messageId = messageRef.key;
  if (!messageId) {
    throw new Error('Không thể tạo tin nhắn. Vui lòng thử lại.');
  }
  const preview = previewOf(content.type, content.text);
  const message: Record<string, unknown> = {
    senderId: sender.uid,
    type: content.type,
    text: content.type === 'text' ? content.text : '',
    createdAt: serverTimestamp(),
    recalled: false,
  };
  if (content.imageUrl) {
    message.imageUrl = content.imageUrl;
  }
  if (content.type === 'location') {
    message.latitude = content.latitude;
    message.longitude = content.longitude;
  }
  if (replyTo) {
    message.replyTo = {
      id: replyTo.id,
      senderId: replyTo.senderId,
      text: replyTo.text.slice(0, 120),
    };
  }
  const changes: Record<string, unknown> = {
    [`messages/${target.convId}/${messageId}`]: message,
  };
  await ensureDirectRecord(sender, target, changes);
  requireUser(sender.uid);

  target.members.forEach(uid => {
    const base = `userChats/${uid}/${target.convId}`;
    changes[`${base}/type`] = target.type;
    if (target.type === 'group') {
      changes[`${base}/name`] = target.name || 'Nhóm';
    }
    changes[`${base}/lastMessage`] = preview;
    changes[`${base}/lastMessageId`] = messageId;
    changes[`${base}/lastSenderId`] = sender.uid;
    changes[`${base}/updatedAt`] = serverTimestamp();
    if (uid !== sender.uid) {
      // increment(1): máy chủ cộng nguyên tử, không đọc giá trị cũ.
      changes[`${base}/unread`] = increment(1);
      if (!target.viewing?.includes(uid)) {
        changes[`notifications/${uid}/${messageNotificationId(target.convId)}`] =
          buildNotification({
            type: 'message',
            convId: target.convId,
            fromUid: sender.uid,
            fromName: sender.displayName,
            text:
              target.type === 'group'
                ? `${sender.displayName}: ${preview}`
                : preview,
          });
      }
    }
  });
  await update(ref(database), changes);
  return messageId;
}

export async function sendTextMessage(
  sender: AuthUser,
  target: SendTarget,
  text: string,
  replyTo?: ReplyRef,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Không thể gửi tin nhắn rỗng.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
  }
  await sendMessage(sender, target, { type: 'text', text: trimmed }, replyTo);
}

export async function sendLocationMessage(
  sender: AuthUser,
  target: SendTarget,
  point: Coordinates,
): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  await sendMessage(sender, target, {
    type: 'location',
    text: '',
    latitude: point.latitude,
    longitude: point.longitude,
  });
}

/** Chỉ lưu URL ảnh (đã tải lên Cloudinary) vào Realtime Database. */
export async function sendImageMessage(
  sender: AuthUser,
  target: SendTarget,
  imageUrl: string,
  replyTo?: ReplyRef,
): Promise<void> {
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error('Đường dẫn ảnh không hợp lệ.');
  }
  await sendMessage(
    sender,
    target,
    { type: 'image', text: '', imageUrl },
    replyTo,
  );
}

// ==================== THU HỒI & CẢM XÚC ====================

/**
 * Thu hồi tin của chính mình: KHÔNG xóa node, chỉ đánh dấu recalled: true
 * (đồng thời xóa nội dung để không còn lộ dữ liệu). Nếu đó là tin cuối của cuộc
 * trò chuyện thì lastMessage của mọi thành viên cập nhật trong cùng một lệnh.
 */
export async function recallMessage(
  me: AuthUser,
  convId: string,
  members: string[],
  message: ChatMessage,
): Promise<void> {
  requireUser(me.uid);
  if (message.senderId !== me.uid) {
    throw new Error('Bạn chỉ có thể thu hồi tin nhắn của chính mình.');
  }
  const base = `messages/${convId}/${message.id}`;
  const changes: Record<string, unknown> = {
    [`${base}/recalled`]: true,
    [`${base}/text`]: '',
    [`${base}/imageUrl`]: null,
    [`${base}/latitude`]: null,
    [`${base}/longitude`]: null,
    [`${base}/replyTo`]: null,
  };
  const last = await get(
    query(ref(database, `messages/${convId}`), orderByKey(), limitToLast(1)),
  );
  let isLast = false;
  last.forEach(child => {
    isLast = child.key === message.id;
  });
  if (isLast) {
    members.forEach(uid => {
      changes[`userChats/${uid}/${convId}/lastMessage`] = RECALLED_TEXT;
    });
  }
  await update(ref(database), changes);
}

/** Thả / đổi / bỏ cảm xúc của chính mình; thả mới thì báo cho người gửi tin. */
export async function toggleReaction(
  me: AuthUser,
  convId: string,
  message: ChatMessage,
  emoji: string,
): Promise<void> {
  requireUser(me.uid);
  if (!(REACTIONS as readonly string[]).includes(emoji) || message.recalled) {
    return;
  }
  const removing = message.reactions[me.uid] === emoji;
  const changes: Record<string, unknown> = {
    [`messages/${convId}/${message.id}/reactions/${me.uid}`]: removing
      ? null
      : emoji,
  };
  if (message.senderId !== me.uid) {
    const id = reactionNotificationId(message.id, me.uid);
    changes[`notifications/${message.senderId}/${id}`] = removing
      ? null
      : buildNotification({
          type: 'reaction',
          convId,
          fromUid: me.uid,
          fromName: me.displayName,
          text: `${me.displayName} đã thả ${emoji} vào tin nhắn của bạn`,
        });
  }
  await update(ref(database), changes);
}

// ==================== ĐÃ ĐỌC / CHƯA ĐỌC ====================

export function subscribeUnreadCount(
  myUid: string,
  convId: string,
  callback: (count: number) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}/${convId}/unread`),
    snapshot => {
      const value = snapshot.val();
      callback(typeof value === 'number' && value > 0 ? value : 0);
    },
    onError,
  );
}

/** Đặt unread của MÌNH về 0 và ghi mốc "đã xem" để người kia thấy "Đã xem". */
export async function markAsRead(myUid: string, convId: string): Promise<void> {
  requireUser(myUid);
  await runTransaction(
    ref(database, `userChats/${myUid}/${convId}/unread`),
    count => (typeof count === 'number' && count > 0 ? 0 : undefined),
    { applyLocally: false },
  );
  await set(ref(database, `readStatus/${convId}/${myUid}`), serverTimestamp());
}

// ==================== DANH SÁCH CUỘC TRÒ CHUYỆN (HOME) ====================

export function subscribeConversations(
  myUid: string,
  callback: (conversations: RealtimeConversation[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}`),
    snapshot => {
      const list: RealtimeConversation[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        const convId = child.key;
        if (
          !convId ||
          !value ||
          typeof value.lastMessage !== 'string' ||
          !Number.isFinite(value.updatedAt)
        ) {
          return;
        }
        const type: ConversationType = value.type === 'group' ? 'group' : 'direct';
        const partner =
          type === 'direct' ? getPartnerUid(convId, myUid) : undefined;
        if (type === 'direct' && !partner) {
          return;
        }
        list.push({
          id: convId,
          type,
          ...(partner ? { contactId: partner } : {}),
          name:
            type === 'group' && typeof value.name === 'string'
              ? value.name
              : '',
          avatar: '',
          lastMessage: value.lastMessage,
          lastSenderId:
            typeof value.lastSenderId === 'string' ? value.lastSenderId : '',
          lastMessageTime: value.updatedAt,
          unreadCount:
            typeof value.unread === 'number' && Number.isFinite(value.unread)
              ? Math.max(0, Math.floor(value.unread))
              : 0,
          isOnline: false,
          statusKnown: false,
        });
      });
      list.sort(
        (a, b) =>
          b.lastMessageTime - a.lastMessageTime ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      callback(list);
    },
    onError,
  );
}

/** Một listener userChats của mình + status của từng đối tác 1-1. */
export function subscribeConversationList(
  myUid: string,
  callback: (conversations: RealtimeConversation[]) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let list: RealtimeConversation[] = [];
  const statuses = new Map<
    string,
    { unsubscribe: () => void; value?: UserStatus }
  >();
  const publish = () => {
    if (!active) {
      return;
    }
    callback(
      list.map(item => {
        const status = item.contactId
          ? statuses.get(item.contactId)?.value
          : undefined;
        return {
          ...item,
          statusKnown: !!status,
          isOnline: status?.isOnline === true,
        };
      }),
    );
  };
  const unsubscribe = subscribeConversations(
    myUid,
    value => {
      if (!active) {
        return;
      }
      list = value;
      const ids = new Set(list.map(item => item.contactId));
      statuses.forEach((entry, id) => {
        if (!ids.has(id)) {
          entry.unsubscribe();
          statuses.delete(id);
        }
      });
      list.forEach(item => {
        const partner = item.contactId;
        if (!partner || statuses.has(partner)) {
          return;
        }
        const entry: { unsubscribe: () => void; value?: UserStatus } = {
          unsubscribe: () => {},
        };
        statuses.set(partner, entry);
        entry.unsubscribe = subscribeStatus(
          partner,
          status => {
            if (!active || statuses.get(partner) !== entry) {
              return;
            }
            entry.value = status;
            publish();
          },
          () => {
            if (!active || statuses.get(partner) !== entry) {
              return;
            }
            entry.value = undefined;
            publish();
          },
        );
      });
      publish();
    },
    error => {
      if (!active) {
        return;
      }
      statuses.forEach(entry => entry.unsubscribe());
      statuses.clear();
      onError(error);
    },
  );
  return () => {
    active = false;
    unsubscribe();
    statuses.forEach(entry => entry.unsubscribe());
    statuses.clear();
  };
}
