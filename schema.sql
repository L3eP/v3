-- ============================================================
-- Database Schema — Ticketing & Activity Logging System
-- Sync date: 2026-07-07 (synced with real database)
-- ============================================================

CREATE DATABASE IF NOT EXISTS login_app;
USE login_app;

-- ============================================================
-- 1. users — Manajemen User & Autentikasi
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'User',
    phone VARCHAR(20) DEFAULT NULL,
    photo VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 2. tickets — Tiket Pekerjaan/Laporan
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
    id INT NOT NULL AUTO_INCREMENT,
    aktifitas VARCHAR(255) NOT NULL,
    sub_node VARCHAR(50) DEFAULT NULL,
    odc VARCHAR(50) DEFAULT NULL,
    lokasi VARCHAR(100) NOT NULL,
    pic VARCHAR(255) DEFAULT NULL,
    priority VARCHAR(50) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'Terlapor',
    info TEXT,
    evidence VARCHAR(255) DEFAULT NULL,
    created_by VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    date_selesai TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_tickets_created_by (created_by),
    KEY idx_tickets_status (status),
    KEY idx_tickets_created_at (created_at),
    KEY idx_tickets_priority (priority),
    KEY idx_tickets_sub_node (sub_node),
    KEY idx_tickets_lokasi (lokasi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 3. activities — Log Aktivitas
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
    id INT NOT NULL AUTO_INCREMENT,
    description TEXT NOT NULL,
    username VARCHAR(255) NOT NULL,
    date TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    date_selesai TIMESTAMP NULL DEFAULT NULL,
    ticket_id INT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_activities_username (username),
    KEY idx_activities_ticket_id (ticket_id),
    KEY idx_activities_date (date),
    KEY fk_activities_ticket (ticket_id),
    CONSTRAINT fk_activities_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 4. ticket_status_history — Riwayat Perubahan Status Tiket
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_status_history (
    id INT NOT NULL AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    old_status VARCHAR(50) DEFAULT NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ticket_id (ticket_id),
    KEY changed_by (changed_by),
    KEY idx_history_ticket_id (ticket_id),
    CONSTRAINT ticket_status_history_ibfk_1 FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT ticket_status_history_ibfk_2 FOREIGN KEY (changed_by) REFERENCES users (username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 5. settings — Pengaturan Aplikasi (key-value)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- Notes:
-- - Table `sessions` dibuat otomatis oleh express-mysql-session,
--   tidak perlu di-create manual.
-- - Index sudah termasuk yang ditambahkan dari P1 optimization.
-- - Semua tabel menggunakan InnoDB + utf8mb4 untuk Unicode support.
-- ============================================================
