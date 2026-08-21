import { useState } from 'react';

interface Props {
  onShare: () => Promise<string>;
  onClose: () => void;
  /** When the document is already shared, skip straight to the link screen. */
  existingLink?: string;
}

export default function ShareDialog({ onShare, onClose, existingLink }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    existingLink ? 'done' : 'idle',
  );
  const [link, setLink] = useState(existingLink ?? '');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function start() {
    setStatus('loading');
    try {
      const url = await onShare();
      setLink(url);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share this document</h3>
        {status === 'idle' && (
          <>
            <p>
              This uploads the PDF and your comments to temporary cloud storage and gives you a
              link. Anyone with the link can view the PDF and add their own comments — perfect for
              sending to your supervisor for review.
            </p>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={start}>
                Create share link
              </button>
            </div>
          </>
        )}
        {status === 'loading' && <p>Uploading…</p>}
        {status === 'error' && (
          <>
            <p className="modal__error">{error}</p>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn btn--primary" onClick={start}>
                Retry
              </button>
            </div>
          </>
        )}
        {status === 'done' && (
          <>
            <p>Share this link with your supervisor. Comments added by either of you will sync.</p>
            <div className="modal__link-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button
                className="btn btn--primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <a
              className="btn btn--ghost modal__email-link"
              href={`mailto:?subject=${encodeURIComponent('PDF for review')}&body=${encodeURIComponent(
                `Please review and comment here: ${link}`,
              )}`}
            >
              Open in email app
            </a>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
