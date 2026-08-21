import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const THUMB_WIDTH = 108;

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}

export default function PageThumbnail({ pdf, pageNumber, active, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Only render thumbnails once they've scrolled near the viewport — rendering
  // every page upfront would be slow for anything beyond a handful of pages.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || rendered) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (!cancelled) setRendered(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, rendered, pdf, pageNumber]);

  return (
    <button
      ref={wrapperRef}
      className={`page-thumb ${active ? 'page-thumb--active' : ''}`}
      onClick={onClick}
    >
      <span className="page-thumb__canvas-wrap">
        {visible ? <canvas ref={canvasRef} /> : null}
      </span>
      <span className="page-thumb__label">{pageNumber}</span>
    </button>
  );
}
