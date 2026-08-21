export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnnotationType = 'highlight' | 'note';

export type AuthProvider = 'google' | 'password' | 'guest';

/** The signed-in person. `id` is stable and drives automatic color assignment. */
export interface User {
  id: string; // "google:<sub>" or "guest:<uuid>"
  name: string;
  email?: string;
  picture?: string;
  provider: AuthProvider;
}

/** Author snapshot stored on each annotation, so attribution survives sign-out. */
export interface AuthorRef {
  id: string;
  name: string;
  email?: string;
  picture?: string;
}

export interface Reply {
  id: string;
  author: AuthorRef;
  text: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number; // 1-indexed
  color: string;
  rects?: NormRect[]; // highlights: normalized to page size (0-1)
  x?: number; // notes: normalized to page size (0-1)
  y?: number;
  quotedText?: string;
  comment: string;
  author: AuthorRef;
  replies: Reply[];
  resolved?: boolean;
  createdAt: number;
  /** Bumped on every change; drives per-annotation last-write-wins merging. */
  updatedAt: number;
  /** Set only when the comment body itself is edited, so replies and resolves
   *  don't make a comment falsely display as "edited". */
  editedAt?: number;
  /** Tombstone, so a delete propagates instead of being resurrected by a merge. */
  deleted?: boolean;
}

export interface DocumentRecord {
  id: string; // sha-256 of file bytes
  name: string;
  bytes: ArrayBuffer;
  createdAt: number;
  /** Set once this document has been shared, so re-sharing reuses the same link. */
  shareId?: string;
}

export interface ShareRecord {
  docName: string;
  pdfUrl: string;
  annotations: Annotation[];
  updatedAt: number;
}
