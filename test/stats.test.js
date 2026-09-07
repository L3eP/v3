/**
 * Test — SLA/KPI sungguhan di GET /api/stats/month (2026-09-07)
 *
 * Target SLA per prioritas dikonfirmasi pemilik produk: Urgent 2j,
 * Critical 4j, Moderate 12j, Low 48j (lihat SLA_TARGET_HOURS di
 * routes/stats.js). Endpoint ini mengagregasi SEMUA tiket di database,
 * bukan cuma milik test — jadi assertion di sini memakai DELTA (sebelum
 * vs sesudah fixture ditambah), bukan nilai absolut, supaya tidak rapuh
 * terhadap data lain yang sudah ada di database lokal.
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli — fixture ditandai TEST_TAG dan dihapus lagi.
 *
 * Cara jalan: npm test
 */
// PENTING: testApp harus di-require DULUAN — lihat catatan yang sama di
// test/validation.test.js soal urutan require ini.
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');
const db = require('../db');

const app = buildTestApp();

describe('GET /api/stats/month — SLA/KPI sungguhan (2026-09-07)', function () {
  this.timeout(15000);

  let ownerAgent, teknisiAgent;
  const ticketIds = [];

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    teknisiAgent = await getAgentFor(app, 'ijang1', 'test123');
  });

  afterEach(async () => {
    for (const id of ticketIds.splice(0)) {
      await db.query('DELETE FROM ticket_status_history WHERE ticket_id = ?', [id]);
      await db.query('DELETE FROM tickets WHERE id = ?', [id]);
    }
  });

  // Bikin tiket via API (biar lolos validasi normal) lalu timpa langsung
  // created_at/date_selesai/status via SQL — cara paling langsung untuk
  // mensimulasikan "tiket ini sudah Selesai N jam setelah dibuat" tanpa
  // ikut transisi status asli satu-satu (yang tidak relevan untuk test ini).
  async function makeCompletedTicket(priority, hoursToComplete) {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'ijang1',
      priority,
      info: `${TEST_TAG}stats-sla`,
      createdBy: 'pfizer',
    });
    if (res.status !== 201) throw new Error(`Gagal buat tiket fixture: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.ticket.id;
    ticketIds.push(id);
    await db.query(
      `UPDATE tickets SET status = 'Selesai',
         created_at = DATE_SUB(NOW(), INTERVAL ? HOUR),
         date_selesai = NOW()
       WHERE id = ?`,
      [hoursToComplete, id]
    );
    return id;
  }

  async function makeOpenTicket(priority, hoursOld) {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'ijang1',
      priority,
      info: `${TEST_TAG}stats-atrisk`,
      createdBy: 'pfizer',
    });
    if (res.status !== 201) throw new Error(`Gagal buat tiket fixture: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.ticket.id;
    ticketIds.push(id);
    await db.query(
      `UPDATE tickets SET created_at = DATE_SUB(NOW(), INTERVAL ? HOUR) WHERE id = ?`,
      [hoursOld, id]
    );
    return id;
  }

  it('tiket Selesai dalam target HARUS masuk hitungan "met" di sla.byPriority', async () => {
    const before = await ownerAgent.get('/api/stats/month');
    const bpBefore = before.body.sla.byPriority.find(p => p.priority === 'Critical');

    await makeCompletedTicket('Critical', 3); // target 4j, selesai dalam 3j -> met

    const after = await ownerAgent.get('/api/stats/month');
    const bpAfter = after.body.sla.byPriority.find(p => p.priority === 'Critical');

    if (bpAfter.total !== bpBefore.total + 1) throw new Error(`Expected total +1, got ${bpBefore.total} -> ${bpAfter.total}`);
    if (bpAfter.met !== bpBefore.met + 1) throw new Error(`Expected met +1 (dalam target), got ${bpBefore.met} -> ${bpAfter.met}`);
  });

  it('tiket Selesai LEWAT target TIDAK BOLEH masuk hitungan "met"', async () => {
    const before = await ownerAgent.get('/api/stats/month');
    const bpBefore = before.body.sla.byPriority.find(p => p.priority === 'Critical');

    await makeCompletedTicket('Critical', 10); // target 4j, selesai dalam 10j -> TIDAK met

    const after = await ownerAgent.get('/api/stats/month');
    const bpAfter = after.body.sla.byPriority.find(p => p.priority === 'Critical');

    if (bpAfter.total !== bpBefore.total + 1) throw new Error(`Expected total +1, got ${bpBefore.total} -> ${bpAfter.total}`);
    if (bpAfter.met !== bpBefore.met) throw new Error(`met seharusnya TIDAK berubah (lewat target), ${bpBefore.met} -> ${bpAfter.met}`);
  });

  it('tiket terbuka yang SUDAH lewat target jam HARUS masuk sla.breached', async () => {
    const before = await ownerAgent.get('/api/stats/month');

    await makeOpenTicket('Urgent', 3); // target 2j, umur 3j -> breached

    const after = await ownerAgent.get('/api/stats/month');
    if (after.body.sla.breached !== before.body.sla.breached + 1) {
      throw new Error(`Expected breached +1, got ${before.body.sla.breached} -> ${after.body.sla.breached}`);
    }
  });

  it('tiket terbuka yang mendekati (>=80%) target jam HARUS masuk sla.atRisk, BUKAN breached', async () => {
    const before = await ownerAgent.get('/api/stats/month');

    await makeOpenTicket('Urgent', 1.8); // target 2j, 80% = 1.6j, umur 1.8j -> atRisk (belum lewat)

    const after = await ownerAgent.get('/api/stats/month');
    if (after.body.sla.atRisk !== before.body.sla.atRisk + 1) {
      throw new Error(`Expected atRisk +1, got ${before.body.sla.atRisk} -> ${after.body.sla.atRisk}`);
    }
    if (after.body.sla.breached !== before.body.sla.breached) {
      throw new Error(`breached seharusnya TIDAK berubah (belum lewat target), ${before.body.sla.breached} -> ${after.body.sla.breached}`);
    }
  });

  it('teknisiPerformance HARUS mencerminkan tiket Selesai milik PIC tsb, dan hilang untuk role Teknisi', async () => {
    const before = await ownerAgent.get('/api/stats/month');
    const perfBefore = before.body.teknisiPerformance.find(t => t.username === 'ijang1');
    const doneBefore = perfBefore ? perfBefore.doneCount : 0;

    await makeCompletedTicket('Moderate', 5); // target 12j, met, pic=ijang1

    const afterOwner = await ownerAgent.get('/api/stats/month');
    if (!Array.isArray(afterOwner.body.teknisiPerformance)) throw new Error('Expected teknisiPerformance array untuk Owner');
    const perfAfter = afterOwner.body.teknisiPerformance.find(t => t.username === 'ijang1');
    if (!perfAfter || perfAfter.doneCount !== doneBefore + 1) {
      throw new Error(`Expected doneCount ijang1 +1, got ${doneBefore} -> ${perfAfter && perfAfter.doneCount}`);
    }

    const afterTeknisi = await teknisiAgent.get('/api/stats/month');
    if (afterTeknisi.body.teknisiPerformance !== undefined) {
      throw new Error('teknisiPerformance TIDAK BOLEH muncul untuk role Teknisi');
    }
  });

  it('sla.targets HARUS mencerminkan target jam yang dikonfirmasi (Urgent 2/Critical 4/Moderate 12/Low 48)', async () => {
    const res = await ownerAgent.get('/api/stats/month');
    const t = res.body.sla.targets;
    if (t.Urgent !== 2 || t.Critical !== 4 || t.Moderate !== 12 || t.Low !== 48) {
      throw new Error(`sla.targets tidak sesuai: ${JSON.stringify(t)}`);
    }
  });
});
