import { head, put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRequestIdentity } from '../_auth';
import {
  isValidShareId,
  mergeAnnotations,
  rejectsIdentitySpoofing,
  sendError,
  type StoredAnnotation,
} from '../_shared';

interface ShareData {
  docName: string;
  pdfUrl: string;
  annotations: StoredAnnotation[];
  updatedAt: number;
}

async function readShare(id: string): Promise<ShareData | null> {
  try {
    const meta = await head(`shares/${id}/data.json`);
    const response = await fetch(meta.url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as ShareData;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id;
  if (!isValidShareId(id)) {
    return sendError(res, 400, 'Invalid share link.');
  }

  if (req.method === 'GET') {
    const data = await readShare(id);
    if (!data) return sendError(res, 404, 'This shared document no longer exists.');
    return res.status(200).json(data);
  }

  if (req.method !== 'PUT') {
    return sendError(res, 405, 'Method not allowed');
  }

  let identity = null;
  try {
    identity = await verifyRequestIdentity(req);
  } catch {
    return sendError(res, 401, 'Your sign-in has expired. Sign in again and retry.');
  }

  const existing = await readShare(id);
  if (!existing) return sendError(res, 404, 'This shared document no longer exists.');

  const incoming = Array.isArray(req.body?.annotations)
    ? (req.body.annotations as StoredAnnotation[])
    : [];

  if (rejectsIdentitySpoofing(existing.annotations ?? [], incoming, identity?.userId ?? null)) {
    return sendError(res, 403, 'Comments must be posted under your own signed-in identity.');
  }

  try {
    const merged = mergeAnnotations(existing.annotations ?? [], incoming);
    const updated: ShareData = { ...existing, annotations: merged, updatedAt: Date.now() };

    await put(`shares/${id}/data.json`, JSON.stringify(updated), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error('share sync failed', err);
    sendError(res, 500, 'Could not save comments. They are still saved on this device.');
  }
}
