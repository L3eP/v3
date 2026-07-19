const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const path = require('path');

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
router.post('/settings/company-name', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
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
router.post('/settings/company-logo', isAuthenticated, isAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;

    await db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('company_logo', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [logoUrl, logoUrl]);
    res.json({ message: 'Company logo updated successfully', logoUrl });
}));

module.exports = router;
