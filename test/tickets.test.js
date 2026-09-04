/**
 * Test — State Machine Status Tiket & IDOR
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli (tidak ada DB test terpisah) — semua fixture di
 * sini ditandai TEST_TAG dan dihapus lagi di afterEach.
 *
 * Cara jalan: npm test
 */
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');

const app = buildTestApp();

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

    const toSelesai = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Selesai' });
    if (toSelesai.status !== 200) throw new Error(`Expected 200 (Dikerjakan->Selesai valid), got ${toSelesai.status}`);

    const toTerlapor = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Terlapor' });
    if (toTerlapor.status !== 400) throw new Error(`Expected 400 (Selesai->Terlapor tidak valid, cuma boleh ke Dikerjakan), got ${toTerlapor.status}`);
  });

  it('Selesai -> Dikerjakan (satu-satunya jalan keluar dari Selesai) HARUS diterima', async () => {
    ticketId = await createTestTicket();
    await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Selesai' });
    const res = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Dikerjakan' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
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
