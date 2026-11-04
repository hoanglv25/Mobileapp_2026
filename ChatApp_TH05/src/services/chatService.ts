import {
  get,
  increment,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database';
import { auth, database } from './firebase';
import { AuthUser } from './authService';
import { ChatMessage, RealtimeConversation } from '../types';
import { subscribeStatus, UserStatus } from './userService';
import { Coordinates, isValidCoordinates } from '../utils/coordinates';

export const MAX_MESSAGE_LENGTH = 2000;

function validUid(uid: string) {
  return (
    !!uid &&
    [...uid].every(
      character =>
        character.charCodeAt(0) >= 32 &&
        character.charCodeAt(0) !== 127 &&
        !'.#$[]/'.includes(character),
    )
  );
}

export function getChatId(firstUid: string, secondUid: string): string {
  if (!validUid(firstUid) || !validUid(secondUid) || firstUid === secondUid) {
    throw new Error(
      'Người nhận không hợp lệ. Hãy chọn người dùng khác trong Danh bạ.',
    );
  }
  return [firstUid, secondUid].sort().join('_');
}

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

export function subscribeMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `messages/${chatId}`),
    snapshot => {
      const messages: ChatMessage[] = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          !child.key ||
          !value ||
          typeof value.senderId !== 'string' ||
          typeof value.receiverId !== 'string' ||
          typeof value.text !== 'string' ||
          !Number.isFinite(value.createdAt) ||
          !['text', 'location'].includes(value.type)
        ) {
          return;
        }
        messages.push({
          id: child.key,
          senderId: value.senderId,
          receiverId: value.receiverId,
          type: value.type,
          text: value.text,
          createdAt: value.createdAt,
          ...(typeof value.latitude === 'number'
            ? { latitude: value.latitude }
            : {}),
          ...(typeof value.longitude === 'number'
            ? { longitude: value.longitude }
            : {}),
        });
      });
      // Thay cả snapshot thay vì nối mảng: một push key chỉ tạo một dòng.
      messages.sort(
        (a, b) =>
          a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      callback(messages);
    },
    onError,
  );
}

export async function sendTextMessage(
  sender: AuthUser,
  partnerUid: string,
  text: string,
): Promise<void> {
  requireUser(sender.uid);
  getChatId(sender.uid, partnerUid);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Không thể gửi tin nhắn rỗng.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`);
  }
  await sendMessage(sender, partnerUid, { type: 'text', text: trimmed });
}

export async function sendLocationMessage(
  sender: AuthUser,
  partnerUid: string,
  point: Coordinates,
): Promise<void> {
  if (!isValidCoordinates(point)) {
    throw new Error('Tọa độ vị trí không hợp lệ.');
  }
  await sendMessage(sender, partnerUid, {
    type: 'location',
    text: '📍 Vị trí',
    latitude: point.latitude,
    longitude: point.longitude,
  });
}

async function sendMessage(
  sender: AuthUser,
  partnerUid: string,
  content: {
    type: 'text' | 'location';
    text: string;
    latitude?: number;
    longitude?: number;
  },
): Promise<void> {
  requireUser(sender.uid);
  const chatId = getChatId(sender.uid, partnerUid);
  // Xác nhận hồ sơ người nhận trước khi tạo tin nhắn.
  const partnerSnapshot = await get(ref(database, `users/${partnerUid}`));
  if (!partnerSnapshot.exists()) {
    throw new Error(
      'Người nhận không tồn tại. Hãy chọn tài khoản trong Danh bạ.',
    );
  }
  const partner = partnerSnapshot.val();
  requireUser(sender.uid);
  const messageRef = push(ref(database, `messages/${chatId}`));
  if (!messageRef.key) {
    throw new Error('Không thể tạo tin nhắn. Vui lòng thử lại.');
  }
  const createdAt = serverTimestamp();
  const changes: Record<string, unknown> = {
    [`messages/${chatId}/${messageRef.key}`]: {
      id: messageRef.key,
      senderId: sender.uid,
      receiverId: partnerUid,
      ...content,
      createdAt,
    },
  };
  const participants = [
    {
      owner: sender.uid,
      contact: partnerUid,
      name:
        typeof partner.displayName === 'string'
          ? partner.displayName
          : 'Người dùng',
      avatar: typeof partner.avatar === 'string' ? partner.avatar : '',
    },
    {
      owner: partnerUid,
      contact: sender.uid,
      name: sender.displayName,
      avatar: sender.avatar,
    },
  ];
  participants.forEach(item => {
    const base = `userChats/${item.owner}/${item.contact}`;
    Object.entries({
      chatId,
      contactId: item.contact,
      name: item.name,
      avatar: item.avatar,
      lastMessage: content.text,
      lastMessageTime: createdAt,
    }).forEach(([field, value]) => {
      changes[`${base}/${field}`] = value;
    });
  });
  changes[`userChats/${partnerUid}/${sender.uid}/unreadCount`] = increment(1);
  // Không ghi đè cả userChats node hoặc reset unread của người gửi.
  await update(ref(database), changes);
}

export function subscribeUnreadCount(
  myUid: string,
  partnerUid: string,
  callback: (count: number) => void,
  onError: (error: unknown) => void,
): () => void {
  return onValue(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    snapshot => {
      const value = snapshot.val();
      callback(typeof value === 'number' && value > 0 ? value : 0);
    },
    onError,
  );
}

export async function markAsRead(
  myUid: string,
  partnerUid: string,
): Promise<void> {
  requireUser(myUid);
  getChatId(myUid, partnerUid);
  // Transaction chỉ ở counter của mình: không cần quyền đọc nhánh người nhận.
  // null/0 không ghi, tránh tạo cuộc trò chuyện rỗng ngay khi mở Chat.
  await runTransaction(
    ref(database, `userChats/${myUid}/${partnerUid}/unreadCount`),
    count => (typeof count === 'number' && count > 0 ? 0 : undefined),
    { applyLocally: false },
  );
}

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
        const partnerUid = child.key;
        if (
          !partnerUid ||
          partnerUid === myUid ||
          !value ||
          typeof value.lastMessage !== 'string' ||
          typeof value.lastMessageTime !== 'number' ||
          !Number.isFinite(value.lastMessageTime)
        ) {
          return;
        }
        let expectedChatId: string;
        try {
          expectedChatId = getChatId(myUid, partnerUid);
        } catch {
          return;
        }
        if (value.chatId !== expectedChatId || value.contactId !== partnerUid) {
          return;
        }
        list.push({
          id: expectedChatId,
          chatId: expectedChatId,
          contactId: partnerUid,
          name: typeof value.name === 'string' ? value.name : 'Người dùng',
          avatar: typeof value.avatar === 'string' ? value.avatar : '',
          lastMessage: value.lastMessage,
          lastMessageTime: value.lastMessageTime,
          unreadCount:
            typeof value.unreadCount === 'number' &&
            Number.isFinite(value.unreadCount)
              ? Math.max(0, Math.floor(value.unreadCount))
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

/** Một listener userChats của mình, cộng status theo UID đối tác theo đúng rules. */
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
        const status = statuses.get(item.contactId)?.value;
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
        if (statuses.has(item.contactId)) {
          return;
        }
        const entry: { unsubscribe: () => void; value?: UserStatus } = {
          unsubscribe: () => {},
        };
        statuses.set(item.contactId, entry);
        entry.unsubscribe = subscribeStatus(
          item.contactId,
          status => {
            if (!active || statuses.get(item.contactId) !== entry) {
              return;
            }
            entry.value = status;
            publish();
          },
          () => {
            if (!active || statuses.get(item.contactId) !== entry) {
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
