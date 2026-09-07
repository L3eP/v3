/**
 * Test — Validasi rujukan yang sebelumnya hilang (cacat #3 & #4, Sprint 1)
 *
 * Empat field yang sebelumnya bisa diisi APA SAJA tanpa dicek keberadaannya:
 * tickets.odp, psb.odp_label, users.default_sub_node, inventory.device_type.
 * Test ini membuktikan validasinya benar-benar menolak nilai sampah — bukan
 * cuma "kelihatan benar" di kode.
 *
 * Lihat test/helpers/testApp.js untuk catatan penting soal test ini jalan
 * langsung ke database asli — fixture ditandai TEST_TAG dan dihapus lagi.
 *
 * Cara jalan: npm test
 */
// PENTING: testApp harus di-require DULUAN — dia yang men-load dotenv.
// db.js membuat connection pool langsung saat pertama kali di-require pakai
// process.env saat itu juga; require duluan = pool keburu dibuat dengan
// kredensial kosong (lihat catatan yang sama di test/tickets.test.js).
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');
const db = require('../db');

const app = buildTestApp();

describe('Validasi rujukan yang sebelumnya hilang', function () {
  this.timeout(15000);

  let ownerAgent;
  let ijang1OriginalSubNode;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
    // Test terakhir di file ini mengubah default_sub_node ijang1 lewat API
    // sungguhan (bukan query langsung) — simpan nilai aslinya dulu supaya
    // bisa dikembalikan, jangan sampai fixture bersama ini nyangkut berubah
    // permanen (pola sama seperti test/fase5.test.js).
    const [rows] = await db.query('SELECT default_sub_node FROM users WHERE username = ?', ['ijang1']);
    ijang1OriginalSubNode = rows[0]?.default_sub_node ?? null;
  });

  after(async () => {
    await db.query('UPDATE users SET default_sub_node = ? WHERE username = ?', [ijang1OriginalSubNode, 'ijang1']);
  });

  it('POST /tickets: ODP yang tidak ada di ftth_devices HARUS ditolak (400)', async () => {
    const res = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}odp-invalid`,
      odp: `${TEST_TAG}odp-tidak-ada`,
      createdBy: 'pfizer',
    });
    if (res.status !== 400) throw new Error(`Expected 400 (ODP tidak valid), got ${res.status}: ${JSON.stringify(res.body)}`);
    // Jangan sampai nyangkut kalau ada bug lain yang lolos-tolak tapi tetap ke-insert
    if (res.body?.ticket?.id) await ownerAgent.delete(`/tickets/${res.body.ticket.id}`);
  });

  it('POST /api/psb: ODP label yang tidak ada di ftth_devices HARUS ditolak (400)', async () => {
    const res = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}pelanggan`,
      address: `${TEST_TAG}alamat`,
      odpLabel: `${TEST_TAG}odp-tidak-ada`,
    });
    if (res.status !== 400) throw new Error(`Expected 400 (ODP tidak valid), got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body?.psb?.id) await ownerAgent.delete(`/api/psb/${res.body.psb.id}`);
  });

  it('POST /api/inventory: device type yang tidak ada di reference_options HARUS ditolak (400)', async () => {
    const res = await ownerAgent.post('/api/inventory').send({
      deviceType: `${TEST_TAG}tipe-tidak-ada`,
      deviceName: `${TEST_TAG}perangkat`,
      totalStock: 5,
    });
    if (res.status !== 400) throw new Error(`Expected 400 (device type tidak valid), got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body?.item?.id) {
      // Endpoint ini tidak punya DELETE khusus test cleanup — hapus langsung
      // via query kalau ternyata lolos (seharusnya tidak pernah terjadi).
      const db = require('../db');
      await db.query('DELETE FROM inventory WHERE id = ?', [res.body.item.id]);
    }
  });

  it('POST /admin/users/update: wilayah (sub-node) yang tidak ada di reference_options HARUS ditolak (400)', async () => {
    const res = await ownerAgent.post('/admin/users/update').send({
      originalUsername: 'ijang1',
      defaultSubNode: `${TEST_TAG}wilayah-tidak-ada`,
    });
    if (res.status !== 400) throw new Error(`Expected 400 (wilayah tidak valid), got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('POST /admin/users/update: wilayah (sub-node) yang SUDAH ADA HARUS diterima', async () => {
    // 'ANJ' diseed lewat scripts/add_reference_table.sql — sama yang dipakai CI,
    // jadi aman dijalankan di lingkungan mana pun tanpa seed tambahan.
    const res = await ownerAgent.post('/admin/users/update').send({
      originalUsername: 'ijang1',
      defaultSubNode: 'ANJ',
    });
    if (res.status !== 200) throw new Error(`Expected 200 (wilayah valid), got ${res.status}: ${JSON.stringify(res.body)}`);
  });
});

describe('Proteksi hapus Referensi yang masih dipakai (cacat #6, Sprint 2)', function () {
  this.timeout(15000);

  let ownerAgent;
  let refId;
  let ticketId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  afterEach(async () => {
    if (ticketId) { await ownerAgent.delete(`/tickets/${ticketId}`); ticketId = null; }
    if (refId) { await ownerAgent.delete(`/api/references/${refId}`); refId = null; }
  });

  it('DELETE reference yang masih dipakai tiket HARUS ditolak (400)', async () => {
    const refRes = await ownerAgent.post('/api/references').send({ type: 'aktifitas', label: `${TEST_TAG}aktifitas-dipakai` });
    if (refRes.status !== 201) throw new Error(`Gagal buat fixture reference: ${refRes.status} ${JSON.stringify(refRes.body)}`);
    refId = refRes.body.id;

    const ticketRes = await ownerAgent.post('/tickets').send({
      aktifitas: `${TEST_TAG}aktifitas-dipakai`,
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}ref-in-use`,
      createdBy: 'pfizer',
    });
    if (ticketRes.status !== 201) throw new Error(`Gagal buat tiket fixture: ${ticketRes.status} ${JSON.stringify(ticketRes.body)}`);
    ticketId = ticketRes.body.ticket.id;

    const delRes = await ownerAgent.delete(`/api/references/${refId}`);
    if (delRes.status !== 400) throw new Error(`Expected 400 (masih dipakai), got ${delRes.status}: ${JSON.stringify(delRes.body)}`);

    // Buktikan reference-nya BENAR-BENAR belum terhapus — cek langsung ke DB,
    // bukan lewat re-create (group_name NULL tidak kena UNIQUE constraint di
    // MySQL, jadi re-create bukan bukti yang valid kalau baris asli masih ada).
    const [[stillThere]] = await db.query('SELECT id FROM reference_options WHERE id = ?', [refId]);
    if (!stillThere) throw new Error('Reference sudah terhapus dari database padahal seharusnya diblokir');
  });

  it('DELETE reference yang TIDAK dipakai HARUS tetap berhasil', async () => {
    const refRes = await ownerAgent.post('/api/references').send({ type: 'aktifitas', label: `${TEST_TAG}aktifitas-tak-dipakai` });
    if (refRes.status !== 201) throw new Error(`Gagal buat fixture reference: ${refRes.status} ${JSON.stringify(refRes.body)}`);
    const id = refRes.body.id;

    const delRes = await ownerAgent.delete(`/api/references/${id}`);
    if (delRes.status !== 200) throw new Error(`Expected 200 (tidak dipakai, boleh dihapus), got ${delRes.status}: ${JSON.stringify(delRes.body)}`);
  });
});

