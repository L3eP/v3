const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../middleware/asyncHandler');
const { sanitizePhone } = require('../utils/phone');
const logger = require('../utils/logger');
const { audit } = require('../middleware/audit');
const { cleanupUploadOnError } = require('../utils/uploads');
const { checkOnuConflicts } = require('../utils/ftthConflicts');

const { mutationLimiter } = require('../middleware/rateLimits');

// 3.2 — Rate limiter mutasi per endpoint group
//
// SENGAJA dipasang per-route (bukan router.use(...) blanket) — lihat catatan
// yang sama di routes/users.js soal kenapa router.use(fn) tanpa path bocor
// menghitung request yang ditangani router lain (semua router di-mount di
// path yang sama, '/', lihat server.js).
const psbMutationLimiter = mutationLimiter('psb');

const VALID_PSB_STATUS = ['Terdaftar', 'Terpasang', 'Aktif', 'Batal'];

// psb.odp_label sebelumnya tidak pernah dicek keberadaannya sama sekali —
// bisa diisi nama yang tidak pernah ada di ftth_devices. Cermin dari
// validateRef('odp', ...) di routes/tickets.js, cuma untuk tabel ini.
async function validateOdpLabel(label) {
  if (!label) return true; // opsional
  const [rows] = await db.query("SELECT id FROM ftth_devices WHERE type = 'odp' AND label = ?", [label]);
  return rows.length > 0;
}

// Tautan tahan-rename (cacat #5) — dipanggil terpisah dari validateOdpLabel()
// di titik penulisan, cermin lookupFtthDeviceId() di routes/tickets.js.
async function lookupOdpId(label) {
  if (!label) return null;
  const [rows] = await db.query("SELECT id FROM ftth_devices WHERE type = 'odp' AND label = ?", [label]);
  return rows.length > 0 ? rows[0].id : null;
}

// GET /api/psb — List semua PSB (terbaru di atas)
router.get('/api/psb', isAuthenticated, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM psb ORDER BY created_at DESC'
  );
  res.json(rows);
}));

// GET /api/psb/:id — Detail satu PSB
router.get('/api/psb/:id', isAuthenticated, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM psb WHERE id = ?', [parseInt(req.params.id)]);
  if (rows.length === 0) return res.status(404).json({ message: 'PSB not found' });
  res.json(rows[0]);
}));

