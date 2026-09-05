/**
 * Test — Fase 5: auto-PIC sadar sub_node, auto-decrement inventory saat PSB
 * Terpasang, draft entri ONU di FTTH yang perlu dikonfirmasi staf.
 *
 * Lihat test/helpers/testApp.js untuk catatan database (tidak ada DB test
 * terpisah — semua fixture di sini ditandai TEST_TAG dan dihapus di after()).
 */
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');
const db = require('../db');

const app = buildTestApp();

describe('Fase 5 — Auto-PIC sub_node', function () {
  this.timeout(15000);
  let ownerAgent;
  const TEST_SUBNODE = `${TEST_TAG}SubNodeX`;
  let originalSubNode;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    const [rows] = await db.query('SELECT default_sub_node FROM users WHERE username = ?', ['ijang1']);
    originalSubNode = rows[0].default_sub_node;
    await db.query('UPDATE users SET default_sub_node = ? WHERE username = ?', [TEST_SUBNODE, 'ijang1']);
  });

  after(async () => {
    await db.query('UPDATE users SET default_sub_node = ? WHERE username = ?', [originalSubNode, 'ijang1']);
  });

  it('tanpa subNode tetap balas PIC (fallback beban paling ringan)', async () => {
    const res = await ownerAgent.get('/api/auto-pic');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.pic) throw new Error('Expected a pic to be returned');
  });

  it('dengan subNode yang cocok default_sub_node ijang1 HARUS pilih ijang1', async () => {
    const res = await ownerAgent.get(`/api/auto-pic?subNode=${encodeURIComponent(TEST_SUBNODE)}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.body.pic !== 'ijang1') throw new Error(`Expected pic=ijang1, got ${res.body.pic}`);
    if (!res.body.matchedSubNode) throw new Error('Expected matchedSubNode=true');
  });

  it('dengan subNode yang TIDAK cocok siapapun HARUS tetap fallback (bukan kosong)', async () => {
    const res = await ownerAgent.get(`/api/auto-pic?subNode=${encodeURIComponent(TEST_TAG + 'TidakAda')}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.pic) throw new Error('Expected fallback pic, got none');
    if (res.body.matchedSubNode) throw new Error('Expected matchedSubNode=false (tidak ada yang cocok)');
  });
});

