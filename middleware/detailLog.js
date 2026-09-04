const detailLogger = require('../utils/detailLog');
const crypto = require('crypto');

// Field yang TIDAK boleh dicatat (password, token, dsb) — diganti '***'
const SENSITIVE_KEYS = new Set([
    'password', 'newPassword', 'currentPassword', 'token', 'authorization',
    'cookie', 'session', 'apiKey', 'secret'
]);

/**
 * Sanitize objek (body/query) — hilangkan nilai field sensitif,
 * batasi kedalaman agar log tidak membengkak.
 */
function sanitize(obj, depth = 0) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') {
        if (typeof obj === 'string' && obj.length > 500) return obj.slice(0, 500) + '…';
        return obj;
    }
    if (obj instanceof Buffer) return `<Buffer ${obj.length} bytes>`;
    if (depth > 3) return '[obj]';

    if (Array.isArray(obj)) {
        return obj.slice(0, 10).map(i => sanitize(i, depth + 1));
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(k.toLowerCase())) {
            out[k] = '***';
        } else {
            out[k] = sanitize(v, depth + 1);
        }
    }
    return out;
}

/**
 * Detail request logging — catat SEMUA request ke logs/detail-*.log.
 * Tidak ditampilkan di aplikasi; untuk investigasi teknis & audit internal.
 * Log dipicu saat response selesai (client dapat respons).
 */
function detailLog(req, res, next) {
    const reqId = crypto.randomBytes(4).toString('hex');
    const start = Date.now();
    const startedAt = new Date();

    // Catat di properties agar bisa dipakai error handler juga
    req.reqId = reqId;

    res.on('finish', () => {
        const duration = Date.now() - start;
        detailLogger.info('request', {
            reqId,
            method: req.method,
            url: req.originalUrl || req.url,
            query: sanitize(req.query),
            params: sanitize(req.params),
            body: sanitize(req.body),
            status: res.statusCode,
            durationMs: duration,
            user: req.session?.user?.username || (req.body?.username ? 'login-attempt' : 'anonymous'),
            role: req.session?.user?.role || null,
            ip: req.ip || null,
            userAgent: (req.get('User-Agent') || '').slice(0, 150),
            contentLength: res.get('Content-Length') || null,
            startedAt: startedAt.toISOString()
        });
    });

    next();
}

module.exports = detailLog;