// POST /api/psb — Buat PSB baru (semua role)
router.post('/api/psb', isAuthenticated, psbMutationLimiter, upload.single('photo'), asyncHandler(async (req, res) => {
  const { customerName, address, phone, onuSn, latitude, longitude, odpLabel, onuPort, notes } = req.body;

  if (!customerName || !customerName.trim()) {
    return res.status(400).json({ message: 'Nama pelanggan wajib diisi' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ message: 'Alamat wajib diisi' });
  }
  if (odpLabel && !(await validateOdpLabel(odpLabel))) {
    cleanupUploadOnError(req);
    return res.status(400).json({ message: 'ODP tidak valid' });
  }

  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  // Standarisasi nomor telepon ke format 62xx — konsisten dengan users (auth.js/
  // users.js). Sebelumnya nomor disimpan mentah apa adanya dari input pelanggan.
  const standardPhone = phone ? (sanitizePhone(phone) || phone) : null;
  // Tautan tahan-rename (cacat #5) — lihat komentar lookupOdpId() di atas.
  const ftthOdpId = await lookupOdpId(odpLabel);

  let result;
  try {
    [result] = await db.query(
      `INSERT INTO psb (customer_name, address, phone, onu_sn, latitude, longitude, odp_label, ftth_odp_id, onu_port, photo, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerName.trim(),
        address.trim(),
        standardPhone,
        onuSn || null,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        odpLabel || null,
        ftthOdpId,
        onuPort || null,
        photo,
        notes || null,
        req.session.user.username
      ]
    );
  } catch (err) {
    cleanupUploadOnError(req);
    throw err;
  }

  const [newPsb] = await db.query('SELECT * FROM psb WHERE id = ?', [result.insertId]);
  audit(req, 'CREATE', 'psb', result.insertId, { customerName: customerName.trim() });
  res.status(201).json({ message: 'PSB berhasil didaftarkan', psb: newPsb[0] });
}));

// PUT /api/psb/:id — Update PSB (Owner/Operator only)
router.put('/api/psb/:id', isAuthenticated, psbMutationLimiter, isOwnerOrOperator, upload.single('photo'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { customerName, address, phone, onuSn, latitude, longitude, odpLabel, onuPort, notes, status, inventoryId } = req.body;

  // Transaksi + SELECT...FOR UPDATE: instalasi (PSB->Terpasang) memicu efek
  // samping nyata (kurangi stok inventory, buat draft ONU di FTTH) yang HARUS
  // hanya terjadi SEKALI per transisi sungguhan, bukan tiap kali PSB yang
  // sudah Terpasang di-save ulang (mis. Owner cuma perbaiki nama pelanggan).
  const connection = await db.getConnection();
  let updatedPsb, draftFtthId = null;
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query('SELECT * FROM psb WHERE id = ? FOR UPDATE', [id]);
    if (existingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'PSB not found' });
    }
    const existing = existingRows[0];

    const updates = [];
    const params = [];

    if (customerName !== undefined) { updates.push('customer_name = ?'); params.push(customerName); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone ? (sanitizePhone(phone) || phone) : null); }
    if (onuSn !== undefined) { updates.push('onu_sn = ?'); params.push(onuSn || null); }
    if (latitude !== undefined) {
      const lat = latitude !== '' ? parseFloat(latitude) : null;
      if (latitude !== '' && isNaN(lat)) { await connection.rollback(); return res.status(400).json({ message: 'Latitude tidak valid' }); }
      updates.push('latitude = ?'); params.push(lat);
    }
    if (longitude !== undefined) {
      const lng = longitude !== '' ? parseFloat(longitude) : null;
      if (longitude !== '' && isNaN(lng)) { await connection.rollback(); return res.status(400).json({ message: 'Longitude tidak valid' }); }
      updates.push('longitude = ?'); params.push(lng);
    }
    if (odpLabel !== undefined) {
      if (odpLabel && !(await validateOdpLabel(odpLabel))) {
        await connection.rollback();
        return res.status(400).json({ message: 'ODP tidak valid' });
      }
      updates.push('odp_label = ?'); params.push(odpLabel || null);
      // Tautan tahan-rename (cacat #5) — ikut diperbarui kapan pun teks
      // odp_label-nya sendiri diperbarui.
      updates.push('ftth_odp_id = ?'); params.push(await lookupOdpId(odpLabel));
    }
    if (onuPort !== undefined) { updates.push('onu_port = ?'); params.push(onuPort || null); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
    if (status !== undefined) {
      if (!VALID_PSB_STATUS.includes(status)) {
        await connection.rollback();
        return res.status(400).json({ message: `Status tidak valid. Harus: ${VALID_PSB_STATUS.join(', ')}` });
      }
      updates.push('status = ?'); params.push(status);
    }
    if (req.file) { updates.push('photo = ?'); params.push(`/uploads/${req.file.filename}`); }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Cacat #1, Sprint 3 — sebelumnya HANYA transisi status yang sungguhan
    // berubah (bukan-Terpasang → Terpasang) yang memicu pemilihan inventory
    // + draft ONU. PSB yang jadi Terpasang lewat jalan pintas (tiket
    // instalasinya ditutup, lihat auto-sync di routes/tickets.js) melewati
    // efek samping ini sama sekali, dan sebelum perbaikan ini TIDAK ADA CARA
    // untuk melengkapinya belakangan — status sudah Terpasang jadi syarat
    // lama ("status berubah DARI selain Terpasang") tidak akan pernah
    // terpenuhi lagi. Sekarang dipicu oleh status TARGET-nya Terpasang DAN
    // belum tertaut ke perangkat FTTH (ftth_device_id IS NULL) — mencakup
    // baik transisi asli maupun PSB yang belakangan "dilengkapi" Owner/
    // Operator lewat psb.html. ftth_device_id yang sudah terisi jadi
    // penanda alami sudah pernah diproses, mencegah dobel-kurangi stok
    // persis seperti guard lama.
    const needsInventoryLink = status === 'Terpasang' && !existing.ftth_device_id;
    let inventoryItem = null;
    // Dihitung sekali di sini — dipakai untuk cek bentrok SN/port (cacat #2)
    // SEBELUM stok dikurangi, dan dipakai lagi untuk draft ONU di bawah,
    // supaya keduanya tidak bisa didesinkron.
    const onuSnFinal = (onuSn !== undefined ? onuSn : existing.onu_sn) || null;
    const odpLabelFinal = (odpLabel !== undefined ? odpLabel : existing.odp_label) || null;
    const onuPortFinal = (onuPort !== undefined ? onuPort : existing.onu_port) || null;

    if (needsInventoryLink) {
      if (!inventoryId) {
        await connection.rollback();
        return res.status(400).json({ message: 'Pilih item ONU dari inventory untuk menandai instalasi selesai' });
      }
      const [invRows] = await connection.query('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [parseInt(inventoryId)]);
      if (invRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item inventory tidak ditemukan' });
      }
      inventoryItem = invRows[0];
      const remaining = (inventoryItem.total_stock || 0) - (inventoryItem.used_stock || 0);
      if (remaining < 1) {
        await connection.rollback();
        return res.status(400).json({ message: `Stok ${inventoryItem.device_name} habis` });
      }

      // Cacat #2, Sprint 3 — draft ONU ini sebelumnya dibuat tanpa cek SN
      // unik atau port bentrok sama sekali (beda dengan jalur langsung di
      // routes/ftth.js). Dicek di sini, SEBELUM stok dikurangi/draft
      // dibuat, pakai fungsi yang sama — kalau bentrok, TOLAK seluruh
      // transisi (bukan cuma draft-nya) supaya stok tidak ikut terlanjur
      // berkurang untuk instalasi yang gagal tercatat dengan benar.
      const conflictMsg = await checkOnuConflicts(connection, {
        serialNumber: onuSnFinal,
        groupName: odpLabelFinal,
        parentPort: onuPortFinal,
        excludeId: 0
      });
      if (conflictMsg) {
        await connection.rollback();
        cleanupUploadOnError(req);
        return res.status(400).json({ message: conflictMsg });
      }
    }

    params.push(id);
    try {
      await connection.query(`UPDATE psb SET ${updates.join(', ')} WHERE id = ?`, params);
    } catch (err) {
      // Rollback ditangani SEKALI di catch terluar (finally di bawah) — di
      // sini cuma bersihkan file upload lalu lempar ulang errornya.
      cleanupUploadOnError(req);
      throw err;
    }

    if (needsInventoryLink) {
      await connection.query('UPDATE inventory SET used_stock = used_stock + 1 WHERE id = ?', [inventoryItem.id]);
      await connection.query(
        `INSERT INTO inventory_log (inventory_id, change_type, quantity, reference_type, reference_id, notes, created_by)
         VALUES (?, 'out', 1, 'psb', ?, ?, ?)`,
        [inventoryItem.id, id, `Instalasi PSB #${id} — ${existing.customer_name}`, req.session.user.username]
      );

      // Draft entri ONU di ftth_devices — perlu dikonfirmasi staf di halaman
      // FTTH (lihat routes/ftth.js is_draft) sebelum dianggap data resmi.
      const latFinal = latitude !== undefined ? (latitude !== '' ? parseFloat(latitude) : null) : existing.latitude;
      const lngFinal = longitude !== undefined ? (longitude !== '' ? parseFloat(longitude) : null) : existing.longitude;
      const customerNameFinal = (customerName !== undefined ? customerName : existing.customer_name);
      // Label harus unik per (type, label, group_name) — SN kalau ada, kalau
      // tidak pakai id PSB (selalu unik) supaya tidak pernah tabrakan.
      const draftLabel = onuSnFinal ? `${customerNameFinal} - ${onuSnFinal}` : `${customerNameFinal} (PSB #${id})`;

      const [ftthResult] = await connection.query(
        `INSERT INTO ftth_devices (type, label, group_name, parent_port, brand, serial_number, latitude, longitude, is_draft)
         VALUES ('onu', ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [draftLabel, odpLabelFinal, onuPortFinal, inventoryItem.device_name, onuSnFinal, latFinal, lngFinal]
      );
      draftFtthId = ftthResult.insertId;

      // Tautan permanen PSB <-> ONU (psb.ftth_device_id) — bukan cuma teks
      // di label seperti sebelumnya. Lihat komentar kolomnya di schema.sql.
      await connection.query('UPDATE psb SET ftth_device_id = ? WHERE id = ?', [draftFtthId, id]);
    }

    const [updatedRows] = await connection.query('SELECT * FROM psb WHERE id = ?', [id]);
    updatedPsb = updatedRows[0];
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  audit(req, 'UPDATE', 'psb', id, { status: req.body.status });
  if (draftFtthId) {
    audit(req, 'CREATE', 'ftth', draftFtthId, { draft: true, trigger: `auto dari PSB #${id} Terpasang` });
  }
  res.json({ message: 'PSB berhasil diupdate', psb: updatedPsb, draftFtthId });
}));

// DELETE /api/psb/:id — Hapus PSB (Owner/Operator only)
router.delete('/api/psb/:id', isAuthenticated, psbMutationLimiter, isAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);

  // Audit: ambil data sebelum dihapus
  const [before] = await db.query('SELECT customer_name, onu_sn FROM psb WHERE id = ?', [id]);

  const [result] = await db.query('DELETE FROM psb WHERE id = ?', [id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'PSB not found' });

  // Audit trail
  logger.warn('PSB deleted', {
    psbId: id,
    customerName: before[0]?.customer_name || 'unknown',
    deletedBy: req.session.user.username
  });
  audit(req, 'DELETE', 'psb', id, { customerName: before[0]?.customer_name });

  res.json({ message: 'PSB berhasil dihapus' });
}));

module.exports = router;
