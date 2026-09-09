/**
 * Test — FTTH: port tidak boleh dobel-pakai
 *
 * Mengunci 2 bug yang sudah pernah ditemukan & diperbaiki sesi ini:
 *  1. POST /api/ftth menolak parent_port yang sudah dipakai device lain
 *     dengan type+group_name yang sama.
 *  2. PUT /api/ftth/:id — sebelumnya kalau parent_port dikirim TANPA
 *     group_name, pengecekan port bentrok di-skip sama sekali (device tetap
 *     tersimpan dengan port yang sudah dipakai device lain). Test ini
 *     mengunci supaya regresi itu tidak terulang.
 *
 * Lihat test/helpers/testApp.js untuk catatan isolasi database.
 */
const { buildTestApp, getAgentFor, TEST_TAG } = require('./helpers/testApp');

const app = buildTestApp();

describe('FTTH — port tidak boleh dobel-pakai', function () {
  this.timeout(20000);

  let ownerAgent;
  const created = { olt: null, odc: [] }; // id yang perlu dihapus di after()
  const oltLabel = `${TEST_TAG}OLT_${Date.now()}`;

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');

    const oltRes = await ownerAgent.post('/api/ftth').send({
      type: 'olt',
      label: oltLabel,
      brand: 'TestBrand',
      total_ports: 8,
    });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status} ${JSON.stringify(oltRes.body)}`);
    created.olt = oltRes.body.device.id;
  });

  after(async () => {
    // Hapus anak dulu (delete FTTH menolak kalau masih punya child), baru induk.
    for (const id of created.odc) {
      await ownerAgent.delete(`/api/ftth/${id}`);
    }
    if (created.olt) await ownerAgent.delete(`/api/ftth/${created.olt}`);
  });

  it('ODC pertama dengan Port 1 di bawah OLT ini HARUS diterima', async () => {
    const res = await ownerAgent.post('/api/ftth').send({
      type: 'odc',
      label: `${TEST_TAG}ODC_A_${Date.now()}`,
      group_name: oltLabel,
      parent_port: 'Port 1',
      total_ports: 8,
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    created.odc.push(res.body.device.id);
  });

  it('ODC KEDUA yang mencoba Port 1 sama di bawah OLT yang sama HARUS ditolak (POST)', async () => {
    const res = await ownerAgent.post('/api/ftth').send({
      type: 'odc',
      label: `${TEST_TAG}ODC_B_${Date.now()}`,
      group_name: oltLabel,
      parent_port: 'Port 1', // sengaja sama dengan ODC_A
      total_ports: 8,
    });
    if (res.status !== 400) {
      if (res.body?.device?.id) created.odc.push(res.body.device.id); // jangan sampai nyangkut kalau ternyata lolos
      throw new Error(`Expected 400 (port sudah dipakai), got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  it('ODC dengan Port 2 (beda port) di bawah OLT yang sama HARUS diterima', async () => {
    const res = await ownerAgent.post('/api/ftth').send({
      type: 'odc',
      label: `${TEST_TAG}ODC_C_${Date.now()}`,
      group_name: oltLabel,
      parent_port: 'Port 2',
      total_ports: 8,
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    created.odc.push(res.body.device.id);

    // Sekarang coba PUT device ini pindah ke Port 1 TANPA mengirim group_name
    // — ini persis skenario bug yang sudah diperbaiki: dulu pengecekan
    // bentrok di-skip total kalau group_name tidak disertakan di body PUT.
    const putRes = await ownerAgent.put(`/api/ftth/${res.body.device.id}`).send({
      parent_port: 'Port 1', // tanpa group_name
    });
    if (putRes.status !== 400) {
      throw new Error(`Expected 400 (PUT tanpa group_name masih harus cek bentrok port), got ${putRes.status}: ${JSON.stringify(putRes.body)}`);
    }
  });
});

describe('FTTH — available-ports tidak boleh mereservasi Port 1 untuk ODC/ODP (regresi off-by-one)', function () {
  this.timeout(20000);

  let ownerAgent;
  // Urutan hapus di after(): anak dulu, baru induk (delete FTTH menolak kalau masih ada child).
  const created = { odp: [], odc: [], olt: [] };

  before(async () => {
    ownerAgent = await getAgentFor(app, 'pfizer', 'test123');
  });

  after(async () => {
    for (const id of created.odp) await ownerAgent.delete(`/api/ftth/${id}`);
    for (const id of created.odc) await ownerAgent.delete(`/api/ftth/${id}`);
    for (const id of created.olt) await ownerAgent.delete(`/api/ftth/${id}`);
  });

  it('ODC parent baru tanpa anak ODP — Port 1 HARUS muncul di available, total 8 slot', async () => {
    const oltLabel = `${TEST_TAG}OLT_AP1_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({
      type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 8,
    });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status} ${JSON.stringify(oltRes.body)}`);
    created.olt.push(oltRes.body.device.id);

    const odcLabel = `${TEST_TAG}ODC_AP1_${Date.now()}`;
    const odcRes = await ownerAgent.post('/api/ftth').send({
      type: 'odc', label: odcLabel, group_name: oltLabel, parent_port: 'Port 1', total_ports: 8,
    });
    if (odcRes.status !== 201) throw new Error(`Gagal buat ODC fixture: ${odcRes.status} ${JSON.stringify(odcRes.body)}`);
    created.odc.push(odcRes.body.device.id);

    const res = await ownerAgent.get(`/api/ftth/available-ports?type=odp&parent=${encodeURIComponent(odcLabel)}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body.used !== 0) throw new Error(`Expected used=0, got ${res.body.used}`);
    if (res.body.available.length !== 8) {
      throw new Error(`Expected 8 available slots untuk ODC dengan total_ports=8, got ${res.body.available.length}: ${JSON.stringify(res.body.available)}`);
    }
    if (!res.body.available.some(p => p.port === 'Port 1')) {
      throw new Error(`Port 1 HARUS ada di available untuk parent ODC (regresi off-by-one): ${JSON.stringify(res.body.available)}`);
    }
  });

  it('ODP parent baru tanpa anak ONU — Port 1 HARUS muncul di available, total 8 slot', async () => {
    const oltLabel = `${TEST_TAG}OLT_AP2_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({
      type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 8,
    });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status} ${JSON.stringify(oltRes.body)}`);
    created.olt.push(oltRes.body.device.id);

    const odcLabel = `${TEST_TAG}ODC_AP2_${Date.now()}`;
    const odcRes = await ownerAgent.post('/api/ftth').send({
      type: 'odc', label: odcLabel, group_name: oltLabel, parent_port: 'Port 1', total_ports: 8,
    });
    if (odcRes.status !== 201) throw new Error(`Gagal buat ODC fixture: ${odcRes.status} ${JSON.stringify(odcRes.body)}`);
    created.odc.push(odcRes.body.device.id);

    const odpLabel = `${TEST_TAG}ODP_AP2_${Date.now()}`;
    const odpRes = await ownerAgent.post('/api/ftth').send({
      type: 'odp', label: odpLabel, group_name: odcLabel, parent_port: 'Port 1', total_ports: 8,
    });
    if (odpRes.status !== 201) throw new Error(`Gagal buat ODP fixture: ${odpRes.status} ${JSON.stringify(odpRes.body)}`);
    created.odp.push(odpRes.body.device.id);

    const res = await ownerAgent.get(`/api/ftth/available-ports?type=onu&parent=${encodeURIComponent(odpLabel)}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body.used !== 0) throw new Error(`Expected used=0, got ${res.body.used}`);
    if (res.body.available.length !== 8) {
      throw new Error(`Expected 8 available slots untuk ODP dengan total_ports=8, got ${res.body.available.length}: ${JSON.stringify(res.body.available)}`);
    }
    if (!res.body.available.some(p => p.port === 'Port 1')) {
      throw new Error(`Port 1 HARUS ada di available untuk parent ODP (regresi off-by-one): ${JSON.stringify(res.body.available)}`);
    }
  });

  it('OLT parent tanpa anak ODC — perilaku TIDAK berubah, tetap mulai dari Port 1 (guard regresi arah sebaliknya)', async () => {
    const oltLabel = `${TEST_TAG}OLT_AP3_${Date.now()}`;
    const oltRes = await ownerAgent.post('/api/ftth').send({
      type: 'olt', label: oltLabel, brand: 'TestBrand', total_ports: 4,
    });
    if (oltRes.status !== 201) throw new Error(`Gagal buat OLT fixture: ${oltRes.status} ${JSON.stringify(oltRes.body)}`);
    created.olt.push(oltRes.body.device.id);

    const res = await ownerAgent.get(`/api/ftth/available-ports?type=odc&parent=${encodeURIComponent(oltLabel)}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body.available.length !== 4) {
      throw new Error(`Expected 4 available slots untuk OLT dengan total_ports=4, got ${res.body.available.length}: ${JSON.stringify(res.body.available)}`);
    }
    if (!res.body.available.some(p => p.port === 'Port 1')) {
      throw new Error(`Port 1 HARUS tetap ada di available untuk parent OLT: ${JSON.stringify(res.body.available)}`);
    }
  });
});
