const express = require("express");
const router = express.Router();
const db = require("../db");
const { body, validationResult } = require("express-validator");
const { isAuthenticated } = require("../middleware/auth");

// Create Activity
router.post(
  "/activities",
  isAuthenticated,
  [
    body("description").trim().notEmpty().escape(),
    body("username").trim().escape(),
    body("ticket_id").trim().escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { description, username, ticket_id } = req.body;

    if (req.session.user.username !== username) {
      return res
        .status(403)
        .json({ message: "Forbidden: Cannot log activity for others" });
    }

    const date = new Date();

    try {
      const [result] = await db.query(
        "INSERT INTO activities (description, username, date, ticket_id) VALUES (?, ?, ?, ?)",
        [description, username, date, ticket_id],
      );

      const newActivity = {
        id: result.insertId,
        description,
        username,
        date: date.toISOString(),
        ticket_id,
      };

      res.status(201).json({
        message: "Activity logged successfully",
        activity: newActivity,
      });
    } catch (error) {
      console.error("Create activity error:", error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// Get Activities (Supports Backend Pagination)
router.get("/activities", isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const page = parseInt(req.query.page) || null;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

    let baseQuery = "";
    let countQuery = "";
    let params = [];
    let countParams = [];

    if (
      user.role === "Owner" ||
      user.role === "Operator" ||
      user.role === "Admin"
    ) {
      baseQuery = `
        SELECT
          activities.*,
          tickets.aktifitas
        FROM activities
        JOIN tickets ON tickets.id = activities.ticket_id
      `;
      countQuery = `
        SELECT COUNT(*) as total
        FROM activities
        JOIN tickets ON tickets.id = activities.ticket_id
      `;
    } else if (user.role === "Teknisi") {
      const whereClause = " WHERE activities.username = ?";
      baseQuery = `
        SELECT
          activities.*,
          tickets.aktifitas
        FROM activities
        JOIN tickets ON tickets.id = activities.ticket_id${whereClause}
      `;
      countQuery = `
        SELECT COUNT(*) as total
        FROM activities
        JOIN tickets ON tickets.id = activities.ticket_id${whereClause}
      `;
      params.push(user.username);
      countParams.push(user.username);
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (page) {
      // Paginated response
      const offset = (page - 1) * limit;
      baseQuery += " ORDER BY date DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const [rows] = await db.query(baseQuery, params);
      const [{ total }] = await db.query(countQuery, countParams);

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
  } catch (error) {
    console.error("Get activities error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Activity
router.delete("/activities/:id", isAuthenticated, async (req, res) => {
  const activityId = parseInt(req.params.id);
  const user = req.session.user;

  // Only Owner and Operator can delete
  if (user.role !== "Owner" && user.role !== "Operator") {
    return res
      .status(403)
      .json({ message: "Forbidden: Insufficient permissions" });
  }

  try {
    const [result] = await db.query("DELETE FROM activities WHERE id = ?", [
      activityId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Activity not found" });
    }

    res.json({ message: "Activity deleted successfully" });
  } catch (error) {
    console.error("Delete activity error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
