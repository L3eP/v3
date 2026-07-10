const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// GET /api/references — Ambil semua reference (untuk dropdown)
router.get('/api/references', isAuthenticated, async (req, res) => {
  try {
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
        sortOrder: row.sort_order
      };
      if (row.latitude || row.longitude) {
        item.lat = parseFloat(row.latitude);
        item.lng = parseFloat(row.longitude);
      }
      grouped[row.type].push(item);
    });

    res.json(grouped);
  } catch (error) {
    console.error('Get references error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/references — Tambah reference baru (Owner only)
router.post('/api/references', isAuthenticated, isAdmin, async (req, res) => {
  const { type, label, group_name, sort_order } = req.body;

  if (!type || !label) {
    return res.status(400).json({ message: 'Type and label are required' });
  }

  const validTypes = ['aktifitas', 'sub_node', 'odc', 'odp', 'olt', 'priority'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid type' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO reference_options (type, label, group_name, latitude, longitude, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [type, label, group_name || null, req.body.latitude || null, req.body.longitude || null, sort_order || 0]
    );

    res.status(201).json({
      message: 'Reference added successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Create reference error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/references/:id — Edit reference (Owner only)
router.put('/api/references/:id', isAuthenticated, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { label, group_name, sort_order } = req.body;

  try {
    const updates = [];
    const params = [];

    if (label) { updates.push('label = ?'); params.push(label); }
    if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name); }
    if (req.body.latitude !== undefined) { updates.push('latitude = ?'); params.push(req.body.latitude || null); }
    if (req.body.longitude !== undefined) { updates.push('longitude = ?'); params.push(req.body.longitude || null); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    params.push(id);
    const [result] = await db.query(
      `UPDATE reference_options SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reference not found' });
    }

    res.json({ message: 'Reference updated successfully' });
  } catch (error) {
    console.error('Update reference error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/references/:id — Hapus reference (Owner only)
router.delete('/api/references/:id', isAuthenticated, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const [result] = await db.query('DELETE FROM reference_options WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reference not found' });
    }

    res.json({ message: 'Reference deleted successfully' });
  } catch (error) {
    console.error('Delete reference error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
