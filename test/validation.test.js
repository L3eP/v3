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
