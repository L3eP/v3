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

const { mutationLimiter } = require('../middleware/rateLimits');

// 3.2 — Rate limiter mutasi per endpoint group
//
// SENGAJA dipasang per-route (bukan router.use(...) blanket) — lihat catatan
// yang sama di routes/users.js soal kenapa router.use(fn) tanpa path bocor
// menghitung request yang ditangani router lain (semua router di-mount di
// path yang sama, '/', lihat server.js).
const psbMutationLimiter = mutationLimiter('psb');

const VALID_PSB_STATUS = ['Terdaftar', 'Terpasang', 'Aktif', 'Batal'];

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

  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  // Standarisasi nomor telepon ke format 62xx — konsisten dengan users (auth.js/
  // users.js). Sebelumnya nomor disimpan mentah apa adanya dari input pelanggan.
  const standardPhone = phone ? (sanitizePhone(phone) || phone) : null;

  let result;
  try {
    [result] = await db.query(
      `INSERT INTO psb (customer_name, address, phone, onu_sn, latitude, longitude, odp_label, onu_port, photo, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerName.trim(),
        address.trim(),
        standardPhone,
        onuSn || null,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        odpLabel || null,
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
    if (odpLabel !== undefined) { updates.push('odp_label = ?'); params.push(odpLabel || null); }
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

    // Transisi SUNGGUHAN ke Terpasang — bukan cuma "statusnya kebetulan
    // Terpasang" (yang juga true kalau field lain di-edit tanpa mengubah status).
    const isNewlyTerpasang = status === 'Terpasang' && existing.status !== 'Terpasang';
    let inventoryItem = null;

    if (isNewlyTerpasang) {
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

    if (isNewlyTerpasang) {
      await connection.query('UPDATE inventory SET used_stock = used_stock + 1 WHERE id = ?', [inventoryItem.id]);
      await connection.query(
        `INSERT INTO inventory_log (inventory_id, change_type, quantity, reference_type, reference_id, notes, created_by)
         VALUES (?, 'out', 1, 'psb', ?, ?, ?)`,
        [inventoryItem.id, id, `Instalasi PSB #${id} — ${existing.customer_name}`, req.session.user.username]
      );

      // Draft entri ONU di ftth_devices — perlu dikonfirmasi staf di halaman
      // FTTH (lihat routes/ftth.js is_draft) sebelum dianggap data resmi.
      // Field diambil dari nilai EFEKTIF (request baru kalau dikirim, kalau
      // tidak dari data PSB yang sudah ada).
      const onuSnFinal = (onuSn !== undefined ? onuSn : existing.onu_sn) || null;
      const odpLabelFinal = (odpLabel !== undefined ? odpLabel : existing.odp_label) || null;
      const onuPortFinal = (onuPort !== undefined ? onuPort : existing.onu_port) || null;
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
