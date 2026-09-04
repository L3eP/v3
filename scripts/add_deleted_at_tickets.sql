-- ============================================================
-- Migration: Add deleted_at column to tickets table
-- Untuk mendukung soft-delete tiket
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER date_selesai,
  ADD INDEX idx_tickets_deleted_at (deleted_at);

SELECT 'deleted_at column added to tickets table' AS result;
