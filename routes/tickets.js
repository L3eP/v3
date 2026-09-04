const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const upload = require('../middleware/upload');
const { body, validationResult } = require('express-validator');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { notifyTicketCreated, notifyTicketUpdated } = require('../services/notification');
const { audit } = require('../middleware/audit');
const logger = require('../utils/logger');
const { cleanupUploadOnError } = require('../utils/uploads');
const { mutationLimiter } = require('../middleware/rateLimits');

// 3.2 — Rate limiter mutasi (POST/PUT/DELETE; GET dilewati) per endpoint group
router.use(mutationLimiter('tickets'));

// Helper to map DB ticket to Frontend ticket
const mapTicket = (ticket) => {
    return {
        id: ticket.id,
        aktifitas: ticket.aktifitas,
        subNode: ticket.sub_node,
        odc: ticket.odc,
        odp: ticket.odp,
        lokasi: ticket.lokasi,
        pic: ticket.pic,
        priority: ticket.priority,
        status: ticket.status,
        info: ticket.info,
        evidence: ticket.evidence,
        createdBy: ticket.created_by,
        createdAt: ticket.created_at,
        dateSelesai: ticket.date_selesai,
        psbId: ticket.psb_id
    };
};

// Create Ticket
// Helper: validasi referensi. odc/odp sumbernya ftth_devices (bukan
// reference_options) — sejak dropdown ODC di form tiket diarahkan ke
// /api/ftth (lihat public/js/ticket-list.js), label seperti "E33"/"Medioker"/
// "skripsi-odc" yang hanya ada di ftth_devices akan SELALU gagal validasi
// "ODC tidak valid" kalau helper ini masih cek reference_options — itu bikin
// create/update tiket gagal validasi walau ODC dipilih dari dropdown app
// sendiri. aktifitas/sub_node/priority TETAP di reference_options (sumbernya
// tidak berubah).
async function validateRef(type, label) {
  if (!label) return true; // allow empty
  if (type === 'odc' || type === 'odp') {
    const [rows] = await db.query("SELECT id FROM ftth_devices WHERE type = ? AND label = ?", [type, label]);
    return rows.length > 0;
  }
  const [rows] = await db.query("SELECT id FROM reference_options WHERE type = ? AND label = ?", [type, label]);
  return rows.length > 0;
}

// PIC sebelumnya tidak divalidasi sama sekali (beda dari aktifitas/odc/priority
// yang selalu dicek via validateRef) — tiket bisa ditugaskan ke username yang
// tidak ada atau sudah di-soft-delete, dan notifikasi WA-nya gagal diam-diam.
async function validateUsername(username) {
  if (!username) return true; // allow empty
  const [rows] = await db.query("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL", [username]);
  return rows.length > 0;
}

// Relasi data sungguhan tiket->PSB (Peta Jalan Fase 1) — dasar untuk auto-sync
// status PSB saat tiket instalasinya selesai (Fase 2). Sebelumnya cuma
// tersambung lewat teks bebas di kolom info yang tidak pernah divalidasi.
async function validatePsbId(psbId) {
  if (!psbId) return true; // allow empty
  const [rows] = await db.query("SELECT id FROM psb WHERE id = ?", [psbId]);
  return rows.length > 0;
}

