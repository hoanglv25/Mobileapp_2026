/**
 * groupService.ts
 * Tạo nhóm và quản trị nhóm. Luật bảo mật được kiểm tra theo trạng thái TRƯỚC khi
 * ghi, nên các thao tác thêm thành viên / tạo nhóm cần 2 bước: (1) ghi
 * conversations/{id}/members, (2) mới ghi được userChats, tin hệ thống, thông báo.
 */
import {
  increment,
  push,
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { auth, database } from './firebase';
import { AuthUser } from './authService';
import { buildNotification } from './notificationService';

export const MIN_OTHER_MEMBERS = 2;
export const MAX_GROUP_NAME = 50;

function requireUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  }
}

export function validateGroupName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Vui lòng nhập tên nhóm.');
  }
  if (trimmed.length > MAX_GROUP_NAME) {
    throw new Error(`Tên nhóm tối đa ${MAX_GROUP_NAME} ký tự.`);
  }
  return trimmed;
}

/** Thêm tin hệ thống + cập nhật lastMessage/unread của các thành viên còn lại. */
function addSystemMessage(
  changes: Record<string, unknown>,
  actor: AuthUser,
  convId: string,
  groupName: string,
  text: string,
  recipients: string[],
) {
  const messageId = push(ref(database, `messages/${convId}`)).key as string;
  changes[`messages/${convId}/${messageId}`] = {
    senderId: actor.uid,
    type: 'system',
    text,
    createdAt: serverTimestamp(),
    recalled: false,
  };
  recipients.forEach(uid => {
    const base = `userChats/${uid}/${convId}`;
    changes[`${base}/type`] = 'group';
    changes[`${base}/name`] = groupName;
    changes[`${base}/lastMessage`] = text;
    changes[`${base}/lastMessageId`] = messageId;
    changes[`${base}/lastSenderId`] = actor.uid;
    changes[`${base}/updatedAt`] = serverTimestamp();
    if (uid !== actor.uid) {
      changes[`${base}/unread`] = increment(1);
    }
  });
}

function notifyAdded(
  changes: Record<string, unknown>,
  actor: AuthUser,
  convId: string,
  groupName: string,
  uids: string[],
) {
  uids.forEach(uid => {
    const id = push(ref(database, `notifications/${uid}`)).key as string;
    changes[`notifications/${uid}/${id}`] = buildNotification({
      type: 'group_add',
      convId,
      fromUid: actor.uid,
      fromName: actor.displayName,
      text: `${actor.displayName} đã thêm bạn vào nhóm "${groupName}"`,
    });
  });
}

/** Tạo nhóm: tối thiểu 2 người ngoài bản thân. Trả về id nhóm. */
export async function createGroup(
  creator: AuthUser,
  rawName: string,
  otherUids: string[],
): Promise<string> {
  requireUser(creator.uid);
  const name = validateGroupName(rawName);
  const others = [...new Set(otherUids)].filter(uid => uid !== creator.uid);
  if (others.length < MIN_OTHER_MEMBERS) {
    throw new Error(`Hãy chọn ít nhất ${MIN_OTHER_MEMBERS} thành viên khác.`);
  }
  const convRef = push(ref(database, 'conversations'));
  const convId = convRef.key;
  if (!convId) {
    throw new Error('Không thể tạo nhóm. Vui lòng thử lại.');
  }
  const members = [creator.uid, ...others];
  // Bước 1: bản ghi nhóm (người tạo là thành viên đầu tiên).
  await set(convRef, {
    type: 'group',
    name,
    members: Object.fromEntries(members.map(uid => [uid, true])),
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
  });
  // Bước 2: một lệnh đa đường dẫn: tin hệ thống + userChats + thông báo.
  const changes: Record<string, unknown> = {};
  addSystemMessage(
    changes,
    creator,
    convId,
    name,
    `${creator.displayName} đã tạo nhóm "${name}"`,
    members,
  );
  notifyAdded(changes, creator, convId, name, others);
  await update(ref(database), changes);
  return convId;
}

export async function renameGroup(
  actor: AuthUser,
  convId: string,
  members: string[],
  oldName: string,
  rawName: string,
): Promise<void> {
  requireUser(actor.uid);
  const name = validateGroupName(rawName);
  if (name === oldName) {
    return;
  }
  const changes: Record<string, unknown> = {
    [`conversations/${convId}/name`]: name,
  };
  addSystemMessage(
    changes,
    actor,
    convId,
    name,
    `${actor.displayName} đã đổi tên nhóm thành "${name}"`,
    members,
  );
  await update(ref(database), changes);
}

export async function addGroupMembers(
  actor: AuthUser,
  convId: string,
  groupName: string,
  currentMembers: string[],
  newUids: string[],
  names: Record<string, string>,
): Promise<void> {
  requireUser(actor.uid);
  const added = [...new Set(newUids)].filter(
    uid => !currentMembers.includes(uid),
  );
  if (added.length === 0) {
    return;
  }
  const first: Record<string, unknown> = {};
  added.forEach(uid => {
    first[`conversations/${convId}/members/${uid}`] = true;
  });
  await update(ref(database), first);
  const all = [...currentMembers, ...added];
  const changes: Record<string, unknown> = {};
  addSystemMessage(
    changes,
    actor,
    convId,
    groupName,
    `${actor.displayName} đã thêm ${added
      .map(uid => names[uid] || 'thành viên mới')
      .join(', ')} vào nhóm`,
    all,
  );
  notifyAdded(changes, actor, convId, groupName, added);
  await update(ref(database), changes);
}

/** Người tạo nhóm xóa một thành viên. */
export async function removeGroupMember(
  actor: AuthUser,
  convId: string,
  groupName: string,
  members: string[],
  targetUid: string,
  targetName: string,
): Promise<void> {
  requireUser(actor.uid);
  const changes: Record<string, unknown> = {
    [`conversations/${convId}/members/${targetUid}`]: null,
    [`userChats/${targetUid}/${convId}`]: null,
  };
  addSystemMessage(
    changes,
    actor,
    convId,
    groupName,
    `${actor.displayName} đã xóa ${targetName} khỏi nhóm`,
    members.filter(uid => uid !== targetUid),
  );
  await update(ref(database), changes);
}

/** Rời nhóm: hiển thị tin hệ thống "A đã rời nhóm". */
export async function leaveGroup(
  me: AuthUser,
  convId: string,
  groupName: string,
  members: string[],
  createdBy: string,
): Promise<void> {
  requireUser(me.uid);
  const remaining = members.filter(uid => uid !== me.uid);
  const changes: Record<string, unknown> = {
    [`conversations/${convId}/members/${me.uid}`]: null,
    [`userChats/${me.uid}/${convId}`]: null,
  };
  if (createdBy === me.uid && remaining.length > 0) {
    changes[`conversations/${convId}/createdBy`] = remaining[0];
  }
  addSystemMessage(
    changes,
    me,
    convId,
    groupName,
    `${me.displayName} đã rời nhóm`,
    remaining,
  );
  await update(ref(database), changes);
}
