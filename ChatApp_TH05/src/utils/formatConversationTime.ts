import { formatTime } from './formatTime';

export function formatConversationTime(
  timestamp: number,
  now = Date.now(),
): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(today.getTime())) {
    return '';
  }
  if (date.toDateString() === today.toDateString()) {
    return formatTime(timestamp);
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}`;
}
