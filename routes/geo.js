const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/geo — Data geografis untuk peta (OLT, ODC, ODP, ONU)
router.get('/api/geo', isAuthenticated, asyncHandler(async (req, res) => {
  const [olt] = await db.query(
    `SELECT id, label as name, latitude as lat, longitude as lng
     FROM reference_options
     WHERE type = 'olt' AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY label`
  );
  const [odc] = await db.query(
    `SELECT id, label as name, group_name as area, parent_port as parentPort,
            latitude as lat, longitude as lng
     FROM reference_options
     WHERE type = 'odc' AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY label`
  );
  const [odp] = await db.query(
    `SELECT id, label as name, group_name as parentOdc, parent_port as parentPort,
            latitude as lat, longitude as lng
     FROM reference_options
     WHERE type = 'odp' AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY label`
  );
  const [onu] = await db.query(
    `SELECT id, label as name, group_name as parentOdp, parent_port as parentPort,
            latitude as lat, longitude as lng
     FROM reference_options
     WHERE type = 'onu' AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY label`
  );
  res.json({ olt, odc, odp, onu, stats: { olt: olt.length, odc: odc.length, odp: odp.length, onu: onu.length } });
}));

module.exports = router;
