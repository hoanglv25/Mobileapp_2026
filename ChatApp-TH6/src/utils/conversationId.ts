/**
 * Quy ước id cuộc trò chuyện:
 *  - 1-1: "uidNhỏ_uidLớn" (xác định, không cần tra cứu). UID Firebase không chứa "_".
 *  - nhóm: push key 20 ký tự do Firebase sinh ra (luật bảo mật dựa vào độ dài này).
 */
function validUid(uid: string) {
  return (
    !!uid &&
    [...uid].every(
      character =>
        character.charCodeAt(0) >= 32 &&
        character.charCodeAt(0) !== 127 &&
        !'.#$[]/_'.includes(character),
    )
  );
}

export function getDirectConversationId(
  firstUid: string,
  secondUid: string,
): string {
  if (!validUid(firstUid) || !validUid(secondUid) || firstUid === secondUid) {
    throw new Error(
      'Người nhận không hợp lệ. Hãy chọn người dùng khác trong Danh bạ.',
    );
  }
  return [firstUid, secondUid].sort().join('_');
}

/** UID người còn lại trong chat 1-1. */
export function getPartnerUid(convId: string, myUid: string): string | null {
  const parts = convId.split('_');
  if (parts.length !== 2 || !parts.includes(myUid)) {
    return null;
  }
  return parts[0] === myUid ? parts[1] : parts[0];
}
