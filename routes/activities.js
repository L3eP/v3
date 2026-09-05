const express = require("express");
const router = express.Router();
const db = require("../db");
const { body, validationResult } = require("express-validator");
const { isAuthenticated } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const logger = require("../utils/logger");
const { audit } = require("../middleware/audit");
const { mutationLimiter } = require("../middleware/rateLimits");
const { notifyTicketUpdated } = require("../services/notification");

// Status tiket yang boleh dimajukan otomatis ke "Dikerjakan" saat Teknisi
// mengaitkan log aktivitas ke tiket itu — subset dari VALID_TRANSITIONS di
// routes/tickets.js (Terlapor→Dikerjakan, Pending→Dikerjakan keduanya valid).
// Sengaja tidak menyentuh "Selesai" (tiket sudah tuntas, jangan dibuka paksa
// cuma karena ada catatan aktivitas susulan).
const AUTO_START_FROM = ["Terlapor", "Pending"];

// LIKE wildcard di input user (%, _) tidak boleh diperlakukan sebagai wildcard SQL
const escapeLike = (str) => str.replace(/[\\%_]/g, (ch) => '\\' + ch);

// 3.2 — Rate limiter mutasi per endpoint group
//
// SENGAJA dipasang per-route (bukan router.use(...) blanket) — lihat catatan
// yang sama di routes/users.js soal kenapa router.use(fn) tanpa path bocor
// menghitung request yang ditangani router lain (semua router di-mount di
// path yang sama, '/', lihat server.js).
const activitiesMutationLimiter = mutationLimiter("activities");

