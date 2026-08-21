/**
 * Highlight palette. Each entry is used with `mix-blend-mode: multiply` (and
 * pdf-lib's Multiply blend on export), so the colours are deliberately light —
 * multiply darkens them over white, and the underlying text stays crisp instead
 * of being washed out by a translucent overlay.
 */
export const HIGHLIGHT_COLORS = [
  '#ffe066', // yellow
  '#8ce99a', // green
  '#74c0fc', // blue
  '#ffa8d5', // pink
  '#ffc078', // orange
  '#b197fc', // purple
  '#66d9e8', // cyan
  '#ffd8a8', // peach
] as const;

export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0];

/** Stable 32-bit hash so a given user always maps to the same colour. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministically assigns a highlight colour to a user id, so each person's
 * highlights are visually distinguishable without anyone picking a colour.
 */
export function colorForUser(userId: string): string {
  return HIGHLIGHT_COLORS[hashString(userId) % HIGHLIGHT_COLORS.length];
}

/** Deterministic avatar background for a user's initials chip. */
export function avatarColorForUser(userId: string): string {
  return colorForUser(userId);
}

interface AuthoredAt {
  author: { id: string };
  createdAt: number;
}

/**
 * Picks a highlight colour for `userId` that no other participant in this
 * document is already using.
 *
 * Hashing alone can collide (two people landing on the same colour), which
 * defeats the point of colour-coding contributors. Within a document we instead
 * seat participants in a stable order — earliest contribution first — and hand
 * out distinct palette entries, falling back to the hash only once every colour
 * is taken.
 */
export function colorForUserInDocument(userId: string, annotations: AuthoredAt[]): string {
  const firstSeen = new Map<string, number>();
  for (const annotation of annotations) {
    const seen = firstSeen.get(annotation.author.id);
    if (seen === undefined || annotation.createdAt < seen) {
      firstSeen.set(annotation.author.id, annotation.createdAt);
    }
  }

  const seating = Array.from(firstSeen.entries())
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  const index = seating.indexOf(userId);
  const seat = index === -1 ? seating.length : index;

  return seat < HIGHLIGHT_COLORS.length ? HIGHLIGHT_COLORS[seat] : colorForUser(userId);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
