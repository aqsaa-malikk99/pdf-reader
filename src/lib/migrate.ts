import type { Annotation, AuthorRef } from '../types';
import { DEFAULT_HIGHLIGHT_COLOR } from './colors';

/**
 * Annotations saved by earlier versions stored `author` as a plain string and
 * had no replies/timestamps. Normalise them on load so old local documents and
 * old share links keep working.
 */
export function normalizeAnnotation(raw: unknown): Annotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== 'string' || typeof a.page !== 'number') return null;

  const createdAt = typeof a.createdAt === 'number' ? a.createdAt : Date.now();

  let author: AuthorRef;
  if (typeof a.author === 'string') {
    const name = a.author.trim() || 'Anonymous';
    author = { id: `legacy:${name.toLowerCase()}`, name };
  } else if (a.author && typeof a.author === 'object') {
    const parsed = a.author as Record<string, unknown>;
    author = {
      id: typeof parsed.id === 'string' ? parsed.id : 'legacy:anonymous',
      name: typeof parsed.name === 'string' ? parsed.name : 'Anonymous',
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      picture: typeof parsed.picture === 'string' ? parsed.picture : undefined,
    };
  } else {
    author = { id: 'legacy:anonymous', name: 'Anonymous' };
  }

  return {
    id: a.id,
    type: a.type === 'note' ? 'note' : 'highlight',
    page: a.page,
    color: typeof a.color === 'string' ? a.color : DEFAULT_HIGHLIGHT_COLOR,
    rects: Array.isArray(a.rects) ? (a.rects as Annotation['rects']) : undefined,
    x: typeof a.x === 'number' ? a.x : undefined,
    y: typeof a.y === 'number' ? a.y : undefined,
    quotedText: typeof a.quotedText === 'string' ? a.quotedText : undefined,
    comment: typeof a.comment === 'string' ? a.comment : '',
    author,
    replies: Array.isArray(a.replies) ? (a.replies as Annotation['replies']) : [],
    resolved: a.resolved === true ? true : undefined,
    createdAt,
    updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : createdAt,
    editedAt: typeof a.editedAt === 'number' ? a.editedAt : undefined,
    deleted: a.deleted === true ? true : undefined,
  };
}

export function normalizeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAnnotation).filter((a): a is Annotation => a !== null);
}
