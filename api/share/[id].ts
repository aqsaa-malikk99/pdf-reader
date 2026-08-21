import { head, put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function isValidId(id: string): boolean {
  return /^[0-9a-f-]{36}$/.test(id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string;
  if (!id || !isValidId(id)) {
    res.status(400).json({ error: 'Invalid share id' });
    return;
  }

  const jsonPath = `shares/${id}/data.json`;

  if (req.method === 'GET') {
    try {
      const meta = await head(jsonPath);
      const response = await fetch(meta.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('blob fetch failed');
      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(404).json({ error: 'Share not found' });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const meta = await head(jsonPath);
      const existingResp = await fetch(meta.url, { cache: 'no-store' });
      const existing = await existingResp.json();

      const { annotations } = req.body ?? {};
      const updated = {
        ...existing,
        annotations: annotations ?? existing.annotations,
        updatedAt: Date.now(),
      };

      await put(jsonPath, JSON.stringify(updated), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      res.status(404).json({ error: 'Share not found' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
