/**
 * Integration Test — API Endpoints
 *
 * Menguji endpoint-endpoint utama untuk memastikan tidak regression.
 * Test ini menggunakan database YANG SUDAH ADA (login_app_db),
 * bukan database terpisah.
 *
 * Cara jalan:
 *   npm test
 *
 * Catatan:
 * - Test ini membaca/mengubah data di database DEVELOPMENT
 * - Jangan jalankan di production!
 * - Beberapa test membutuhkan session — gunakan agent supertest
 */

const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Setup Express app untuk testing
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');

const app = express();

// Middleware minimal untuk test
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: 86400000,
});

app.use(
  session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'test-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', maxAge: 86400000 },
  })
);

// Mount routes
app.use('/', require('../routes/settings'));

// ===================== TESTS =====================

describe('Settings API', function () {
  // Timeout lebih panjang karena koneksi DB
  this.timeout(10000);

  describe('GET /settings/company-name', function () {
    it('should return company name (public, no auth needed)', function (done) {
      request(app)
        .get('/settings/company-name')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          if (!res.body.hasOwnProperty('companyName')) {
            return done(new Error('Response missing companyName field'));
          }
          done();
        });
    });
  });

  describe('GET /settings/company-logo', function () {
    it('should return logo URL (public, no auth needed)', function (done) {
      request(app)
        .get('/settings/company-logo')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          if (!res.body.hasOwnProperty('logoUrl')) {
            return done(new Error('Response missing logoUrl field'));
          }
          done();
        });
    });
  });
});

// ===================== RUN =====================

// Jika file di-run langsung, print petunjuk
if (require.main === module) {
  console.log('Jalankan test dengan: npm test');
  console.log('Atau: npx mocha test/*.test.js --timeout 10000');
}
