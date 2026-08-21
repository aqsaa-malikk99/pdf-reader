import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRequestIdentity } from '../_auth';
import { sendError } from '../_shared';

// Serverless request bodies are capped; keep uploads comfortably under it and
// fail with a clear message rather than a generic platform error.
const MAX_PDF_BYTES = 4 * 1024 * 1024;

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    await verifyRequestIdentity(req);
  } catch {
    return sendError(res, 401, 'Your sign-in has expired. Sign in again and retry.');
  }

  try {
    const { docName, pdfBase64, annotations } = req.body ?? {};
    if (typeof docName !== 'string' || typeof pdfBase64 !== 'string') {
      return sendError(res, 400, 'docName and pdfBase64 are required');
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    if (pdfBuffer.length === 0) {
      return sendError(res, 400, 'The PDF appears to be empty.');
    }
    if (pdfBuffer.length > MAX_PDF_BYTES) {
      return sendError(
        res,
        413,
        'This PDF is too large to share (limit ~4 MB). Use “Export PDF” and email the file instead.',
      );
    }

    const id = crypto.randomUUID();
    const pdfBlob = await put(`shares/${id}/document.pdf`, pdfBuffer, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });

    const data = {
      docName,
      pdfUrl: pdfBlob.url,
      annotations: Array.isArray(annotations) ? annotations : [],
      updatedAt: Date.now(),
    };

    await put(`shares/${id}/data.json`, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    res.status(200).json({ id, ...data });
  } catch (err) {
    console.error('share create failed', err);
    sendError(res, 500, 'Could not create the share link. Please try again.');
  }
}
