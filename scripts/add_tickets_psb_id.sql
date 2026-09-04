-- ============================================================
-- Migration: tickets.psb_id (upgrade-only)
-- Sebelumnya tiket dan PSB cuma terhubung lewat teks bebas di kolom info
-- ("PSB - nama pelanggan | ..."), disalin sekali saat tiket dibuat lalu tidak
-- pernah sinkron lagi. Kolom ini adalah relasi data sungguhan, dasar untuk
-- auto-sync status PSB saat tiket instalasinya selesai (Fase 2 peta jalan).
-- schema.sql (fresh install) sudah mencakup kolom ini langsung; script ini
-- untuk database yang SUDAH berjalan sebelum kolom ini ditambahkan.
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN psb_id INT DEFAULT NULL AFTER deleted_at,
  ADD INDEX idx_tickets_psb_id (psb_id);

-- ON DELETE SET NULL: hapus PSB tidak boleh ikut menghapus riwayat tiketnya.
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_psb FOREIGN KEY (psb_id) REFERENCES psb (id) ON DELETE SET NULL;

SELECT 'psb_id column + FK added to tickets table' AS result;
