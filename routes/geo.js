const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

// GET /api/geo — Data geografis untuk peta (ODC, ODP, dan lokasi tiket)
router.get('/api/geo', isAuthenticated, async (req, res) => {
  try {
    // ODC dengan koordinat
    const [odc] = await db.query(
      `SELECT id, label as name, group_name as area,
              latitude as lat, longitude as lng
       FROM reference_options
       WHERE type = 'odc' AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY label`
    );
    const [odp] = await db.query(
      `SELECT id, label as name, group_name as parentOdc,
              latitude as lat, longitude as lng
       FROM reference_options
       WHERE type = 'odp' AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY label`
    );
    res.json({ odc, odp, stats: { odc: odc.length, odp: odp.length } });
  } catch (error) {
    console.error('Geo error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;
