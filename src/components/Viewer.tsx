import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getDocument } from '../lib/pdfjs';
import { exportAnnotatedPdf } from '../lib/exportPdf';
import { createShare, fetchShare, updateShareAnnotations, buildShareLink } from '../lib/share';
import type { Annotation, NormRect } from '../types';
import PdfPage from './PdfPage';
import Sidebar from './Sidebar';
import ShareDialog from './ShareDialog';

interface Props {
  pdfBytes: ArrayBuffer;
  docName: string;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  shareId: string | null;
  onBack: () => void;
  readOnly?: boolean;
}

export default function Viewer({
  pdfBytes,
  docName,
  annotations,
  onAnnotationsChange,
  userName,
  onUserNameChange,
  shareId,
  onBack,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.2);
  const [noteMode, setNoteMode] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const pageContainers = useRef<Map<number, HTMLDivElement>>(new Map());
  const bytesRef = useRef(pdfBytes);
  bytesRef.current = pdfBytes;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await getDocument({ data: pdfBytes.slice(0) }).promise;
      if (!cancelled) setPdf(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Poll for updates from collaborators when viewing a shared document.
  useEffect(() => {
    if (!shareId) return;
    const interval = setInterval(async () => {
      try {
        const record = await fetchShare(shareId);
        onAnnotationsChange(record.annotations);
      } catch {
        // ignore transient poll failures
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [shareId, onAnnotationsChange]);

  const pageNumbers = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []),
    [pdf],
  );

  function ensureName(): string {
    if (userName) return userName;
    const name = window.prompt('Your name (shown next to your comments):', '') ?? '';
    if (name) onUserNameChange(name);
    return name;
  }

  async function persist(next: Annotation[]) {
    onAnnotationsChange(next);
    if (shareId) {
      setSyncStatus('syncing');
      try {
        await updateShareAnnotations(shareId, next);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    }
  }

  function createHighlight(
    page: number,
    rects: NormRect[],
    quotedText: string,
    color: string,
    comment: string,
  ) {
    const author = ensureName();
    const ann: Annotation = {
      id: crypto.randomUUID(),
      type: 'highlight',
      page,
      color,
      rects,
      quotedText,
      comment,
      author,
      createdAt: Date.now(),
    };
    persist([...annotations, ann]);
  }

  function createNote(page: number, x: number, y: number, color: string, comment: string) {
    const author = ensureName();
    const ann: Annotation = {
      id: crypto.randomUUID(),
      type: 'note',
      page,
      color,
      x,
      y,
      comment,
      author,
      createdAt: Date.now(),
    };
    persist([...annotations, ann]);
    setNoteMode(false);
  }

  function deleteAnnotation(id: string) {
    persist(annotations.filter((a) => a.id !== id));
  }

  function editAnnotation(id: string, comment: string) {
    persist(annotations.map((a) => (a.id === id ? { ...a, comment } : a)));
  }

  function selectAnnotation(id: string | null) {
    setActiveAnnotationId(id);
    if (!id) return;
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    const el = pageContainers.current.get(ann.page);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleExport() {
    const bytes = await exportAnnotatedPdf(bytesRef.current, annotations);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docName.replace(/\.pdf$/i, '') + '-annotated.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare(): Promise<string> {
    const record = await createShare(docName, bytesRef.current, annotations);
    return buildShareLink(record.id);
  }

  return (
    <div className="viewer">
      <div className="toolbar">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <span className="toolbar__title" title={docName}>
          {docName}
        </span>
        {shareId && (
          <span className={`sync-badge sync-badge--${syncStatus}`}>
            {syncStatus === 'syncing' && 'Syncing…'}
            {syncStatus === 'synced' && 'Synced'}
            {syncStatus === 'error' && 'Sync failed'}
            {syncStatus === 'idle' && 'Shared'}
          </span>
        )}
        <div className="toolbar__spacer" />
        <button className="btn btn--ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}>
          −
        </button>
        <span className="toolbar__zoom">{Math.round(scale * 100)}%</span>
        <button className="btn btn--ghost" onClick={() => setScale((s) => Math.min(3, s + 0.1))}>
          +
        </button>
        <button
          className={`btn ${noteMode ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setNoteMode((v) => !v)}
        >
          💬 Add Comment
        </button>
        <button className="btn btn--ghost" onClick={handleExport}>
          ⬇ Export PDF
        </button>
        {!shareId && (
          <button className="btn btn--primary" onClick={() => setShareOpen(true)}>
            Share
          </button>
        )}
      </div>

      <div className="viewer__body">
        <div className="viewer__pages">
          {pdf ? (
            pageNumbers.map((n) => (
              <PdfPage
                key={n}
                pdf={pdf}
                pageNumber={n}
                scale={scale}
                annotations={annotations.filter((a) => a.page === n)}
                noteMode={noteMode}
                registerContainer={(page, el) => {
                  if (el) pageContainers.current.set(page, el);
                  else pageContainers.current.delete(page);
                }}
                onCreateHighlight={createHighlight}
                onCreateNote={createNote}
                activeAnnotationId={activeAnnotationId}
                onSelectAnnotation={selectAnnotation}
              />
            ))
          ) : (
            <p className="viewer__loading">Loading PDF…</p>
          )}
        </div>
        <Sidebar
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          onSelect={selectAnnotation}
          onDelete={deleteAnnotation}
          onEdit={editAnnotation}
        />
      </div>

      {shareOpen && <ShareDialog onShare={handleShare} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
