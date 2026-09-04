/**
 * Rate limiter untuk endpoint mutasi (POST/PUT/PATCH/DELETE).
 *
 * Satu instance per route file (= bucket per-IP per endpoint group):
 * serangan massal pada satu endpoint tidak menguras kuota endpoint lain,
 * dan method aman (GET/HEAD/OPTIONS) tidak pernah dihitung di sini.
 *
 * Dipasang via `router.use(mutationLimiter('<label>'))` di masing-masing
 * route file — lihat Sprint 3.2.
 */
const rateLimit = require('express-rate-limit');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function mutationLimiter(label, max = 60) {
    return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 menit
        max, // per-IP per 15 menit, per endpoint group
        standardHeaders: true,
        legacyHeaders: false,
        message: `Terlalu banyak permintaan ke ${label}, coba lagi nanti.`,
        skip: (req) => SAFE_METHODS.has(req.method.toUpperCase())
    });
}

module.exports = { mutationLimiter };
