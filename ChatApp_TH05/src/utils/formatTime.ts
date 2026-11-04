export function formatTime(createdAt: number): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}
