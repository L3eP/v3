/**
 * Test — State Machine Status Tiket & IDOR
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli (tidak ada DB test terpisah) — semua fixture di
 * sini ditandai TEST_TAG dan dihapus lagi di afterEach.
 *
 * Cara jalan: npm test
 */
// PENTING: testApp harus di-require DULUAN — dia yang men-load dotenv
// (lihat komentar di dalamnya). db.js membuat connection pool langsung saat
// pertama kali di-require pakai process.env saat itu juga; kalau db di-require
// duluan, dotenv belum jalan, dan pool KEBURU dibuat pakai kredensial kosong
// (root@localhost tanpa password) — nyangkut permanen di module cache Node
// untuk sisa proses (baru ketahuan waktu file ini dijalankan SENDIRIAN, bukan
// lewat `npm test` yang men-load file lain duluan sehingga dotenv kebetulan
// sudah jalan sebelum baris ini dieksekusi).
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');
const db = require('../db');

const app = buildTestApp();

// Buffer JPEG minimal — cukup untuk lolos cek magic bytes di middleware/upload.js
// (butuh >= 12 byte DAN 3 byte pertama FF D8 FF), tidak perlu gambar asli yang
// bisa didekode karena app ini tidak pernah men-decode isi filenya.
const MIN_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9
]);

