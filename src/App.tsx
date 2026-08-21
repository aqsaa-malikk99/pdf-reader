import { useEffect, useState } from 'react';
import Home from './components/Home';
import Viewer from './components/Viewer';
import {
  hashBytes,
  loadDocument,
  saveDocument,
  loadAnnotations,
  saveAnnotations,
  getUserName,
  setUserName,
} from './lib/storage';
import { fetchShare, parseShareIdFromHash } from './lib/share';
import type { Annotation } from './types';

interface OpenDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  shareId: string | null;
}

export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [userName, setUserNameState] = useState(getUserName());
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState('');

  useEffect(() => {
    const shareId = parseShareIdFromHash(window.location.hash);
    if (!shareId) return;
    setLoadingShared(true);
    (async () => {
      try {
        const record = await fetchShare(shareId);
        const pdfResp = await fetch(record.pdfUrl);
        const bytes = await pdfResp.arrayBuffer();
        const id = await hashBytes(bytes);
        setDoc({ id, name: record.docName, bytes, shareId });
        setAnnotations(record.annotations);
      } catch (err) {
        setSharedError(err instanceof Error ? err.message : 'Failed to load shared document');
      } finally {
        setLoadingShared(false);
      }
    })();
  }, []);

  async function openFile(file: File) {
    const bytes = await file.arrayBuffer();
    const id = await hashBytes(bytes);
    const existing = await loadDocument(id);
    if (!existing) {
      await saveDocument({ id, name: file.name, bytes, createdAt: Date.now() });
    }
    const anns = await loadAnnotations(id);
    setDoc({ id, name: file.name, bytes, shareId: null });
    setAnnotations(anns);
  }

  async function openRecent(id: string) {
    const record = await loadDocument(id);
    if (!record) return;
    const anns = await loadAnnotations(id);
    setDoc({ id, name: record.name, bytes: record.bytes, shareId: null });
    setAnnotations(anns);
  }

  function handleAnnotationsChange(next: Annotation[]) {
    setAnnotations(next);
    if (doc && !doc.shareId) {
      saveAnnotations(doc.id, next);
    }
  }

  function handleUserNameChange(name: string) {
    setUserNameState(name);
    setUserName(name);
  }

  function goBack() {
    setDoc(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (loadingShared) {
    return (
      <div className="centered-message">
        <p>Loading shared document…</p>
      </div>
    );
  }

  if (sharedError) {
    return (
      <div className="centered-message">
        <p>{sharedError}</p>
        <button className="btn btn--primary" onClick={goBack}>
          Go to home
        </button>
      </div>
    );
  }

  if (doc) {
    return (
      <Viewer
        pdfBytes={doc.bytes}
        docName={doc.name}
        annotations={annotations}
        onAnnotationsChange={handleAnnotationsChange}
        userName={userName}
        onUserNameChange={handleUserNameChange}
        shareId={doc.shareId}
        onBack={goBack}
      />
    );
  }

  return <Home onOpenFile={openFile} onOpenRecent={openRecent} />;
}
