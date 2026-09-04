-- ============================================================
-- Migration: Fix FK on ticket_status_history
-- Problem: FK changed_by → users(username) ON DELETE CASCADE
--   causes all status history to be deleted when a user is deleted.
-- Fix: Remove the FK constraint. changed_by stores username as a
--   historical snapshot — it should survive user deletion.
-- ============================================================

ALTER TABLE ticket_status_history
  DROP FOREIGN KEY ticket_status_history_ibfk_2;

-- Also remove the index on changed_by if it exists and is not needed
-- (keep it for query performance on filtering by changed_by)
-- SELECT * FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'ticket_status_history';

SELECT 'FK ticket_status_history_ibfk_2 removed successfully' AS result;
