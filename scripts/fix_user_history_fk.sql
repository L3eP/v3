-- ============================================================
-- Migration: Fix FK on ticket_status_history.changed_by (CORRECTED)
-- Mengubah ON DELETE CASCADE menjadi SET NULL
-- agar history tetap utuh saat user dihapus (soft-delete)
--
-- Catatan: FK 'ticket_status_history_ibfk_2' sudah dihapus
-- sebelumnya. Script ini hanya menambahkan FK baru.
-- Index idx_history_changed_by sudah ada.
-- ============================================================

-- Ubah kolom changed_by jadi nullable dulu (SET NULL butuh nullable column)
ALTER TABLE ticket_status_history
  MODIFY COLUMN changed_by VARCHAR(255) DEFAULT NULL;

-- Tambah FK dengan SET NULL
ALTER TABLE ticket_status_history
  ADD CONSTRAINT fk_history_changed_by_setnull
  FOREIGN KEY (changed_by) REFERENCES users(username)
  ON DELETE SET NULL;