router.post('/tickets', isAuthenticated, upload.single('evidence'), [
    // aktifitas/subNode/odc/priority TIDAK di-escape(): nilainya divalidasi via
    // validateRef() terhadap label yang tersimpan APA ADANYA di reference_options
    // (aktifitas/sub_node/priority) atau ftth_devices (odc — lihat validateRef()
    // di atas). Kedua tabel itu tidak mem-escape saat insert (references.js dan
    // ftth.js). Label berisi & < > " ' akan ter-entity-encode di sini lalu tidak
    // pernah cocok dengan label asli — tiket ditolak "tidak valid" walau dipilih
    // dari dropdown app sendiri. Rendering aman tetap dilakukan di frontend
    // (esc() sebelum masuk DOM).
    body('aktifitas').trim().notEmpty(),
    body('subNode').trim(),
    body('odc').trim(),
    body('lokasi').trim().escape(),
    body('pic').trim().escape(),
    body('priority').trim(),
    body('info').trim().escape(),
    body('aktifitas').custom(async (val) => {
      if (val && !(await validateRef('aktifitas', val))) throw new Error('Aktifitas tidak valid');
    }),
    body('subNode').custom(async (val) => {
      if (val && !(await validateRef('sub_node', val))) throw new Error('Sub-node tidak valid');
    }),
    body('odc').custom(async (val) => {
      if (val && !(await validateRef('odc', val))) throw new Error('ODC tidak valid');
    }),
    body('priority').custom(async (val) => {
      if (val && !(await validateRef('priority', val))) throw new Error('Priority tidak valid');
    }),
    body('pic').custom(async (val) => {
      if (val && !(await validateUsername(val))) throw new Error('PIC tidak valid — user tidak ditemukan');
    }),
    body('psbId').optional({ checkFalsy: true }).isInt().custom(async (val) => {
      if (val && !(await validatePsbId(val))) throw new Error('PSB tidak ditemukan');
    })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: "Validation failed", errors: errors.array() });
    }
    const { aktifitas, subNode, odc, lokasi, pic, priority, status, info, createdBy, odp, psbId } = req.body;

    if (req.session.user.username !== createdBy) {
        return res.status(403).json({ message: 'Forbidden: Invalid creator' });
    }

    // 2.2 — Status awal hanya Terlapor atau Pending. Tidak boleh create langsung
    // "Selesai": alur penyelesaian hanya lewat endpoint update (VALID_TRANSITIONS).
    const INITIAL_STATUSES = ['Terlapor', 'Pending'];
    const newStatus = status || 'Terlapor';
    if (status && !INITIAL_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Status awal hanya bisa ${INITIAL_STATUSES.join(' atau ')}` });
    }

    const evidence = req.file ? `/uploads/${req.file.filename}` : null;
    const createdAt = new Date();

    // 2.1 — INSERT tiket + INSERT riwayat status dalam SATU transaksi di koneksi
    // yang sama. Kalau salah satu gagal di tengah, semuanya di-rollback → tidak
    // ada tiket tanpa riwayat (atau riwayat tanpa tiket).
    const connection = await db.getConnection();
    let result;
    try {
        await connection.beginTransaction();

        [result] = await connection.query(
            'INSERT INTO tickets (aktifitas, sub_node, odc, odp, lokasi, pic, priority, status, info, evidence, created_by, created_at, psb_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [aktifitas, subNode, odc, odp || null, lokasi, pic, priority, newStatus, info, evidence, createdBy, createdAt, psbId || null]
        );

        // Catat event pembuatan tiket ke riwayat status (old=NULL, new=status awal)
        // Ini membuat timeline detail selalu mulai dari "Terlapor" / status awal.
        await connection.query(
          'INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by) VALUES (?, NULL, ?, ?)',
          [result.insertId, newStatus, req.session.user.username]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        cleanupUploadOnError(req);
        throw error;
    } finally {
        connection.release();
    }

    const newTicket = {
        id: result.insertId,
        aktifitas,
        subNode,
        odc,
        odp: odp || null,
        lokasi,
        pic,
        priority,
        status: newStatus,
        info,
        evidence,
        createdBy,
        createdAt,
        psbId: psbId || null
    };

    // Kirim notifikasi WA (fire-and-forget — tidak nunggu response)
    notifyTicketCreated(newTicket).catch(err => logger.error('WA notify failed:', err));

    res.status(201).json({ message: 'Ticket created successfully', ticket: newTicket });
    audit(req, "CREATE", "ticket", newTicket.id, { aktifitas, lokasi, pic, priority });
}));

const SOFT_DELETE_CLAUSE = 'deleted_at IS NULL';

// LIKE wildcard di input user (%, _) tidak boleh diperlakukan sebagai wildcard
// SQL — tanpa ini pencarian "%" cocok dengan semua baris, bukan literal "%".
const escapeLike = (str) => str.replace(/[\\%_]/g, (ch) => '\\' + ch);

// Helper to build WHERE clause for ticket filters
const buildTicketWhere = (filters) => {
    const clauses = [SOFT_DELETE_CLAUSE];
    const params = [];

    if (filters.search) {
        const searchPattern = `%${escapeLike(filters.search)}%`;
        clauses.push("(aktifitas LIKE ? ESCAPE '\\\\' OR sub_node LIKE ? ESCAPE '\\\\' OR lokasi LIKE ? ESCAPE '\\\\' OR pic LIKE ? ESCAPE '\\\\' OR info LIKE ? ESCAPE '\\\\')");
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (filters.status && filters.status !== 'All') {
        const statusList = filters.status.split(',').map(s => s.trim()).filter(Boolean);
        if (statusList.length === 1) {
            clauses.push('status = ?');
            params.push(statusList[0]);
        } else if (statusList.length > 1) {
            clauses.push('status IN (' + statusList.map(() => '?').join(', ') + ')');
            params.push(...statusList);
        }
    }

    if (filters.priority && filters.priority !== 'All') {
        clauses.push('priority = ?');
        params.push(filters.priority);
    }

    if (filters.startDate) {
        const d = new Date(filters.startDate);
        // Tanggal tak valid dari query string diabaikan (bukan 500) — mysql2
        // menolak Invalid Date, jadi filter cukup di-skip alih-alih meledak.
        if (!isNaN(d.getTime())) {
            clauses.push('created_at >= ?');
            params.push(d);
        }
    }

    if (filters.endDate) {
        const d = new Date(filters.endDate);
        if (!isNaN(d.getTime())) {
            clauses.push('created_at <= ?');
            params.push(d);
        }
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

    // Server-side sorting
    const SORT_MAP = {
        id: 'id', aktifitas: 'aktifitas', subNode: 'sub_node',
        priority: 'priority', status: 'status', createdAt: 'created_at',
        lokasi: 'lokasi', pic: 'pic',
    };
    let sortColumn = 'created_at';
    let sortDir = 'DESC';
    const rawSort = req.query.sort || '';
    const rawOrder = (req.query.order || '').toUpperCase();
    if (rawSort && SORT_MAP[rawSort]) {
        sortColumn = SORT_MAP[rawSort];
        sortDir = rawOrder === 'ASC' ? 'ASC' : 'DESC';
    }

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
            'SELECT * FROM tickets' + finalWhere + ' ORDER BY ' + sortColumn + ' ' + sortDir + ' LIMIT ? OFFSET ?',
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
        'SELECT * FROM tickets' + finalWhere + ' ORDER BY ' + sortColumn + ' ' + sortDir,
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
router.post('/tickets/:id/update', isAuthenticated, upload.single('evidence'), [
    // Lihat catatan di POST /tickets — field yang divalidasi via validateRef()
    // tidak boleh di-escape().
    body('aktifitas').optional().trim(),
    body('subNode').optional().trim(),
    body('odc').optional().trim(),
    body('lokasi').optional().trim().escape(),
    body('pic').optional().trim().escape(),
    body('priority').optional().trim(),
    body('info').optional().trim().escape(),
    body('aktifitas').optional().custom(async (val) => {
      if (val && !(await validateRef('aktifitas', val))) throw new Error('Aktifitas tidak valid');
    }),
    body('subNode').optional().custom(async (val) => {
      if (val && !(await validateRef('sub_node', val))) throw new Error('Sub-node tidak valid');
    }),
    body('odc').optional().custom(async (val) => {
      if (val && !(await validateRef('odc', val))) throw new Error('ODC tidak valid');
    }),
    body('priority').optional().custom(async (val) => {
      if (val && !(await validateRef('priority', val))) throw new Error('Priority tidak valid');
    }),
    body('pic').optional().custom(async (val) => {
      if (val && !(await validateUsername(val))) throw new Error('PIC tidak valid — user tidak ditemukan');
    })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const ticketId = parseInt(req.params.id);
    const { status, info, pic, priority, subNode, odc, odp, lokasi, aktifitas } = req.body;

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
    const fieldUpdates = { status, info, pic, priority, subNode, odc, odp, lokasi, aktifitas };

    let updates = [];
    let params = [];

    for (const [field, value] of Object.entries(fieldUpdates)) {
        if (value === undefined) continue;
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

    // === Validasi: status empty string tidak diizinkan ===
    if (status !== undefined && status !== null && status.trim() === '') {
        return res.status(400).json({ message: 'Status tidak boleh kosong' });
    }
    // (Validasi workflow status DIPINDAH ke dalam transaksi — dicek terhadap baris
    //  yang dikunci FOR UPDATE, jadi basis transisinya state TERBARU, bukan
    //  snapshot lama yang bisa kedaluwarsa saat dua request datang bersamaan.)

    let psbAutoSynced = null;
    if (updates.length > 0) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 2.3 — Kunci baris tiket (FOR UPDATE) pada koneksi transaksi yang SAMA.
            // Dua update paralel: request kedua BLOCK sampai yang pertama commit,
            // lalu membaca status terbaru → validasi transisi & tulis history tetap
            // konsisten (lost-update / double-write status dicegah).
            const [lockedRows] = await connection.query(
                'SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
                [ticketId]
            );
            if (lockedRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Ticket not found' });
            }
            const current = lockedRows[0];

            // === Validasi workflow status (berbasis state terkunci) ===
            if (status !== undefined && status !== null && status !== current.status) {
                const validNext = VALID_TRANSITIONS[current.status];
                if (!validNext || !validNext.includes(status)) {
                    await connection.rollback();
                    return res.status(400).json({
                        message: `Status tidak valid: "${current.status}" tidak bisa langsung ke "${status}". ` +
                            `Status yang diizinkan: ${(validNext || []).join(', ') || '(tidak ada)'}`
                    });
                }
            }

            let query = 'UPDATE tickets SET ' + updates.join(', ') + ' WHERE id = ?';
            await connection.query(query, [...params, ticketId]);

            // Log Status Change if applicable
            if (status !== undefined && status !== null && status !== current.status) {
                await connection.query(
                    'INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
                    [ticketId, current.status, status, req.session.user.username]
                );

                // date_selesai: tulis saat masuk Selesai, kosongkan saat keluar dari Selesai
                if (status === 'Selesai') {
                    await connection.query('UPDATE tickets SET date_selesai = NOW() WHERE id = ?', [ticketId]);
                } else if (current.status === 'Selesai') {
                    await connection.query('UPDATE tickets SET date_selesai = NULL WHERE id = ?', [ticketId]);
                }

                // Peta Jalan Fase 2 — auto-sync psb.status saat tiket instalasinya
                // "Selesai". Sebelumnya loop laporan→dikerjakan→selesai terputus
                // persis di sini: menandai tiket selesai tidak pernah menyentuh
                // status PSB, staf harus ingat mengubahnya manual di halaman lain.
                // Sengaja HANYA maju (Terdaftar→Terpasang), tidak pernah mundur
                // otomatis saat tiket dibuka kembali — membuka ulang tiket tidak
                // berarti ONU dicabut, dan status PSB bisa sudah dimajukan manual
                // lebih jauh (Aktif) oleh staf. WHERE status='Terdaftar' juga
                // mencegah menimpa 'Batal' kalau PSB-nya sudah dibatalkan duluan.
                if (status === 'Selesai' && current.psb_id) {
                    const [psbSyncResult] = await connection.query(
                        "UPDATE psb SET status = 'Terpasang' WHERE id = ? AND status = 'Terdaftar'",
                        [current.psb_id]
                    );
                    if (psbSyncResult.affectedRows > 0) psbAutoSynced = current.psb_id;
                }
            }

            await connection.commit();

            // Notifikasi WA saat status berubah (fire-and-forget setelah commit)
            if (status !== undefined && status !== null && status !== current.status) {
                notifyTicketUpdated(ticketId, current.status, status, req.session.user.username, current)
                    .catch(err => logger.error('WA notify failed:', err));
            }

            // Hapus evidence lama — tanpa ini public/uploads tumbuh tanpa batas
            // setiap kali evidence diganti (file lama tidak pernah dipakai lagi).
            if (req.file && current.evidence && current.evidence.startsWith('/uploads/')) {
                const prevPath = path.join(__dirname, '../public', current.evidence);
                fs.unlink(prevPath, (err) => {
                    if (err && err.code !== 'ENOENT') logger.error('Failed to remove old evidence file', { prevEvidence: current.evidence, error: err.message });
                });
            }
        } catch (error) {
            await connection.rollback();
            cleanupUploadOnError(req);
            throw error;
        } finally {
            connection.release();
        }
    }

    const [updatedRows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    res.json({ message: 'Ticket updated successfully', ticket: mapTicket(updatedRows[0]) });
    audit(req, "UPDATE", "ticket", ticketId, { status: req.body.status, pic: req.body.pic });
    if (psbAutoSynced) {
        audit(req, "UPDATE", "psb", psbAutoSynced, { status: 'Terpasang', trigger: `auto-sync dari ticket #${ticketId} selesai` });
    }
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
         ORDER BY h.changed_at ASC`,
        [ticketId]
    );
    res.json(history);
}));

// Delete Ticket (Soft-Delete — Owner only)
router.delete('/tickets/:id', isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.id);
    // Check existence
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticket = rows[0];

    // Cek apakah sudah di-soft-delete sebelumnya
    if (ticket.deleted_at) {
        return res.status(400).json({ message: 'Ticket sudah dihapus sebelumnya' });
    }

    // Soft-delete: set deleted_at instead of hard DELETE
    await db.query('UPDATE tickets SET deleted_at = NOW() WHERE id = ?', [ticketId]);

    // Audit trail
    logger.info('Ticket soft-deleted', { ticketId, deletedBy: req.session.user.username });

    res.json({ message: 'Ticket berhasil diarsipkan' });
    audit(req, "DELETE", "ticket", ticketId, { deleted_by: req.session.user.username });
}));

// Auto-assign PIC — cari Teknisi dengan beban tiket paling ringan
router.get('/api/auto-pic', isAuthenticated, asyncHandler(async (req, res) => {
    const subNode = req.query.subNode ? String(req.query.subNode).trim() : '';

    // Kalau sub_node tiket diketahui, prioritaskan Teknisi yang wilayah
    // default-nya (users.default_sub_node) sama dulu, baru urutkan berdasar
    // beban paling ringan DI ANTARA yang cocok. is_local dipakai sebagai kunci
    // urut pertama (bukan filter WHERE) supaya kalau tidak ada satupun yang
    // cocok, tetap jatuh ke Teknisi manapun dengan beban paling ringan
    // (fallback global), bukan malah tidak dapat PIC sama sekali.
    const [rows] = await db.query(`
        SELECT u.username, u.full_name, u.default_sub_node,
            COUNT(t.id) as active_tickets,
            (u.default_sub_node IS NOT NULL AND u.default_sub_node = ?) as is_local
        FROM users u
        LEFT JOIN tickets t ON t.pic = u.username
            AND t.status IN ('Terlapor', 'Dikerjakan')
            AND t.deleted_at IS NULL
        WHERE u.role = 'Teknisi' AND u.deleted_at IS NULL
        GROUP BY u.username, u.full_name, u.default_sub_node
        ORDER BY is_local DESC, active_tickets ASC
        LIMIT 1
    `, [subNode || null]);
    if (rows.length > 0) {
        return res.json({
            pic: rows[0].username,
            fullName: rows[0].full_name,
            activeTickets: rows[0].active_tickets,
            matchedSubNode: !!rows[0].is_local
        });
    }
    res.json({ pic: null, fullName: null, activeTickets: 0, matchedSubNode: false });
}));

module.exports = router;
