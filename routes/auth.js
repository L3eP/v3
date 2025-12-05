const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const upload = require('../middleware/upload');
const path = require('path');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.'
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
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Login failed: Invalid username or password' });
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
            res.status(401).json({ message: 'Login failed: Invalid username or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

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

// Register
router.post('/register', upload.single('photo'), [
    body('username').trim().isLength({ min: 3 }).escape(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars'),
    body('fullName').trim().escape(),
    body('phone').trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { fullName, username, password, phone, role } = req.body;

    try {
        // Check if user exists
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Default role is Teknisi if not specified
        const userRole = role || 'Teknisi';

        // Set photo to uploaded file or default
        const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.png';

        await db.query(
            'INSERT INTO users (full_name, username, password, phone, role, photo) VALUES (?, ?, ?, ?, ?, ?)',
            [fullName, username, hashedPassword, phone, userRole, photo]
        );

        res.status(201).json({ message: 'Account created successfully', redirect: '/index.html' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
