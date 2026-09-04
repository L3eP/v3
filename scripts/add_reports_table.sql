-- ============================================================
-- Migration: Public Reports Table
-- Untuk laporan dari pelanggan (self-service, tanpa login)
-- ============================================================

CREATE TABLE IF NOT EXISTS public_reports (
    id INT NOT NULL AUTO_INCREMENT,
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    address TEXT,
    description TEXT NOT NULL,
    sub_node VARCHAR(50) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'Baru',
    handled_by VARCHAR(255) DEFAULT NULL,
    ticket_id INT DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reports_status (status),
    KEY idx_reports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
