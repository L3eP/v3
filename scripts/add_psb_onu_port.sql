-- ============================================================
-- Migration: onu_port column on psb (upgrade-only)
-- Menyimpan port ODP yang dipilih staf saat registrasi PSB — mirip parent_port
-- di ftth_devices saat menambah ONU (registrasi PSB pada dasarnya adalah
-- penempatan satu ONU di satu port ODP). schema.sql (fresh install) sudah
-- mencakup kolom ini langsung; script ini untuk database yang SUDAH berjalan
-- sebelum kolom ini ditambahkan.
-- ============================================================

ALTER TABLE psb
  ADD COLUMN onu_port VARCHAR(50) DEFAULT NULL AFTER odp_label;

SELECT 'onu_port column added to psb table' AS result;
