import { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import { createGuestUser, isGoogleConfigured, renderGoogleButton } from '../lib/auth';

interface Props {
  onSignedIn: (user: User, idToken?: string) => void;
}

export default function SignIn({ onSignedIn }: Props) {
  const googleRef = useRef<HTMLDivElement | null>(null);
  const [googleError, setGoogleError] = useState('');
  const [name, setName] = useState('');
  const [showGuestForm, setShowGuestForm] = useState(!isGoogleConfigured);

  useEffect(() => {
    if (!isGoogleConfigured || !googleRef.current) return;
    let cancelled = false;
    renderGoogleButton(googleRef.current, (user, idToken) => {
      if (!cancelled) onSignedIn(user, idToken);
    }).catch((err: Error) => {
      if (!cancelled) {
        setGoogleError(err.message);
        setShowGuestForm(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  function submitGuest(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSignedIn(createGuestUser(trimmed));
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <span className="signin__logo" aria-hidden="true">
            📄
          </span>
          <h1>PDF Commenter</h1>
        </div>
        <p className="signin__tagline">
          Read, highlight, and discuss PDFs — on your own or with someone reviewing your work.
        </p>

        {isGoogleConfigured && (
          <>
            <div ref={googleRef} className="signin__google" />
            {googleError && <p className="signin__error">{googleError}</p>}
            {!showGuestForm && (
              <button className="signin__switch" onClick={() => setShowGuestForm(true)}>
                Continue without a Google account
              </button>
            )}
          </>
        )}

        {showGuestForm && (
          <>
            {isGoogleConfigured && <div className="signin__divider">or</div>}
            <form className="signin__form" onSubmit={submitGuest}>
              <label htmlFor="signin-name">Your name</label>
              <input
                id="signin-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aqsa Malik"
                autoComplete="name"
              />
              <p className="signin__hint">
                Shown next to your highlights and comments so collaborators know who wrote what.
              </p>
              <button className="btn btn--primary btn--block" type="submit" disabled={!name.trim()}>
                Continue
              </button>
            </form>
          </>
        )}

        {!isGoogleConfigured && (
          <p className="signin__footnote">
            Google sign-in isn’t configured for this deployment. See the README to enable it.
          </p>
        )}
      </div>
    </div>
  );
}
