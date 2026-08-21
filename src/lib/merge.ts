import type { Annotation, Reply } from '../types';

/**
 * Merges two annotation lists.
 *
 * The naive approach — whoever writes last replaces the whole list — loses the
 * other person's work whenever both are commenting at the same time. Instead we
 * reconcile per annotation: newest `updatedAt` wins for a given id, deletions
 * are tombstones (so they propagate rather than being resurrected), and replies
 * are unioned by id so two people replying to the same thread both survive.
 *
 * Used identically on the client and in the API, so the outcome is the same
 * whichever side reconciles first.
 */
export function mergeAnnotations(base: Annotation[], incoming: Annotation[]): Annotation[] {
  const byId = new Map<string, Annotation>();
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
      // A delete from either side sticks, regardless of which body won.
      deleted: existing.deleted || next.deleted || undefined,
      replies: mergeReplies(existing.replies ?? [], next.replies ?? []),
    });
  }

  return Array.from(byId.values());
}

function mergeReplies(base: Reply[], incoming: Reply[]): Reply[] {
  const byId = new Map<string, Reply>();
  for (const reply of base) byId.set(reply.id, reply);
  for (const reply of incoming) {
    const existing = byId.get(reply.id);
    if (!existing || (reply.updatedAt ?? reply.createdAt) >= (existing.updatedAt ?? existing.createdAt)) {
      byId.set(reply.id, reply);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
}

/** Tombstones are kept for syncing but never rendered. */
export function visibleAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter((a) => !a.deleted);
}
