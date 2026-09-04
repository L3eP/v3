const express = require('express');
const router = express.Router();
const fs = require('fs');
const db = require('../db');
const upload = require('../middleware/upload');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { sanitizePhone } = require('../utils/phone');
const logger = require('../utils/logger');
const { audit } = require('../middleware/audit');
const { mutationLimiter } = require('../middleware/rateLimits');
const { cleanupUploadOnError } = require('../utils/uploads');

// 3.2 — Rate limiter mutasi (update-role, admin/users/update, delete sebelumnya
// hanya dilindungi limiter global 1000/15min)
router.use(mutationLimiter('users'));

// Rate limit untuk update-profile — cegah brute force password change
const profileUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5,
    message: 'Too many profile update attempts, please try again later.'
});

// Sesi disimpan sebagai JSON di kolom `sessions.data` (express-mysql-session).
// Delete/demote hanya mengubah DB — tanpa ini, session cookie yang sudah ada
// tetap berjalan dengan role/akses lama sampai 24 jam (maxAge). Best-effort:
// kegagalan di sini tidak boleh menggagalkan aksi utama (delete/update role).
const revokeUserSessions = async (username) => {
    try {
        await db.query(
            "DELETE FROM sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.username')) = ?",
            [username]
        );
    } catch (e) {
        logger.error('Failed to revoke sessions for user', { username, error: e.message });
    }
};

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
        defaultSubNode: user.default_sub_node,
        createdAt: user.created_at
    };
};

// Update Profile (dengan rate limit)
router.post('/update-profile', isAuthenticated, profileUpdateLimiter, upload.single('photo'), asyncHandler(async (req, res) => {
    const { username, currentPassword, newPassword, phone } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    if (req.session.user.username !== username) {
        return res.status(403).json({ message: 'Forbidden: Cannot update other users profile' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect current password' });
    }

    // Standarisasi nomor telepon ke format Fonnte
    const standardPhone = phone ? (sanitizePhone(phone) || phone) : user.phone;
    let query = 'UPDATE users SET phone = ?';
    let params = [standardPhone];

    if (newPassword) {
        // Policy password konsisten dengan register/admin: min 8 + huruf & angka
        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password minimal 8 karakter' });
        }
        if (!/(?=.*[A-Za-z])(?=.*\d)/.test(newPassword)) {
            return res.status(400).json({ message: 'Password harus mengandung huruf dan angka' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }
    if (photo) {
        query += ', photo = ?';
        params.push(photo);
    }

    query += ' WHERE id = ?';
    params.push(user.id);

    try {
        await db.query(query, params);
    } catch (err) {
        cleanupUploadOnError(req);
        throw err;
    }

    // Hapus foto profil lama — tanpa ini public/uploads tumbuh tanpa batas
    // setiap kali user ganti foto (file lama tidak pernah dipakai lagi).
    // /uploads/default.png dikecualikan — itu avatar bersama dipakai banyak user.
    if (photo && user.photo && user.photo.startsWith('/uploads/') &&
        user.photo !== photo && user.photo !== '/uploads/default.png') {
        const prevPath = path.join(__dirname, '../public', user.photo);
        fs.unlink(prevPath, (err) => {
            if (err && err.code !== 'ENOENT') logger.error('Failed to remove old profile photo', { prevPhoto: user.photo, error: err.message });
        });
    }

    const [updatedRows] = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
    const updatedUser = mapUser(updatedRows[0]);

    req.session.user = updatedUser;

    res.status(200).json({
        message: 'Profile updated successfully',
        user: updatedUser
    });
}));

// Get all users (Owner and Operator can view) — exclude soft-deleted
router.get('/users', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
    const [rows] = await db.query(
        "SELECT id, username, full_name, role, phone, photo, default_sub_node, created_at FROM users WHERE deleted_at IS NULL"
    );
    const users = rows.map(mapUser);
    res.json(users);
}));

// Update User Role (Owner only)
router.post('/update-role', isAuthenticated, isAdmin, [
    body('newRole').isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role'),
    body('username').trim().escape()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });

    const { username, newRole } = req.body;

    // 🛡️ Self-demotion prevention — Owner tidak boleh menurunkan role sendiri
    if (req.session.user.username === username) {
        return res.status(400).json({ message: 'Cannot change your own role' });
    }

    const [result] = await db.query('UPDATE users SET role = ? WHERE username = ? AND deleted_at IS NULL', [newRole, username]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    audit(req, 'UPDATE', 'user', null, { role: req.body.newRole, username: req.body.username });
    // Paksa re-login — sesi lama membawa role sebelumnya di req.session.user
    await revokeUserSessions(username);
    res.json({ message: 'Role updated successfully' });
}));

