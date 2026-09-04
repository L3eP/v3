/**
 * Integration Test — API Endpoints
 *
 * Menguji endpoint-endpoint utama untuk memastikan tidak regression.
 *
 * Cara jalan:
 *   npm test
 *
 * Catatan:
 * - Test ini menggunakan database YANG SUDAH ADA (login_app_db)
 * - Jangan jalankan di production!
 */

const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Setup Express app untuk testing
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF — bypass untuk testing
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    req.headers['x-csrf-token'] = 'test-token';
    // Juga set cookie biar middleware CSRF lulus
    if (!req.headers.cookie) req.headers.cookie = 'csrf-token=test-token';
    // Tambah _csrf_token di body untuk FormData
    if (!req.body) req.body = {};
    req.body._csrf_token = 'test-token';
  }
  next();
});

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
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
app.use('/', require('../routes/auth'));

// ===================== TESTS =====================

describe('Settings API (Public)', function () {
  this.timeout(10000);

  describe('GET /settings/company-name', function () {
    it('should return company name', function (done) {
      request(app)
        .get('/settings/company-name')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          if (!Object.hasOwn(res.body, 'companyName')) {
            return done(new Error('Response missing companyName'));
          }
          done();
        });
    });
  });

  describe('GET /settings/company-logo', function () {
    it('should return logo URL', function (done) {
      request(app)
        .get('/settings/company-logo')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          if (!Object.hasOwn(res.body, 'logoUrl')) {
            return done(new Error('Response missing logoUrl'));
          }
          done();
        });
    });
  });
});

describe('Auth API', function () {
  this.timeout(10000);

  describe('POST /login', function () {
    it('should reject empty credentials with 400 (validation)', function (done) {
      // password kosong ditolak oleh express-validator .notEmpty() sebelum
      // sampai ke pengecekan kredensial — 400 (permintaan tidak valid),
      // bukan 401 (kredensial salah). Lihat routes/auth.js.
      request(app)
        .post('/login')
        .send({ username: '', password: '' })
        .expect(400)
        .end(done);
    });

    it('should reject invalid credentials with 401', function (done) {
      request(app)
        .post('/login')
        .send({ username: 'nonexistent_user_xyz', password: 'wrongpass' })
        .expect(401)
        .end(done);
    });
  });

  describe('POST /logout', function () {
    it('should return success message', function (done) {
      request(app)
        .post('/logout')
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);
          if (!res.body.message || !res.body.redirect) {
            return done(new Error('Logout response incomplete'));
          }
          done();
        });
    });
  });
});

// ===================== RUN =====================

if (require.main === module) {
  console.log('Jalankan test dengan: npm test');
  console.log('Atau: npx mocha test/*.test.js --timeout 10000');
}
