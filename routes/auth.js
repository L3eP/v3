const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const upload = require('../middleware/upload');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { sanitizePhone } = require('../utils/phone');
const logger = require('../utils/logger');

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

// Hash statis hanya untuk menyamakan waktu bcrypt.compare saat username tak ditemukan
const DUMMY_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i8fSGZAXG5eGZ3aWvxE1Y5N7z8T3W';

// Login
router.post('/login', loginLimiter, [
    body('username').trim().escape(),
    // Password TIDAK di-trim/escape: nilai ini hanya dibandingkan via bcrypt,
    // tidak pernah dirender ke HTML. .escape() mengubah karakter < > & " ' pada
    // password sebelum bcrypt.compare, sehingga password yang mengandung
    // karakter itu tidak akan pernah cocok — akun terkunci permanen padahal
    // password yang diketik benar. register/update-profile/admin-update tidak
    // melakukan ini, jadi login harus konsisten dengan cara password disimpan.
    body('password').notEmpty()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: "Validation failed", errors: errors.array() });
    }
    const { username, password } = req.body;

    // Hanya user yang belum di-soft-delete dan aktif yang boleh login
    const [rows] = await db.query(
        'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL AND is_active = TRUE',
        [username]
    );
    const user = rows[0];

    if (!user) {
        // Audit log: failed login — user not found
        logger.warn('Login failed — user not found', {
            username,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
        // bcrypt.compare dummy — samakan waktu respons dengan jalur user ditemukan
        // (tanpa ini, respons unknown-user ~1ms vs ~100ms jadi celah timing utk
        // menebak username yang valid meski pesan errornya sama)
        await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
        const mappedUser = mapUser(user);

        // 3.4 — Anti session-fixation: regenerate session id saat login sukses.
        // Penyerang yang "mengunci" id session sebelum korban login tidak bisa
        // melanjutkan — korban mendapat Session ID BARU setelah autentikasi.
        try {
            await new Promise((resolve, reject) => {
                req.session.regenerate((err) => err ? reject(err) : resolve());
            });
        } catch (regErr) {
            logger.error('Session regenerate failed:', { error: regErr.message, username });
            return res.status(500).json({ message: 'Login failed' });
        }
        req.session.user = mappedUser;

        let redirectUrl;
        if (user.role === 'Owner' || user.role === 'Operator') {
            redirectUrl = '/dashboard.html';
        } else if (user.role === 'Teknisi') {
            redirectUrl = '/dashboard.html';
        } else {
            // Fallback
            redirectUrl = '/dashboard.html';
        }

        res.status(200).json({
            message: 'Login successful',
            redirect: redirectUrl,
            user: mappedUser
        });
    } else {
        // Audit log: failed login — wrong password
        logger.warn('Login failed — wrong password', {
            username,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
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
    // Sprint 4 — policy password: minimal 8 karakter + wajib huruf dan angka
    body('password')
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter')
        .matches(/(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password harus mengandung huruf dan angka'),
    body('fullName').trim().escape(),
    body('phone').trim().escape(),
    body('role').optional().isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: "Validation failed", errors: errors.array() });
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
    // Tolak jika format nomor tidak valid
    let standardPhone = null;
    if (phone) {
      standardPhone = sanitizePhone(phone);
      if (!standardPhone) {
        return res.status(400).json({ message: 'Format nomor telepon tidak valid. Gunakan format Indonesia (08xx atau 628xx)' });
      }
    }

    // Set photo to uploaded file or default
    const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.png';

    await db.query(
        'INSERT INTO users (full_name, username, password, phone, role, photo) VALUES (?, ?, ?, ?, ?, ?)',
        [fullName, username, hashedPassword, standardPhone, userRole, photo]
    );

    res.status(201).json({ message: 'Account created successfully' });
}));

module.exports = router;
