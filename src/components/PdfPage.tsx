import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from '../lib/pdfjs';
import type { Annotation, NormRect } from '../types';
import AnnotationPopup from './AnnotationPopup';

interface PendingHighlight {
  screenX: number;
  screenY: number;
  rects: NormRect[];
  quotedText: string;
}

interface PendingNote {
  screenX: number;
  screenY: number;
  x: number;
  y: number;
}

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  annotations: Annotation[];
  noteMode: boolean;
  /** The signed-in user's automatically assigned highlight colour. */
  userColor: string;
  registerContainer: (page: number, el: HTMLDivElement | null) => void;
  onCreateHighlight: (page: number, rects: NormRect[], quotedText: string, color: string, comment: string) => void;
  onCreateNote: (page: number, x: number, y: number, color: string, comment: string) => void;
  activeAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
}

export default function PdfPage({
  pdf,
  pageNumber,
  scale,
  annotations,
  noteMode,
  userColor,
  registerContainer,
  onCreateHighlight,
  onCreateNote,
  activeAnnotationId,
  onSelectAnnotation,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pending, setPending] = useState<PendingHighlight | PendingNote | null>(null);
  const [previewColor, setPreviewColor] = useState(userColor);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;

    (async () => {
      page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ width: viewport.width, height: viewport.height });

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      const renderTask = page.render({ canvasContext: ctx, viewport, transform, canvas });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (cancelled) return;

      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.setProperty('--total-scale-factor', String(scale));
        textLayerRef.current.style.setProperty('--scale-round-x', '1px');
        textLayerRef.current.style.setProperty('--scale-round-y', '1px');
        const textContent = await page.getTextContent();
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport,
        });
        await textLayer.render();
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  const dragStartRef = useRef<{ node: Node; offset: number } | null>(null);
  const isDraggingRef = useRef(false);

  function caretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
    const docAny = document as any;
    if (docAny.caretRangeFromPoint) {
      const range = docAny.caretRangeFromPoint(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    if (docAny.caretPositionFromPoint) {
      const pos = docAny.caretPositionFromPoint(x, y);
      return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
    }
    return null;
  }

  function finishSelection(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (selection && selection.rangeCount > 0 && text.length > 0) {
      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      const withinPage = clientRects.filter(
        (r) => r.width > 0 && r.bottom > containerRect.top && r.top < containerRect.bottom,
      );
      if (withinPage.length > 0) {
        const rects: NormRect[] = withinPage.map((r) => ({
          x: (r.left - containerRect.left) / containerRect.width,
          y: (r.top - containerRect.top) / containerRect.height,
          w: r.width / containerRect.width,
          h: r.height / containerRect.height,
        }));
        setPreviewColor(userColor);
        setPending({ screenX: clientX, screenY: clientY, rects, quotedText: text });
        selection.removeAllRanges();
        return;
      }
    }
    selection?.removeAllRanges();

    // Plain click (no drag, nothing selected): see if it landed on an existing
    // highlight so it can be opened in the sidebar, since the highlight overlay
    // itself is pointer-events:none (so it never blocks selecting text under it).
    const px = (clientX - containerRect.left) / containerRect.width;
    const py = (clientY - containerRect.top) / containerRect.height;
    const clicked = highlights.find((a) =>
      a.rects!.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h),
    );
    if (clicked) {
      onSelectAnnotation(clicked.id);
      return;
    }

    if (noteMode) {
      setPreviewColor(userColor);
      setPending({ screenX: clientX, screenY: clientY, x: px, y: py });
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;

    // Double/triple click: let the browser's native word/line selection run
    // (it's reliable for that case) and just pick up the result on mouseup.
    if (e.detail > 1) {
      return;
    }

    const start = caretAtPoint(e.clientX, e.clientY);
    if (!start) return;

    // pdf.js scales each line of text individually via a CSS transform, which
    // makes the browser's own native drag-to-select unreliable — starting a
    // drag on some characters silently fails to extend the selection at all.
    // So we drive selection manually: block the native drag (preventDefault)
    // and rebuild the Range ourselves on every mousemove via
    // setBaseAndExtent, which works from any start/end pair regardless of
    // document order.
    e.preventDefault();
    dragStartRef.current = start;
    isDraggingRef.current = true;
    window.getSelection()?.collapse(start.node, start.offset);

    const handleMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const current = caretAtPoint(moveEvent.clientX, moveEvent.clientY);
      if (!current) return;
      window
        .getSelection()
        ?.setBaseAndExtent(dragStartRef.current.node, dragStartRef.current.offset, current.node, current.offset);
    };

    const handleUp = (upEvent: MouseEvent) => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      finishSelection(upEvent.clientX, upEvent.clientY);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function handleMouseUp(e: React.MouseEvent) {
    // Drags started by handleMouseDown are finalized by their own window
    // listener; this only handles cases that skip that path, i.e. native
    // double/triple-click word selection.
    if (isDraggingRef.current) return;
    finishSelection(e.clientX, e.clientY);
  }

  const highlights = annotations.filter((a) => a.type === 'highlight' && a.rects);
  const notes = annotations.filter((a) => a.type === 'note' && a.x !== undefined);

  return (
    <div
      className="pdf-page-wrapper"
      ref={(el) => {
        containerRef.current = el;
        registerContainer(pageNumber, el);
      }}
      style={{ width: size.width || undefined, height: size.height || undefined }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />

      <div className="annotation-layer">
        {highlights.map((a) =>
          a.rects!.map((r, i) => (
            <div
              key={`${a.id}-${i}`}
              className={[
                'highlight-rect',
                activeAnnotationId === a.id ? 'highlight-rect--active' : '',
                a.resolved ? 'highlight-rect--resolved' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: a.color,
              }}
              title={`${a.author.name}${a.comment ? `: ${a.comment}` : ''}`}
            />
          )),
        )}
        {notes.map((a) => (
          <button
            key={a.id}
            className={[
              'note-pin',
              activeAnnotationId === a.id ? 'note-pin--active' : '',
              a.resolved ? 'note-pin--resolved' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${(a.x ?? 0) * 100}%`, top: `${(a.y ?? 0) * 100}%`, background: a.color }}
            onClick={() => onSelectAnnotation(a.id)}
            title={`${a.author.name}: ${a.comment}`}
          >
            {a.replies.length > 0 ? a.replies.length + 1 : '💬'}
          </button>
        ))}
        {pending && 'rects' in pending &&
          pending.rects.map((r, i) => (
            <div
              key={`pending-${i}`}
              className="highlight-rect highlight-rect--active"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: previewColor,
              }}
            />
          ))}
      </div>

      {pending && 'rects' in pending && (
        <AnnotationPopup
          x={pending.screenX}
          y={pending.screenY}
          initialColor={previewColor}
          placeholder="Add a comment to this highlight (optional)…"
          onCancel={() => setPending(null)}
          onColorChange={setPreviewColor}
          onSave={(color, comment) => {
            onCreateHighlight(pageNumber, pending.rects, pending.quotedText, color, comment);
            setPending(null);
          }}
        />
      )}
      {pending && 'x' in pending && (
        <AnnotationPopup
          x={pending.screenX}
          y={pending.screenY}
          initialColor={previewColor}
          placeholder="Write your comment…"
          requireComment
          onCancel={() => setPending(null)}
          onColorChange={setPreviewColor}
          onSave={(color, comment) => {
            if (comment) {
              onCreateNote(pageNumber, pending.x, pending.y, color, comment);
            }
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
