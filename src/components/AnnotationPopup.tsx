import { useLayoutEffect, useRef, useState } from 'react';
import { HIGHLIGHT_COLORS } from '../lib/colors';
import CopyButton from './CopyButton';

const MARGIN = 12;

interface Props {
  x: number;
  y: number;
  /** Defaults to the signed-in user's automatically assigned colour. */
  initialColor: string;
  onSave: (color: string, comment: string) => void;
  onCancel: () => void;
  onColorChange?: (color: string) => void;
  placeholder?: string;
  requireComment?: boolean;
  /** The highlighted text this popup is attached to, if any. */
  quotedText?: string;
}

export default function AnnotationPopup({
  x,
  y,
  initialColor,
  onSave,
  onCancel,
  onColorChange,
  placeholder = 'Add a comment (optional)…',
  requireComment = false,
  quotedText,
}: Props) {
  const [color, setColor] = useState(initialColor);
  const [comment, setComment] = useState('');
  const popupRef = useRef<HTMLDivElement | null>(null);
  // Start at opacity 0 (not visibility:hidden — a hidden element can't take
  // focus, which would silently break autoFocus on the textarea) while we
  // measure and clamp the position below.
  const [style, setStyle] = useState<{ left: number; top: number; opacity: number }>({
    left: x,
    top: y,
    opacity: 0,
  });

  // The popup's height depends on content, so measure it after it first paints
  // and clamp it fully inside the viewport — otherwise a highlight made low on
  // the page opens a popup whose textarea renders below the visible window.
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    let left = x - rect.width / 2;
    left = Math.min(Math.max(left, MARGIN), window.innerWidth - rect.width - MARGIN);

    let top = y + MARGIN;
    if (top + rect.height > window.innerHeight - MARGIN) {
      top = y - rect.height - MARGIN; // flip above the cursor
    }
    top = Math.min(Math.max(top, MARGIN), window.innerHeight - rect.height - MARGIN);

    setStyle({ left, top, opacity: 1 });
  }, [x, y]);

  function chooseColor(c: string) {
    setColor(c);
    onColorChange?.(c);
  }

  const canSave = !requireComment || comment.trim().length > 0;

  return (
    <div
      ref={popupRef}
      className="annotation-popup"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="annotation-popup__colors">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch ${c === color ? 'color-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => chooseColor(c)}
            aria-label={`Use colour ${c}`}
          />
        ))}
      </div>
      {quotedText && (
        <div className="annotation-popup__quote">
          <blockquote className="comment__quote">{quotedText}</blockquote>
          <CopyButton text={quotedText} label="Copy highlighted text" />
        </div>
      )}
      <textarea
        autoFocus
        rows={3}
        placeholder={placeholder}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSave) {
            onSave(color, comment.trim());
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="annotation-popup__actions">
        <span className="annotation-popup__hint">⌘↵ to save</span>
        {comment.trim() && <CopyButton text={comment} label="Copy comment" />}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!canSave}
          onClick={() => onSave(color, comment.trim())}
        >
          Save
        </button>
      </div>
    </div>
  );
}
