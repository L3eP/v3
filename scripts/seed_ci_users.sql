-- ============================================================
-- Seed akun untuk test/*.test.js di lingkungan CI (bukan data asli).
-- test/helpers/testApp.js login sebagai 'pfizer' (Owner) dan 'ijang1'
-- (Teknisi) dengan password 'test123' — di database dev/staging akun ini
-- sudah ada, tapi database CI dibuat baru dari nol tiap run jadi perlu
-- di-seed di sini. Hash di bawah = bcrypt('test123', 10 rounds), sama
-- seperti yang dipakai routes/auth.js saat register.
-- ============================================================

INSERT INTO users (username, password, full_name, role, phone, is_active)
VALUES ('pfizer', '$2b$10$hOw45lyvy.MW8tdxkiWcIerpSGNfCgJG488GfwSwOP4KP9djgkJUW', 'CI Test Owner', 'Owner', '620000000001', TRUE)
ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), is_active = VALUES(is_active);

INSERT INTO users (username, password, full_name, role, phone, is_active)
VALUES ('ijang1', '$2b$10$hOw45lyvy.MW8tdxkiWcIerpSGNfCgJG488GfwSwOP4KP9djgkJUW', 'CI Test Teknisi', 'Teknisi', '620000000002', TRUE)
ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), is_active = VALUES(is_active);
