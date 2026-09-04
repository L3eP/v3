/**
 * Test — Auto-start Tiket dari Log Aktivitas
 *
 * Teknisi yang mencatat aktivitas terkait tiket "Terlapor"/"Pending"
 * otomatis memajukan status tiket itu ke "Dikerjakan" (routes/activities.js).
 * Owner/Operator TIDAK memicu ini — hanya Teknisi.
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli — semua fixture di sini ditandai TEST_TAG dan
 * dihapus lagi di after().
 *
 * Sengaja SATU tiket dipakai bergantian lewat seluruh describe (bukan
 * create/delete per-it) — routes/tickets.js punya mutationLimiter bersama
 * (60/15menit, satu proses mocha = satu counter) yang juga dipakai
 * test/tickets.test.js; terlalu banyak create/update/delete tiket di sini
 * pernah menghabiskan kuota itu dan menjatuhkan test file LAIN dengan 429.
 * Urutan `it()` di bawah sengaja dependen satu sama lain (status tiket
 * berjalan maju melalui skenario), bukan isolated per-test.
 *
 * Cara jalan: npm test
 */
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');

const app = buildTestApp();

describe('Auto-start Tiket dari Log Aktivitas', function () {
  this.timeout(15000);

  let ownerAgent;
  let teknisiAgent;
  let ticketId;
  const activityIds = [];

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    teknisiAgent = await getAgentFor(app, 'ijang1', 'test123');

    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'ijang1',
      priority: 'Low',
      info: `${TEST_TAG}auto-start`,
      createdBy: 'pfizer',
    });
    if (res.status !== 201) {
      throw new Error(`Gagal buat tiket fixture: ${res.status} ${JSON.stringify(res.body)}`);
    }
    ticketId = res.body.ticket.id;
  });

  after(async () => {
    for (const id of activityIds) {
      await ownerAgent.delete(`/activities/${id}`);
    }
    if (ticketId) await ownerAgent.delete(`/tickets/${ticketId}`);
  });

  it('Teknisi log aktivitas ke tiket "Terlapor" miliknya HARUS memajukan status ke Dikerjakan', async () => {
    const res = await teknisiAgent.post('/activities').send({
      description: `${TEST_TAG}mulai kerjakan`,
      username: 'ijang1',
      ticket_id: String(ticketId),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    activityIds.push(res.body.activity.id);

    if (!res.body.autoTransition) throw new Error('Expected autoTransition di response, tidak ada');
    if (res.body.autoTransition.oldStatus !== 'Terlapor' || res.body.autoTransition.newStatus !== 'Dikerjakan') {
      throw new Error(`autoTransition salah: ${JSON.stringify(res.body.autoTransition)}`);
    }

    const ticket = await ownerAgent.get(`/tickets/${ticketId}`);
    if (ticket.body.status !== 'Dikerjakan') {
      throw new Error(`Expected status Dikerjakan, got ${ticket.body.status}`);
    }

    const history = await ownerAgent.get(`/tickets/${ticketId}/history`);
    const last = history.body[history.body.length - 1];
    if (!last || last.new_status !== 'Dikerjakan' || last.changed_by !== 'ijang1') {
      throw new Error(`ticket_status_history tidak tercatat benar: ${JSON.stringify(last)}`);
    }
  });

  it('Teknisi log aktivitas lagi ke tiket yang SUDAH Dikerjakan TIDAK memicu transisi ulang', async () => {
    const res = await teknisiAgent.post('/activities').send({
      description: `${TEST_TAG}sudah dikerjakan`,
      username: 'ijang1',
      ticket_id: String(ticketId),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    activityIds.push(res.body.activity.id);

    if (res.body.autoTransition !== null) {
      throw new Error(`Expected autoTransition null (sudah Dikerjakan), got ${JSON.stringify(res.body.autoTransition)}`);
    }
  });

  it('Teknisi log aktivitas ke tiket "Pending" miliknya HARUS memajukan status ke Dikerjakan', async () => {
    // Dikerjakan -> Pending valid (VALID_TRANSITIONS) — geser tiket yang sama
    // ke Pending dulu, supaya tidak perlu bikin tiket fixture baru.
    const toPending = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Pending' });
    if (toPending.status !== 200) throw new Error(`Gagal set Pending: ${toPending.status}`);

    const res = await teknisiAgent.post('/activities').send({
      description: `${TEST_TAG}lanjut dari pending`,
      username: 'ijang1',
      ticket_id: String(ticketId),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    activityIds.push(res.body.activity.id);

    if (res.body.autoTransition?.oldStatus !== 'Pending' || res.body.autoTransition?.newStatus !== 'Dikerjakan') {
      throw new Error(`autoTransition salah dari Pending: ${JSON.stringify(res.body.autoTransition)}`);
    }
  });

  it('Owner/Operator log aktivitas ke tiket "Terlapor" TIDAK BOLEH memicu auto-start', async () => {
    // Dikerjakan -> Terlapor valid — geser balik supaya ada status yang
    // SEHARUSNYA auto-start kalau pelakunya Teknisi, untuk membuktikan
    // yang mencegahnya benar-benar role Owner, bukan status tiketnya.
    const toTerlapor = await ownerAgent.post(`/tickets/${ticketId}/update`).send({ status: 'Terlapor' });
    if (toTerlapor.status !== 200) throw new Error(`Gagal set Terlapor: ${toTerlapor.status}`);

    const res = await ownerAgent.post('/activities').send({
      description: `${TEST_TAG}catatan admin`,
      username: 'pfizer',
      ticket_id: String(ticketId),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    activityIds.push(res.body.activity.id);

    if (res.body.autoTransition !== null) {
      throw new Error(`Expected autoTransition null untuk Owner, got ${JSON.stringify(res.body.autoTransition)}`);
    }
    const ticket = await ownerAgent.get(`/tickets/${ticketId}`);
    if (ticket.body.status !== 'Terlapor') {
      throw new Error(`Status tiket tidak boleh berubah, got ${ticket.body.status}`);
    }
  });

  it('Teknisi log aktivitas TANPA ticket_id TIDAK memicu apapun (autoTransition null)', async () => {
    const res = await teknisiAgent.post('/activities').send({
      description: `${TEST_TAG}tanpa tiket`,
      username: 'ijang1',
      ticket_id: '',
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    activityIds.push(res.body.activity.id);

    if (res.body.autoTransition !== null) {
      throw new Error(`Expected autoTransition null, got ${JSON.stringify(res.body.autoTransition)}`);
    }
  });
});