describe('Fase 5 — PSB Terpasang: auto-decrement inventory + draft ONU', function () {
  this.timeout(15000);
  let ownerAgent;
  let psbId, inventoryId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');

    const [invResult] = await db.query(
      "INSERT INTO inventory (device_type, device_name, total_stock, used_stock, created_by) VALUES ('ONU', ?, 5, 0, 'pfizer')",
      [`${TEST_TAG}ONU_TestDevice`]
    );
    inventoryId = invResult.insertId;

    const res = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}Customer`,
      address: `${TEST_TAG}Address`,
      onuSn: `${TEST_TAG}SN123`,
    });
    if (res.status !== 201) throw new Error(`Gagal buat PSB fixture: ${res.status} ${JSON.stringify(res.body)}`);
    psbId = res.body.psb.id;
  });

  after(async () => {
    await db.query("DELETE FROM ftth_devices WHERE label LIKE ?", [`${TEST_TAG}%`]);
    await db.query('DELETE FROM inventory_log WHERE inventory_id = ?', [inventoryId]);
    await db.query('DELETE FROM inventory WHERE id = ?', [inventoryId]);
    await db.query('DELETE FROM psb WHERE id = ?', [psbId]);
  });

  it('transisi ke Terpasang TANPA inventoryId HARUS ditolak (400)', async () => {
    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang' });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);

    const [rows] = await db.query('SELECT status FROM psb WHERE id = ?', [psbId]);
    if (rows[0].status === 'Terpasang') throw new Error('Status PSB berubah padahal request ditolak');
  });

  it('transisi ke Terpasang DENGAN inventoryId HARUS diterima: stok berkurang & draft ONU dibuat', async () => {
    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    if (!res.body.draftFtthId) throw new Error('Expected draftFtthId di response');

    const [invRows] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (invRows[0].used_stock !== 1) throw new Error(`Expected used_stock=1, got ${invRows[0].used_stock}`);

    const [logRows] = await db.query(
      "SELECT * FROM inventory_log WHERE inventory_id = ? AND reference_type = 'psb' AND reference_id = ?",
      [inventoryId, psbId]
    );
    if (logRows.length !== 1) throw new Error(`Expected 1 inventory_log entry, got ${logRows.length}`);

    const [ftthRows] = await db.query('SELECT * FROM ftth_devices WHERE id = ?', [res.body.draftFtthId]);
    if (ftthRows.length === 0) throw new Error('Draft ONU tidak ditemukan di ftth_devices');
    if (!ftthRows[0].is_draft) throw new Error('Expected is_draft = 1 pada entri baru');
    if (ftthRows[0].serial_number !== `${TEST_TAG}SN123`) throw new Error('SN pada draft ONU tidak cocok dengan PSB');

    // PSB dan ONU adalah entitas yang sama secara konsep — psb.ftth_device_id
    // harus tertaut ke draft ONU yang baru dibuat, bukan cuma teks di label.
    const [psbRows] = await db.query('SELECT ftth_device_id FROM psb WHERE id = ?', [psbId]);
    if (psbRows[0].ftth_device_id !== res.body.draftFtthId) {
      throw new Error(`Expected psb.ftth_device_id=${res.body.draftFtthId}, got ${psbRows[0].ftth_device_id}`);
    }
  });

  it('save ulang PSB yang SUDAH Terpasang tanpa ubah status TIDAK BOLEH decrement lagi', async () => {
    const [before] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ notes: `${TEST_TAG}update biasa` });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const [after] = await db.query('SELECT used_stock FROM inventory WHERE id = ?', [inventoryId]);
    if (after[0].used_stock !== before[0].used_stock) {
      throw new Error(`Stok berubah dari ${before[0].used_stock} ke ${after[0].used_stock} padahal status tidak berubah — double-decrement!`);
    }
  });

  it('konfirmasi draft ONU lewat PUT /api/ftth/:id {is_draft:false} HARUS berhasil', async () => {
    const [ftthRows] = await db.query('SELECT id FROM ftth_devices WHERE label LIKE ? AND is_draft = 1', [`${TEST_TAG}%`]);
    if (ftthRows.length === 0) throw new Error('Draft ONU tidak ditemukan untuk dikonfirmasi');
    const draftId = ftthRows[0].id;

    const res = await ownerAgent.put(`/api/ftth/${draftId}`).send({ is_draft: false });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

    const [check] = await db.query('SELECT is_draft FROM ftth_devices WHERE id = ?', [draftId]);
    if (check[0].is_draft) throw new Error('is_draft masih 1 setelah konfirmasi');
  });
});

describe('Fase 5 — PSB Terpasang: stok habis ditolak', function () {
  this.timeout(15000);
  let ownerAgent;
  let psbId, inventoryId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    const [invResult] = await db.query(
      "INSERT INTO inventory (device_type, device_name, total_stock, used_stock, created_by) VALUES ('ONU', ?, 1, 1, 'pfizer')",
      [`${TEST_TAG}ONU_Habis`]
    );
    inventoryId = invResult.insertId;
    const res = await ownerAgent.post('/api/psb').send({ customerName: `${TEST_TAG}Customer2`, address: `${TEST_TAG}Address2` });
    if (res.status !== 201) throw new Error(`Gagal buat PSB fixture: ${res.status}`);
    psbId = res.body.psb.id;
  });

  after(async () => {
    await db.query('DELETE FROM inventory WHERE id = ?', [inventoryId]);
    await db.query('DELETE FROM psb WHERE id = ?', [psbId]);
  });

  it('transisi ke Terpasang dengan stok item = 0 HARUS ditolak (400)', async () => {
    const res = await ownerAgent.put(`/api/psb/${psbId}`).send({ status: 'Terpasang', inventoryId });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
  });
});
