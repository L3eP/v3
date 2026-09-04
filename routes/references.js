const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const { audit } = require('../middleware/audit');
const { mutationLimiter } = require('../middleware/rateLimits');

// 3.2 — Rate limiter mutasi per endpoint group (referensi sering di-bulk via UI)
router.use(mutationLimiter('references', 100));

// GET /api/references — Ambil semua reference (untuk dropdown)
router.get('/api/references', isAuthenticated, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM reference_options ORDER BY type, sort_order, label'
  );

  // Group by type
  const grouped = {};
  rows.forEach(row => {
    if (!grouped[row.type]) grouped[row.type] = [];
    const item = {
      id: row.id,
      label: row.label,
      group: row.group_name,
      parentPort: row.parent_port,
      sortOrder: row.sort_order
    };
    if (row.latitude !== null || row.longitude !== null) {
      item.lat = row.latitude !== null ? parseFloat(row.latitude) : null;
      item.lng = row.longitude !== null ? parseFloat(row.longitude) : null;
    }
    grouped[row.type].push(item);
  });

  res.json(grouped);
}));

// POST /api/references — Tambah reference baru (Owner only)
router.post('/api/references', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { type, label, group_name, parent_port, sort_order } = req.body;

  if (!type || !label) {
    return res.status(400).json({ message: 'Type and label are required' });
  }

  const validTypes = ['aktifitas', 'sub_node', 'odc', 'odp', 'olt', 'onu', 'priority', 'device_brand', 'inventory_type'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid type' });
  }

  let lat = null, lng = null;
  if (req.body.latitude !== undefined && req.body.latitude !== '') {
    lat = parseFloat(req.body.latitude);
    if (isNaN(lat)) return res.status(400).json({ message: 'Latitude tidak valid' });
  }
  if (req.body.longitude !== undefined && req.body.longitude !== '') {
    lng = parseFloat(req.body.longitude);
    if (isNaN(lng)) return res.status(400).json({ message: 'Longitude tidak valid' });
  }

  let result;
  try {
    [result] = await db.query(
      'INSERT INTO reference_options (type, label, group_name, parent_port, latitude, longitude, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [type, label, group_name || null, parent_port || null, lat, lng, sort_order || 0]
    );
  } catch (dbErr) {
    if (dbErr && dbErr.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: `Reference "${label}" sudah ada pada grup ini` });
    }
    throw dbErr;
  }

  audit(req, 'CREATE', 'reference', result.insertId, { type, label });
  res.status(201).json({
    message: 'Reference added successfully',
    id: result.insertId
  });
}));

// PUT /api/references/:id — Edit reference (Owner only)
router.put('/api/references/:id', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { label, group_name, parent_port, sort_order } = req.body;

  const updates = [];
  const params = [];

  if (label) { updates.push('label = ?'); params.push(label); }
  if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name); }
  if (parent_port !== undefined) { updates.push('parent_port = ?'); params.push(parent_port || null); }
  if (req.body.latitude !== undefined) {
    const lat = req.body.latitude !== '' ? parseFloat(req.body.latitude) : null;
    if (req.body.latitude !== '' && isNaN(lat)) return res.status(400).json({ message: 'Latitude tidak valid' });
    updates.push('latitude = ?'); params.push(lat);
  }
  if (req.body.longitude !== undefined) {
    const lng = req.body.longitude !== '' ? parseFloat(req.body.longitude) : null;
    if (req.body.longitude !== '' && isNaN(lng)) return res.status(400).json({ message: 'Longitude tidak valid' });
    updates.push('longitude = ?'); params.push(lng);
  }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  params.push(id);
  let result;
  try {
    [result] = await db.query(
      `UPDATE reference_options SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  } catch (dbErr) {
    if (dbErr && dbErr.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Reference dengan type/label/group yang sama sudah ada' });
    }
    throw dbErr;
  }

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Reference not found' });
  }

  audit(req, 'UPDATE', 'reference', id, { label, group_name });
  res.json({ message: 'Reference updated successfully' });
}));

// DELETE /api/references/:id — Hapus reference (Owner only)
router.delete('/api/references/:id', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);

  // Audit: ambil label sebelum dihapus
  const [before] = await db.query('SELECT type, label FROM reference_options WHERE id = ?', [id]);

  const [result] = await db.query('DELETE FROM reference_options WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Reference not found' });
  }

  // Audit trail
  logger.warn('Reference deleted', {
    referenceId: id,
    type: before[0]?.type || 'unknown',
    label: before[0]?.label || 'unknown',
    deletedBy: req.session.user.username
  });
  audit(req, 'DELETE', 'reference', id, { type: before[0]?.type, label: before[0]?.label });

  res.json({ message: 'Reference deleted successfully' });
}));

module.exports = router;
