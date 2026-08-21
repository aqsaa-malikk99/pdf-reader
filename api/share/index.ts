import { head } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError } from '../_shared.js';
import { writeShareRevision } from '../_shareStore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    const { id, docName, pdfUrl, annotations } = req.body ?? {};
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(id) ||
      typeof docName !== 'string' ||
      typeof pdfUrl !== 'string'
    ) {
      return sendError(res, 400, 'id, docName and pdfUrl are required');
    }

    // The PDF is uploaded directly to Blob storage by the client (see
    // api/blob-upload.ts) before this call, so confirm it actually landed at
    // the expected path rather than trusting an arbitrary client-supplied URL.
    const expectedPath = `shares/${id}/document.pdf`;
    try {
      const meta = await head(expectedPath);
      if (meta.url !== pdfUrl) {
        return sendError(res, 400, 'pdfUrl does not match the uploaded file.');
      }
    } catch {
      return sendError(res, 400, 'The PDF upload has not completed yet. Please retry.');
    }

    const data = {
      docName,
      pdfUrl,
      annotations: Array.isArray(annotations) ? annotations : [],
      updatedAt: Date.now(),
    };

    await writeShareRevision(id, data);

    res.status(200).json({ id, ...data });
  } catch (err) {
    console.error('share create failed', err);
    sendError(res, 500, 'Could not create the share link. Please try again.');
  }
}