describe('Rename ODC/ODP mencascade ke tiket & PSB lama (cacat #5, Sprint 2)', function () {
  this.timeout(20000);

  let ownerAgent;
  let oltId, odcId, odpId, ticketId, psbId;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  // afterEach, BUKAN after — dua test di bawah masing-masing bikin OLT/ODC
  // sendiri pakai variabel yang sama; kalau cleanup cuma sekali di akhir,
  // fixture test pertama nyangkut ketimpa variabel test kedua sebelum sempat
  // dihapus.
  afterEach(async () => {
    if (ticketId) { await ownerAgent.delete(`/tickets/${ticketId}`); ticketId = null; }
    if (psbId) { await ownerAgent.delete(`/api/psb/${psbId}`); psbId = null; }
    if (odpId) { await ownerAgent.delete(`/api/ftth/${odpId}`); odpId = null; }
    if (odcId) { await ownerAgent.delete(`/api/ftth/${odcId}`); odcId = null; }
    if (oltId) { await ownerAgent.delete(`/api/ftth/${oltId}`); oltId = null; }
  });

  it('Rename ODC HARUS ikut membetulkan teks odc di tiket lama yang menunjuknya', async () => {
    const oltLabel = `${TEST_TAG}OLT_rename_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({ type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 8 });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status} ${JSON.stringify(oltRes.body)}`);
    oltId = oltRes.body.device.id;

    const odcLabelOld = `${TEST_TAG}ODC_lama_${Date.now()}`;
    const odcRes = await ownerAgent.post('/api/ftth').send({ type: 'odc', label: odcLabelOld, group_name: oltLabel, total_ports: 8 });
    if (odcRes.status !== 201) throw new Error(`Gagal buat ODC fixture: ${odcRes.status} ${JSON.stringify(odcRes.body)}`);
    odcId = odcRes.body.device.id;

    const ticketRes = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      odc: odcLabelOld,
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}rename-cascade`,
      createdBy: 'pfizer',
    });
    if (ticketRes.status !== 201) throw new Error(`Gagal buat tiket fixture: ${ticketRes.status} ${JSON.stringify(ticketRes.body)}`);
    ticketId = ticketRes.body.ticket.id;

    const odcLabelNew = `${TEST_TAG}ODC_baru_${Date.now()}`;
    const renameRes = await ownerAgent.put(`/api/ftth/${odcId}`).send({ label: odcLabelNew });
    if (renameRes.status !== 200) throw new Error(`Gagal rename ODC: ${renameRes.status} ${JSON.stringify(renameRes.body)}`);

    const check = await ownerAgent.get(`/tickets/${ticketId}`);
    if (check.body.odc !== odcLabelNew) {
      throw new Error(`Expected tiket.odc = "${odcLabelNew}" (ikut cascade), got "${check.body.odc}" — masih menunjuk nama lama`);
    }
  });

  it('Rename ODP HARUS ikut membetulkan teks odp di tiket DAN odp_label di PSB lama', async () => {
    const oltLabel = `${TEST_TAG}OLT_rename2_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({ type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 8 });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status}`);
    oltId = oltRes.body.device.id;

    const odcLabel = `${TEST_TAG}ODC_utk_odp_${Date.now()}`;
    const odcRes = await ownerAgent.post('/api/ftth').send({ type: 'odc', label: odcLabel, group_name: oltLabel, total_ports: 8 });
    if (odcRes.status !== 201) throw new Error(`Gagal buat ODC fixture: ${odcRes.status}`);
    odcId = odcRes.body.device.id;

    const odpLabelOld = `${TEST_TAG}ODP_lama_${Date.now()}`;
    const odpRes = await ownerAgent.post('/api/ftth').send({ type: 'odp', label: odpLabelOld, group_name: odcLabel, total_ports: 8 });
    if (odpRes.status !== 201) throw new Error(`Gagal buat ODP fixture: ${odpRes.status}`);
    odpId = odpRes.body.device.id;

    const ticketRes = await ownerAgent.post('/tickets').send({
      aktifitas: 'Maintenance',
      odp: odpLabelOld,
      lokasi: `${TEST_TAG}lokasi`,
      pic: 'pfizer',
      priority: 'Low',
      info: `${TEST_TAG}rename-cascade-odp`,
      createdBy: 'pfizer',
    });
    if (ticketRes.status !== 201) throw new Error(`Gagal buat tiket fixture: ${ticketRes.status} ${JSON.stringify(ticketRes.body)}`);
    ticketId = ticketRes.body.ticket.id;

    const psbRes = await ownerAgent.post('/api/psb').send({
      customerName: `${TEST_TAG}pelanggan-rename`,
      address: `${TEST_TAG}alamat`,
      odpLabel: odpLabelOld,
    });
    if (psbRes.status !== 201) throw new Error(`Gagal buat PSB fixture: ${psbRes.status} ${JSON.stringify(psbRes.body)}`);
    psbId = psbRes.body.psb.id;

    const odpLabelNew = `${TEST_TAG}ODP_baru_${Date.now()}`;
    const renameRes = await ownerAgent.put(`/api/ftth/${odpId}`).send({ label: odpLabelNew });
    if (renameRes.status !== 200) throw new Error(`Gagal rename ODP: ${renameRes.status} ${JSON.stringify(renameRes.body)}`);

    const ticketCheck = await ownerAgent.get(`/tickets/${ticketId}`);
    if (ticketCheck.body.odp !== odpLabelNew) {
      throw new Error(`Expected tiket.odp = "${odpLabelNew}", got "${ticketCheck.body.odp}"`);
    }
    const psbCheck = await ownerAgent.get(`/api/psb/${psbId}`);
    if (psbCheck.body.odp_label !== odpLabelNew) {
      throw new Error(`Expected psb.odp_label = "${odpLabelNew}", got "${psbCheck.body.odp_label}"`);
    }
  });
});
