/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * Cara kerja:
 * 1. GET request → server set cookie `csrf-token` jika belum ada
 * 2. Frontend membaca cookie, kirim sebagai header `X-CSRF-Token`
 *    (termasuk untuk FormData/multipart — lihat js/csrf.js)
 * 3. POST/PUT/PATCH/DELETE → server validasi
 *
 * Frontend:
 *   Gunakan csrfFetch() dari js/csrf.js untuk semua state-changing request.
 *
 * Catatan: middleware ini mounted SEBELUM body parser multipart (multer
 * berjalan per-route, setelah middleware ini), jadi req.body selalu undefined
 * di sini untuk request multipart — karena itu token HARUS lewat header, tidak
 * bisa lewat field body untuk FormData.
 */

const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// 3.1 — cookie CSRF ikut NODE_ENV: Secure hanya saat production (HTTPS)
const IS_PROD = process.env.NODE_ENV === 'production';

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
        secure: IS_PROD,
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    return next();
  }

  // State-changing methods — validasi CSRF
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  const headerToken = req.headers[CSRF_HEADER_NAME];

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

  // Rotate token setelah validasi sukses — cegah replay attack
  const newToken = generateToken();
  res.cookie(CSRF_COOKIE_NAME, newToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 24 * 60 * 60 * 1000
  });

  next();
}

module.exports = { csrfMiddleware, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
