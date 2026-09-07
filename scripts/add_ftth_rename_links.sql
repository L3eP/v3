-- ============================================================
-- Migration: Tautan tahan-rename untuk tickets.odc/odp & psb.odp_label
--
-- tickets.odc, tickets.odp, dan psb.odp_label disimpan sebagai TEKS —
-- divalidasi ADA-nya saat ditulis (validateRef() / validateOdpLabel()),
-- tapi kalau ODC/ODP itu di-rename belakangan lewat routes/ftth.js, teks
-- yang sudah tersimpan di tiket/PSB lama tidak ikut berubah -- diam-diam
-- menunjuk nama yang sudah tidak ada ("menunjuk ke hantu").
--
-- Migrasi ini HANYA menambah kolom + FK (nullable, additive, tidak
-- menghapus/mengubah data apa pun) -- cermin pola scripts/add_psb_ftth_link.sql
-- minggu lalu. Jalankan scripts/backfill_ftth_rename_links.js SETELAH ini
-- untuk menautkan baris yang sudah ada, HANYA yang cocok persis (exact
-- match teks ke label ftth_devices) -- tidak menebak yang ambigu.
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN ftth_odc_id INT DEFAULT NULL AFTER odc,
  ADD COLUMN ftth_odp_id INT DEFAULT NULL AFTER odp,
  ADD INDEX idx_tickets_ftth_odc (ftth_odc_id),
  ADD INDEX idx_tickets_ftth_odp (ftth_odp_id),
  ADD CONSTRAINT fk_tickets_ftth_odc FOREIGN KEY (ftth_odc_id)
    REFERENCES ftth_devices (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tickets_ftth_odp FOREIGN KEY (ftth_odp_id)
    REFERENCES ftth_devices (id) ON DELETE SET NULL;

ALTER TABLE psb
  ADD COLUMN ftth_odp_id INT DEFAULT NULL AFTER ftth_device_id,
  ADD INDEX idx_psb_ftth_odp (ftth_odp_id),
  ADD CONSTRAINT fk_psb_ftth_odp FOREIGN KEY (ftth_odp_id)
    REFERENCES ftth_devices (id) ON DELETE SET NULL;

SELECT 'tickets.ftth_odc_id/ftth_odp_id dan psb.ftth_odp_id ditambahkan -- lanjutkan dengan node scripts/backfill_ftth_rename_links.js' AS result;
