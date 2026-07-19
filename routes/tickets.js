const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const { body, validationResult } = require('express-validator');
const { isAuthenticated } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { notifyTicketCreated, notifyTicketUpdated } = require('../services/notification');
const logger = require('../utils/logger');

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
        createdAt: ticket.created_at,
        dateSelesai: ticket.date_selesai
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
], asyncHandler(async (req, res) => {
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

    // Kirim notifikasi WA (fire-and-forget — tidak nunggu response)
    notifyTicketCreated(newTicket).catch(err => logger.error('WA notify failed:', err));

    res.status(201).json({ message: 'Ticket created successfully', ticket: newTicket });
}));

const SOFT_DELETE_CLAUSE = 'deleted_at IS NULL';

// Helper to build WHERE clause for ticket filters
const buildTicketWhere = (filters) => {
    const clauses = [SOFT_DELETE_CLAUSE];
    const params = [];

    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        clauses.push('(aktifitas LIKE ? OR sub_node LIKE ? OR lokasi LIKE ? OR pic LIKE ? OR info LIKE ?)');
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (filters.status && filters.status !== 'All') {
        clauses.push('status = ?');
        params.push(filters.status);
    }

    if (filters.priority && filters.priority !== 'All') {
        clauses.push('priority = ?');
        params.push(filters.priority);
    }

    if (filters.startDate) {
        clauses.push('created_at >= ?');
        params.push(new Date(filters.startDate));
    }

    if (filters.endDate) {
        clauses.push('created_at <= ?');
        params.push(new Date(filters.endDate));
    }

    return { where: ' WHERE ' + clauses.join(' AND '), params };
};

// Get Tickets (Supports Backend Pagination & Filtering)
router.get('/tickets', isAuthenticated, asyncHandler(async (req, res) => {
    const user = req.session.user;
    const page = parseInt(req.query.page) || null;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

    const filters = {
        search: req.query.search || '',
        status: req.query.status || '',
        priority: req.query.priority || '',
        startDate: req.query.startDate || '',
        endDate: req.query.endDate || ''
    };

    const { where, params } = buildTicketWhere(filters);

    // RBAC Filtering: Teknisi hanya lihat tiket miliknya sendiri atau jadi PIC
    let roleWhere = '';
    let roleParams = [];
    if (user.role === 'Teknisi') {
        const roleClause = '(created_by = ? OR pic = ?)';
        roleWhere = ' AND ' + roleClause;
        roleParams = [user.username, user.username];
    }

    const finalWhere = where + roleWhere;
    const finalParams = [...params, ...roleParams];

    if (page) {
        // Paginated response
        const offset = (page - 1) * limit;

        const [rows] = await db.query(
            'SELECT * FROM tickets' + finalWhere + ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [...finalParams, limit, offset]
        );
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM tickets' + finalWhere,
            finalParams
        );
        const total = countResult[0].total;

        return res.json({
            data: rows.map(mapTicket),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    }

    // Backward compatible: return all tickets (used by dashboard)
    const [rows] = await db.query(
        'SELECT * FROM tickets' + finalWhere + ' ORDER BY created_at DESC',
        finalParams
    );
    const tickets = rows.map(mapTicket);
    res.json(tickets);
}));

// Get Ticket Details (IDOR Protected)
router.get('/tickets/:id', isAuthenticated, asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL', [ticketId]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticket = rows[0];

    // Access Control — Creator, PIC (teknisi assigned), Owner, or Operator
    const isOwner = ticket.created_by === req.session.user.username;
    const isPIC = ticket.pic === req.session.user.username;
    const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

    if (!isOwner && !isPIC && !isAdmin) {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to view this ticket.' });
    }

    res.json(mapTicket(ticket));
}));

// Valid status transitions — tidak boleh lompat
const VALID_TRANSITIONS = {
    'Terlapor': ['Dikerjakan', 'Pending'],
    'Dikerjakan': ['Selesai', 'Pending', 'Terlapor'],
    'Selesai': ['Dikerjakan'],
    'Pending': ['Dikerjakan', 'Terlapor']
};

