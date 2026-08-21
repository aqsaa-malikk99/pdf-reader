import type { Annotation, ShareRecord } from '../types';
import { normalizeAnnotations } from './migrate';

function bytesToBase64(bytes: ArrayBuffer): string {
  const chunkSize = 0x8000;
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function authHeaders(idToken?: string): Record<string, string> {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? fallback;
  } catch {
    return fallback;
  }
}

function toShareRecord(raw: any): ShareRecord {
  return {
    docName: raw?.docName ?? 'Document',
    pdfUrl: raw?.pdfUrl ?? '',
    annotations: normalizeAnnotations(raw?.annotations),
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export async function createShare(
  docName: string,
  pdfBytes: ArrayBuffer,
  annotations: Annotation[],
  idToken?: string,
): Promise<{ id: string } & ShareRecord> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(idToken) },
    body: JSON.stringify({ docName, pdfBase64: bytesToBase64(pdfBytes), annotations }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `Share upload failed (${res.status})`));
  }
  const data = await res.json();
  return { id: data.id, ...toShareRecord(data) };
}

export async function fetchShare(id: string): Promise<ShareRecord> {
  const res = await fetch(`/api/share/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(await readError(res, `Shared document not found (${res.status})`));
  }
  return toShareRecord(await res.json());
}

/**
 * Pushes local annotations and receives the server-merged result back, so a
 * collaborator's concurrent edits are folded in rather than overwritten.
 */
export async function syncShareAnnotations(
  id: string,
  annotations: Annotation[],
  idToken?: string,
): Promise<ShareRecord> {
  const res = await fetch(`/api/share/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(idToken) },
    body: JSON.stringify({ annotations }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `Failed to sync comments (${res.status})`));
  }
  return toShareRecord(await res.json());
}

export function buildShareLink(id: string): string {
  return `${window.location.origin}${window.location.pathname}#/shared/${id}`;
}

export function parseShareIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/shared\/([0-9a-f-]{36})$/);
  return match ? match[1] : null;
}
