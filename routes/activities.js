const express = require('express');
const router = express.Router();
const db = require('../db');
const { body, validationResult } = require('express-validator');
const { isAuthenticated } = require('../middleware/auth');

// Create Activity
router.post('/activities', isAuthenticated, [
    body('description').trim().notEmpty().escape(),
    body('username').trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { description, username } = req.body;

    if (req.session.user.username !== username) {
        return res.status(403).json({ message: 'Forbidden: Cannot log activity for others' });
    }

    const date = new Date();

    try {
        const [result] = await db.query(
            'INSERT INTO activities (description, username, date) VALUES (?, ?, ?)',
            [description, username, date]
        );

        const newActivity = {
            id: result.insertId,
            description,
            username,
            date: date.toISOString()
        };

        res.status(201).json({ message: 'Activity logged successfully', activity: newActivity });
    } catch (error) {
        console.error('Create activity error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Activities
router.get('/activities', isAuthenticated, async (req, res) => {
    const { username } = req.query;
    const user = req.session.user;

    // Allow if:
    // 1. User is trying to view their own activities
    // 2. User has 'Owner' or 'Operator' role (can view all)
    // 3. User has 'Admin' role (legacy check, keeping for safety)

    const isSelf = user.username === username;
    const isPrivileged = user.role === 'Owner' || user.role === 'Operator' || user.role === 'Admin';

    // If filtering by username, ensure we are allowed to see that user
    if (username && !isSelf && !isPrivileged) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // If NO username is provided (view all), only Privileged users can do that
    if (!username && !isPrivileged) {
        // If not privileged, force filter to self? Or return 403?
        // Usually safer to return 403 or auto-filter. 
        // Let's auto-filter to self if they try to view all but aren't privileged.
        // But the current implementation returns 403. Let's stick to 403 for specific "view all" request.
        return res.status(403).json({ message: 'Forbidden: Access restricted' });
    }

    try {
        let query = 'SELECT * FROM activities';
        let params = [];

        if (username) {
            query += ' WHERE username = ?';
            params.push(username);
        }

        query += ' ORDER BY date DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
