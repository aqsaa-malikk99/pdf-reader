import type { Annotation } from '../types';

export interface ShareRecord {
  docName: string;
  pdfUrl: string;
  annotations: Annotation[];
  updatedAt: number;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const chunkSize = 0x8000;
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function createShare(
  docName: string,
  pdfBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<{ id: string } & ShareRecord> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docName,
      pdfBase64: bytesToBase64(pdfBytes),
      annotations,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Share upload failed (${res.status})`);
  }
  return res.json();
}

export async function fetchShare(id: string): Promise<ShareRecord> {
  const res = await fetch(`/api/share/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Shared document not found (${res.status})`);
  }
  return res.json();
}

export async function updateShareAnnotations(
  id: string,
  annotations: Annotation[],
): Promise<ShareRecord> {
  const res = await fetch(`/api/share/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations }),
  });
  if (!res.ok) {
    throw new Error(`Failed to sync comments (${res.status})`);
  }
  return res.json();
}

export function buildShareLink(id: string): string {
  return `${window.location.origin}${window.location.pathname}#/shared/${id}`;
}

export function parseShareIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/shared\/([0-9a-f-]{36})$/);
  return match ? match[1] : null;
}
