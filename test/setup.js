/**
 * Test Setup — MAYUNG Ticketing System
 *
 * Sebelum menjalankan test, pastikan:
 * 1. Database testing sudah ada (login_app_db_test)
 * 2. .env sudah diisi dengan DB_TEST yang sesuai
 *
 * Cara jalanin:
 *   npm test
 *   # atau
 *   npx mocha test/*.test.js
 *
 * Environment variable untuk test:
 *   NODE_ENV=test — otomatis dipakai saat `npm test`
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
