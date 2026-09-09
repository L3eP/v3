const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const { audit } = require('../middleware/audit');
const { mutationLimiter } = require('../middleware/rateLimits');
const { checkOnuConflicts } = require('../utils/ftthConflicts');

// 3.2 — Rate limiter mutasi per endpoint group
//
// SENGAJA dipasang per-route (bukan router.use(...) blanket) — lihat catatan
// yang sama di routes/users.js soal kenapa router.use(fn) tanpa path bocor
// menghitung request yang ditangani router lain (semua router di-mount di
// path yang sama, '/', lihat server.js).
const ftthMutationLimiter = mutationLimiter('ftth');

// Valid types untuk FTTH devices
const VALID_TYPES = ['olt', 'odc', 'odp', 'onu'];

// Helper map device type to label
const mapDevice = (row) => ({
  id: row.id,
  type: row.type,
  label: row.label,
  group: row.group_name,
  parentPort: row.parent_port,
  brand: row.brand,
  totalPorts: row.total_ports,
  serialNumber: row.serial_number,
  lat: row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null,
  lng: row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null,
  sortOrder: row.sort_order,
  isDraft: !!row.is_draft,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// GET /api/ftth — Ambil semua perangkat, grouped by type
router.get('/api/ftth', isAuthenticated, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM ftth_devices ORDER BY type, sort_order, label'
  );

  const grouped = {};
  rows.forEach(row => {
    if (!grouped[row.type]) grouped[row.type] = [];
    grouped[row.type].push(mapDevice(row));
  });

  // Hitung stat
  const stats = {};
  for (const type of VALID_TYPES) {
    stats[type] = (grouped[type] || []).length;
  }
  // Draft menunggu konfirmasi staf — dibuat otomatis dari PSB "Terpasang"
  // (lihat routes/psb.js). Staf perlu tahu ada berapa tanpa harus buka tab ONU.
  stats.draftCount = rows.filter(r => r.is_draft).length;

  res.json({ data: grouped, stats });
}));

// GET /api/ftth/available-ports — Port tersedia dari parent (HARUS sebelum :id)
router.get('/api/ftth/available-ports', isAuthenticated, asyncHandler(async (req, res) => {
  const { type, parent } = req.query;
  if (!type || !parent) return res.status(400).json({ message: 'Parameter type dan parent wajib diisi' });

  const VALID_CHILD_TYPES = { odc: 'olt', odp: 'odc', onu: 'odp' };
  const parentType = VALID_CHILD_TYPES[type];
  if (!parentType) return res.status(400).json({ message: 'Tipe device tidak valid. Harus: odc, odp, onu' });

  // Cari parent device
  const [parentDevices] = await db.query(
    'SELECT * FROM ftth_devices WHERE type = ? AND label = ?',
    [parentType, parent]
  );
  if (parentDevices.length === 0) return res.status(404).json({ message: `Parent "${parent}" tidak ditemukan` });

  const parentDevice = parentDevices[0];
  const totalPorts = parentDevice.total_ports || 0;

  if (totalPorts === 0) {
    return res.json({
      parent: { label: parent, type: parentType, totalPorts: 0 },
      used: 0,
      available: [],
      message: 'Parent tidak memiliki port (total_ports = 0)'
    });
  }

  // Ambil port yang sudah terpakai oleh child — HANYA tipe yang sama dengan
  // tipe yang sedang ditambahkan. Dulu tanpa filter type: ODC & ODP yang
  // punya group_name sama (mis. 'test') saling mengunci port miliknya sendiri,
  // sehingga ODP/ONU tidak bisa ditambahkan dari parent-nya.
  const [usedPorts] = await db.query(
    "SELECT parent_port FROM ftth_devices WHERE group_name = ? AND type = ? AND parent_port IS NOT NULL AND parent_port != ''",
    [parent, type]
  );
  const usedSet = new Set(usedPorts.map(p => p.parent_port));

  // Port tersedia untuk child:
  // total_ports HANYA menghitung port OUT/downstream yang bisa dipakai child —
  // koneksi uplink/IN device ke parent-nya sendiri adalah port fisik terpisah
  // yang TIDAK PERNAH disimpan/ditrack di field manapun (bukan total_ports+1,
  // bukan field lain) — sama sekali bukan bagian dari rentang port yang
  // dimodelkan di sini. Karena itu TIDAK ADA port yang perlu direservasi,
  // berlaku SAMA untuk OLT, ODC, maupun ODP: semua mulai dari Port 1.
  // (Bug lama, dikonfirmasi pemilik produk 2026-09-09: ODC/ODP salah mengira
  // Port 1 = uplink lalu direservasi, sehingga Port 1 hilang dari daftar
  // available padahal sebenarnya usable — kehilangan satu slot per device.
  // Perbaikan ini murni ke depan, tidak mengubah data total_ports lama.)
  // Port yang sudah terpakai child lain → TIDAK muncul.
  const startPort = 1;
  const available = [];
  for (let i = startPort; i <= totalPorts; i++) {
    const portName = `Port ${i}`;
    if (!usedSet.has(portName)) {
      available.push({ port: portName });
    }
  }

  res.json({
    parent: { label: parent, type: parentType, totalPorts },
    used: usedPorts.length,
    available,
    usedPorts: [...usedSet]
  });
}));

