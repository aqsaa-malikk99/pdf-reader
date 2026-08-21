import { useState } from 'react';
import type { Annotation } from '../types';

interface Props {
  annotations: Annotation[];
  activeAnnotationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, comment: string) => void;
}

export default function Sidebar({ annotations, activeAnnotationId, onSelect, onDelete, onEdit }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const sorted = [...annotations].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  if (sorted.length === 0) {
    return (
      <div className="sidebar">
        <h3>Comments</h3>
        <p className="sidebar__empty">
          Select text on the page to highlight it, or use “Add Comment” to drop a note anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <h3>Comments ({sorted.length})</h3>
      <ul className="sidebar__list">
        {sorted.map((a) => (
          <li
            key={a.id}
            className={`sidebar__item ${activeAnnotationId === a.id ? 'sidebar__item--active' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <div className="sidebar__item-header">
              <span className="sidebar__page-badge" style={{ background: a.color }}>
                p.{a.page}
              </span>
              <span className="sidebar__author">{a.author || 'Anonymous'}</span>
              <button
                className="icon-btn"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(a.id);
                }}
              >
                ✕
              </button>
            </div>
            {a.quotedText && <blockquote className="sidebar__quote">“{a.quotedText}”</blockquote>}
            {editingId === a.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <div className="sidebar__edit-actions">
                  <button className="btn btn--ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      onEdit(a.id, draft.trim());
                      setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="sidebar__comment"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(a.id);
                  setDraft(a.comment);
                }}
              >
                {a.comment || <em>Click to add a comment…</em>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
