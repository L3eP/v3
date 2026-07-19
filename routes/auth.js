const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const upload = require('../middleware/upload');
const path = require('path');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { sanitizePhone } = require('../utils/phone');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.'
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max: 5, // Maks 5 registrasi per jam per IP
    message: 'Too many registration attempts, please try again later.'
});

// Helper to map DB user to Frontend user
const mapUser = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        phone: user.phone,
        photo: user.photo,
        createdAt: user.created_at
    };
};

const bcrypt = require('bcryptjs');

// Login
router.post('/login', loginLimiter, [
    body('username').trim().escape(),
    body('password').trim().escape()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, password } = req.body;

    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
        const mappedUser = mapUser(user);
        req.session.user = mappedUser;

        let redirectUrl;
        if (user.role === 'Owner' || user.role === 'Operator') {
            redirectUrl = '/dashboard.html';
        } else if (user.role === 'Teknisi') {
            redirectUrl = '/activity.html';
        } else {
            // Fallback
            redirectUrl = '/user-dashboard.html';
        }

        res.status(200).json({
            message: 'Login successful',
            redirect: redirectUrl,
            user: mappedUser
        });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
}));

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed' });
        }
        res.clearCookie('session_cookie_name');
        res.json({ message: 'Logout successful', redirect: '/index.html' });
    });
});

// Register (Owner only — requires authentication + admin role)
router.post('/register', isAuthenticated, isAdmin, registerLimiter, upload.single('photo'), [
    body('username').trim().isLength({ min: 3 }).escape(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars'),
    body('fullName').trim().escape(),
    body('phone').trim().escape(),
    body('role').optional().isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { fullName, username, password, phone, role } = req.body;

    // Check if user exists
    const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUsers.length > 0) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Validate role — only allow valid roles, default to Teknisi
    const validRoles = ['Owner', 'Operator', 'Teknisi'];
    const userRole = role && validRoles.includes(role) ? role : 'Teknisi';

    // Standarisasi nomor telepon ke format Fonnte (62xx)
    const standardPhone = sanitizePhone(phone) || phone;

    // Set photo to uploaded file or default
    const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.png';

    await db.query(
        'INSERT INTO users (full_name, username, password, phone, role, photo) VALUES (?, ?, ?, ?, ?, ?)',
        [fullName, username, hashedPassword, standardPhone, userRole, photo]
    );

    res.status(201).json({ message: 'Account created successfully' });
}));

module.exports = router;
