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

    if (req.session.user.role !== 'Admin' && req.session.user.username !== username) {
        return res.status(403).json({ message: 'Forbidden' });
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
