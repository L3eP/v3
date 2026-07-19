const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const bcrypt = require('bcryptjs');
const { sanitizePhone } = require('../utils/phone');
const logger = require('../utils/logger');

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

// Update Profile
router.post('/update-profile', isAuthenticated, upload.single('photo'), asyncHandler(async (req, res) => {
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

    await db.query(query, params);

    const [updatedRows] = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
    const updatedUser = mapUser(updatedRows[0]);

    req.session.user = updatedUser;

    res.status(200).json({
        message: 'Profile updated successfully',
        user: updatedUser
    });
}));

// Get all users (Owner and Operator can view)
router.get('/users', isAuthenticated, isOwnerOrOperator, asyncHandler(async (req, res) => {
    const [rows] = await db.query('SELECT id, username, full_name, role, phone, photo, created_at FROM users');
    const users = rows.map(mapUser);
    res.json(users);
}));

// Update User Role (Owner only)
router.post('/update-role', isAuthenticated, isAdmin, [
    body('newRole').isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role'),
    body('username').trim().escape()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, newRole } = req.body;

    const [result] = await db.query('UPDATE users SET role = ? WHERE username = ?', [newRole, username]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
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

    const [rows] = await db.query('SELECT id, username, full_name, role, phone, photo, created_at FROM users WHERE username = ?', [username]);
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

    const [result] = await db.query('DELETE FROM users WHERE username = ?', [username]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Audit trail
    logger.warn('User deleted', { deletedUser: username, deletedBy: req.session.user.username });

    res.json({ message: 'User deleted successfully' });
}));

// Admin/Owner Update User
router.post('/admin/users/update', isAuthenticated, isAdmin, [
    body('originalUsername').trim().escape(),
    body('fullName').optional().trim().escape(),
    body('role').optional().isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role'),
    body('phone').optional().trim().escape(),
    body('password').optional().isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { originalUsername, fullName, password, phone, role } = req.body;

    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [originalUsername]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    const user = rows[0];

    const standardPhone = phone ? (sanitizePhone(phone) || phone) : user.phone;
    let query = 'UPDATE users SET full_name = ?, phone = ?, role = ?';
    let params = [fullName || user.full_name, standardPhone, role || user.role];

    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(user.id);

    await db.query(query, params);
    res.json({ message: 'User updated successfully' });
}));

module.exports = router;
