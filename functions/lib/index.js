"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tellerProxy = void 0;
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
const TELLER_API = 'https://api.teller.io';
// Proxies /teller-api/* → https://api.teller.io/*
// Requires a valid Firebase ID token in the Authorization header (Bearer <token>).
exports.tellerProxy = (0, https_1.onRequest)(async (req, res) => {
    // Verify Firebase ID token
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
        res.status(401).json({ error: 'Missing authorization token' });
        return;
    }
    try {
        await (0, auth_1.getAuth)().verifyIdToken(idToken);
    }
    catch (_a) {
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
    }
    // Forward the Teller access token (passed as a separate header) to Teller
    const tellerPath = req.url.replace(/^\/teller-api/, '') || '/';
    const url = `${TELLER_API}${tellerPath}`;
    const headers = { Accept: 'application/json' };
    if (req.headers['x-teller-token']) {
        const tellerToken = req.headers['x-teller-token'];
        headers['Authorization'] = 'Basic ' + Buffer.from(tellerToken + ':').toString('base64');
    }
    const response = await fetch(url, { method: req.method, headers });
    const data = await response.json();
    res.status(response.status).json(data);
});
//# sourceMappingURL=index.js.map