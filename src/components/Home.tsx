import { useEffect, useRef, useState } from 'react';
import { listRecentDocuments, deleteDocument, type RecentDoc } from '../lib/storage';
import { toAuthorRef } from '../lib/auth';
import { relativeTime } from '../lib/time';
import type { User } from '../types';
import Avatar from './Avatar';

interface Props {
  currentUser: User;
  onOpenFile: (file: File) => void;
  onOpenRecent: (id: string) => void;
  onSignOut: () => void;
}

export default function Home({ currentUser, onOpenFile, onOpenRecent, onSignOut }: Props) {
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRecentDocuments().then(setRecent);
  }, []);

  function accept(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('That file isn’t a PDF. Please choose a .pdf file.');
      return;
    }
    setError('');
    onOpenFile(file);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteDocument(id);
    setRecent(await listRecentDocuments());
  }

  return (
    <div className="home">
      <header className="home__bar">
        <span className="home__brand">📄 PDF Commenter</span>
        <div className="toolbar__user">
          <Avatar author={toAuthorRef(currentUser)} size={28} />
          <span className="home__username">{currentUser.name}</span>
          <button className="link-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="home__main">
        <h1>Your library</h1>
        <p className="home__subtitle">
          Open a PDF to highlight and comment on it. Everything stays on this device until you
          choose to share it.
        </p>

        <div
          className={`dropzone ${dragOver ? 'dropzone--active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            accept(e.dataTransfer.files[0]);
          }}
        >
          <span className="dropzone__icon" aria-hidden="true">
            ⬆
          </span>
          <p className="dropzone__title">Drop a PDF here, or click to browse</p>
          <p className="dropzone__hint">Your files never leave your device unless you share them.</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {error && <p className="home__error">{error}</p>}

        {recent.length > 0 && (
          <section className="recent">
            <h2>Recent documents</h2>
            <ul>
              {recent.map((doc) => (
                <li key={doc.id} onClick={() => onOpenRecent(doc.id)}>
                  <span className="recent__icon" aria-hidden="true">
                    📕
                  </span>
                  <span className="recent__name">{doc.name}</span>
                  {doc.shareId && (
                    <span className="recent__badge" title="This document is shared and syncs live">
                      Shared
                    </span>
                  )}
                  <span className="recent__meta">
                    {doc.annotationCount > 0 &&
                      `${doc.annotationCount} comment${doc.annotationCount === 1 ? '' : 's'} · `}
                    {relativeTime(doc.createdAt)}
                  </span>
                  <button
                    className="icon-btn"
                    onClick={(e) => handleDelete(doc.id, e)}
                    title="Remove from library"
                    aria-label={`Remove ${doc.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
