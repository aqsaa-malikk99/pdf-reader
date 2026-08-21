import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getDocument } from '../lib/pdfjs';
import { exportAnnotatedPdf } from '../lib/exportPdf';
import { createShare, fetchShare, syncShareAnnotations, buildShareLink } from '../lib/share';
import { mergeAnnotations, visibleAnnotations } from '../lib/merge';
import { colorForUserInDocument } from '../lib/colors';
import { toAuthorRef } from '../lib/auth';
import { loadOutline, type OutlineItem } from '../lib/outline';
import type { Annotation, NormRect, User } from '../types';
import PdfPage from './PdfPage';
import Sidebar from './Sidebar';
import ShareDialog from './ShareDialog';
import Avatar from './Avatar';
import PageNav from './PageNav';

const POLL_INTERVAL_MS = 8000;

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface Props {
  pdfBytes: ArrayBuffer;
  docName: string;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  currentUser: User;
  idToken?: string;
  shareId: string | null;
  /** Called once a share link is created, so the host session starts syncing too. */
  onShareCreated: (shareId: string) => void;
  onBack: () => void;
  onSignOut: () => void;
}

export default function Viewer({
  pdfBytes,
  docName,
  annotations,
  onAnnotationsChange,
  currentUser,
  idToken,
  shareId,
  onShareCreated,
  onBack,
  onSignOut,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState('');
  const [scale, setScale] = useState(1.2);
  const [noteMode, setNoteMode] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [navOpen, setNavOpen] = useState(true);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [pageInput, setPageInput] = useState<string | null>(null);

  const pageContainers = useRef<Map<number, HTMLDivElement>>(new Map());
  const bytesRef = useRef(pdfBytes);
  bytesRef.current = pdfBytes;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const shown = useMemo(() => visibleAnnotations(annotations), [annotations]);
  // Recomputed as participants join, so each contributor keeps a distinct colour.
  const userColor = useMemo(
    () => colorForUserInDocument(currentUser.id, shown),
    [currentUser.id, shown],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    (async () => {
      try {
        const doc = await getDocument({ data: pdfBytes.slice(0) }).promise;
        if (cancelled) return;
        setPdf(doc);
        loadOutline(doc).then((items) => {
          if (!cancelled) setOutline(items);
        });
      } catch {
        if (!cancelled) setLoadError('This file could not be opened as a PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Poll for collaborators' changes, merging rather than replacing so local
  // edits made since the last sync are never dropped.
  useEffect(() => {
    if (!shareId) return;
    const interval = setInterval(async () => {
      try {
        const record = await fetchShare(shareId);
        const merged = mergeAnnotations(annotationsRef.current, record.annotations);
        onAnnotationsChange(merged);
      } catch {
        // Transient poll failures are non-fatal; the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shareId, onAnnotationsChange]);

  // Track which page is centred, for the page indicator.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const page = Number((visible.target as HTMLElement).dataset.page);
          if (page) setCurrentPage(page);
        }
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    pageContainers.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdf]);

  const persist = useCallback(
    async (next: Annotation[]) => {
      onAnnotationsChange(next);
      if (!shareId) return;
      setSyncStatus('syncing');
      try {
        const record = await syncShareAnnotations(shareId, next, idToken);
        // Fold the server's merged view back in, picking up anything a
        // collaborator saved between our last poll and this write.
        onAnnotationsChange(mergeAnnotations(next, record.annotations));
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    },
    [shareId, idToken, onAnnotationsChange],
  );

  function createHighlight(
    page: number,
    rects: NormRect[],
    quotedText: string,
    color: string,
    comment: string,
  ) {
    const now = Date.now();
    persist([
      ...annotations,
      {
        id: crypto.randomUUID(),
        type: 'highlight',
        page,
        color,
        rects,
        quotedText,
        comment,
        author: toAuthorRef(currentUser),
        replies: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  function createNote(page: number, x: number, y: number, color: string, comment: string) {
    const now = Date.now();
    persist([
      ...annotations,
      {
        id: crypto.randomUUID(),
        type: 'note',
        page,
        color,
        x,
        y,
        comment,
        author: toAuthorRef(currentUser),
        replies: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setNoteMode(false);
  }

  function updateAnnotation(id: string, patch: Partial<Annotation>) {
    persist(
      annotations.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
    );
  }

  /** Soft-delete, so the removal syncs instead of being resurrected by a merge. */
  function deleteAnnotation(id: string) {
    updateAnnotation(id, { deleted: true });
    if (activeAnnotationId === id) setActiveAnnotationId(null);
  }

  function addReply(id: string, text: string) {
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation) return;
    updateAnnotation(id, {
      replies: [
        ...annotation.replies,
        {
          id: crypto.randomUUID(),
          author: toAuthorRef(currentUser),
          text,
          createdAt: Date.now(),
        },
      ],
    });
  }

  function deleteReply(annotationId: string, replyId: string) {
    const annotation = annotations.find((a) => a.id === annotationId);
    if (!annotation) return;
    updateAnnotation(annotationId, {
      replies: annotation.replies.filter((r) => r.id !== replyId),
    });
  }

  function toggleResolved(id: string) {
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation) return;
    updateAnnotation(id, { resolved: !annotation.resolved || undefined });
  }

  function goToPage(page: number) {
    pageContainers.current.get(page)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }

  function submitPageInput(e: React.FormEvent) {
    e.preventDefault();
    const page = Number(pageInput);
    if (pdf && Number.isInteger(page) && page >= 1 && page <= pdf.numPages) {
      goToPage(page);
    }
    setPageInput(null);
  }

  function selectAnnotation(id: string | null) {
    setActiveAnnotationId(id);
    if (!id) return;
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation) return;
    pageContainers.current.get(annotation.page)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const bytes = await exportAnnotatedPdf(bytesRef.current, shown);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docName.replace(/\.pdf$/i, '')}-annotated.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleShare(): Promise<string> {
    const record = await createShare(docName, bytesRef.current, annotations, idToken);
    // Switch this session into shared mode too, so comments made by whoever
    // opens the link sync back here — not just the other way around.
    onShareCreated(record.id);
    return buildShareLink(record.id);
  }

  // Zoom shortcuts, ignored while typing so they don't hijack the comment box.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea')) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setScale((s) => Math.min(3, s + 0.1));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        setScale((s) => Math.max(0.5, s - 0.1));
      }
      if (e.key === 'Escape') setNoteMode(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pageNumbers = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []),
    [pdf],
  );

  return (
    <div className="viewer">
      <header className="toolbar">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          ← Library
        </button>
        <button
          className={`btn btn--ghost btn--sm ${navOpen ? 'btn--primary' : ''}`}
          onClick={() => setNavOpen((v) => !v)}
          title="Toggle pages panel"
          aria-label="Toggle pages panel"
        >
          ☰
        </button>
        <span className="toolbar__title" title={docName}>
          {docName}
        </span>
        {shareId && (
          <span className={`sync-badge sync-badge--${syncStatus}`}>
            {syncStatus === 'syncing' && 'Syncing…'}
            {syncStatus === 'synced' && '✓ Synced'}
            {syncStatus === 'error' && '⚠ Sync failed'}
            {syncStatus === 'idle' && 'Shared'}
          </span>
        )}

        <div className="toolbar__spacer" />

        <div className="toolbar__group">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="toolbar__zoom">{Math.round(scale * 100)}%</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setScale((s) => Math.min(3, s + 0.1))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

        {pdf &&
          (pageInput !== null ? (
            <form className="toolbar__page-form" onSubmit={submitPageInput}>
              <input
                autoFocus
                className="toolbar__page-input"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setPageInput(null)}
                inputMode="numeric"
              />
              <span>/ {pdf.numPages}</span>
            </form>
          ) : (
            <button
              className="toolbar__pages"
              onClick={() => setPageInput(String(currentPage))}
              title="Go to page"
            >
              Page {currentPage} / {pdf.numPages}
            </button>
          ))}

        <button
          className={`btn btn--sm ${noteMode ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setNoteMode((v) => !v)}
          title="Click anywhere on the page to leave a comment"
        >
          💬 {noteMode ? 'Click a spot…' : 'Add Comment'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⬇ Export'}
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => setShareOpen(true)}>
          {shareId ? 'Copy Link' : 'Share'}
        </button>

        <div className="toolbar__user" title={currentUser.email ?? currentUser.name}>
          <Avatar author={toAuthorRef(currentUser)} size={28} />
          <button className="link-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="viewer__body">
        {navOpen && pdf && (
          <PageNav pdf={pdf} outline={outline} currentPage={currentPage} onNavigate={goToPage} />
        )}

        <div className={`viewer__pages ${noteMode ? 'viewer__pages--note-mode' : ''}`}>
          {loadError ? (
            <p className="viewer__error">{loadError}</p>
          ) : pdf ? (
            pageNumbers.map((n) => (
              <PdfPage
                key={n}
                pdf={pdf}
                pageNumber={n}
                scale={scale}
                annotations={shown.filter((a) => a.page === n)}
                noteMode={noteMode}
                userColor={userColor}
                registerContainer={(page, el) => {
                  if (el) {
                    el.dataset.page = String(page);
                    pageContainers.current.set(page, el);
                  } else {
                    pageContainers.current.delete(page);
                  }
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
          annotations={shown}
          currentUser={currentUser}
          activeAnnotationId={activeAnnotationId}
          onSelect={selectAnnotation}
          onDelete={deleteAnnotation}
          onEditComment={(id, comment) => updateAnnotation(id, { comment, editedAt: Date.now() })}
          onToggleResolved={toggleResolved}
          onReply={addReply}
          onDeleteReply={deleteReply}
        />
      </div>

      {shareOpen && (
        <ShareDialog
          onShare={handleShare}
          onClose={() => setShareOpen(false)}
          existingLink={shareId ? buildShareLink(shareId) : undefined}
        />
      )}
    </div>
  );
}
