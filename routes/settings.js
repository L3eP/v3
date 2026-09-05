const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const upload = require('../middleware/upload');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { mutationLimiter } = require('../middleware/rateLimits');
const logger = require('../utils/logger');
const { cleanupUploadOnError } = require('../utils/uploads');

// 3.2 — Rate limiter mutasi (sebelumnya endpoint ini hanya dilindungi limiter
// global 1000/15min — upload logo 5MB bisa diulang ratusan kali per window)
//
// SENGAJA dipasang per-route (bukan router.use(...) blanket) — lihat catatan
// yang sama di routes/users.js soal kenapa router.use(fn) tanpa path bocor
// menghitung request yang ditangani router lain (semua router di-mount di
// path yang sama, '/', lihat server.js).
const settingsMutationLimiter = mutationLimiter('settings');

// Get Company Name (Public or Authenticated)
router.get('/settings/company-name', asyncHandler(async (req, res) => {
    const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_name'");
    if (rows.length > 0) {
        res.json({ companyName: rows[0].setting_value });
    } else {
        res.json({ companyName: 'MAYUNG' });
    }
}));

// Update Company Name (Owner only)
router.post('/settings/company-name', isAuthenticated, settingsMutationLimiter, isAdmin, asyncHandler(async (req, res) => {
    const { companyName } = req.body;

    if (!companyName || companyName.trim() === '') {
        return res.status(400).json({ message: 'Company name cannot be empty' });
    }

    await db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('company_name', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [companyName, companyName]);
    res.json({ message: 'Company name updated successfully', companyName });
}));

// Get Company Logo
router.get('/settings/company-logo', asyncHandler(async (req, res) => {
    const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_logo'");
    if (rows.length > 0) {
        res.json({ logoUrl: rows[0].setting_value });
    } else {
        res.json({ logoUrl: null });
    }
}));

// Update Company Logo (Owner only)
router.post('/settings/company-logo', isAuthenticated, settingsMutationLimiter, isAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const [prevRows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_logo'");
    const logoUrl = `/uploads/${req.file.filename}`;

    try {
        await db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('company_logo', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [logoUrl, logoUrl]);
    } catch (err) {
        cleanupUploadOnError(req);
        throw err;
    }

    // Hapus file logo lama — tanpa ini public/uploads tumbuh tanpa batas setiap
    // kali logo diganti (file lama tidak pernah dipakai lagi tapi tidak dihapus).
    const prevUrl = prevRows[0] && prevRows[0].setting_value;
    if (prevUrl && prevUrl.startsWith('/uploads/') && prevUrl !== logoUrl) {
        const prevPath = path.join(__dirname, '../public', prevUrl);
        fs.unlink(prevPath, (err) => {
            if (err && err.code !== 'ENOENT') logger.error('Failed to remove old logo file', { prevUrl, error: err.message });
        });
    }

    res.json({ message: 'Company logo updated successfully', logoUrl });
}));

module.exports = router;
