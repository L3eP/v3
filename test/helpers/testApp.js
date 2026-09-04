/**
 * Test app builder — dipakai bareng oleh semua test/*.test.js supaya boilerplate
 * session + CSRF-bypass tidak diulang di tiap file (pola yang sama dengan
 * test/api.test.js, dipindah ke sini biar bisa dipakai ulang).
 *
 * PENTING — batasan yang harus dipahami sebelum menambah test baru:
 * Tidak ada database test terpisah. `login_app_user` cuma punya privilege di
 * `login_app_db` (tidak ada grant CREATE DATABASE), jadi test di sini jalan
 * LANGSUNG ke database yang sama dengan yang dipakai aplikasi asli. Supaya
 * aman: SETIAP test WAJIB membuat fixture sendiri dengan penanda yang jelas
 * (lihat TEST_TAG di bawah) dan menghapusnya lagi di afterEach/after — jangan
 * pernah mengubah/menghapus data yang bukan dibuat oleh test itu sendiri.
 * Isolasi sungguhan (database terpisah) butuh akses admin MySQL untuk
 * `GRANT CREATE ON login_app_db_test.* TO login_app_user` — di luar kendali
 * kredensial yang tersedia saat ini.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Test ini membuat & mengubah tiket sungguhan (lihat catatan di atas soal
// tidak ada DB terpisah) — tanpa ini, tiap `npm test` mengirim WhatsApp ASLI
// ke nomor pfizer/ijang1 sungguhan lewat Fonnte setiap kali status tiket
// berubah. sendWhatsApp() di services/notification.js sudah punya guard
// "skip kalau FONNTE_TOKEN kosong" — cukup kosongkan di sini, tidak perlu
// ubah kode notifikasi itu sendiri.
delete process.env.FONNTE_TOKEN;

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

// Penanda semua data yang dibuat test — memudahkan audit manual/cleanup darurat
// kalau ada test yang gagal di tengah jalan dan afterEach tidak sempat jalan.
const TEST_TAG = 'AUTOTEST_';

// Singleton — semua file test berbagi SATU instance app (bukan cuma satu
// route module, per catatan di getAgentFor di bawah). Kalau tiap file bikin
// app-nya sendiri, agent yang di-cache dari app file A dipakai ulang di app
// file B secara tidak sengaja "kebetulan jalan" karena route-nya sama persis
// — lebih baik eksplisit satu app saja.
let cachedApp = null;

function buildTestApp() {
  if (cachedApp) return cachedApp;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CSRF bypass untuk testing — sama seperti test/api.test.js
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      req.headers['x-csrf-token'] = 'test-token';
      if (!req.headers.cookie) req.headers.cookie = 'csrf-token=test-token';
      else if (!req.headers.cookie.includes('csrf-token=')) req.headers.cookie += '; csrf-token=test-token';
    }
    next();
  });

  const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: false, // test pendek, tidak perlu timer background
  });

  app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'test-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', maxAge: 86400000 },
  }));

  app.use('/', require('../../routes/auth'));
  app.use('/', require('../../routes/users'));
  app.use('/', require('../../routes/tickets'));
  app.use('/', require('../../routes/ftth'));
  app.use('/', require('../../routes/psb'));
  app.use('/', require('../../routes/activities'));

  // Error handler minimal — biar error balik sebagai JSON, bukan halaman HTML
  // default Express (memudahkan baca pesan error saat test gagal).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ message: err.message });
  });

  cachedApp = app;
  return app;
}

// Login via endpoint sungguhan (bukan mock session) — supertest agent menyimpan
// cookie session secara otomatis untuk request berikutnya di agent yang sama.
async function loginAs(agent, username, password) {
  const res = await agent.post('/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${username}) gagal: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

// POST /login dibatasi 5x/15menit (loginLimiter) — dan karena semua file test
// jalan dalam SATU proses mocha yang sama, mereka semua require() modul
// routes/auth.js yang SAMA (Node module cache), jadi berbagi satu counter
// rate-limit yang sama juga. Login berulang-ulang di tiap describe/file akan
// cepat kena 429. Solusinya bukan skip rate limiter (itu justru bagian yang
// mau diuji tetap aktif) — solusinya: login SEKALI per akun per proses test,
// pakai ulang agent yang sama di semua file lewat memoisasi di sini.
const agentCache = new Map();
async function getAgentFor(app, username, password) {
  if (agentCache.has(username)) return agentCache.get(username);
  const request = require('supertest');
  const agent = request.agent(app);
  await loginAs(agent, username, password);
  agentCache.set(username, agent);
  return agent;
}

module.exports = { buildTestApp, loginAs, getAgentFor, TEST_TAG };
