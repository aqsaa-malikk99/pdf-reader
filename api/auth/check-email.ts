import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findUser, isValidEmail } from '../_users.js';
import { sendError } from '../_shared.js';

/** Lets the sign-in form decide whether to show a password box or a signup box. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    return sendError(res, 400, 'Enter a valid email address.');
  }
  try {
    const user = await findUser(email);
    res.status(200).json({ exists: !!user });
  } catch (err) {
    console.error('check-email failed', err);
    sendError(res, 500, 'Could not check that email right now. Please try again.');
  }
}