// Update Ticket (IDOR Protected)
router.post('/tickets/:id/update', isAuthenticated, upload.single('evidence'), asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const { status, info, pic, priority, subNode, odc, lokasi, aktifitas } = req.body;

    // Hanya cari tiket yang belum di-soft-delete
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL', [ticketId]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticket = rows[0];

    // Access Control — Creator, PIC, Owner, or Operator
    const isOwner = ticket.created_by === req.session.user.username;
    const isPIC = ticket.pic === req.session.user.username;
    const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';
    const isTeknisi = req.session.user.role === 'Teknisi';

    if (!isOwner && !isPIC && !isAdmin) {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to edit this ticket.' });
    }

    // Role-based field restriction: Teknisi hanya boleh edit status, info, dan evidence
    const allowedTeknisiFields = new Set(['status', 'info', 'evidence']);
    const fieldUpdates = { status, info, pic, priority, subNode, odc, lokasi, aktifitas };

    let updates = [];
    let params = [];

    for (const [field, value] of Object.entries(fieldUpdates)) {
        if (value === undefined && field !== 'odc') continue;
        if (field === 'odc' && value === undefined) continue;
        if (isTeknisi && !allowedTeknisiFields.has(field)) continue;
        const dbField = field === 'subNode' ? 'sub_node' : field;
        updates.push(`${dbField} = ?`);
        params.push(value);
    }

    if (req.file) {
        if (!isTeknisi || allowedTeknisiFields.has('evidence')) {
            updates.push('evidence = ?');
            params.push(`/uploads/${req.file.filename}`);
        }
    }

    // === Task 23: Validasi workflow status ===
    if (status && status !== ticket.status) {
        const validNext = VALID_TRANSITIONS[ticket.status];
        if (!validNext || !validNext.includes(status)) {
            return res.status(400).json({
                message: `Status tidak valid: "${ticket.status}" tidak bisa langsung ke "${status}". ` +
                    `Status yang diizinkan: ${(validNext || []).join(', ') || '(tidak ada)'}`
            });
        }
    }

    if (updates.length > 0) {
        let query = 'UPDATE tickets SET ' + updates.join(', ') + ' WHERE id = ?';
        params.push(ticketId);
        await db.query(query, params);

        // Log Status Change if applicable
        if (status && status !== ticket.status) {
            await db.query(
                'INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
                [ticketId, ticket.status, status, req.session.user.username]
            );
            // Notifikasi WA saat status berubah
            notifyTicketUpdated(ticketId, ticket.status, status, req.session.user.username, ticket).catch(err => logger.error('WA notify failed:', err));
        }
    }

    const [updatedRows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    res.json({ message: 'Ticket updated successfully', ticket: mapTicket(updatedRows[0]) });
}));

// Get Ticket History
router.get('/tickets/:id/history', isAuthenticated, asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.id);
    // Access Control (Same as details) — history tetap bisa diakses untuk tiket yang dihapus
    const [ticketRows] = await db.query('SELECT created_by, pic FROM tickets WHERE id = ?', [ticketId]);
    if (ticketRows.length === 0) return res.status(404).json({ message: 'Ticket not found' });

    const isOwner = ticketRows[0].created_by === req.session.user.username;
    const isPIC = ticketRows[0].pic === req.session.user.username;
    const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

    if (!isOwner && !isPIC && !isAdmin) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const [history] = await db.query(
        `SELECT h.*, u.full_name, u.role, u.photo
         FROM ticket_status_history h
         LEFT JOIN users u ON h.changed_by = u.username
         WHERE h.ticket_id = ?
         ORDER BY h.changed_at DESC`,
        [ticketId]
    );
    res.json(history);
}));

// Delete Ticket (Soft-Delete — IDOR Protected)
router.delete('/tickets/:id', isAuthenticated, asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.id);
    // Check existence and ownership first (termasuk yang sudah soft-delete)
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticket = rows[0];

    // Cek apakah sudah di-soft-delete sebelumnya
    if (ticket.deleted_at) {
        return res.status(400).json({ message: 'Ticket sudah dihapus sebelumnya' });
    }

    // Access Control
    const isOwner = ticket.created_by === req.session.user.username;
    const isAdmin = req.session.user.role === 'Owner' || req.session.user.role === 'Operator';

    if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to delete this ticket.' });
    }

    // Soft-delete: set deleted_at instead of hard DELETE
    await db.query('UPDATE tickets SET deleted_at = NOW() WHERE id = ?', [ticketId]);

    // Audit trail
    logger.info('Ticket soft-deleted', { ticketId, deletedBy: req.session.user.username });

    res.json({ message: 'Ticket berhasil diarsipkan' });
}));

module.exports = router;
