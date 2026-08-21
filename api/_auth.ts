import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { VercelRequest } from '@vercel/node';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface VerifiedIdentity {
  /** Matches the client-side user id format: "google:<sub>". */
  userId: string;
  email?: string;
  name?: string;
}

/**
 * Verifies a Google ID token from the Authorization header.
 *
 * Returns null when no token is supplied (guest usage) and throws when a token
 * is supplied but invalid, so a bad token is a hard failure rather than a
 * silent downgrade to unauthenticated.
 */
export async function verifyRequestIdentity(req: VercelRequest): Promise<VerifiedIdentity | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    // Nothing to validate the audience against; treat as unverified guest.
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
  });

  if (typeof payload.sub !== 'string') {
    throw new Error('Token is missing a subject claim');
  }

  return {
    userId: `google:${payload.sub}`,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}
