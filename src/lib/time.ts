const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Compact relative timestamp, e.g. "just now", "5m ago", "3d ago". */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 0) return 'just now';
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  });
}

/** Full timestamp for tooltips. */
export function absoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
