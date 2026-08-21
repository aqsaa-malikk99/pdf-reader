import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation } from '../types';

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function exportAnnotatedPdf(
  originalBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const byPage = new Map<number, Annotation[]>();
  for (const ann of annotations) {
    if (!byPage.has(ann.page)) byPage.set(ann.page, []);
    byPage.get(ann.page)!.push(ann);
  }

  let noteNumber = 0;
  const noteEntries: { number: number; ann: Annotation }[] = [];

  for (const [pageNum, anns] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) continue;
    const { width, height } = page.getSize();

    for (const ann of anns) {
      const { r, g, b } = hexToRgb01(ann.color);

      if (ann.type === 'highlight' && ann.rects) {
        for (const rect of ann.rects) {
          page.drawRectangle({
            x: rect.x * width,
            y: height - (rect.y + rect.h) * height,
            width: rect.w * width,
            height: rect.h * height,
            color: rgb(r, g, b),
            opacity: 0.35,
          });
        }
      }

      if (ann.comment) {
        noteNumber += 1;
        noteEntries.push({ number: noteNumber, ann });

        let markerX: number;
        let markerY: number;
        if (ann.type === 'note' && ann.x !== undefined && ann.y !== undefined) {
          markerX = ann.x * width;
          markerY = height - ann.y * height;
        } else if (ann.rects && ann.rects.length > 0) {
          const first = ann.rects[0];
          markerX = first.x * width;
          markerY = height - first.y * height;
        } else {
          continue;
        }

        const radius = 8;
        page.drawCircle({
          x: markerX,
          y: markerY,
          size: radius,
          color: rgb(r, g, b),
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 0.75,
        });
        page.drawText(String(noteNumber), {
          x: markerX - (noteNumber > 9 ? 5 : 3),
          y: markerY - 3.5,
          size: 8,
          font: bold,
          color: rgb(1, 1, 1),
        });
      }
    }
  }

  if (noteEntries.length > 0) {
    let notesPage = pdfDoc.addPage();
    let { width: pw, height: ph } = notesPage.getSize();
    let cursorY = ph - 50;
    const margin = 50;
    const maxWidth = pw - margin * 2;

    notesPage.drawText('Comments', {
      x: margin,
      y: cursorY,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= 30;

    for (const { number, ann } of noteEntries) {
      if (cursorY < 80) {
        notesPage = pdfDoc.addPage();
        ({ width: pw, height: ph } = notesPage.getSize());
        cursorY = ph - 50;
      }

      const { r, g, b } = hexToRgb01(ann.color);
      notesPage.drawCircle({
        x: margin + 6,
        y: cursorY + 3,
        size: 7,
        color: rgb(r, g, b),
      });
      notesPage.drawText(String(number), {
        x: margin + (number > 9 ? 2.5 : 4),
        y: cursorY - 0.5,
        size: 7,
        font: bold,
        color: rgb(1, 1, 1),
      });

      const header = `Page ${ann.page} — ${ann.author || 'Anonymous'}`;
      notesPage.drawText(header, {
        x: margin + 20,
        y: cursorY,
        size: 10,
        font: bold,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= 14;

      if (ann.quotedText) {
        const quoteLines = wrapText(`"${ann.quotedText}"`, font, 9, maxWidth - 20);
        for (const line of quoteLines) {
          notesPage.drawText(line, {
            x: margin + 20,
            y: cursorY,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
          });
          cursorY -= 12;
        }
      }

      const commentLines = wrapText(ann.comment, font, 10, maxWidth - 20);
      for (const line of commentLines) {
        notesPage.drawText(line, {
          x: margin + 20,
          y: cursorY,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
        cursorY -= 13;
      }
      cursorY -= 10;
    }
  }

  return pdfDoc.save();
}