// Get Single User
router.get('/users/:username', isAuthenticated, asyncHandler(async (req, res) => {
    const { username } = req.params;

    // Owner, Operator, or the user themselves can view details
    const isSelf = req.session.user.username === username;
    const isPrivileged = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

    if (!isPrivileged && !isSelf) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const [rows] = await db.query(
        'SELECT id, username, full_name, role, phone, photo, default_sub_node, created_at, deleted_at FROM users WHERE username = ?',
        [username]
    );
    if (rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    res.json(mapUser(rows[0]));
}));

// Delete User (Owner only)
router.delete('/users/:username', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
    const { username } = req.params;

    // Prevent self-deletion — Owner tidak bisa menghapus akun sendiri
    if (req.session.user.username === username) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const [result] = await db.query(
        'UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE username = ? AND deleted_at IS NULL',
        [username]
    );
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found or already deleted' });
    }

    // Audit trail
    logger.warn('User soft-deleted', { deletedUser: username, deletedBy: req.session.user.username });
    audit(req, 'DELETE', 'user', null, { username });
    await revokeUserSessions(username);

    res.json({ message: 'User deleted successfully' });
}));

// Restore soft-deleted user (Owner only) — sebelumnya tidak ada jalan balik
// sama sekali: is_active hanya ditulis SEKALI ke FALSE (di DELETE di atas),
// jadi user yang salah hapus tidak bisa dipulihkan dan usernamenya "terbakar"
// (register menolak "sudah ada" untuk baris yang justru tak terlihat di UI).
router.post('/users/:username/restore', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
    const { username } = req.params;

    const [result] = await db.query(
        'UPDATE users SET deleted_at = NULL, is_active = TRUE WHERE username = ? AND deleted_at IS NOT NULL',
        [username]
    );
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found or not deleted' });
    }

    logger.warn('User restored', { restoredUser: username, restoredBy: req.session.user.username });
    audit(req, 'UPDATE', 'user', null, { username, action: 'restore' });

    res.json({ message: 'User restored successfully' });
}));

// Admin/Owner Update User
router.post('/admin/users/update', isAuthenticated, isOwnerOrOperator, [
    body('originalUsername').trim().escape(),
    body('fullName').optional().trim().escape(),
    body('role').optional().isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role'),
    body('phone').optional().trim().escape(),
    body('defaultSubNode').optional({ checkFalsy: true }).trim().escape(),
    body('password').optional()
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter')
        .matches(/(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password harus mengandung huruf dan angka')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });

    const { originalUsername, fullName, password, phone, role, defaultSubNode } = req.body;

    // 🛡️ Self-demotion prevention — Owner tidak boleh mengubah role sendiri
    // lewat jalur admin update (bisa terkunci dari sistem)
    if (req.session.user.username === originalUsername && role) {
        return res.status(400).json({ message: 'Cannot change your own role' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', [originalUsername]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    const user = rows[0];

    // 🛡️ Operator tidak boleh edit user dengan role Owner
    if (req.session.user.role !== 'Owner' && user.role === 'Owner') {
        return res.status(403).json({ message: 'Cannot modify Owner account' });
    }
    // 🛡️ Operator tidak boleh menaikkan role ke Owner
    if (req.session.user.role !== 'Owner' && role === 'Owner') {
        return res.status(403).json({ message: 'Only Owner can assign Owner role' });
    }

    const standardPhone = phone ? (sanitizePhone(phone) || phone) : user.phone;
    let query = 'UPDATE users SET full_name = ?, phone = ?, role = ?, default_sub_node = ?';
    let params = [fullName || user.full_name, standardPhone, role || user.role, defaultSubNode || user.default_sub_node];

    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(user.id);

    await db.query(query, params);
    audit(req, 'UPDATE', 'user', null, { username: req.body.originalUsername, changes: 'admin update' });
    // Role/password berubah → sesi lama membawa role/kredensial usang, paksa re-login
    if (role || password) {
        await revokeUserSessions(originalUsername);
    }
    res.json({ message: 'User updated successfully' });
}));

module.exports = router;