// GET /api/ftth/:id — Detail satu perangkat
router.get('/api/ftth/:id', isAuthenticated, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

  const [rows] = await db.query('SELECT * FROM ftth_devices WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ message: 'Device tidak ditemukan' });

  res.json(mapDevice(rows[0]));
}));

// POST /api/ftth — Tambah perangkat baru (Owner only)
router.post('/api/ftth', isAuthenticated, ftthMutationLimiter, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const { type, label, group_name, parent_port, brand, total_ports, serial_number, latitude, longitude, sort_order } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ message: 'Tipe device tidak valid. Harus: olt, odc, odp, onu' });
  }
  if (!label || !label.trim()) {
    return res.status(400).json({ message: 'Label wajib diisi' });
  }

  // Validasi spesifik per tipe
  if (type === 'olt') {
    if (!brand || !brand.trim()) return res.status(400).json({ message: 'Brand OLT wajib diisi' });
    if (!total_ports || parseInt(total_ports) < 1) return res.status(400).json({ message: 'Total port OLT wajib diisi (min 1)' });
  }

  if (type === 'onu') {
    // Cek unique SN & port bentrok lewat fungsi bersama (cacat #2, Sprint 3)
    // — dipakai juga oleh routes/psb.js untuk draft ONU dan oleh PUT di bawah
    // untuk konfirmasi draft, supaya aturannya persis sama di ketiga jalur.
    const conflictMsg = await checkOnuConflicts(db, {
      serialNumber: serial_number || null,
      groupName: group_name || null,
      parentPort: parent_port || null,
      excludeId: 0
    });
    if (conflictMsg) return res.status(400).json({ message: conflictMsg });
  }

  // Validasi parent port tidak duplikat (untuk ODC, ODP — ONU sudah dicek
  // di atas lewat checkOnuConflicts). Filter type child → SAMPAH di grup
  // yang sama di level lain tidak dianggap konflik.
  if (parent_port && group_name && type !== 'olt' && type !== 'onu') {
    const [conflict] = await db.query(
      'SELECT id, label FROM ftth_devices WHERE group_name = ? AND type = ? AND parent_port = ?',
      [group_name, type, parent_port]
    );
    if (conflict.length > 0) {
      return res.status(400).json({
        message: `Port "${parent_port}" pada "${group_name}" sudah dipakai oleh ${conflict[0].label}`
      });
    }
  }

  // Validasi geografis
  let lat = null, lng = null;
  if (latitude !== undefined && latitude !== '') {
    lat = parseFloat(latitude);
    if (isNaN(lat)) return res.status(400).json({ message: 'Latitude tidak valid' });
  }
  if (longitude !== undefined && longitude !== '') {
    lng = parseFloat(longitude);
    if (isNaN(lng)) return res.status(400).json({ message: 'Longitude tidak valid' });
  }

  let result;
  try {
    [result] = await db.query(
      `INSERT INTO ftth_devices (type, label, group_name, parent_port, brand, total_ports, serial_number, latitude, longitude, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        label.trim(),
        group_name || null,
        parent_port || null,
        type === 'olt' ? brand.trim() : (brand || null),
        type !== 'onu' ? (parseInt(total_ports) || 0) : 0,
        type === 'onu' ? (serial_number || null) : null,
        lat, lng,
        sort_order || 0
      ]
    );
  } catch (dbErr) {
    if (dbErr && dbErr.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: `Device "${label.trim()}" sudah ada pada grup ini` });
    }
    throw dbErr;
  }

  const [newDevice] = await db.query('SELECT * FROM ftth_devices WHERE id = ?', [result.insertId]);
  audit(req, 'CREATE', 'ftth', result.insertId, { type, label: label.trim() });
  res.status(201).json({ message: 'Device berhasil ditambahkan', device: mapDevice(newDevice[0]) });
}));

// PUT /api/ftth/:id — Update perangkat (Owner only)
router.put('/api/ftth/:id', isAuthenticated, ftthMutationLimiter, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

  const { label, group_name, parent_port, brand, total_ports, serial_number, latitude, longitude, sort_order, is_draft } = req.body;
  if (label !== undefined && typeof label !== 'string') {
    return res.status(400).json({ message: 'Label tidak valid' });
  }
  if (label !== undefined && !label.trim()) {
    return res.status(400).json({ message: 'Label wajib diisi' });
  }

  const [existing] = await db.query('SELECT * FROM ftth_devices WHERE id = ?', [id]);
  if (existing.length === 0) return res.status(404).json({ message: 'Device tidak ditemukan' });
  const device = existing[0];

  const updates = [];
  const params = [];

  if (label !== undefined) { updates.push('label = ?'); params.push(label.trim()); }
  if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name || null); }
  if (brand !== undefined) { updates.push('brand = ?'); params.push(brand || null); }
  if (total_ports !== undefined) { updates.push('total_ports = ?'); params.push(parseInt(total_ports) || 0); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  // Konfirmasi draft (dari auto-entry PSB "Terpasang") — cuma bisa maju dari
  // draft ke resmi, staf tidak perlu (dan tidak seharusnya) menandai balik
  // device yang sudah resmi jadi draft lagi lewat field ini.
  const confirmingDraft = is_draft !== undefined && device.is_draft && !is_draft;
  if (confirmingDraft) {
    updates.push('is_draft = ?'); params.push(false);
  }

  // Cacat #2, Sprint 3 — SN unik & port-bentrok untuk ONU. Draft ONU yang
  // dibuat otomatis dari PSB "Terpasang" (routes/psb.js) sekarang sudah
  // dicek saat draft itu dibuat, tapi tetap dicek ULANG di sini terhadap
  // nilai yang benar-benar akan tersimpan — baik saat serial_number/
  // parent_port dikirim ulang di request ini, MAUPUN (celah sebelumnya)
  // saat staf mengonfirmasi draft TANPA mengirim ulang field-nya sama
  // sekali, memakai nilai yang sudah tersimpan di database. Tanpa ini,
  // konfirmasi draft yang kebetulan bentrok bisa lolos begitu saja jadi
  // data resmi.
  if (device.type === 'onu' && (serial_number !== undefined || parent_port !== undefined || confirmingDraft)) {
    const effectiveGroup = group_name !== undefined ? (group_name || null) : device.group_name;
    const effectiveSerial = serial_number !== undefined ? (serial_number || null) : device.serial_number;
    const effectivePort = parent_port !== undefined ? (parent_port || null) : device.parent_port;
    const conflictMsg = await checkOnuConflicts(db, {
      serialNumber: effectiveSerial,
      groupName: effectiveGroup,
      parentPort: effectivePort,
      excludeId: id
    });
    if (conflictMsg) return res.status(400).json({ message: conflictMsg });
  }

  if (serial_number !== undefined && device.type === 'onu') {
    updates.push('serial_number = ?'); params.push(serial_number || null);
  }

  // Validasi parent port tidak duplikat untuk ODC/ODP — HARUS pakai
  // group_name efektif (request baru ATAU group_name device saat ini jika
  // tidak dikirim), kalau tidak: kirim parent_port tanpa group_name lolos
  // tanpa dicek sama sekali tapi tetap ditulis → dua device bisa dobel-pakai
  // port yang sama. ONU sudah dicek di atas lewat checkOnuConflicts
  // (termasuk kasus konfirmasi draft tanpa resend).
  if (parent_port !== undefined) {
    if (device.type !== 'onu') {
      const effectiveGroup = group_name !== undefined ? (group_name || null) : device.group_name;
      if (parent_port && effectiveGroup) {
        const [conflict] = await db.query(
          'SELECT id, label FROM ftth_devices WHERE group_name = ? AND type = ? AND parent_port = ? AND id != ?',
          [effectiveGroup, device.type, parent_port, id]
        );
        if (conflict.length > 0) {
          return res.status(400).json({
            message: `Port "${parent_port}" sudah dipakai oleh ${conflict[0].label}`
          });
        }
      }
    }
    updates.push('parent_port = ?');
    params.push(parent_port || null);
  }

  // Latitude/longitude
  if (latitude !== undefined) {
    const lat = latitude !== '' ? parseFloat(latitude) : null;
    if (latitude !== '' && isNaN(lat)) return res.status(400).json({ message: 'Latitude tidak valid' });
    updates.push('latitude = ?'); params.push(lat);
  }
  if (longitude !== undefined) {
    const lng = longitude !== '' ? parseFloat(longitude) : null;
    if (longitude !== '' && isNaN(lng)) return res.status(400).json({ message: 'Longitude tidak valid' });
    updates.push('longitude = ?'); params.push(lng);
  }

  if (updates.length === 0) return res.status(400).json({ message: 'Tidak ada field yang diubah' });

  params.push(id);

  // Hierarki FTTH berbasis label: group_name anak = label persis milik parent.
  // Jika label berubah dan device ini punya anak, WAJIB update group_name semua
  // anak dalam transaksi yang sama — kalau tidak, seluruh subtree "lepas" dari
  // tree (hilang dari admin.html) dan parent yang baru di-rename jadi terlihat
  // tanpa child sehingga bisa dihapus padahal subtree-nya masih ada.
  const labelChanged = label !== undefined && label.trim() !== device.label;
  const connection = await db.getConnection();
  let updatedDevice;
  try {
    await connection.beginTransaction();
    try {
      await connection.query(`UPDATE ftth_devices SET ${updates.join(', ')} WHERE id = ?`, params);
    } catch (dbErr) {
      if (dbErr && dbErr.code === 'ER_DUP_ENTRY') {
        await connection.rollback();
        return res.status(400).json({ message: 'Device dengan type/label/group yang sama sudah ada' });
      }
      throw dbErr;
    }
    if (labelChanged) {
      await connection.query(
        'UPDATE ftth_devices SET group_name = ? WHERE group_name = ?',
        [label.trim(), device.label]
      );
      // Cacat #5 — rename ODC/ODP sebelumnya cuma membetulkan pohon FTTH
      // sendiri (di atas); tiket/PSB lama yang sudah menyimpan teksnya
      // sebagai snapshot tetap diam-diam menunjuk nama lama yang sudah
      // tidak ada. tickets.ftth_odc_id/ftth_odp_id dan psb.ftth_odp_id
      // (diisi otomatis saat teksnya ditulis, lihat routes/tickets.js &
      // routes/psb.js) yang dipakai di sini untuk menemukan baris mana
      // yang perlu ikut dibetulkan — bukan menebak dari teks lama.
      if (device.type === 'odc') {
        await connection.query('UPDATE tickets SET odc = ? WHERE ftth_odc_id = ?', [label.trim(), id]);
      } else if (device.type === 'odp') {
        await connection.query('UPDATE tickets SET odp = ? WHERE ftth_odp_id = ?', [label.trim(), id]);
        await connection.query('UPDATE psb SET odp_label = ? WHERE ftth_odp_id = ?', [label.trim(), id]);
      }
    }
    const [updatedRows] = await connection.query('SELECT * FROM ftth_devices WHERE id = ?', [id]);
    updatedDevice = updatedRows[0];
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  audit(req, 'UPDATE', 'ftth', id, { label: updatedDevice.label, type: updatedDevice.type });
  res.json({ message: 'Device berhasil diupdate', device: mapDevice(updatedDevice) });
}));

// DELETE /api/ftth/:id — Hapus perangkat (Owner only), dengan cascade check
router.delete('/api/ftth/:id', isAuthenticated, ftthMutationLimiter, isAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

  const [device] = await db.query('SELECT * FROM ftth_devices WHERE id = ?', [id]);
  if (device.length === 0) return res.status(404).json({ message: 'Device tidak ditemukan' });

  // Cek apakah punya child — tolak jika masih ada
  const [children] = await db.query(
    'SELECT type, label FROM ftth_devices WHERE group_name = ?',
    [device[0].label]
  );
  if (children.length > 0) {
    return res.status(400).json({
      message: `Tidak bisa menghapus "${device[0].label}". ${children.length} child masih terdaftar: ${children.map(c => `${c.type}: ${c.label}`).join(', ')}`
    });
  }

  await db.query('DELETE FROM ftth_devices WHERE id = ?', [id]);

  logger.warn('FTTH device deleted', { id, type: device[0].type, label: device[0].label, by: req.session.user.username });
  audit(req, 'DELETE', 'ftth', id, { type: device[0].type, label: device[0].label });

  res.json({ message: 'Device berhasil dihapus' });
}));

module.exports = router;
