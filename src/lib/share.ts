import { upload } from '@vercel/blob/client';
import type { Annotation, ShareRecord } from '../types';
import { normalizeAnnotations } from './migrate';

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
  const id = crypto.randomUUID();

  // Uploaded directly from the browser to Blob storage — not through this
  // app's own API — so PDF size is limited by Blob (multi-GB), not by the
  // ~4.5MB body cap on serverless functions.
  const blob = await upload(`shares/${id}/document.pdf`, new Blob([pdfBytes], { type: 'application/pdf' }), {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
  });

  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(idToken) },
    body: JSON.stringify({ id, docName, pdfUrl: blob.url, annotations }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `Share creation failed (${res.status})`));
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
