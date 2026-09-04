/**
 * Server.js
 * Main entry point for the Ticketing & Activity Logging System.
 * Handles Express server setup, middleware configuration, API routes, and database connections.
 */
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const app = express();
require('dotenv').config();

const logger = require('./utils/logger');
const { csrfMiddleware } = require('./middleware/csrf');
const db = require('./db');

const PORT = process.env.PORT || 3000; // default disamakan dengan .env (PORT=3000)

// GET /health — dipasang paling awal, SEBELUM helmet/CSRF/session/rate-limit,
// supaya load balancer/uptime monitor tidak perlu cookie/CSRF token dan tidak
// ikut kena rate limit. Benar-benar mengecek koneksi DB (bukan cuma "proses
// hidup") — server bisa saja tetap listening walau DB-nya putus.
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ status: 'ok', db: 'connected', uptime: process.uptime() });
    } catch (err) {
        logger.error('Health check gagal — database tidak bisa dijangkau', { error: err.message });
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// Percaya header X-Forwarded-* dari 1 reverse proxy di depan Node (nginx/dsb).
// Tanpa ini, req.ip selalu jadi alamat proxy untuk SEMUA klien — express-rate-limit
// (login/register/mutationLimiter) jadi satu counter bersama utk seluruh kantor,
// dan audit_logs/detail log mencatat IP yang salah. Jika app benar-benar
// internet-facing tanpa reverse proxy, set TRUST_PROXY=false di .env.
if (process.env.TRUST_PROXY !== 'false') {
    app.set('trust proxy', 1);
}

// Import Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const ticketRoutes = require('./routes/tickets');
const activityRoutes = require('./routes/activities');
const settingsRoutes = require('./routes/settings');
const referenceRoutes = require('./routes/references');
const geoRoutes = require('./routes/geo');
const psbRoutes = require('./routes/psb');
const inventoryRoutes = require('./routes/inventory');
const ftthRoutes = require('./routes/ftth');
const statsRoutes = require('./routes/stats');

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Middleware — mounted SEBELUM express.static agar header keamanan
// juga diterapkan ke halaman HTML statis. Sebelumnya helmet berjalan SETELAH
// static, sehingga CSP tidak pernah sampai ke dokumen HTML (hanya ke JSON API).
app.use(helmet({
    // CSP dikelola manual per-dokumen HTML (di bawah). Jika dipasang global,
    // CSP dengan 'unsafe-inline' pada script-src akan menolak registrasi
    // Service Worker (worker script tidak boleh memuat unsafe-inline).
    contentSecurityPolicy: false,
    // Referrer-Policy default helmet = 'no-referrer'. Itu membuat browser
    // TIDAK mengirim header Referer ke tile.openstreetmap.org, dan OSM
    // menolak request tile tanpa referer yang valid dengan HTTP 403
    // (peta jadi kosong). Ganti ke default browser (kirim origin) — cukup
    // informatif untuk tile, tapi tidak membocorkan path URL ke lintas-origin.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CSRF Protection — harus SEBELUM static agar cookie ter-set saat GET halaman
app.use(csrfMiddleware);

// CSP khusus dokumen HTML statis. sw.js / manifest / css / js / gambar
// dibiarkan tanpa header CSP. Halaman memuat resource eksternal:
//  - fonts.googleapis.com + fonts.gstatic.com (Inter, display=swap)
//  - cdnjs.cloudflare.com (leaflet, jspdf + autotable via pdf-loader.js)
//  - cdn.jsdelivr.net (chart.js lazy di dashboard.js)
//  - *.tile.openstreetmap.org + icon Leaflet dari cdnjs (peta map.html)
//  - via.placeholder.com (placeholder logo)
const STATIC_PAGE_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://via.placeholder.com https://cdnjs.cloudflare.com https://*.tile.openstreetmap.org",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
].join('; ');

app.use((req, res, next) => {
    if (req.path === '/' || /\.html?$/i.test(req.path)) {
        res.setHeader('Content-Security-Policy', STATIC_PAGE_CSP);
    }
    next();
});

// Session Configuration — dipindah SEBELUM static agar /uploads (di bawah) bisa
// memakai req.session untuk gating auth. Sebelumnya session di-setup SETELAH
// express.static(public), yang berarti file di public/uploads (evidence tiket,
// foto profil, foto PSB pelanggan) terlayani ke internet tanpa login sama sekali.
const MySQLStore = require('express-mysql-session')(session);
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 minutes
    expiration: 86400000 // 24 hours
});

app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        // 3.1 — Secure hanya saat production (HTTPS). Di dev (http://localhost)
        // cookie Secure akan ditolak browser, jadi tetap false.
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// /uploads di-gate auth SEBELUM express.static(public) umum — kalau tidak,
// request akan lolos ke static umum di bawah dan file tetap terlayani tanpa
// login (public/uploads ada di dalam public/, isinya: evidence tiket, foto
// profil, foto instalasi PSB pelanggan — semua privat). Pengecualian: logo
// perusahaan (settings.company_logo) HARUS tetap publik karena tampil di
// index.html sebelum login — dicek terhadap nilai settings yang sedang aktif,
// jadi logo baru yang di-upload Owner otomatis ikut terkecuali juga.
app.use('/uploads', async (req, res, next) => {
    if (req.session && req.session.user) return next();
    try {
        const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_logo'");
        const logoUrl = rows[0] && rows[0].setting_value;
        if (logoUrl && logoUrl.startsWith('/uploads/') && req.path === logoUrl.slice('/uploads'.length)) {
            return next();
        }
    } catch (e) {
        logger.error('company-logo lookup failed while gating /uploads', { error: e.message });
    }
    return res.status(401).json({ message: 'Unauthorized: Please log in' });
}, express.static(uploadDir), (req, res) => {
    res.status(404).json({ message: 'Not found' });
});

app.use(express.static(path.join(__dirname, 'public')));

// Detail Request Logging — ke logs/detail-*.log (TIDAK tampil di app, retensi 7 hari)
const detailLog = require('./middleware/detailLog');
app.use(detailLog);

// Global Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later.'
});
app.use(globalLimiter);

