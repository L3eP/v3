-- ============================================================
-- Migration: FK on inventory_log.inventory_id (upgrade-only)
-- Sebelumnya tanpa FK sama sekali: DELETE /api/inventory/:id menyisakan
-- baris inventory_log yatim yang lalu di-drop diam-diam oleh JOIN di
-- routes/inventory.js — histori pemakaian item yang dihapus lenyap tanpa
-- jejak. schema.sql (fresh install) sudah mencakup FK ini langsung; script
-- ini untuk database yang SUDAH berjalan sebelum konsolidasi 2026-08-26.
-- ============================================================

-- SET NULL butuh kolom nullable
ALTER TABLE inventory_log
  MODIFY COLUMN inventory_id INT DEFAULT NULL;

ALTER TABLE inventory_log
  ADD CONSTRAINT fk_inventory_log_item
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
  ON DELETE SET NULL;

SELECT 'FK fk_inventory_log_item added (inventory_id nullable, ON DELETE SET NULL)' AS result;
