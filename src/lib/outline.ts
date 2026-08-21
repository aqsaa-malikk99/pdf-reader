import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface OutlineItem {
  title: string;
  page: number | null;
  items: OutlineItem[];
}

/** Resolves a pdf.js outline entry's `dest` (named or explicit) to a 1-indexed page number. */
async function resolvePage(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    let explicit = dest;
    if (typeof dest === 'string') {
      explicit = await pdf.getDestination(dest);
    }
    if (!Array.isArray(explicit) || !explicit[0]) return null;
    const index = await pdf.getPageIndex(explicit[0]);
    return index + 1;
  } catch {
    return null;
  }
}

async function convert(pdf: PDFDocumentProxy, nodes: any[]): Promise<OutlineItem[]> {
  const out: OutlineItem[] = [];
  for (const node of nodes) {
    out.push({
      title: node.title || 'Untitled',
      page: await resolvePage(pdf, node.dest),
      items: node.items?.length ? await convert(pdf, node.items) : [],
    });
  }
  return out;
}

/** Returns the PDF's table of contents (bookmarks), or an empty array if it has none. */
export async function loadOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  try {
    const raw = await pdf.getOutline();
    if (!raw?.length) return [];
    return convert(pdf, raw);
  } catch {
    return [];
  }
}
