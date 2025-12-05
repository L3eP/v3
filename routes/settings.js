const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const path = require('path');

// Get Company Name (Public or Authenticated)
router.get('/settings/company-name', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_name'");
        if (rows.length > 0) {
            res.json({ companyName: rows[0].setting_value });
        } else {
            res.json({ companyName: 'Acme Corp' });
        }
    } catch (error) {
        console.error('Get company name error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Company Name (Owner only)
router.post('/settings/company-name', isAuthenticated, isAdmin, async (req, res) => {
    const { companyName } = req.body;

    if (!companyName || companyName.trim() === '') {
        return res.status(400).json({ message: 'Company name cannot be empty' });
    }

    try {
        await db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('company_name', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [companyName, companyName]);
        res.json({ message: 'Company name updated successfully', companyName });
    } catch (error) {
        console.error('Update company name error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Company Logo
router.get('/settings/company-logo', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'company_logo'");
        if (rows.length > 0) {
            res.json({ logoUrl: rows[0].setting_value });
        } else {
            res.json({ logoUrl: null }); // Frontend will handle default
        }
    } catch (error) {
        console.error('Get company logo error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Company Logo (Owner only)
router.post('/settings/company-logo', isAuthenticated, isAdmin, upload.single('logo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;

    try {
        await db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('company_logo', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [logoUrl, logoUrl]);
        res.json({ message: 'Company logo updated successfully', logoUrl });
    } catch (error) {
        console.error('Update company logo error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
