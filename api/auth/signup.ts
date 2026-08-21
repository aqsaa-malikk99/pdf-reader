import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createUser, findUser, isValidEmail, isValidPassword, issueSessionToken } from '../_users.js';
import { sendError } from '../_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const { email, password, name } = req.body ?? {};
  if (!isValidEmail(email)) return sendError(res, 400, 'Enter a valid email address.');
  if (!isValidPassword(password)) return sendError(res, 400, 'Password must be at least 8 characters.');
  if (typeof name !== 'string' || !name.trim()) return sendError(res, 400, 'Enter your name.');

  try {
    if (await findUser(email)) {
      return sendError(res, 409, 'An account with that email already exists. Try logging in instead.');
    }

    const user = await createUser(email, password, name);
    const token = await issueSessionToken(user);
    res.status(200).json({ token, user: { email: user.email, name: user.name } });
  } catch (err: any) {
    // allowOverwrite:false in createUser throws if two signups race on the same email.
    if (err?.message?.includes('already exists') || err?.name === 'BlobError') {
      return sendError(res, 409, 'An account with that email already exists. Try logging in instead.');
    }
    console.error('signup failed', err);
    sendError(res, 500, 'Could not create your account. Please try again.');
  }
}
