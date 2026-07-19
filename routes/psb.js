const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

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
router.post('/api/psb', isAuthenticated, upload.single('photo'), asyncHandler(async (req, res) => {
  const { customerName, address, phone, onuSn, latitude, longitude, odpLabel, notes } = req.body;

  if (!customerName || !customerName.trim()) {
    return res.status(400).json({ message: 'Nama pelanggan wajib diisi' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ message: 'Alamat wajib diisi' });
  }

  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  const [result] = await db.query(
    `INSERT INTO psb (customer_name, address, phone, onu_sn, latitude, longitude, odp_label, photo, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerName.trim(),
      address.trim(),
      phone || null,
      onuSn || null,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      odpLabel || null,
      photo,
      notes || null,
      req.session.user.username
    ]
  );

  const [newPsb] = await db.query('SELECT * FROM psb WHERE id = ?', [result.insertId]);
  res.status(201).json({ message: 'PSB berhasil didaftarkan', psb: newPsb[0] });
}));

// PUT /api/psb/:id — Update PSB (Owner/Operator only)
router.put('/api/psb/:id', isAuthenticated, isOwnerOrOperator, upload.single('photo'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { customerName, address, phone, onuSn, latitude, longitude, odpLabel, notes, status } = req.body;

  const [existing] = await db.query('SELECT * FROM psb WHERE id = ?', [id]);
  if (existing.length === 0) return res.status(404).json({ message: 'PSB not found' });

  const updates = [];
  const params = [];

  if (customerName !== undefined) { updates.push('customer_name = ?'); params.push(customerName); }
  if (address !== undefined) { updates.push('address = ?'); params.push(address); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
  if (onuSn !== undefined) { updates.push('onu_sn = ?'); params.push(onuSn || null); }
  if (latitude !== undefined) { updates.push('latitude = ?'); params.push(latitude ? parseFloat(latitude) : null); }
  if (longitude !== undefined) { updates.push('longitude = ?'); params.push(longitude ? parseFloat(longitude) : null); }
  if (odpLabel !== undefined) { updates.push('odp_label = ?'); params.push(odpLabel || null); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (req.file) { updates.push('photo = ?'); params.push(`/uploads/${req.file.filename}`); }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

  params.push(id);
  await db.query(`UPDATE psb SET ${updates.join(', ')} WHERE id = ?`, params);

  const [updated] = await db.query('SELECT * FROM psb WHERE id = ?', [id]);
  res.json({ message: 'PSB berhasil diupdate', psb: updated[0] });
}));

// DELETE /api/psb/:id — Hapus PSB (Owner/Operator only)
router.delete('/api/psb/:id', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
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

  res.json({ message: 'PSB berhasil dihapus' });
}));

module.exports = router;
