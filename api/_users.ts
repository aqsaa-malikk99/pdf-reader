import { head, put } from '@vercel/blob';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_ISSUER = 'pdf-commenter';

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured on the server.');
  }
  return secret;
}

/**
 * User records live in the same public Blob store as shared PDFs (adding a
 * second private store per project is real setup friction — see README).
 * Path-level secrecy substitutes for store-level privacy: the path is an
 * HMAC of the email keyed by a server-only secret, so it is unguessable
 * without that secret even though the object itself is on a public store.
 * The password hash underneath is scrypt, so even a leaked record doesn't
 * directly disclose a usable password.
 */
function userPath(email: string): string {
  const digest = createHmac('sha256', authSecret()).update(email.trim().toLowerCase()).digest('hex');
  return `users/${digest}.json`;
}

export interface StoredUser {
  email: string;
  name: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
}

export async function findUser(email: string): Promise<StoredUser | null> {
  try {
    const meta = await head(userPath(email));
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as StoredUser;
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

export function verifyPassword(password: string, user: StoredUser): boolean {
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const actual = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === actual.length && timingSafeEqual(candidate, actual);
}

/** Throws if the account already exists — callers should check findUser() first for a nicer message. */
export async function createUser(email: string, password: string, name: string): Promise<StoredUser> {
  const salt = randomBytes(16).toString('hex');
  const user: StoredUser = {
    email: email.trim().toLowerCase(),
    name: name.trim(),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
  await put(userPath(email), JSON.stringify(user), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: false, // fails if the path exists — guards a signup race on the same email
  });
  return user;
}

export interface SessionUser {
  id: string; // "password:<hmac-of-email>"
  email: string;
  name: string;
}

function idForEmail(email: string): string {
  return `password:${createHmac('sha256', authSecret()).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)}`;
}

export async function issueSessionToken(user: StoredUser): Promise<string> {
  const secretKey = new TextEncoder().encode(authSecret());
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(idForEmail(user.email))
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const secretKey = new TextEncoder().encode(authSecret());
    const { payload } = await jwtVerify(token, secretKey, { issuer: SESSION_ISSUER });
    if (typeof payload.sub !== 'string') return null;
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : 'Account',
    };
  } catch {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}
