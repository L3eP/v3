-- ============================================================
-- Migration: Add parent_port column to reference_options
-- Untuk tracking port koneksi antar perangkat FTTH
-- Contoh: ONU-A "Port 3/8" → terhubung ke port 3 dari 8 di ODP-A
-- ============================================================

ALTER TABLE reference_options
  ADD COLUMN parent_port VARCHAR(50) DEFAULT NULL AFTER group_name;

SELECT 'parent_port column added to reference_options' AS result;
