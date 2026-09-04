-- ============================================================
-- Migration: User Soft Delete
-- Menambahkan soft-delete support untuk users table
-- ============================================================

ALTER TABLE users
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER photo,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER deleted_at,
  ADD INDEX idx_users_deleted_at (deleted_at),
  ADD INDEX idx_users_is_active (is_active);
