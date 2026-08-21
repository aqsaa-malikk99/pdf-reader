import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findUser, isValidEmail, issueSessionToken, verifyPassword } from '../_users.js';
import { sendError } from '../_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const { email, password } = req.body ?? {};
  if (!isValidEmail(email) || typeof password !== 'string') {
    return sendError(res, 400, 'Enter your email and password.');
  }

  try {
    const user = await findUser(email);
    // Same message whether the email is unknown or the password is wrong —
    // distinguishing the two would let an attacker enumerate registered emails.
    if (!user || !verifyPassword(password, user)) {
      return sendError(res, 401, 'Incorrect email or password.');
    }

    const token = await issueSessionToken(user);
    res.status(200).json({ token, user: { email: user.email, name: user.name } });
  } catch (err) {
    console.error('login failed', err);
    sendError(res, 500, 'Could not log you in right now. Please try again.');
  }
}