// Create Activity
router.post(
  "/activities",
  isAuthenticated,
  activitiesMutationLimiter,
  [
    body("description").trim().notEmpty().escape(),
    body("username").trim().escape(),
    body("ticket_id").optional().trim().escape(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const { description, username, ticket_id } = req.body;

    if (req.session.user.username !== username) {
      return res
        .status(403)
        .json({ message: "Forbidden: Cannot log activity for others" });
    }

    const date = new Date();
    // ticket_id optional — jika tidak diisi atau kosong, simpan sebagai NULL
    const activityTicketId = ticket_id ? parseInt(ticket_id) : null;

    // IDOR guard: tanpa ini, Teknisi bisa POST activity dengan ticket_id tiket
    // MILIK ORANG LAIN, lalu baca balik `tickets.aktifitas` lewat GET /activities
    // (join di bawah tidak dibatasi kepemilikan) — jalan pintas keliling
    // pengecekan per-ticket yang ada di tickets.js. Owner/Operator boleh
    // melampirkan ke tiket manapun; Teknisi hanya ke tiket miliknya (creator/PIC).
    // Ambil baris lengkap (bukan cuma created_by/pic) — statusnya sekalian
    // dipakai untuk auto-start di bawah, tanpa query kedua.
    let ticket = null;
    if (activityTicketId) {
      const [ticketRows] = await db.query(
        "SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL",
        [activityTicketId]
      );
      if (ticketRows.length === 0) {
        return res.status(400).json({ message: "Ticket tidak ditemukan" });
      }
      ticket = ticketRows[0];
      const isPrivileged = req.session.user.role === "Owner" || req.session.user.role === "Operator";
      if (!isPrivileged && ticket.created_by !== req.session.user.username && ticket.pic !== req.session.user.username) {
        return res.status(403).json({ message: "Forbidden: Tiket bukan milik Anda" });
      }
    }

    // Auto-start: Teknisi yang log aktivitas ke tiket yang belum dikerjakan
    // (Terlapor/Pending) otomatis memajukan status tiket itu ke "Dikerjakan" —
    // sinyal "saya mulai kerjakan" tidak perlu langkah terpisah ke halaman
    // tiket. Hanya Teknisi (Owner/Operator sering log aktivitas untuk
    // keperluan admin/rekap, bukan sinyal "mulai kerja"), dan hanya dari
    // status yang memang punya transisi valid ke Dikerjakan (lihat
    // AUTO_START_FROM / VALID_TRANSITIONS di routes/tickets.js).
    const eligibleForAutoStart =
      ticket &&
      req.session.user.role === "Teknisi" &&
      AUTO_START_FROM.includes(ticket.status);

    let autoTransition = null;
    let insertId;

    if (eligibleForAutoStart) {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        // Kunci baris tiket (FOR UPDATE) — cegah race kalau tiket sudah
        // dipindahkan status oleh request lain (mis. update manual) tepat
        // di antara SELECT di atas dan transaksi ini; validasi ulang
        // terhadap state terkunci, bukan snapshot lama.
        const [lockedRows] = await connection.query(
          "SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
          [activityTicketId]
        );
        const current = lockedRows[0];

        if (current && AUTO_START_FROM.includes(current.status)) {
          await connection.query("UPDATE tickets SET status = 'Dikerjakan' WHERE id = ?", [activityTicketId]);
          await connection.query(
            "INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)",
            [activityTicketId, current.status, "Dikerjakan", req.session.user.username]
          );
          autoTransition = { ticketId: activityTicketId, oldStatus: current.status, newStatus: "Dikerjakan", ticketRow: current };
        }

        const [result] = await connection.query(
          "INSERT INTO activities (description, username, date, ticket_id) VALUES (?, ?, ?, ?)",
          [description, username, date, activityTicketId],
        );
        insertId = result.insertId;

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else {
      const [result] = await db.query(
        "INSERT INTO activities (description, username, date, ticket_id) VALUES (?, ?, ?, ?)",
        [description, username, date, activityTicketId],
      );
      insertId = result.insertId;
    }

    const newActivity = {
      id: insertId,
      description,
      username,
      date: date.toISOString(),
      ticket_id: activityTicketId,
    };

    audit(req, "CREATE", "activity", insertId, { ticket_id: activityTicketId });

    if (autoTransition) {
      audit(req, "UPDATE", "ticket", autoTransition.ticketId, {
        status: autoTransition.newStatus,
        trigger: `auto-start dari log aktivitas #${insertId}`,
      });
      // Notifikasi WA saat status berubah (fire-and-forget setelah commit) —
      // konsisten dengan setiap transisi status lain (lihat routes/tickets.js).
      notifyTicketUpdated(
        autoTransition.ticketId,
        autoTransition.oldStatus,
        autoTransition.newStatus,
        req.session.user.username,
        autoTransition.ticketRow
      ).catch((err) => logger.error("WA notify failed:", err));
    }

    res.status(201).json({
      message: "Activity logged successfully",
      activity: newActivity,
      autoTransition: autoTransition
        ? { ticketId: autoTransition.ticketId, oldStatus: autoTransition.oldStatus, newStatus: autoTransition.newStatus }
        : null,
    });
  }),
);

// Get Activities (Supports Backend Pagination)
router.get("/activities", isAuthenticated, asyncHandler(async (req, res) => {
  const user = req.session.user;
  const page = parseInt(req.query.page) || null;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

  let baseQuery = "";
  let countQuery = "";
  let params = [];
  let countParams = [];

  if (
    user.role === "Owner" ||
    user.role === "Operator"
  ) {
    // (role "Admin" dihapus — tidak ada role itu di sistem; cuma Owner/Operator/Teknisi)
    const whereParts = [];

    const usernameFilter = req.query.username;
    if (usernameFilter && typeof usernameFilter === "string" && usernameFilter.trim()) {
      whereParts.push("activities.username = ?");
      params.push(usernameFilter.trim());
      countParams.push(usernameFilter.trim());
    }

    const searchFilter = req.query.search;
    if (searchFilter && typeof searchFilter === "string" && searchFilter.trim()) {
      const pattern = `%${escapeLike(searchFilter.trim())}%`;
      whereParts.push("(activities.description LIKE ? ESCAPE '\\\\' OR activities.username LIKE ? ESCAPE '\\\\')");
      params.push(pattern, pattern);
      countParams.push(pattern, pattern);
    }

    const whereClause = whereParts.length ? " WHERE " + whereParts.join(" AND ") : "";
    baseQuery = `
      SELECT
        activities.*,
        tickets.aktifitas
      FROM activities
      LEFT JOIN tickets ON tickets.id = activities.ticket_id AND tickets.deleted_at IS NULL${whereClause}
    `;
    countQuery = `
      SELECT COUNT(*) as total
      FROM activities
      LEFT JOIN tickets ON tickets.id = activities.ticket_id AND tickets.deleted_at IS NULL${whereClause}
    `;
  } else if (user.role === "Teknisi") {
    const whereParts = ["activities.username = ?"];
    params.push(user.username);
    countParams.push(user.username);

    const searchFilter = req.query.search;
    if (searchFilter && typeof searchFilter === "string" && searchFilter.trim()) {
      const pattern = `%${escapeLike(searchFilter.trim())}%`;
      whereParts.push("activities.description LIKE ? ESCAPE '\\\\'");
      params.push(pattern);
      countParams.push(pattern);
    }

    const whereClause = " WHERE " + whereParts.join(" AND ");
    baseQuery = `
      SELECT
        activities.*,
        tickets.aktifitas
      FROM activities
      LEFT JOIN tickets ON tickets.id = activities.ticket_id AND tickets.deleted_at IS NULL${whereClause}
    `;
    countQuery = `
      SELECT COUNT(*) as total
      FROM activities
      LEFT JOIN tickets ON tickets.id = activities.ticket_id AND tickets.deleted_at IS NULL${whereClause}
    `;
  } else {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (page) {
    // Paginated response
    const offset = (page - 1) * limit;
    baseQuery += " ORDER BY date DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await db.query(baseQuery, params);
    const countResult = countParams.length
      ? await db.query(countQuery, countParams)
      : await db.query(countQuery);
    const total = countResult[0][0].total;

    return res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  }

  // Backward compatible: return all
  baseQuery += " ORDER BY date DESC";
  const [rows] = await db.query(baseQuery, params);
  res.json(rows);
}));

// Delete Activity
router.delete("/activities/:id", isAuthenticated, activitiesMutationLimiter, asyncHandler(async (req, res) => {
  const activityId = parseInt(req.params.id);
  const user = req.session.user;

  // Only Owner and Operator can delete
  if (user.role !== "Owner" && user.role !== "Operator") {
    return res
      .status(403)
      .json({ message: "Forbidden: Insufficient permissions" });
  }

  // Audit: ambil data aktivitas sebelum dihapus
  const [before] = await db.query('SELECT description, username FROM activities WHERE id = ?', [activityId]);

  const [result] = await db.query("DELETE FROM activities WHERE id = ?", [
    activityId,
  ]);

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: "Activity not found" });
  }

  // Audit trail
  logger.warn('Activity deleted', {
    activityId,
    deletedBy: user.username,
    activityOwner: before[0]?.username || 'unknown',
    description: before[0]?.description?.substring(0, 100) || 'unknown'
  });
  audit(req, "DELETE", "activity", activityId, { owner: before[0]?.username || 'unknown' });

  res.json({ message: "Activity deleted successfully" });
}));

module.exports = router;
