import { useCallback, useEffect, useState } from 'react';
import Home from './components/Home';
import Viewer from './components/Viewer';
import SignIn from './components/SignIn';
import {
  hashBytes,
  loadDocument,
  saveDocument,
  loadAnnotations,
  saveAnnotations,
  setDocumentShareId,
} from './lib/storage';
import { clearSession, loadSession, saveSession } from './lib/auth';
import { fetchShare, parseShareIdFromHash } from './lib/share';
import type { Annotation, User } from './types';

interface OpenDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  shareId: string | null;
}

function goToShare(shareId: string) {
  window.history.replaceState(null, '', `${window.location.pathname}#/shared/${shareId}`);
}

export default function App() {
  const stored = loadSession();
  const [user, setUser] = useState<User | null>(stored?.user ?? null);
  const [idToken, setIdToken] = useState<string | undefined>(stored?.idToken);

  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pendingShareId, setPendingShareId] = useState<string | null>(() =>
    parseShareIdFromHash(window.location.hash),
  );
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState('');

  // Open a shared link once the person has an identity — a shared document is
  // collaborative, so we need to know who to attribute comments to first.
  // Used both for links someone else sent and for reopening a document of
  // ours that's already shared, so it's always loaded fresh from the server
  // rather than from a possibly-stale local cache.
  useEffect(() => {
    if (!pendingShareId || !user || doc) return;
    setLoadingShared(true);
    setSharedError('');
    (async () => {
      try {
        const record = await fetchShare(pendingShareId);
        const pdfResponse = await fetch(record.pdfUrl);
        if (!pdfResponse.ok) throw new Error('The shared PDF could not be downloaded.');
        const bytes = await pdfResponse.arrayBuffer();
        const id = await hashBytes(bytes);

        // Save locally too, so it shows up in "Recent documents" and can be
        // reopened straight from the library without needing the link again.
        await saveDocument({ id, name: record.docName, bytes, createdAt: Date.now(), shareId: pendingShareId });
        await saveAnnotations(id, record.annotations);

        setDoc({ id, name: record.docName, bytes, shareId: pendingShareId });
        setAnnotations(record.annotations);
      } catch (err) {
        setSharedError(err instanceof Error ? err.message : 'Failed to load shared document.');
      } finally {
        setLoadingShared(false);
      }
    })();
  }, [pendingShareId, user, doc]);

  function handleSignedIn(nextUser: User, token?: string) {
    setUser(nextUser);
    setIdToken(token);
    saveSession({ user: nextUser, idToken: token });
  }

  function handleSignOut() {
    clearSession();
    setUser(null);
    setIdToken(undefined);
    setDoc(null);
    setAnnotations([]);
  }

  async function openFile(file: File) {
    const bytes = await file.arrayBuffer();
    const id = await hashBytes(bytes);
    const existing = await loadDocument(id);

    // Already shared under this exact content — reload live from the server
    // instead of opening a disconnected local copy, and don't mint a second link.
    if (existing?.shareId) {
      setPendingShareId(existing.shareId);
      goToShare(existing.shareId);
      return;
    }

    if (!existing) {
      await saveDocument({ id, name: file.name, bytes, createdAt: Date.now() });
    }
    setDoc({ id, name: file.name, bytes, shareId: null });
    setAnnotations(await loadAnnotations(id));
  }

  async function openRecent(id: string) {
    const record = await loadDocument(id);
    if (!record) return;

    if (record.shareId) {
      setPendingShareId(record.shareId);
      goToShare(record.shareId);
      return;
    }

    setDoc({ id, name: record.name, bytes: record.bytes, shareId: null });
    setAnnotations(await loadAnnotations(id));
  }

  const handleAnnotationsChange = useCallback((next: Annotation[]) => {
    setAnnotations(next);
    setDoc((current) => {
      if (current) void saveAnnotations(current.id, next);
      return current;
    });
  }, []);

  const handleShareCreated = useCallback((newShareId: string) => {
    setDoc((current) => {
      if (current) void setDocumentShareId(current.id, newShareId);
      return current ? { ...current, shareId: newShareId } : current;
    });
    // Reflect the share in the URL too — otherwise refreshing the creator's own
    // tab has nothing to reload from (it only exists in React state) and drops
    // them back to an empty library instead of the now-shared document.
    setPendingShareId(newShareId);
    goToShare(newShareId);
  }, []);

  function goBack() {
    setDoc(null);
    setAnnotations([]);
    setPendingShareId(null);
    setSharedError('');
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (!user) {
    return <SignIn onSignedIn={handleSignedIn} />;
  }

  if (loadingShared) {
    return (
      <div className="centered-message">
        <div className="spinner" aria-hidden="true" />
        <p>Loading shared document…</p>
      </div>
    );
  }

  if (sharedError) {
    return (
      <div className="centered-message">
        <p className="centered-message__error">{sharedError}</p>
        <button className="btn btn--primary" onClick={goBack}>
          Go to my library
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
        currentUser={user}
        idToken={idToken}
        shareId={doc.shareId}
        onShareCreated={handleShareCreated}
        onBack={goBack}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <Home
      currentUser={user}
      onOpenFile={openFile}
      onOpenRecent={openRecent}
      onSignOut={handleSignOut}
    />
  );
}
