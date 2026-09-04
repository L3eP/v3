-- ============================================================
-- Migration: Inventory Management Table
-- Untuk melacak stok perangkat dan histori pemakaian
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory (
    id INT NOT NULL AUTO_INCREMENT,
    device_type VARCHAR(50) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    total_stock INT DEFAULT 0,
    used_stock INT DEFAULT 0,
    location VARCHAR(255) DEFAULT NULL,
    notes TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_inventory_type (device_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inventory_log (
    id INT NOT NULL AUTO_INCREMENT,
    inventory_id INT NOT NULL,
    change_type ENUM('in','out') NOT NULL,
    quantity INT NOT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    reference_id INT DEFAULT NULL,
    notes TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_log_inventory (inventory_id),
    KEY idx_log_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
