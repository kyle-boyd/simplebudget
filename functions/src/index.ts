import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';
import * as https from 'https';

initializeApp();

const tellerCert = defineSecret('TELLER_CERT');
const tellerKey = defineSecret('TELLER_PRIVATE_KEY');

function tellerRequest(
  path: string,
  headers: Record<string, string>,
  cert?: string,
  key?: string
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.teller.io',
      path,
      method: 'GET',
      headers,
      ...(cert && key ? { cert, key } : {}),
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode ?? 500, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Proxies /teller-api/* → https://api.teller.io/*
// Requires a valid Firebase ID token in Authorization header and Teller token in x-teller-token header.
export const tellerProxy = onRequest({ secrets: [tellerCert, tellerKey], invoker: 'public' }, async (req, res) => {
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

  const tellerToken = req.headers['x-teller-token'] as string;
  if (!tellerToken) {
    res.status(400).json({ error: 'Missing Teller access token' });
    return;
  }

  const tellerPath = req.url.replace(/^\/teller-api/, '') || '/';
  const basicAuth = 'Basic ' + Buffer.from(tellerToken + ':').toString('base64');

  const cert = tellerCert.value();
  const key = tellerKey.value();

  const { status, data } = await tellerRequest(
    tellerPath,
    { Authorization: basicAuth, Accept: 'application/json' },
    cert || undefined,
    key || undefined
  );

  res.status(status).json(data);
});