// Use Routes
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', ticketRoutes);
app.use('/', activityRoutes);
app.use('/', settingsRoutes);
app.use('/', referenceRoutes);
app.use('/', geoRoutes);
app.use('/', psbRoutes);
app.use('/', inventoryRoutes);
app.use('/', ftthRoutes);
app.use('/', statsRoutes);

// GET /api/audit — Ambil log audit (Owner only)
app.get('/api/audit', async (req, res) => {
  if (!req.session?.user || req.session.user.role !== 'Owner') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM audit_logs');
    const total = countResult[0].total;

    res.json({
      data: rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 }
    });
  } catch (e) {
    res.status(500).json({ message: 'Gagal memuat audit log' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error('Unhandled Error:', { message: err.message, stack: err.stack });
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err.message === 'Only image files (jpeg, jpg, png, gif, webp) are allowed!') {
        return res.status(400).json({ message: err.message });
    }
    // 3.3 — file lolos ekstensi+MIME tapi magic bytes-nya bukan gambar (x.png isi HTML dll)
    if (err && err.code === 'INVALID_IMAGE_CONTENT') {
        return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Internal Server Error' });
});

// Start Server
const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown — berhenti terima koneksi baru dulu, biarkan request yang
// sedang berjalan selesai, baru tutup pool DB & session store. Tanpa ini,
// SIGTERM (mis. saat deploy/restart via systemd/pm2/docker stop) memutus
// koneksi yang sedang aktif secara paksa di tengah jalan.
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} diterima — mematikan server dengan rapi...`);

    server.close(async (err) => {
        if (err) logger.error('Error saat menutup HTTP server', { error: err.message });
        try {
            await sessionStore.close();
        } catch (e) {
            logger.error('Error saat menutup session store', { error: e.message });
        }
        try {
            await db.end();
            logger.info('Connection pool database ditutup.');
        } catch (e) {
            logger.error('Error saat menutup database pool', { error: e.message });
        }
        process.exit(err ? 1 : 0);
    });

    // Kalau ada koneksi yang menggantung dan tidak selesai-selesai, paksa keluar
    // setelah 10 detik alih-alih membuat proses restart/deploy menggantung selamanya.
    setTimeout(() => {
        logger.error('Graceful shutdown timeout (10s) — memaksa keluar.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
