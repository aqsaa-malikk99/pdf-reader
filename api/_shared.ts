import type { VercelResponse } from '@vercel/node';

export interface StoredAnnotation {
  id: string;
  author?: { id?: string; name?: string };
  replies?: StoredReply[];
  updatedAt?: number;
  createdAt?: number;
  deleted?: boolean;
  [key: string]: unknown;
}

interface StoredReply {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

/**
 * Per-annotation last-write-wins merge. Mirrors src/lib/merge.ts so the client
 * and server agree on the outcome regardless of which reconciles first.
 */
export function mergeAnnotations(
  base: StoredAnnotation[],
  incoming: StoredAnnotation[],
): StoredAnnotation[] {
  const byId = new Map<string, StoredAnnotation>();
  for (const annotation of base) byId.set(annotation.id, annotation);

  for (const next of incoming) {
    const existing = byId.get(next.id);
    if (!existing) {
      byId.set(next.id, next);
      continue;
    }
    const winner = (next.updatedAt ?? 0) >= (existing.updatedAt ?? 0) ? next : existing;
    byId.set(next.id, {
      ...winner,
      deleted: existing.deleted || next.deleted || undefined,
      replies: mergeReplies(existing.replies ?? [], next.replies ?? []),
    });
  }

  return Array.from(byId.values());
}

function mergeReplies(base: StoredReply[], incoming: StoredReply[]): StoredReply[] {
  const byId = new Map<string, StoredReply>();
  for (const reply of base) byId.set(reply.id, reply);
  for (const reply of incoming) {
    const existing = byId.get(reply.id);
    const nextAt = reply.updatedAt ?? reply.createdAt ?? 0;
    const prevAt = existing ? existing.updatedAt ?? existing.createdAt ?? 0 : -1;
    if (!existing || nextAt >= prevAt) byId.set(reply.id, reply);
  }
  return Array.from(byId.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/**
 * Blocks the realistic abuse case for a link-shared document: someone with the
 * link posting *new* comments under another Google user's identity. Annotations
 * already stored are left alone (a client legitimately re-sends the merged list,
 * including other people's comments).
 */
export function rejectsIdentitySpoofing(
  stored: StoredAnnotation[],
  incoming: StoredAnnotation[],
  verifiedUserId: string | null,
): boolean {
  const knownIds = new Set(stored.map((a) => a.id));
  for (const annotation of incoming) {
    if (knownIds.has(annotation.id)) continue;
    const authorId = annotation.author?.id;
    if (typeof authorId === 'string' && authorId.startsWith('google:')) {
      if (authorId !== verifiedUserId) return true;
    }
  }
  return false;
}

export function isValidShareId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
}

export function sendError(res: VercelResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}
