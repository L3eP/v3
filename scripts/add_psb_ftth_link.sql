-- ============================================================
-- Migration: Tautan PSB <-> ftth_devices (psb.ftth_device_id)
--
-- PSB ("Pemasangan Baru") dan ONU adalah entitas yang sama secara konsep --
-- tapi tetap 2 tabel terpisah (psb = status pemasangan, ftth_devices =
-- topologi jaringan). Sebelumnya, transisi PSB -> "Terpasang" membuat baris
-- ONU baru di ftth_devices TANPA tautan permanen -- cuma nama pelanggan
-- dicantumkan sebagai teks di label, tidak bisa di-query balik.
--
-- Migrasi ini HANYA menambah kolom + FK (nullable, additive, tidak
-- menghapus/mengubah data apa pun). Jalankan scripts/backfill_psb_ftth_link.js
-- SETELAH ini untuk menautkan baris psb existing yang cocok SN-nya secara
-- pasti dengan ONU yang sudah ada -- lihat komentar di script itu untuk
-- kenapa backfill tidak dilakukan di sini via SQL polos (butuh logging per
-- baris + guard "satu ONU cuma boleh ditautkan ke satu PSB").
-- ============================================================

ALTER TABLE psb
  ADD COLUMN ftth_device_id INT DEFAULT NULL AFTER onu_port,
  ADD INDEX idx_psb_ftth_device (ftth_device_id),
  ADD CONSTRAINT fk_psb_ftth_device FOREIGN KEY (ftth_device_id)
    REFERENCES ftth_devices (id) ON DELETE SET NULL;

SELECT 'psb.ftth_device_id ditambahkan -- lanjutkan dengan node scripts/backfill_psb_ftth_link.js' AS result;
