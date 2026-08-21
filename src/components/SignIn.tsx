import { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import {
  checkEmailExists,
  isGoogleConfigured,
  logInWithPassword,
  renderGoogleButton,
  signUpWithPassword,
} from '../lib/auth';

interface Props {
  onSignedIn: (user: User, idToken?: string) => void;
}

type Stage = 'email' | 'login' | 'signup';

export default function SignIn({ onSignedIn }: Props) {
  const googleRef = useRef<HTMLDivElement | null>(null);
  const [googleError, setGoogleError] = useState('');

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isGoogleConfigured || !googleRef.current) return;
    let cancelled = false;
    renderGoogleButton(googleRef.current, (user, idToken) => {
      if (!cancelled) onSignedIn(user, idToken);
    }).catch((err: Error) => {
      if (!cancelled) setGoogleError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError('');
    setCheckingEmail(true);
    try {
      const exists = await checkEmailExists(trimmed);
      setStage(exists ? 'login' : 'signup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCheckingEmail(false);
    }
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { user, token } = await logInWithPassword(email.trim(), password);
      onSignedIn(user, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log you in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }
    setSubmitting(true);
    try {
      const { user, token } = await signUpWithPassword(email.trim(), password, name);
      onSignedIn(user, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  function backToEmail() {
    setStage('email');
    setPassword('');
    setConfirmPassword('');
    setError('');
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
            <div className="signin__divider">or</div>
          </>
        )}

        {stage === 'email' && (
          <form className="signin__form" onSubmit={submitEmail}>
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              autoFocus
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {error && <p className="signin__error">{error}</p>}
            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={!email.trim() || checkingEmail}
            >
              {checkingEmail ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {stage === 'login' && (
          <form className="signin__form" onSubmit={submitLogin}>
            <p className="signin__account-email">{email}</p>
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              autoFocus
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="signin__error">{error}</p>}
            <button className="btn btn--primary btn--block" type="submit" disabled={!password || submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
            <button type="button" className="signin__switch" onClick={backToEmail}>
              Use a different email
            </button>
          </form>
        )}

        {stage === 'signup' && (
          <form className="signin__form" onSubmit={submitSignup}>
            <p className="signin__account-email">
              No account yet for <strong>{email}</strong> — let’s set one up.
            </p>
            <label htmlFor="signin-name">Your name</label>
            <input
              id="signin-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aqsa Malik"
              autoComplete="name"
            />
            <label htmlFor="signin-new-password">Create a password</label>
            <input
              id="signin-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="signin-confirm-password">Confirm password</label>
            <input
              id="signin-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <p className="signin__hint">At least 8 characters.</p>
            {error && <p className="signin__error">{error}</p>}
            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={!name.trim() || !password || !confirmPassword || submitting}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
            <button type="button" className="signin__switch" onClick={backToEmail}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
