import { useLayoutEffect, useRef, useState } from 'react';

const COLORS = ['#ffe066', '#a3e6a1', '#a3c9f9', '#f6a3c9', '#f9c99a'];
const MARGIN = 12;

interface Props {
  x: number;
  y: number;
  initialColor?: string;
  onSave: (color: string, comment: string) => void;
  onCancel: () => void;
  onColorChange?: (color: string) => void;
  placeholder?: string;
}

export default function AnnotationPopup({
  x,
  y,
  initialColor,
  onSave,
  onCancel,
  onColorChange,
  placeholder = 'Add a comment (optional)…',
}: Props) {
  const [color, setColor] = useState(initialColor ?? COLORS[0]);
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

  // The popup's height depends on content (wrapped placeholder text, etc.), so
  // measure it after it first paints and clamp it fully inside the viewport —
  // otherwise a highlight made low on the page opens a popup whose textarea
  // (and Save button) render below the visible window, out of reach.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  function chooseColor(c: string) {
    setColor(c);
    onColorChange?.(c);
  }

  return (
    <div
      ref={popupRef}
      className="annotation-popup"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="annotation-popup__colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-swatch ${c === color ? 'color-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => chooseColor(c)}
            aria-label={`Choose color ${c}`}
          />
        ))}
      </div>
      <textarea
        autoFocus
        rows={3}
        placeholder={placeholder}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            onSave(color, comment.trim());
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="annotation-popup__actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" onClick={() => onSave(color, comment.trim())}>
          Save
        </button>
      </div>
    </div>
  );
}
