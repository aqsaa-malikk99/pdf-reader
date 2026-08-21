import { useEffect, useRef, useState } from 'react';
import { listRecentDocuments, deleteDocument, type RecentDoc } from '../lib/storage';

interface Props {
  onOpenFile: (file: File) => void;
  onOpenRecent: (id: string) => void;
}

export default function Home({ onOpenFile, onOpenRecent }: Props) {
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    listRecentDocuments().then(setRecent);
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteDocument(id);
    setRecent(await listRecentDocuments());
  }

  return (
    <div className="home">
      <h1>PDF Commenter</h1>
      <p className="home__subtitle">
        View, highlight, and comment on PDFs — fully offline. Share a link when you want feedback.
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
          const file = e.dataTransfer.files[0];
          if (file && file.type === 'application/pdf') onOpenFile(file);
        }}
      >
        <p>Click to open a PDF, or drag one here</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onOpenFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {recent.length > 0 && (
        <div className="recent-docs">
          <h3>Recent</h3>
          <ul>
            {recent.map((doc) => (
              <li key={doc.id} onClick={() => onOpenRecent(doc.id)}>
                <span className="recent-docs__name">{doc.name}</span>
                <span className="recent-docs__date">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                <button className="icon-btn" onClick={(e) => handleDelete(doc.id, e)} title="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
