const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

// Target jam SLA per prioritas (created_at -> date_selesai), dikonfirmasi
// pemilik produk 2026-09-07. Prioritas di luar 4 ini (mis. ditambah lewat
// /api/references type=priority) SENGAJA tidak dihitung ke sla.byPriority
// atau breached/atRisk — tidak ada target yang bisa dijadikan acuan, jadi
// dikeluarkan dari pembilang MAUPUN penyebut, bukan ditebak.
const SLA_TARGET_HOURS = { Urgent: 2, Critical: 4, Moderate: 12, Low: 48 };

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

  // SLA/KPI sungguhan (2026-09-07) — dua dataset mentah diambil sekali lalu
  // diagregasi di JS (bukan SQL bertingkat per prioritas): (a) tiket Selesai
  // bulan ini dipakai untuk sla.byPriority/metPercent SEKALIGUS
  // teknisiPerformance (satu query, satu sumber, tidak bisa didesinkron
  // antara keduanya); (b) tiket yang MASIH terbuka dipakai untuk
  // breached/atRisk. Volume bulanan kecil (puluhan-ratusan baris) jadi
  // agregasi di Node aman, dan menghindari CASE WHEN bertingkat per-baris
  // yang beda ambang batas per prioritas.
  const [monthDoneRows] = await db.query(`
    SELECT pic, priority, TIMESTAMPDIFF(HOUR, created_at, date_selesai) AS hours
    FROM tickets
    WHERE deleted_at IS NULL AND status = 'Selesai'
      AND date_selesai >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  `);

  const byPriorityMap = new Map(Object.keys(SLA_TARGET_HOURS).map(p => [p, { total: 0, met: 0 }]));
  const teknisiMap = new Map();
  let knownCount = 0, metCount = 0;

  for (const row of monthDoneRows) {
    const target = SLA_TARGET_HOURS[row.priority];
    const isMet = target !== undefined && row.hours <= target;
    if (target !== undefined) {
      knownCount++;
      if (isMet) metCount++;
      const bp = byPriorityMap.get(row.priority);
      bp.total++;
      if (isMet) bp.met++;
    }
    if (row.pic) {
      if (!teknisiMap.has(row.pic)) teknisiMap.set(row.pic, { username: row.pic, doneCount: 0, totalHours: 0, slaKnownCount: 0, slaMetCount: 0 });
      const t = teknisiMap.get(row.pic);
      t.doneCount++;
      t.totalHours += row.hours;
      if (target !== undefined) {
        t.slaKnownCount++;
        if (isMet) t.slaMetCount++;
      }
    }
  }

  const byPriority = Object.entries(SLA_TARGET_HOURS).map(([priority, targetHours]) => {
    const bp = byPriorityMap.get(priority);
    return {
      priority,
      targetHours,
      total: bp.total,
      met: bp.met,
      metPercent: bp.total > 0 ? Math.round((bp.met / bp.total) * 1000) / 10 : null
    };
  });

  // Tiket yang MASIH terbuka — breached = sudah lewat target jam-nya,
  // atRisk = sudah 80% dari target tapi belum lewat (peringatan dini,
  // bukan cuma laporan setelah kejadian).
  const [openRows] = await db.query(`
    SELECT priority, TIMESTAMPDIFF(HOUR, created_at, NOW()) AS hoursElapsed
    FROM tickets
    WHERE deleted_at IS NULL AND status IN ('Terlapor','Dikerjakan','Pending')
  `);
  let breached = 0, atRisk = 0;
  for (const row of openRows) {
    const target = SLA_TARGET_HOURS[row.priority];
    if (target === undefined) continue;
    if (row.hoursElapsed > target) breached++;
    else if (row.hoursElapsed >= target * 0.8) atRisk++;
  }

  // Kinerja per Teknisi — Owner/Operator only (lihat penyaringan di res.json
  // di bawah), dari dataset monthDoneRows yang sama dengan sla.byPriority di
  // atas supaya angkanya tidak bisa berbeda antara dua bagian laporan ini.
  const teknisiPerformance = [...teknisiMap.values()]
    .map(t => ({
      username: t.username,
      doneCount: t.doneCount,
      avgHours: Math.round((t.totalHours / t.doneCount) * 10) / 10,
      slaMetPercent: t.slaKnownCount > 0 ? Math.round((t.slaMetCount / t.slaKnownCount) * 1000) / 10 : null
    }))
    .sort((a, b) => b.doneCount - a.doneCount);

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
      doneCount: s.sla_done_count,
      targets: SLA_TARGET_HOURS,
      metPercent: knownCount > 0 ? Math.round((metCount / knownCount) * 1000) / 10 : null,
      metCount,
      knownCount,
      byPriority,
      breached,
      atRisk
    },
    statusBreakdown,
    teknisi,
    // Owner/Operator only — rekan kerja tidak perlu (dan tidak seharusnya)
    // melihat rincian kinerja satu sama lain lewat endpoint bersama ini.
    teknisiPerformance: isTeknisi ? undefined : teknisiPerformance
  });
}));

module.exports = router;
