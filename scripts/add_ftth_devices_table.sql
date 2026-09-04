-- ============================================================
-- Migration: ftth_devices table
-- Tabel khusus untuk manajemen perangkat FTTH + port inventory
-- Pisah dari reference_options (dropdown) untuk data lebih rapi
-- ============================================================

CREATE TABLE IF NOT EXISTS ftth_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('olt','odc','odp','onu') NOT NULL,
  label VARCHAR(255) NOT NULL,
  group_name VARCHAR(255) DEFAULT NULL,
  parent_port VARCHAR(50) DEFAULT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  total_ports INT DEFAULT 0,
  serial_number VARCHAR(100) DEFAULT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ftth_type (type),
  INDEX idx_ftth_group (group_name),
  UNIQUE KEY uq_ftth (type, label, group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Copy data existing dari reference_options (hanya tipe FTTH)
INSERT IGNORE INTO ftth_devices (type, label, group_name, parent_port, latitude, longitude, sort_order, created_at)
SELECT type, label, group_name, parent_port, latitude, longitude, sort_order, created_at
FROM reference_options
WHERE type IN ('olt', 'odc', 'odp', 'onu')
ORDER BY type, sort_order, label;
