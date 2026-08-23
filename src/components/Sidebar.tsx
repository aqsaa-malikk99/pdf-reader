import { useMemo, useState } from 'react';
import type { Annotation, User } from '../types';
import { relativeTime, absoluteTime } from '../lib/time';
import Avatar from './Avatar';
import CopyButton from './CopyButton';

type Filter = 'all' | 'open' | 'mine';

interface Props {
  annotations: Annotation[];
  currentUser: User;
  activeAnnotationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEditComment: (id: string, comment: string) => void;
  onToggleResolved: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onDeleteReply: (annotationId: string, replyId: string) => void;
}

export default function Sidebar({
  annotations,
  currentUser,
  activeAnnotationId,
  onSelect,
  onDelete,
  onEditComment,
  onToggleResolved,
  onReply,
  onDeleteReply,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return annotations
      .filter((a) => {
        if (filter === 'open' && a.resolved) return false;
        if (filter === 'mine' && a.author.id !== currentUser.id) return false;
        if (!needle) return true;
        const haystack = [
          a.comment,
          a.quotedText ?? '',
          a.author.name,
          ...a.replies.map((r) => `${r.text} ${r.author.name}`),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  }, [annotations, filter, query, currentUser.id]);

  const openCount = annotations.filter((a) => !a.resolved).length;

  function submitReply(annotationId: string) {
    const text = replyDraft.trim();
    if (!text) return;
    onReply(annotationId, text);
    setReplyDraft('');
    setReplyingId(null);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2>
          Comments <span className="sidebar__count">{openCount} open</span>
        </h2>
        <input
          className="sidebar__search"
          type="search"
          placeholder="Search comments…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="sidebar__filters" role="tablist">
          {(['all', 'open', 'mine'] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`chip ${filter === f ? 'chip--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Mine'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="sidebar__empty">
          {annotations.length === 0
            ? 'Select text on the page to highlight it, or use “Add Comment” to drop a note anywhere.'
            : 'No comments match this filter.'}
        </p>
      ) : (
        <ul className="sidebar__list">
          {visible.map((a) => {
            const isMine = a.author.id === currentUser.id;
            return (
              <li
                key={a.id}
                className={[
                  'comment',
                  activeAnnotationId === a.id ? 'comment--active' : '',
                  a.resolved ? 'comment--resolved' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(a.id)}
              >
                <div className="comment__header">
                  <Avatar author={a.author} />
                  <div className="comment__meta">
                    <span className="comment__author">{isMine ? 'You' : a.author.name}</span>
                    <time className="comment__time" title={absoluteTime(a.createdAt)}>
                      {relativeTime(a.createdAt)}
                      {a.editedAt && ' · edited'}
                    </time>
                  </div>
                  <span className="comment__page" style={{ background: a.color }}>
                    p.{a.page}
                  </span>
                </div>

                {a.quotedText && <blockquote className="comment__quote">{a.quotedText}</blockquote>}

                {editingId === a.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      rows={3}
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null);
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          onEditComment(a.id, draft.trim());
                          setEditingId(null);
                        }
                      }}
                    />
                    <div className="comment__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn--primary btn--sm"
                        onClick={() => {
                          onEditComment(a.id, draft.trim());
                          setEditingId(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="comment__body">
                    {a.comment || <em className="comment__placeholder">No comment</em>}
                  </p>
                )}

                {a.replies.length > 0 && (
                  <ul className="replies">
                    {a.replies.map((r) => (
                      <li key={r.id} className="reply">
                        <Avatar author={r.author} size={20} />
                        <div className="reply__content">
                          <div className="reply__meta">
                            <span className="reply__author">
                              {r.author.id === currentUser.id ? 'You' : r.author.name}
                            </span>
                            <time title={absoluteTime(r.createdAt)}>{relativeTime(r.createdAt)}</time>
                            {r.author.id === currentUser.id && (
                              <button
                                className="icon-btn"
                                title="Delete reply"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteReply(a.id, r.id);
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <p>{r.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {replyingId === a.id ? (
                  <div className="reply-form" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      rows={2}
                      autoFocus
                      placeholder="Write a reply…"
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setReplyingId(null);
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply(a.id);
                      }}
                    />
                    <div className="comment__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => setReplyingId(null)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={!replyDraft.trim()}
                        onClick={() => submitReply(a.id)}
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="comment__toolbar" onClick={(e) => e.stopPropagation()}>
                    <CopyButton
                      text={[a.quotedText, a.comment].filter(Boolean).join('\n\n')}
                      label="Copy comment"
                    />
                    <button
                      className="link-btn"
                      onClick={() => {
                        setReplyingId(a.id);
                        setReplyDraft('');
                      }}
                    >
                      Reply
                    </button>
                    <button className="link-btn" onClick={() => onToggleResolved(a.id)}>
                      {a.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                    {isMine && (
                      <>
                        <button
                          className="link-btn"
                          onClick={() => {
                            setEditingId(a.id);
                            setDraft(a.comment);
                          }}
                        >
                          Edit
                        </button>
                        <button className="link-btn link-btn--danger" onClick={() => onDelete(a.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
