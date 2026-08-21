import { del, get, list, put } from '@vercel/blob';
import type { StoredAnnotation } from './_shared.js';

export interface ShareData {
  docName: string;
  pdfUrl: string;
  annotations: StoredAnnotation[];
  updatedAt: number;
}

const revPrefix = (id: string) => `shares/${id}/rev/`;
const legacyPath = (id: string) => `shares/${id}/data.json`;

/**
 * Every edit is written to a brand-new path (`rev/<timestamp>-<random>.json`)
 * instead of overwriting one `data.json` in place. This sidesteps a real
 * consistency issue: Vercel Blob's public CDN can take a few seconds — and,
 * with default caching, up to a month — to reflect an overwrite at an
 * existing URL. A URL that has never been requested before can't be served
 * stale, since nothing is cached for it yet. `list()` (a metadata call, not a
 * cached content fetch) finds the newest revision.
 */
export async function readShare(id: string): Promise<ShareData | null> {
  try {
    const { blobs } = await list({ prefix: revPrefix(id), limit: 1000 });
    if (blobs.length > 0) {
      const latest = blobs.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
      const result = await get(latest.pathname, { access: 'public', useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return JSON.parse(await new Response(result.stream).text()) as ShareData;
    }

    // Shares created before this change only have the legacy overwritten path.
    const legacy = await get(legacyPath(id), { access: 'public', useCache: false });
    if (!legacy || legacy.statusCode !== 200 || !legacy.stream) return null;
    return JSON.parse(await new Response(legacy.stream).text()) as ShareData;
  } catch {
    return null;
  }
}

export async function writeShareRevision(id: string, data: ShareData): Promise<void> {
  const path = `${revPrefix(id)}${Date.now()}-${crypto.randomUUID()}.json`;
  await put(path, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  // Best-effort cleanup so revisions don't accumulate forever; correctness
  // never depends on this succeeding, so failures are swallowed. Only prune
  // revisions older than a minute — two people saving within the same window
  // would otherwise risk one's cleanup deleting the other's fresh revision
  // before it's ever read.
  const CLEANUP_AGE_MS = 60_000;
  list({ prefix: revPrefix(id), limit: 1000 })
    .then(({ blobs }) => {
      const stale = blobs.filter(
        (b) => b.pathname !== path && Date.now() - b.uploadedAt.getTime() > CLEANUP_AGE_MS,
      );
      if (stale.length > 0) return del(stale.map((b) => b.pathname));
    })
    .catch(() => {});
}
