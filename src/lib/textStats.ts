import type { PDFPageProxy } from 'pdfjs-dist';

/** Extracts every word the text layer would pick up on a page, via pdf.js's own text content. */
export async function scanPageWordCount(page: PDFPageProxy): Promise<number> {
  const textContent = await page.getTextContent();
  const text = textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}
