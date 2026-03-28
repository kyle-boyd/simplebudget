"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tellerProxy = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const auth_1 = require("firebase-admin/auth");
const app_1 = require("firebase-admin/app");
const https = __importStar(require("https"));
(0, app_1.initializeApp)();
const tellerCert = (0, params_1.defineSecret)('TELLER_CERT');
const tellerKey = (0, params_1.defineSecret)('TELLER_PRIVATE_KEY');
function tellerRequest(path, headers, cert, key) {
    return new Promise((resolve, reject) => {
        const options = Object.assign({ hostname: 'api.teller.io', path, method: 'GET', headers }, (cert && key ? { cert, key } : {}));
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                var _a, _b;
                try {
                    resolve({ status: (_a = res.statusCode) !== null && _a !== void 0 ? _a : 500, data: JSON.parse(body) });
                }
                catch (_c) {
                    resolve({ status: (_b = res.statusCode) !== null && _b !== void 0 ? _b : 500, data: body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}
// Proxies /teller-api/* → https://api.teller.io/*
// Requires a valid Firebase ID token in Authorization header and Teller token in x-teller-token header.
exports.tellerProxy = (0, https_1.onRequest)({ secrets: [tellerCert, tellerKey], invoker: 'public' }, async (req, res) => {
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
    const tellerToken = req.headers['x-teller-token'];
    if (!tellerToken) {
        res.status(400).json({ error: 'Missing Teller access token' });
        return;
    }
    const tellerPath = req.url.replace(/^\/teller-api/, '') || '/';
    const basicAuth = 'Basic ' + Buffer.from(tellerToken + ':').toString('base64');
    const cert = tellerCert.value();
    const key = tellerKey.value();
    const { status, data } = await tellerRequest(tellerPath, { Authorization: basicAuth, Accept: 'application/json' }, cert || undefined, key || undefined);
    res.status(status).json(data);
});
//# sourceMappingURL=index.js.map