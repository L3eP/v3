-- ============================================================
-- Migration: Reference Options Table
-- Untuk dropdown dinamis (aktifitas, sub_node, odc, priority)
-- ============================================================

CREATE TABLE IF NOT EXISTS reference_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    group_name VARCHAR(100) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Seed data: Aktifitas
INSERT INTO reference_options (type, label, sort_order) VALUES
('aktifitas', 'PSB', 1),
('aktifitas', 'Maintenance', 2),
('aktifitas', 'loss', 3),
('aktifitas', 'migrasi', 4);

-- Seed data: Sub-Node
INSERT INTO reference_options (type, label, sort_order) VALUES
('sub_node', 'ANJ', 1),
('sub_node', 'SKM', 2),
('sub_node', 'JRG', 3),
('sub_node', 'DMS', 4),
('sub_node', 'SKJ', 5),
('sub_node', 'RKM', 6),
('sub_node', 'MBL', 7);

-- Seed data: ODC
INSERT INTO reference_options (type, label, group_name, sort_order) VALUES
('odc', 'ODC 1 - rumah p enjel', 'OLT JRG', 1),
('odc', 'ODC 2 - h. Marjan', 'OLT JRG', 2),
('odc', 'ODC 3 - depan kubur sekarteja', 'OLT JRG', 3),
('odc', 'ODC 4 - sekarteja', 'OLT JRG', 4),
('odc', 'ODC 5 - rumah amak unet', 'OLT SKM', 1),
('odc', 'ODC 6 - indomaret sukamulia', 'OLT SKM', 2),
('odc', 'ODC 7 - rumah epol', 'OLT SKM', 3),
('odc', 'ODC 8 - orong piter induk', 'OLT SKM', 4),
('odc', 'ODC 9 - BTN Hanum', 'OLT HNM', 1),
('odc', 'ODC 10 - BTN sekar anyar', 'OLT HNM', 2),
('odc', 'ODC 11 - BTN sekar anyar', 'OLT HNM', 3),
('odc', 'ODC 12 - Anjani', 'OLT HNM', 4),
('odc', 'ODC 13 - rumah pandi', 'OLT DMS', 1),
('odc', 'ODC 14 - Rekat lauk', 'OLT DMS', 2),
('odc', 'ODC 15 - Gubuk Lauk Masjid', 'OLT HIOSO', 1);

-- Seed data: Priority
INSERT INTO reference_options (type, label, sort_order) VALUES
('priority', 'Low', 1),
('priority', 'Moderate', 2),
('priority', 'Critical', 3),
('priority', 'Urgent', 4);
