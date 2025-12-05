const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const { body, validationResult } = require('express-validator');
const { isAuthenticated } = require('../middleware/auth');

// Helper to map DB ticket to Frontend ticket
const mapTicket = (ticket) => {
    return {
        id: ticket.id,
        aktifitas: ticket.aktifitas,
        subNode: ticket.sub_node,
        odc: ticket.odc,
        lokasi: ticket.lokasi,
        pic: ticket.pic,
        priority: ticket.priority,
        status: ticket.status,
        info: ticket.info,
        evidence: ticket.evidence,
        createdBy: ticket.created_by,
        createdAt: ticket.created_at
    };
};

// Create Ticket
router.post('/tickets', isAuthenticated, upload.single('evidence'), [
    body('aktifitas').trim().notEmpty().escape(),
    body('subNode').trim().escape(),
    body('odc').trim().escape(),
    body('lokasi').trim().escape(),
    body('pic').trim().escape(),
    body('priority').trim().escape(),
    body('info').trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { aktifitas, subNode, odc, lokasi, pic, priority, status, info, createdBy } = req.body;

    if (req.session.user.username !== createdBy) {
        return res.status(403).json({ message: 'Forbidden: Invalid creator' });
    }

    const evidence = req.file ? `/uploads/${req.file.filename}` : null;
    const createdAt = req.body.createdAt ? new Date(req.body.createdAt) : new Date();

    try {
        const [result] = await db.query(
            'INSERT INTO tickets (aktifitas, sub_node, odc, lokasi, pic, priority, status, info, evidence, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [aktifitas, subNode, odc, lokasi, pic, priority, status || 'Terlapor', info, evidence, createdBy, createdAt]
        );

        const newTicket = {
            id: result.insertId,
            aktifitas,
            subNode,
            odc,
            lokasi,
            pic,
            priority,
            status: status || 'Terlapor',
            info,
            evidence,
            createdBy,
            createdAt
        };

        res.status(201).json({ message: 'Ticket created successfully', ticket: newTicket });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Tickets
router.get('/tickets', isAuthenticated, async (req, res) => {
    try {
        // If Admin/Owner/Operator, show all. If Teknisi, show only theirs?
        // Requirement usually implies Dashboard shows all. Keeping as is for now, but IDOR check is more for specific item access.
        // However, for strict security, we might want to filter lists too.
        // For now, we'll keep list open (as per dashboard requirement) but lock down specific actions.
        const [rows] = await db.query('SELECT * FROM tickets ORDER BY created_at DESC');
        const tickets = rows.map(mapTicket);
        res.json(tickets);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Ticket Details (IDOR Protected)
router.get('/tickets/:id', isAuthenticated, async (req, res) => {
    const ticketId = parseInt(req.params.id);
    try {
        const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const ticket = rows[0];

        // Access Control
        const isOwner = ticket.created_by === req.session.user.username;
        const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to view this ticket.' });
        }

        res.json(mapTicket(ticket));
    } catch (error) {
        console.error('Get ticket details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Ticket (IDOR Protected)
router.post('/tickets/:id/update', isAuthenticated, upload.single('evidence'), async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const { status, info, pic, priority, subNode, odc, lokasi, aktifitas } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const ticket = rows[0];

        // Access Control
        const isOwner = ticket.created_by === req.session.user.username;
        const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to edit this ticket.' });
        }

        let query = 'UPDATE tickets SET ';
        let params = [];
        let updates = [];

        if (status) { updates.push('status = ?'); params.push(status); }
        if (info) { updates.push('info = ?'); params.push(info); }
        if (pic) { updates.push('pic = ?'); params.push(pic); }
        if (priority) { updates.push('priority = ?'); params.push(priority); }
        if (subNode) { updates.push('sub_node = ?'); params.push(subNode); }
        if (odc !== undefined) { updates.push('odc = ?'); params.push(odc); }
        if (lokasi) { updates.push('lokasi = ?'); params.push(lokasi); }
        if (aktifitas) { updates.push('aktifitas = ?'); params.push(aktifitas); }

        if (req.file) {
            updates.push('evidence = ?');
            params.push(`/uploads/${req.file.filename}`);
        }

        if (updates.length > 0) {
            query += updates.join(', ') + ' WHERE id = ?';
            params.push(ticketId);
            await db.query(query, params);
        }

        const [updatedRows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        res.json({ message: 'Ticket updated successfully', ticket: mapTicket(updatedRows[0]) });

    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete Ticket (IDOR Protected)
router.delete('/tickets/:id', isAuthenticated, async (req, res) => {
    const ticketId = parseInt(req.params.id);
    try {
        // Check existence and ownership first
        const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const ticket = rows[0];

        // Access Control
        const isOwner = ticket.created_by === req.session.user.username;
        const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to delete this ticket.' });
        }

        const [result] = await db.query('DELETE FROM tickets WHERE id = ?', [ticketId]);
        res.json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        console.error('Delete ticket error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
