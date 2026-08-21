import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError } from './_shared.js';

const SHARE_PDF_PATTERN = /^shares\/[0-9a-f-]{36}\/document\.pdf$/;
const MAX_PDF_BYTES = 50 * 1024 * 1024; // generous; the old limit was an artifact of the base64 body, not a real constraint

/**
 * Authorizes direct browser -> Blob uploads. This exists specifically so PDF
 * uploads never pass through a serverless function body: Vercel's platform
 * caps that at ~4.5MB, and a base64-encoded PDF blows past it around 3MB.
 * The browser talks to Blob storage directly instead; this route only issues
 * a short-lived, path-restricted token.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!SHARE_PDF_PATTERN.test(pathname)) {
          throw new Error('Invalid upload path');
        }
        return {
          allowedContentTypes: ['application/pdf'],
          addRandomSuffix: false,
          allowOverwrite: false,
          maximumSizeInBytes: MAX_PDF_BYTES,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the client writes share metadata via POST /api/share right
        // after the upload resolves, once it has the resulting blob URL.
      },
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('blob-upload authorization failed', err);
    sendError(res, 400, err instanceof Error ? err.message : 'Upload could not be authorized.');
  }
}
