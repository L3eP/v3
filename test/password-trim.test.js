/**
 * Test — Password/Username Trim Konsisten (login vs set-password)
 *
 * Regresi untuk bug nyata: password yang di-set lewat /register atau
 * /admin/users/update dengan spasi tak sengaja di awal/akhir (autofill,
 * copy-paste) tersimpan APA ADANYA, tapi /login tidak pernah men-trim
 * input-nya — jadi password yang "kelihatan benar" tidak pernah cocok.
 * Diperbaiki dengan .trim() konsisten di semua jalur (routes/auth.js,
 * routes/users.js).
 *
 * Skenario /register diverifikasi end-to-end lewat /login sungguhan.
 * Skenario /admin/users/update SENGAJA diverifikasi langsung ke hash di
 * database (bcrypt.compare), BUKAN lewat /login lagi — loginLimiter
 * (5/15menit) dibagi SATU counter untuk SELURUH proses mocha, dan
 * api.test.js + getAgentFor(pfizer/ijang1) sudah memakai sebagian besar
 * kuota itu; menambah percobaan /login kedua di sini pernah membuat test
 * lain kena 429. Tetap pengujian nyata (baca hash asli dari DB), cuma
 * tidak lewat HTTP /login.
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli — fixture ditandai TEST_TAG dan dihapus lagi
 * (hard-delete langsung, BUKAN lewat endpoint DELETE /users/:username yang
 * cuma soft-delete — soft-delete membuat username itu dianggap "already
 * exists" oleh /register kalau test ini dijalankan ulang) di after().
 *
 * Cara jalan: npm test
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');

const app = buildTestApp();

describe('Trim Password/Username — konsisten set vs login', function () {
  this.timeout(15000);

  let ownerAgent;
  const testUsername = `${TEST_TAG}pwdtrim`;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    // Bersihkan sisa fixture dari run sebelumnya yang gagal di tengah jalan
    // (soft-delete lewat API tidak membebaskan username untuk dipakai lagi).
    await db.query('DELETE FROM users WHERE username = ?', [testUsername]);
  });

  after(async () => {
    await db.query('DELETE FROM users WHERE username = ?', [testUsername]);
  });

  it('/register: password dengan spasi tak sengaja tetap bisa login TANPA spasi', async () => {
    const res = await ownerAgent.post('/register').send({
      username: testUsername,
      password: '  Test1234  ', // sengaja ada spasi di awal & akhir
      fullName: `${TEST_TAG}Pwd Trim`,
      role: 'Teknisi',
    });
    if (res.status !== 201) {
      throw new Error(`Gagal register fixture: ${res.status} ${JSON.stringify(res.body)}`);
    }

    // Login pakai password TANPA spasi — ini skenario bug nyatanya: user
    // asli tidak tahu ada spasi tersembunyi di versi yang di-set admin.
    const loginTrimmed = await request(app)
      .post('/login')
      .send({ username: testUsername, password: 'Test1234' });
    if (loginTrimmed.status !== 200) {
      throw new Error(`Login TANPA spasi HARUS berhasil, got ${loginTrimmed.status}: ${JSON.stringify(loginTrimmed.body)}`);
    }
  });

  it('/admin/users/update: password baru dengan spasi tak sengaja tersimpan ter-trim (verifikasi langsung ke hash)', async () => {
    const update = await ownerAgent.post('/admin/users/update').send({
      originalUsername: testUsername,
      password: '  Ganti5678  ', // sengaja ada spasi
    });
    if (update.status !== 200) {
      throw new Error(`Gagal update password: ${update.status} ${JSON.stringify(update.body)}`);
    }

    const [rows] = await db.query('SELECT password FROM users WHERE username = ?', [testUsername]);
    if (!rows[0]) throw new Error('User fixture tidak ditemukan setelah update');

    const matchesTrimmed = await bcrypt.compare('Ganti5678', rows[0].password);
    if (!matchesTrimmed) {
      throw new Error('Hash tersimpan TIDAK cocok dengan password ter-trim — berarti .trim() gagal diterapkan sebelum bcrypt.hash()');
    }
  });
});
