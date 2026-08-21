import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { docName, pdfBase64, annotations } = req.body ?? {};
    if (!docName || !pdfBase64) {
      res.status(400).json({ error: 'docName and pdfBase64 are required' });
      return;
    }

    const id = crypto.randomUUID();
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const pdfBlob = await put(`shares/${id}/document.pdf`, pdfBuffer, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });

    const data = {
      docName,
      pdfUrl: pdfBlob.url,
      annotations: annotations ?? [],
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
    console.error(err);
    res.status(500).json({ error: 'Failed to create share' });
  }
}
