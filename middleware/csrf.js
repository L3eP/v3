/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * Cara kerja:
 * 1. GET request → server set cookie `csrf-token` jika belum ada
 * 2. Frontend membaca cookie, kirim sebagai:
 *    - Header `X-CSRF-Token` untuk JSON/urlencoded requests
 *    - Field `_csrf_token` untuk FormData (multipart) requests
 * 3. POST/PUT/PATCH/DELETE → server validasi
 *
 * Frontend:
 *   Gunakan csrfFetch() dari js/csrf.js untuk semua state-changing request.
 */

const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_BODY_FIELD = '_csrf_token';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Parse cookies dari Cookie header manual
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, ...vals] = pair.trim().split('=');
    if (key) acc[key.trim()] = decodeURIComponent(vals.join('='));
    return acc;
  }, {});
}

function csrfMiddleware(req, res, next) {
  const method = req.method.toUpperCase();

  // Safe methods — lewat, set cookie jika belum ada
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    const cookies = parseCookies(req.headers.cookie);
    if (!cookies[CSRF_COOKIE_NAME]) {
      res.cookie(CSRF_COOKIE_NAME, generateToken(), {
        httpOnly: false,
        sameSite: 'strict',
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    return next();
  }

  // State-changing methods — validasi CSRF
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  // Cek header dulu, lalu body (untuk FormData)
  let headerToken = req.headers[CSRF_HEADER_NAME];
  if (!headerToken) {
    headerToken = req.body ? req.body[CSRF_BODY_FIELD] : undefined;
  }

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ message: 'CSRF token missing' });
  }

  try {
    if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
      return res.status(403).json({ message: 'CSRF token mismatch' });
    }
  } catch {
    return res.status(403).json({ message: 'CSRF token invalid' });
  }

  next();
}

module.exports = { csrfMiddleware, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
