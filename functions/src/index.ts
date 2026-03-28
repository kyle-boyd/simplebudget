import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

const TELLER_API = 'https://api.teller.io';

// Proxies /teller-api/* → https://api.teller.io/*
// Requires a valid Firebase ID token in the Authorization header (Bearer <token>).
export const tellerProxy = onRequest(async (req, res) => {
  // Verify Firebase ID token
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  try {
    await getAuth().verifyIdToken(idToken);
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  // Forward the Teller access token (passed as a separate header) to Teller
  const tellerPath = req.url.replace(/^\/teller-api/, '') || '/';
  const url = `${TELLER_API}${tellerPath}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.headers['x-teller-token']) {
    const tellerToken = req.headers['x-teller-token'] as string;
    headers['Authorization'] = 'Basic ' + Buffer.from(tellerToken + ':').toString('base64');
  }

  const response = await fetch(url, { method: req.method, headers });

  const data = await response.json();
  res.status(response.status).json(data);
});
