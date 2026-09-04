const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/stats/month
// Ringkasan kesehatan & antrian per role dalam SATU ambilan agregat.
// Owner/Operator: antrian + aging, selesai bulan ini, SLA rata-rata.
// Teknisi: tiket saya terbuka/perlu perhatian, aktivitas hari/pekan ini,
// selesai bulan ini (saya), dan SLA rata-rata saya (dibandingkan sla.avgHours
// tim di atas — dihitung dari tiket yang PIC-nya teknisi ini, bukan sekadar
// pelapor, supaya benar-benar mengukur kinerja penyelesaian).
// Catatan: batas waktu memakai zona waktu MySQL server (konsisten dengan query lain).
router.get('/api/stats/month', isAuthenticated, asyncHandler(async (req, res) => {
  const isTeknisi = req.session.user.role === 'Teknisi';
  const u = req.session.user.username;

  const [rows] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
      ) AS total_open,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
          AND DATE(created_at) = CURDATE()
      ) AS open_today,

      -- Label frontend "1–2 hari" (dashboard.html) berarti bucket ini HARUS
      -- mencakup umur 1 ATAU 2 hari — sebelumnya hanya = 1 hari (tepat kemarin),
      -- sehingga tiket berumur 2 hari salah masuk ke bucket ">2 hari".
      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
          AND DATE(created_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 2 DAY) AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      ) AS open_yesterday,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
          AND DATE(created_at) < DATE_SUB(CURDATE(), INTERVAL 2 DAY)
      ) AS open_older,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status = 'Selesai'
          AND date_selesai >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      ) AS done_month,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status = 'Selesai'
          AND date_selesai >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
      ) AS done_week,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND status = 'Selesai'
      ) AS done_total,

      (SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, date_selesai))
        FROM tickets WHERE deleted_at IS NULL AND date_selesai IS NOT NULL
      ) AS sla_avg_hours,

      (SELECT COUNT(*) FROM tickets
        WHERE deleted_at IS NULL AND date_selesai IS NOT NULL
      ) AS sla_done_count
  `);
  const s = rows[0];

  const [bdRows] = await db.query(
    `SELECT status, COUNT(*) AS count FROM tickets
     WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
     GROUP BY status`
  );
  const statusBreakdown = { Terlapor: 0, Dikerjakan: 0, Pending: 0 };
  bdRows.forEach(r => { statusBreakdown[r.status] = r.count; });

  let teknisi = undefined;
  if (isTeknisi) {
    const [tRows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM tickets
          WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
            AND (created_by = ? OR pic = ?)
        ) AS my_open,

        (SELECT COUNT(*) FROM tickets
          WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
            AND (created_by = ? OR pic = ?)
            AND (priority = 'Critical'
                 OR created_at < DATE_SUB(CURDATE(), INTERVAL 2 DAY))
        ) AS my_attention,

        (SELECT COUNT(*) FROM activities
          WHERE username = ?
            AND date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        ) AS my_week_activities,

        (SELECT COUNT(*) FROM activities
          WHERE username = ? AND DATE(date) = CURDATE()
        ) AS my_activities_today,

        -- pic (bukan created_by) — kinerja penyelesaian diukur dari tiket yang
        -- jadi TANGGUNG JAWAB teknisi ini, bukan yang sekadar dia laporkan.
        (SELECT COUNT(*) FROM tickets
          WHERE deleted_at IS NULL AND status = 'Selesai' AND pic = ?
            AND date_selesai >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        ) AS my_done_month,

        (SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, date_selesai))
          FROM tickets
          WHERE deleted_at IS NULL AND date_selesai IS NOT NULL AND pic = ?
        ) AS my_sla_avg_hours
    `, [u, u, u, u, u, u, u, u]);
    teknisi = {
      myOpen: tRows[0].my_open,
      myAttention: tRows[0].my_attention,
      myWeekActivities: tRows[0].my_week_activities,
      myActivitiesToday: tRows[0].my_activities_today,
      myDoneMonth: tRows[0].my_done_month,
      mySlaAvgHours: tRows[0].my_sla_avg_hours === null ? null : Number(tRows[0].my_sla_avg_hours)
    };
  }

  res.json({
    totalOpen: s.total_open,
    aging: {
      today: s.open_today,
      oneTwoDays: s.open_yesterday,
      older: s.open_older
    },
    done: {
      month: s.done_month,
      week: s.done_week,
      total: s.done_total
    },
    sla: {
      avgHours: s.sla_avg_hours === null ? null : Number(s.sla_avg_hours),
      doneCount: s.sla_done_count
    },
    statusBreakdown,
    teknisi
  });
}));

module.exports = router;
