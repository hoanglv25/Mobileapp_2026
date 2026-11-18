/** "Hoạt động X phút trước" cho người đang offline. */
export function formatLastActive(
  lastChanged: number | null | undefined,
  now = Date.now(),
): string {
  if (typeof lastChanged !== 'number' || !Number.isFinite(lastChanged)) {
    return 'Ngoại tuyến';
  }
  const minutes = Math.max(0, Math.floor((now - lastChanged) / 60000));
  if (minutes < 1) {
    return 'Hoạt động vừa xong';
  }
  if (minutes < 60) {
    return `Hoạt động ${minutes} phút trước`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Hoạt động ${hours} giờ trước`;
  }
  return `Hoạt động ${Math.floor(hours / 24)} ngày trước`;
}