describe('Ticket Status State Machine', function () {
  this.timeout(15000);

  let ownerAgent;
  let ticketId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  afterEach(async () => {
    // Hapus tiket fixture setelah tiap test — jangan biarkan menumpuk di
    // database asli. Soft-delete (endpoint sungguhan), bukan raw DELETE.
    if (ticketId) {
      await ownerAgent.delete(`/tickets/${ticketId}`);
      ticketId = null;
    }
  });

  async function createTestTicket(overrides = {}) {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}state-machine`,
      createdBy: 'pfizer',
      ...overrides,
    });
    if (res.status !== 201) {
      throw new Error(`Gagal buat tiket fixture: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.ticket.id;
  }

  it('tiket baru harus mulai dari status Terlapor', async () => {
    ticketId = await createTestTicket();
    const res = await ownerAgent.get(`/tickets/${ticketId}`);
    if (res.body.status !== 'Terlapor') {
      throw new Error(`Expected status Terlapor, got ${res.body.status}`);
    }
  });

  it('TIDAK BOLEH create tiket langsung dengan status Selesai', async () => {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}reject-selesai`,
      status: 'Selesai',
      createdBy: 'pfizer',
    });
    if (res.status !== 400) {
      // Kalau ini lolos, hapus supaya tidak nyangkut
      if (res.body?.ticket?.id) await ownerAgent.delete(`/tickets/${res.body.ticket.id}`);
      throw new Error(`Expected 400 (status awal cuma Terlapor/Pending), got ${res.status}`);
    }
  });

  it('transisi Terlapor -> Dikerjakan HARUS diterima', async () => {
    ticketId = await createTestTicket();
    const res = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('transisi Terlapor -> Selesai (lompat) HARUS ditolak', async () => {
    ticketId = await createTestTicket();
    const res = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Selesai' });
    if (res.status !== 400) throw new Error(`Expected 400 (transisi tidak valid), got ${res.status}`);
  });

  it('transisi Dikerjakan -> Selesai HARUS diterima, dan Selesai -> Terlapor (lompat) HARUS ditolak', async () => {
    ticketId = await createTestTicket();
    const toDikerjakan = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    if (toDikerjakan.status !== 200) throw new Error('Gagal set Dikerjakan sebagai prasyarat test');

    // Sejak foto bukti diwajibkan saat masuk Selesai, transisi ini butuh evidence.
    const toSelesai = await ownerAgent.post(`/tickets/${ticketId}/update`)
      .field('status', 'Selesai')
      .attach('evidence', MIN_JPEG_BUFFER, 'bukti.jpg');
    if (toSelesai.status !== 200) throw new Error(`Expected 200 (Dikerjakan->Selesai valid), got ${toSelesai.status}: ${JSON.stringify(toSelesai.body)}`);

    const toTerlapor = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Terlapor' });
    if (toTerlapor.status !== 400) throw new Error(`Expected 400 (Selesai->Terlapor tidak valid, cuma boleh ke Dikerjakan), got ${toTerlapor.status}`);
  });

  it('Selesai -> Dikerjakan (satu-satunya jalan keluar dari Selesai) HARUS diterima', async () => {
    ticketId = await createTestTicket();
    await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    await ownerAgent.post(`/tickets/${ticketId}/update`)
      .field('status', 'Selesai')
      .attach('evidence', MIN_JPEG_BUFFER, 'bukti.jpg');
    const res = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  it('transisi ke Selesai TANPA foto bukti ditolak (400); DITERIMA begitu evidence tersedia (dari DB, bukan upload baru)', async () => {
    // Satu fixture dipakai utk kedua skenario — tekan jumlah request supaya
    // tidak numpuk di mutationLimiter('tickets') yang dibagi seluruh proses
    // mocha (lihat test/helpers/testApp.js).
    ticketId = await createTestTicket();
    await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });

    const rejected = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Selesai' });
    if (rejected.status !== 400) throw new Error(`Expected 400 (tanpa foto bukti), got ${rejected.status}: ${JSON.stringify(rejected.body)}`);
    const check = await ownerAgent.get(`/tickets/${ticketId}`);
    if (check.body.status === 'Selesai') throw new Error('Status berubah ke Selesai padahal request ditolak');

    // Foto sudah dilampirkan sebelumnya (mis. saat masih Dikerjakan) — tidak
    // wajib upload ulang foto yang sama persis saat menyelesaikan.
    await db.query("UPDATE tickets SET evidence = '/uploads/existing-test.jpg' WHERE id = ?", [ticketId]);
    const accepted = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Selesai' });
    if (accepted.status !== 200) throw new Error(`Expected 200 (evidence sudah ada dari sebelumnya), got ${accepted.status}: ${JSON.stringify(accepted.body)}`);
  });
});

describe('Ticket IDOR (Teknisi hanya boleh akses tiket miliknya)', function () {
  this.timeout(15000);

  let ownerAgent;
  let teknisiAgent;
  let foreignTicketId; // dibuat Owner, PIC = pfizer (BUKAN ijang1)

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    teknisiAgent = await getAgentFor(app, 'ijang1', 'test123');
  });

  beforeEach(async () => {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}idor`,
      pic: 'pfizer', // sengaja BUKAN ijang1 — punya orang lain dari sudut pandang ijang1
      priority: 'Low',
      info: `${TEST_TAG}idor-fixture`,
      createdBy: 'pfizer',
    });
    if (res.status !== 201) throw new Error(`Gagal buat tiket fixture IDOR: ${res.status}`);
    foreignTicketId = res.body.ticket.id;
  });

  afterEach(async () => {
    if (foreignTicketId) {
      await ownerAgent.delete(`/tickets/${foreignTicketId}`);
      foreignTicketId = null;
    }
  });

  it('Teknisi TIDAK melihat tiket orang lain di GET /tickets', async () => {
    const res = await teknisiAgent.get('/tickets');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const ids = (res.body.data || res.body || []).map((t) => t.id);
    if (ids.includes(foreignTicketId)) {
      throw new Error('IDOR: tiket milik pfizer muncul di daftar tiket ijang1');
    }
  });

  it('Teknisi TIDAK BOLEH buka detail tiket orang lain (GET /tickets/:id)', async () => {
    const res = await teknisiAgent.get(`/tickets/${foreignTicketId}`);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  it('Teknisi TIDAK BOLEH update tiket orang lain (POST /tickets/:id/update)', async () => {
    const res = await teknisiAgent.post(`/tickets/${foreignTicketId}/update`).send({ status: 'Dikerjakan' });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  it('Teknisi TETAP bisa akses tiket miliknya sendiri (creator)', async () => {
    const own = await teknisiAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}idor-own`,
      pic: 'ijang1',
      priority: 'Low',
      info: `${TEST_TAG}idor-own-fixture`,
      createdBy: 'ijang1',
    });
    if (own.status !== 201) throw new Error(`Gagal buat tiket milik ijang1: ${own.status}`);
    const ownId = own.body.ticket.id;
    try {
      const detail = await teknisiAgent.get(`/tickets/${ownId}`);
      if (detail.status !== 200) throw new Error(`Expected 200 untuk tiket milik sendiri, got ${detail.status}`);
    } finally {
      await ownerAgent.delete(`/tickets/${ownId}`);
    }
  });
});
