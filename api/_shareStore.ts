import { Redis } from '@upstash/redis';
import type { StoredAnnotation } from './_shared.js';

export interface ShareData {
  docName: string;
  pdfUrl: string;
  annotations: StoredAnnotation[];
  updatedAt: number;
}

const redis = Redis.fromEnv();

const shareKey = (id: string) => `share:${id}`;

/**
 * Redis is a single strongly-consistent key per share, so — unlike the old
 * Vercel Blob revision scheme this replaced — there's no CDN staleness to work
 * around and no list()/del() "Advanced Operations" quota to burn through on
 * every read or save.
 */
export async function readShare(id: string): Promise<ShareData | null> {
  const data = await redis.get<ShareData>(shareKey(id));
  return data ?? null;
}

export async function writeShareRevision(id: string, data: ShareData): Promise<void> {
  await redis.set(shareKey(id), data);
}
