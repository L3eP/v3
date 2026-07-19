const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isOwnerOrOperator } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

// GET /api/inventory — List semua inventory
router.get('/api/inventory', isAuthenticated, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT *, (total_stock - used_stock) as remaining FROM inventory ORDER BY device_type, device_name'
  );
  res.json(rows);
}));

// GET /api/inventory/log — Histori pemakaian
router.get('/api/inventory/log', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT l.*, i.device_name FROM inventory_log l
     JOIN inventory i ON l.inventory_id = i.id
     ORDER BY l.created_at DESC LIMIT 100`
  );
  res.json(rows);
}));

// POST /api/inventory — Tambah item (Owner/Operator)
router.post('/api/inventory', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const { deviceType, deviceName, totalStock, location, notes } = req.body;
  if (!deviceType || !deviceName) {
    return res.status(400).json({ message: 'Device type dan name wajib diisi' });
  }
  const stock = parseInt(totalStock) || 0;
  const [result] = await db.query(
    'INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by) VALUES (?, ?, ?, 0, ?, ?, ?)',
    [deviceType, deviceName, stock, location || null, notes || null, req.session.user.username]
  );
  const [newItem] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId]);
  res.status(201).json({ message: 'Item inventory ditambahkan', item: newItem[0] });
}));

// PUT /api/inventory/:id — Update stock (Owner/Operator)
router.put('/api/inventory/:id', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { totalStock, usedStock, deviceType, deviceName, location, notes } = req.body;
  const [existing] = await db.query('SELECT * FROM inventory WHERE id = ?', [id]);
  if (!existing.length) return res.status(404).json({ message: 'Item not found' });

  const updates = [], params = [];
  if (deviceType !== undefined) { updates.push('device_type = ?'); params.push(deviceType); }
  if (deviceName !== undefined) { updates.push('device_name = ?'); params.push(deviceName); }
  if (totalStock !== undefined) { updates.push('total_stock = ?'); params.push(parseInt(totalStock) || 0); }
  if (usedStock !== undefined) { updates.push('used_stock = ?'); params.push(parseInt(usedStock) || 0); }
  if (location !== undefined) { updates.push('location = ?'); params.push(location || null); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
  if (!updates.length) return res.status(400).json({ message: 'No fields to update' });

  params.push(id);
  await db.query(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`, params);

  // Log perubahan
  if (totalStock !== undefined || usedStock !== undefined) {
    const [updated] = await db.query('SELECT * FROM inventory WHERE id = ?', [id]);
    logger.info('Inventory updated', { id, total: updated[0].total_stock, used: updated[0].used_stock, by: req.session.user.username });
  }

  const [updated] = await db.query('SELECT *, (total_stock - used_stock) as remaining FROM inventory WHERE id = ?', [id]);
  res.json({ message: 'Inventory diupdate', item: updated[0] });
}));

// DELETE /api/inventory/:id — Hapus item (Owner only)
router.delete('/api/inventory/:id', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const [result] = await db.query('DELETE FROM inventory WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Item not found' });
  logger.warn('Inventory deleted', { id, by: req.session.user.username });
  res.json({ message: 'Item inventory dihapus' });
}));

module.exports = router;
