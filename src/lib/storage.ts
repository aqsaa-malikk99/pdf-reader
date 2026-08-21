import { get, set, del, keys } from 'idb-keyval';
import type { Annotation, DocumentRecord } from '../types';
import { normalizeAnnotations } from './migrate';

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const docKey = (id: string) => `doc:${id}`;
const annKey = (id: string) => `ann:${id}`;

export async function saveDocument(record: DocumentRecord): Promise<void> {
  await set(docKey(record.id), record);
}

export async function loadDocument(id: string): Promise<DocumentRecord | undefined> {
  return get(docKey(id));
}

/** Records that a document has been shared, so re-sharing it reuses the same link. */
export async function setDocumentShareId(id: string, shareId: string): Promise<void> {
  const existing = await loadDocument(id);
  if (existing) await saveDocument({ ...existing, shareId });
}

export async function saveAnnotations(docId: string, annotations: Annotation[]): Promise<void> {
  await set(annKey(docId), annotations);
}

export async function loadAnnotations(docId: string): Promise<Annotation[]> {
  return normalizeAnnotations(await get(annKey(docId)));
}

export async function deleteDocument(id: string): Promise<void> {
  await del(docKey(id));
  await del(annKey(id));
}

export interface RecentDoc {
  id: string;
  name: string;
  createdAt: number;
  annotationCount: number;
  shareId?: string;
}

export async function listRecentDocuments(): Promise<RecentDoc[]> {
  const allKeys = await keys();
  const docIds = allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith('doc:'))
    .map((k) => k.slice(4));

  const records = await Promise.all(
    docIds.map(async (id) => {
      const [doc, annotations] = await Promise.all([loadDocument(id), loadAnnotations(id)]);
      if (!doc) return null;
      return {
        id: doc.id,
        name: doc.name,
        createdAt: doc.createdAt,
        annotationCount: annotations.filter((a) => !a.deleted).length,
        ...(doc.shareId ? { shareId: doc.shareId } : {}),
      };
    }),
  );

  return records
    .filter((r): r is RecentDoc => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}
