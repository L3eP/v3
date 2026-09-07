/**
 * Test — Sprint 3: dua cacat fungsional terbesar.
 *
 * cacat #2: ONU baru dari jalur PSB (draft otomatis saat PSB "Terpasang")
 * tidak pernah dicek SN unik/port bentrok — beda dengan jalur langsung di
 * routes/ftth.js. Juga: mengonfirmasi draft (PUT /api/ftth/:id {is_draft:
 * false}) tanpa mengirim ulang serial_number/parent_port melewati validasi
 * itu sama sekali, memakai nilai yang sudah TERSIMPAN.
 *
 * cacat #1: PSB yang jadi "Terpasang" lewat jalan pintas (tiket instalasinya
 * ditutup, lihat auto-sync di routes/tickets.js) melewati efek samping
 * inventory/FTTH sepenuhnya, dan sebelum perbaikan ini tidak ada cara untuk
 * melengkapinya belakangan.
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

describe('PSB→ONU: SN unik & port bentrok dicek sebelum draft dibuat (cacat #2, Sprint 3)', function () {
  this.timeout(20000);

  let ownerAgent;
  let inventoryId, psbId, oltId, odcId, odpId, otherDeviceId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  afterEach(async () => {
    if (psbId) { await ownerAgent.delete(`/api/psb/${psbId}`); psbId = null; }
    if (inventoryId) {
      await db.query('DELETE FROM inventory_log WHERE inventory_id = ?', [inventoryId]);
      await db.query('DELETE FROM inventory WHERE id = ?', [inventoryId]);
      inventoryId = null;
    }
    if (otherDeviceId) { await ownerAgent.delete(`/api/ftth/${otherDeviceId}`); otherDeviceId = null; }
    if (odpId) { await ownerAgent.delete(`/api/ftth/${odpId}`); odpId = null; }
    if (odcId) { await ownerAgent.delete(`/api/ftth/${odcId}`); odcId = null; }
    if (oltId) { await ownerAgent.delete(`/api/ftth/${oltId}`); oltId = null; }
  });

  it('SN yang sudah dipakai ONU lain HARUS menolak transisi (400), status & stok TIDAK berubah', async () => {
    const dupSn = `${TEST_TAG}SN_dup_${Date.now()}`;

    const deviceRes = await ownerAgent.post('/api/ftth').send({ type: 'onu', label: `${TEST_TAG}ONU_existing`, serial_number: dupSn });
    if (deviceRes.status !== 201) throw new Error(`Gagal buat ONU fixture: ${deviceRes.status} ${JSON.stringify(deviceRes.body)}`);
    otherDeviceId = deviceRes.body.device.id;

    const [invRes] = await db.query(
      "INSERT INTO inventory (device_type, device_name, total_stock, used_stock, created_by) VALUES ('ONU', ?, 5, 0, 'pfizer')",
      [`${TEST_TAG}ONU_stock_sn`]
    );
    inventoryId = invRes.insertId;

    const psbRes = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}pelanggan_sn`,
      address: `${TEST_TAG}alamat`,
      onuSn: dupSn,
    });
    if (psbRes.status !== 201) throw new Error(`Gagal buat PSB fixture: ${psbRes.status} ${JSON.stringify(psbRes.body)}`);
    psbId = psbRes.body.psb.id;

    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (res.status !== 400) throw new Error(`Expected 400 (SN bentrok), got ${res.status}: ${JSON.stringify(res.body)}`);
    if (!/SN/.test(res.body.message || '')) throw new Error(`Expected pesan menyebut SN, got: ${res.body.message}`);

    const [psbCheck] = await db.query('SELECT status, ftth_device_id FROM psb WHERE id = ?', [psbId]);
    if (psbCheck[0].status === 'Terpasang') throw new Error('Status PSB berubah padahal request ditolak');
    if (psbCheck[0].ftth_device_id) throw new Error('ftth_device_id ikut terisi padahal request ditolak');

    const [invCheck] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (invCheck[0].used_stock !== 0) throw new Error(`Stok ikut berkurang (${invCheck[0].used_stock}) padahal request ditolak`);
  });

  it('Port yang sudah dipakai ONU lain di ODP yang sama HARUS menolak transisi (400)', async () => {
    const oltLabel = `${TEST_TAG}OLT_port_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({ type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 8 });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status}`);
    oltId = oltRes.body.device.id;

    const odcLabel = `${TEST_TAG}ODC_port_${Date.now()}`;
    const odcRes = await ownerAgent.post('/api/ftth').send({ type: 'odc', label: odcLabel, group_name: oltLabel, total_ports: 8 });
    if (odcRes.status !== 201) throw new Error(`Gagal buat ODC fixture: ${odcRes.status}`);
    odcId = odcRes.body.device.id;

    const odpLabel = `${TEST_TAG}ODP_port_${Date.now()}`;
    const odpRes = await ownerAgent.post('/api/ftth').send({ type: 'odp', label: odpLabel, group_name: odcLabel, total_ports: 8 });
    if (odpRes.status !== 201) throw new Error(`Gagal buat ODP fixture: ${odpRes.status}`);
    odpId = odpRes.body.device.id;

    const deviceRes = await ownerAgent.post('/api/ftth').send({
      type: 'onu', label: `${TEST_TAG}ONU_di_port`, group_name: odpLabel, parent_port: 'Port 3'
    });
    if (deviceRes.status !== 201) throw new Error(`Gagal buat ONU fixture di port: ${deviceRes.status} ${JSON.stringify(deviceRes.body)}`);
    otherDeviceId = deviceRes.body.device.id;

    const [invRes] = await db.query(
      "INSERT INTO inventory (device_type, device_name, total_stock, used_stock, created_by) VALUES ('ONU', ?, 5, 0, 'pfizer')",
      [`${TEST_TAG}ONU_stock_port`]
    );
    inventoryId = invRes.insertId;

    const psbRes = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}pelanggan_port`,
      address: `${TEST_TAG}alamat`,
      odpLabel,
      onuPort: 'Port 3',
    });
    if (psbRes.status !== 201) throw new Error(`Gagal buat PSB fixture: ${psbRes.status} ${JSON.stringify(psbRes.body)}`);
    psbId = psbRes.body.psb.id;

    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (res.status !== 400) throw new Error(`Expected 400 (port bentrok), got ${res.status}: ${JSON.stringify(res.body)}`);
    if (!/Port/.test(res.body.message || '')) throw new Error(`Expected pesan menyebut Port, got: ${res.body.message}`);

    const [invCheck] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (invCheck[0].used_stock !== 0) throw new Error(`Stok ikut berkurang (${invCheck[0].used_stock}) padahal request ditolak`);
  });
});

describe('Konfirmasi draft ONU tetap dicek ulang walau field tidak dikirim ulang (cacat #2, Sprint 3)', function () {
  this.timeout(15000);

  let ownerAgent;
  let officialId, draftId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  afterEach(async () => {
    if (draftId) { await db.query('DELETE FROM ftth_devices WHERE id = ?', [draftId]); draftId = null; }
    if (officialId) { await ownerAgent.delete(`/api/ftth/${officialId}`); officialId = null; }
  });

  it('Draft dengan SN yang (belakangan) bentrok HARUS ditolak saat dikonfirmasi, walau serial_number tidak dikirim ulang', async () => {
    const sharedSn = `${TEST_TAG}SN_confirm_${Date.now()}`;

    const officialRes = await ownerAgent.post('/api/ftth').send({ type: 'onu', label: `${TEST_TAG}ONU_resmi`, serial_number: sharedSn });
    if (officialRes.status !== 201) throw new Error(`Gagal buat ONU resmi: ${officialRes.status}`);
    officialId = officialRes.body.device.id;

    // Draft ONU hanya bisa dibuat via routes/psb.js (POST /api/ftth tidak
    // menerima is_draft) — di sini disimulasikan langsung lewat DB, meniru
    // persis kondisi yang seharusnya sudah dicegah cacat #2 di jalur PSB,
    // supaya jalur konfirmasi di routes/ftth.js diuji sendiri.
    const [insertResult] = await db.query(
      `INSERT INTO ftth_devices (type, label, serial_number, is_draft) VALUES ('onu', ?, ?, TRUE)`,
      [`${TEST_TAG}ONU_draft_bentrok`, sharedSn]
    );
    draftId = insertResult.insertId;

    const res = await ownerAgent.put(`/api/ftth/${draftId}`).send({ is_draft: false });
    if (res.status !== 400) throw new Error(`Expected 400 (SN bentrok saat konfirmasi), got ${res.status}: ${JSON.stringify(res.body)}`);
    if (!/SN/.test(res.body.message || '')) throw new Error(`Expected pesan menyebut SN, got: ${res.body.message}`);

    const [check] = await db.query('SELECT is_draft FROM ftth_devices WHERE id = ?', [draftId]);
    if (!check[0].is_draft) throw new Error('is_draft berubah jadi 0 padahal konfirmasi ditolak');
  });
});

describe('PSB Terpasang lewat jalan pintas tiket bisa dilengkapi belakangan (cacat #1, Sprint 3)', function () {
  this.timeout(15000);

  let ownerAgent;
  let psbId, inventoryId, draftFtthId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  after(async () => {
    if (draftFtthId) await db.query('DELETE FROM ftth_devices WHERE id = ?', [draftFtthId]);
    if (inventoryId) {
      await db.query('DELETE FROM inventory_log WHERE inventory_id = ?', [inventoryId]);
      await db.query('DELETE FROM inventory WHERE id = ?', [inventoryId]);
    }
    if (psbId) await db.query('DELETE FROM psb WHERE id = ?', [psbId]);
  });

  it('PSB yang sudah Terpasang lewat jalan pintas (ftth_device_id NULL) bisa dilengkapi lewat PUT dengan inventoryId', async () => {
    const psbRes = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}pelanggan_shortcut`,
      address: `${TEST_TAG}alamat`,
      onuSn: `${TEST_TAG}SN_shortcut_${Date.now()}`,
    });
    if (psbRes.status !== 201) throw new Error(`Gagal buat PSB fixture: ${psbRes.status}`);
    psbId = psbRes.body.psb.id;

    // Meniru PERSIS efek samping auto-sync tiket→PSB di routes/tickets.js
    // (UPDATE psb SET status = 'Terpasang' ... , tanpa inventory/FTTH sama
    // sekali) — bukan menguji ulang alur tiketnya, tapi kondisi akhirnya.
    await db.query("UPDATE psb SET status = 'Terpasang' WHERE id = ?", [psbId]);

    const before = await ownerAgent.get(`/api/psb/${psbId}`);
    if (before.body.status !== 'Terpasang') throw new Error('Setup gagal: status belum Terpasang');
    if (before.body.ftth_device_id) throw new Error('Setup gagal: ftth_device_id seharusnya masih NULL (belum lengkap)');

    const [invRes] = await db.query(
      "INSERT INTO inventory (device_type, device_name, total_stock, used_stock, created_by) VALUES ('ONU', ?, 5, 0, 'pfizer')",
      [`${TEST_TAG}ONU_lengkapi`]
    );
    inventoryId = invRes.insertId;

    // Melengkapi: status yang dikirim SAMA (Terpasang), bukan transisi baru
    // — inilah persis yang sebelumnya tidak mungkin dilakukan (lihat
    // needsInventoryLink di routes/psb.js).
    const completeRes = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (completeRes.status !== 200) throw new Error(`Expected 200, got ${completeRes.status}: ${JSON.stringify(completeRes.body)}`);
    if (!completeRes.body.draftFtthId) throw new Error('Expected draftFtthId di response');
    draftFtthId = completeRes.body.draftFtthId;

    const [invCheck] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (invCheck[0].used_stock !== 1) throw new Error(`Expected used_stock=1, got ${invCheck[0].used_stock}`);

    const [psbCheck] = await db.query('SELECT ftth_device_id FROM psb WHERE id = ?', [psbId]);
    if (psbCheck[0].ftth_device_id !== draftFtthId) throw new Error('psb.ftth_device_id tidak tertaut ke draft yang baru dibuat');
  });

  it('memanggil PUT status Terpasang lagi setelah lengkap TIDAK BOLEH dobel-kurangi stok', async () => {
    const [beforeRows] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    const [afterRows] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (afterRows[0].used_stock !== beforeRows[0].used_stock) {
      throw new Error(`Stok berubah dari ${beforeRows[0].used_stock} ke ${afterRows[0].used_stock} — dobel-kurangi!`);
    }
  });
});
