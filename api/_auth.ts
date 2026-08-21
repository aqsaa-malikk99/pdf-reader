import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import type { VercelRequest } from '@vercel/node';
import { verifySessionToken, SESSION_ISSUER } from './_users.js';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface VerifiedIdentity {
  /** Matches the client-side user id format: "google:<sub>" or "password:<hmac>". */
  userId: string;
  email?: string;
  name?: string;
}

async function verifyGoogleToken(token: string): Promise<VerifiedIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured on the server.');

  const { payload } = await jwtVerify(token, JWKS, { issuer: GOOGLE_ISSUERS, audience: clientId });
  if (typeof payload.sub !== 'string') throw new Error('Token is missing a subject claim');

  return {
    userId: `google:${payload.sub}`,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

/**
 * Verifies a bearer token from the Authorization header — either a Google ID
 * token or a self-issued email/password session token. Returns null when no
 * token is supplied (guest usage) and throws when a token is supplied but
 * invalid, so a bad token is a hard failure rather than a silent downgrade.
 */
export async function verifyRequestIdentity(req: VercelRequest): Promise<VerifiedIdentity | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();

  // Cheap, unverified peek to route to the right verifier — both paths fully
  // verify the signature below, this only decides *which* key to check against.
  let issuer: unknown;
  try {
    issuer = decodeJwt(token).iss;
  } catch {
    throw new Error('Malformed token');
  }

  if (issuer === SESSION_ISSUER) {
    const session = await verifySessionToken(token);
    if (!session) throw new Error('Invalid or expired session token');
    return { userId: session.id, email: session.email, name: session.name };
  }

  return verifyGoogleToken(token);
}
