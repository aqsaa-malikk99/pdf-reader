import { BlendMode, PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation } from '../types';

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** pdf-lib's WinAnsi fonts reject characters like smart quotes and emoji. */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\n]/g, '');
}

export async function exportAnnotatedPdf(
  originalBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const pages = pdfDoc.getPages();

  const live = annotations.filter((a) => !a.deleted);
  const ordered = [...live].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  const numbered = ordered.filter((a) => a.comment || a.replies.length > 0);
  const numberOf = new Map(numbered.map((a, i) => [a.id, i + 1]));

  for (const annotation of ordered) {
    const page = pages[annotation.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const { r, g, b } = hexToRgb01(annotation.color);

    if (annotation.type === 'highlight' && annotation.rects) {
      for (const rect of annotation.rects) {
        page.drawRectangle({
          x: rect.x * width,
          y: height - (rect.y + rect.h) * height,
          width: rect.w * width,
          height: rect.h * height,
          color: rgb(r, g, b),
          // Multiply keeps the underlying text crisp instead of veiling it,
          // matching how highlights look in the viewer.
          blendMode: BlendMode.Multiply,
        });
      }
    }

    const marker = numberOf.get(annotation.id);
    if (!marker) continue;

    let markerX: number;
    let markerY: number;
    if (annotation.type === 'note' && annotation.x !== undefined && annotation.y !== undefined) {
      markerX = annotation.x * width;
      markerY = height - annotation.y * height;
    } else if (annotation.rects?.length) {
      markerX = annotation.rects[0].x * width;
      markerY = height - annotation.rects[0].y * height;
    } else {
      continue;
    }

    page.drawCircle({
      x: markerX,
      y: markerY,
      size: 8,
      color: rgb(r, g, b),
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth: 0.75,
    });
    page.drawText(String(marker), {
      x: markerX - (marker > 9 ? 5 : 2.5),
      y: markerY - 3.5,
      size: 8,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  if (numbered.length > 0) {
    const MARGIN = 50;
    let page = pdfDoc.addPage();
    let { width: pw, height: ph } = page.getSize();
    let y = ph - MARGIN;
    const maxWidth = pw - MARGIN * 2 - 20;

    const ensureRoom = (needed: number) => {
      if (y - needed < MARGIN) {
        page = pdfDoc.addPage();
        ({ width: pw, height: ph } = page.getSize());
        y = ph - MARGIN;
      }
    };

    page.drawText('Comments', { x: MARGIN, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 12;
    page.drawText(`${numbered.length} comment${numbered.length === 1 ? '' : 's'}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    y -= 24;

    for (const annotation of numbered) {
      const marker = numberOf.get(annotation.id)!;
      ensureRoom(60);

      const { r, g, b } = hexToRgb01(annotation.color);
      page.drawCircle({ x: MARGIN + 6, y: y + 3, size: 7, color: rgb(r, g, b) });
      page.drawText(String(marker), {
        x: MARGIN + (marker > 9 ? 2.5 : 4),
        y,
        size: 7,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });

      const header = sanitize(
        `Page ${annotation.page} - ${annotation.author.name}` +
          (annotation.resolved ? ' (resolved)' : ''),
      );
      page.drawText(header, { x: MARGIN + 20, y, size: 10, font: bold, color: rgb(0.15, 0.15, 0.15) });

      const stamp = new Date(annotation.createdAt).toLocaleString();
      const stampWidth = font.widthOfTextAtSize(stamp, 8);
      page.drawText(stamp, {
        x: pw - MARGIN - stampWidth,
        y,
        size: 8,
        font,
        color: rgb(0.55, 0.55, 0.55),
      });
      y -= 14;

      if (annotation.quotedText) {
        for (const line of wrapText(`"${sanitize(annotation.quotedText)}"`, italic, 9, maxWidth)) {
          ensureRoom(12);
          page.drawText(line, { x: MARGIN + 20, y, size: 9, font: italic, color: rgb(0.45, 0.45, 0.45) });
          y -= 12;
        }
      }

      if (annotation.comment) {
        for (const line of wrapText(sanitize(annotation.comment), font, 10, maxWidth)) {
          ensureRoom(13);
          page.drawText(line, { x: MARGIN + 20, y, size: 10, font, color: rgb(0, 0, 0) });
          y -= 13;
        }
      }

      for (const reply of annotation.replies) {
        ensureRoom(24);
        y -= 4;
        const replyHeader = sanitize(
          `${reply.author.name} - ${new Date(reply.createdAt).toLocaleString()}`,
        );
        page.drawText(replyHeader, {
          x: MARGIN + 36,
          y,
          size: 8,
          font: bold,
          color: rgb(0.45, 0.45, 0.45),
        });
        y -= 11;
        for (const line of wrapText(sanitize(reply.text), font, 9.5, maxWidth - 16)) {
          ensureRoom(12);
          page.drawText(line, { x: MARGIN + 36, y, size: 9.5, font, color: rgb(0.2, 0.2, 0.2) });
          y -= 12;
        }
      }

      y -= 14;
    }
  }

  return pdfDoc.save();
}
