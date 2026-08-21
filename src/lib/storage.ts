import { get, set, del, keys } from 'idb-keyval';
import type { Annotation, DocumentRecord } from '../types';

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

export async function saveAnnotations(docId: string, annotations: Annotation[]): Promise<void> {
  await set(annKey(docId), annotations);
}

export async function loadAnnotations(docId: string): Promise<Annotation[]> {
  return (await get(annKey(docId))) ?? [];
}

export async function deleteDocument(id: string): Promise<void> {
  await del(docKey(id));
  await del(annKey(id));
}

export interface RecentDoc {
  id: string;
  name: string;
  createdAt: number;
}

export async function listRecentDocuments(): Promise<RecentDoc[]> {
  const allKeys = await keys();
  const docIds = allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith('doc:'))
    .map((k) => k.slice(4));
  const records = await Promise.all(docIds.map((id) => loadDocument(id)));
  return records
    .filter((r): r is DocumentRecord => !!r)
    .map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getUserName(): string {
  return localStorage.getItem('pdf-commenter:username') ?? '';
}

export function setUserName(name: string): void {
  localStorage.setItem('pdf-commenter:username', name);
}
