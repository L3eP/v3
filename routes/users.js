const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const { isAuthenticated, isAdmin, isOwnerOrOperator } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Configure Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'))
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

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

// ... (imports)

// ... (imports)

// Update Profile
router.post('/update-profile', isAuthenticated, upload.single('photo'), async (req, res) => {
    const { username, currentPassword, newPassword, phone } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    if (req.session.user.username !== username) {
        return res.status(403).json({ message: 'Forbidden: Cannot update other users profile' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        let query = 'UPDATE users SET phone = ?';
        let params = [phone || user.phone];

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
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (Owner and Operator can view)
router.get('/users', isAuthenticated, isOwnerOrOperator, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM users');
        const users = rows.map(mapUser);
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update User Role (Owner only)
router.post('/update-role', isAuthenticated, isAdmin, async (req, res) => {
    const { username, newRole } = req.body;

    try {
        const [result] = await db.query('UPDATE users SET role = ? WHERE username = ?', [newRole, username]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Single User
router.get('/users/:username', isAuthenticated, async (req, res) => {
    const { username } = req.params;

    // Owner, Operator, or the user themselves can view details
    const isSelf = req.session.user.username === username;
    const isPrivileged = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

    if (!isPrivileged && !isSelf) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(mapUser(rows[0]));
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete User (Owner only)
router.delete('/users/:username', isAuthenticated, isAdmin, async (req, res) => {
    const { username } = req.params;
    try {
        const [result] = await db.query('DELETE FROM users WHERE username = ?', [username]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Admin/Owner Update User
router.post('/admin/users/update', isAuthenticated, isAdmin, async (req, res) => {
    // ... (implementation remains same, isAdmin ensures Owner only)
    const { originalUsername, fullName, password, phone, role } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [originalUsername]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = rows[0];

        let query = 'UPDATE users SET full_name = ?, phone = ?, role = ?';
        let params = [fullName || user.full_name, phone || user.phone, role || user.role];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(user.id);

        await db.query(query, params);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
