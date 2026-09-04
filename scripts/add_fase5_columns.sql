-- ============================================================
-- Migration: Fase 5 — auto-PIC sadar-lokasi, auto-decrement inventory,
-- draft entri ONU dari PSB. Upgrade-only untuk database yang sudah ada
-- SEBELUM kolom ini disatukan ke schema.sql.
-- ============================================================

-- 1) Auto-PIC sadar sub_node: wilayah default seorang Teknisi.
--    Sengaja varchar bebas (bukan FK ke reference_options), konsisten
--    dengan tickets.sub_node yang juga teks bebas, bukan relasi.
ALTER TABLE users ADD COLUMN default_sub_node VARCHAR(100) DEFAULT NULL;

-- 2) Draft entri ONU dari PSB "Terpasang" — device masuk ftth_devices
--    tapi ditandai draft sampai staf konfirmasi lewat halaman FTTH.
ALTER TABLE ftth_devices ADD COLUMN is_draft TINYINT(1) NOT NULL DEFAULT 0;
