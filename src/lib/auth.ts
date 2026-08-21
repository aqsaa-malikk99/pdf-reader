import type { AuthorRef, User } from '../types';

const SESSION_KEY = 'pdf-commenter:session';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID: string | undefined =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

interface StoredSession {
  user: User;
  /** Google ID token, sent to the API so the server can verify attribution. */
  idToken?: string;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.user?.id || !parsed.user.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode); the session just won't persist.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* no-op */
  }
}

export function createGuestUser(name: string): User {
  return {
    id: `guest:${crypto.randomUUID()}`,
    name: name.trim(),
    provider: 'guest',
  };
}

export function toAuthorRef(user: User): AuthorRef {
  return {
    id: user.id,
    name: user.name,
    ...(user.email ? { email: user.email } : {}),
    ...(user.picture ? { picture: user.picture } : {}),
  };
}

/** Decodes a JWT payload for display only — the server re-verifies the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function userFromGoogleCredential(credential: string): User | null {
  const claims = decodeJwtPayload(credential);
  if (!claims || typeof claims.sub !== 'string') return null;
  return {
    id: `google:${claims.sub}`,
    name: (claims.name as string) || (claims.email as string) || 'Google user',
    email: claims.email as string | undefined,
    picture: claims.picture as string | undefined,
    provider: 'google',
  };
}

let gsiPromise: Promise<void> | null = null;

/** Loads the Google Identity Services script once. */
export function loadGoogleScript(): Promise<void> {
  if (!isGoogleConfigured) return Promise.reject(new Error('Google sign-in is not configured'));
  if (gsiPromise) return gsiPromise;

  gsiPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${GSI_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null;
      reject(new Error('Could not reach Google sign-in. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return gsiPromise;
}

interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

function googleAccountsId(): GoogleAccountsId | null {
  return (window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }).google
    ?.accounts?.id ?? null;
}

/**
 * Renders the official Google button into `container`. Resolves the signed-in
 * user (and the raw ID token) when the person completes sign-in.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onSignedIn: (user: User, idToken: string) => void,
): Promise<void> {
  await loadGoogleScript();
  const accountsId = googleAccountsId();
  if (!accountsId) throw new Error('Google sign-in failed to initialise.');

  accountsId.initialize({
    client_id: GOOGLE_CLIENT_ID!,
    callback: (response) => {
      const user = userFromGoogleCredential(response.credential);
      if (user) onSignedIn(user, response.credential);
    },
  });
  accountsId.renderButton(container, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: 280,
  });
}
