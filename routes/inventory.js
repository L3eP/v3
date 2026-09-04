const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isOwnerOrOperator, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const { audit } = require('../middleware/audit');
const { mutationLimiter } = require('../middleware/rateLimits');

// 3.2 — Rate limiter mutasi per endpoint group
router.use(mutationLimiter('inventory'));

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
  const { deviceType, deviceName, totalStock, location, notes, attributes } = req.body;
  if (!deviceType || !deviceName) {
    return res.status(400).json({ message: 'Device type dan name wajib diisi' });
  }
  const stock = parseInt(totalStock) || 0;
  const attrs = attributes ? JSON.stringify(attributes) : null;
  const [result] = await db.query(
    'INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
    [deviceType, deviceName, stock, location || null, notes || null, req.session.user.username, attrs]
  );
  const [newItem] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId]);
  audit(req, 'CREATE', 'inventory', result.insertId, { deviceType, deviceName });
    res.status(201).json({ message: 'Item inventory ditambahkan', item: newItem[0] });
}));

// PUT /api/inventory/:id — Update stock (Owner/Operator)
router.put('/api/inventory/:id', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { totalStock, usedStock, deviceType, deviceName, location, notes } = req.body;

  // Transaksi + SELECT...FOR UPDATE (pola sama dengan tickets.js): tanpa ini,
  // dua request PUT paralel membaca stok lama yang sama, menghitung delta dari
  // basis yang sudah kedaluwarsa, dan menulis inventory_log yang tidak cocok
  // dengan nilai akhir di tabel inventory (lost-update).
  const connection = await db.getConnection();
  let updatedItem;
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [id]);
    if (!existingRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    const existing = existingRows[0];

    const updates = [], params = [];
    if (deviceType !== undefined) { updates.push('device_type = ?'); params.push(deviceType); }
    if (deviceName !== undefined) { updates.push('device_name = ?'); params.push(deviceName); }

    let newTotal = existing.total_stock || 0;
    let newUsed = existing.used_stock || 0;
    if (totalStock !== undefined) newTotal = parseInt(totalStock) || 0;
    if (usedStock !== undefined) newUsed = parseInt(usedStock) || 0;

    if (totalStock !== undefined || usedStock !== undefined) {
      if (newTotal < 0 || newUsed < 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Stok tidak boleh negatif' });
      }
      if (newUsed > newTotal) {
        await connection.rollback();
        return res.status(400).json({ message: 'Stok terpakai tidak boleh melebihi total stok' });
      }
      if (totalStock !== undefined) { updates.push('total_stock = ?'); params.push(newTotal); }
      if (usedStock !== undefined) { updates.push('used_stock = ?'); params.push(newUsed); }
    }
    if (location !== undefined) { updates.push('location = ?'); params.push(location || null); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
    if (req.body.attributes !== undefined) {
      updates.push('attributes = ?');
      params.push(req.body.attributes ? JSON.stringify(req.body.attributes) : null);
    }
    if (!updates.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'No fields to update' });
    }

    params.push(id);
    await connection.query(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`, params);

    // Catat perubahan stok ke inventory_log — delta dihitung dari baris yang
    // sama-sama terkunci di transaksi ini, bukan pembacaan terpisah.
    if (totalStock !== undefined) {
      const oldTotal = existing.total_stock || 0;
      if (newTotal !== oldTotal) {
        await connection.query(
          'INSERT INTO inventory_log (inventory_id, change_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)',
          [id, newTotal > oldTotal ? 'in' : 'out', Math.abs(newTotal - oldTotal), 'Update total stok', req.session.user.username]
        );
      }
    }
    if (usedStock !== undefined) {
      const oldUsed = existing.used_stock || 0;
      if (newUsed !== oldUsed) {
        await connection.query(
          'INSERT INTO inventory_log (inventory_id, change_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)',
          [id, newUsed > oldUsed ? 'out' : 'in', Math.abs(newUsed - oldUsed), 'Update stok terpakai', req.session.user.username]
        );
      }
    }

    const [updatedRows] = await connection.query(
      'SELECT *, (total_stock - used_stock) as remaining FROM inventory WHERE id = ?', [id]
    );
    updatedItem = updatedRows[0];

    await connection.commit();
    logger.info('Inventory updated', { id, total: newTotal, used: newUsed, by: req.session.user.username });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  audit(req, 'UPDATE', 'inventory', id, { deviceType, deviceName });
  res.json({ message: 'Inventory diupdate', item: updatedItem });
}));

// DELETE /api/inventory/:id — Hapus item (Owner only)
router.delete('/api/inventory/:id', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const [result] = await db.query('DELETE FROM inventory WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Item not found' });
  logger.warn('Inventory deleted', { id, by: req.session.user.username });
  audit(req, 'DELETE', 'inventory', id, { by: req.session.user.username });
    res.json({ message: 'Item inventory dihapus' });
}));

module.exports = router;
