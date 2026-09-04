-- ============================================================
-- Database Index Migration
-- Aplikasi: Ticketing & Activity Logging System
-- Tanggal: 2026-07-07
-- Deskripsi: Menambahkan index untuk optimasi query
-- ============================================================

-- 1. Index untuk pencarian tiket berdasarkan pembuat
-- Digunakan di: routes/tickets.js (IDOR check: created_by)
-- Query: SELECT * FROM tickets WHERE created_by = ?
CREATE INDEX idx_tickets_created_by ON tickets(created_by);

-- 2. Index untuk filter tiket berdasarkan status
-- Digunakan di: dashboard.js (filter: Selesai, Dikerjakan, Pending/Terlapor)
-- Query: SELECT * FROM tickets WHERE status = ?
CREATE INDEX idx_tickets_status ON tickets(status);

-- 3. Index untuk sorting tiket berdasarkan tanggal dibuat
-- Digunakan di: routes/tickets.js (ORDER BY created_at DESC)
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- 4. Index untuk filter tiket berdasarkan prioritas
-- Digunakan di: Frontend filter prioritas
CREATE INDEX idx_tickets_priority ON tickets(priority);

-- 5. Index untuk pencarian tiket berdasarkan sub_node
-- Digunakan di: Frontend search
CREATE INDEX idx_tickets_sub_node ON tickets(sub_node);

-- 6. Index untuk pencarian tiket berdasarkan lokasi
-- Digunakan di: Frontend search
CREATE INDEX idx_tickets_lokasi ON tickets(lokasi);

-- 7. Index untuk aktivitas berdasarkan username
-- Digunakan di: routes/activities.js (WHERE activities.username = ?)
CREATE INDEX idx_activities_username ON activities(username);

-- 8. Index untuk aktivitas berdasarkan ticket_id
-- Digunakan di: routes/activities.js (JOIN tickets ON tickets.id = activities.ticket_id)
CREATE INDEX idx_activities_ticket_id ON activities(ticket_id);

-- 9. Index untuk aktivitas berdasarkan tanggal
-- Digunakan di: routes/activities.js (ORDER BY date DESC)
CREATE INDEX idx_activities_date ON activities(date);

-- 10. Index untuk riwayat status berdasarkan ticket_id
-- Digunakan di: routes/tickets.js (WHERE h.ticket_id = ?)
CREATE INDEX idx_history_ticket_id ON ticket_status_history(ticket_id);

-- 11. Index untuk pencarian user berdasarkan username
-- Digunakan di: routes/auth.js (SELECT * FROM users WHERE username = ?)
-- Catatan: username sudah UNIQUE index, jadi sudah optimal
-- ALTER TABLE users ADD INDEX idx_users_username (username); -- Tidak perlu

-- 12. Index untuk settings berdasarkan setting_key
-- Digunakan di: routes/settings.js (SELECT * FROM settings WHERE setting_key = ?)
-- Catatan: setting_key sudah PRIMARY KEY, jadi sudah optimal
-- ALTER TABLE settings ADD INDEX idx_settings_key (setting_key); -- Tidak perlu

-- ============================================================
-- Cara menjalankan:
--   mysql -u login_app_user -p login_app_db < scripts/add_indexes.sql
-- ============================================================
