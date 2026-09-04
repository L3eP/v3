-- ============================================================
-- Migration: Add ODP column to tickets table
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN odp VARCHAR(255) DEFAULT NULL AFTER odc,
  ADD INDEX idx_tickets_odp (odp);
