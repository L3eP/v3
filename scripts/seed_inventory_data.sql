-- ============================================================
-- Dummy Data: Inventory Attributes & Device Types
-- ============================================================

-- 0. Tambah kolom attributes JSON (untuk atribut per tipe device)
ALTER TABLE inventory ADD COLUMN attributes JSON DEFAULT NULL AFTER notes;

-- 1. Device Brand (buat dropdown FTTH)
INSERT IGNORE INTO reference_options (type, label, sort_order) VALUES
('device_brand', 'Huawei', 1),
('device_brand', 'ZTE', 2),
('device_brand', 'FiberHome', 3),
('device_brand', 'TP-Link', 4),
('device_brand', 'Cisco', 5),
('device_brand', 'MikroTik', 6),
('device_brand', 'Ubiquiti', 7),
('device_brand', 'D-Link', 8),
('device_brand', 'Tenda', 9),
('device_brand', 'Lainnya', 10);

-- 2. Inventory Type (buat dropdown stok)
INSERT IGNORE INTO reference_options (type, label, sort_order) VALUES
('inventory_type', 'ONU', 1),
('inventory_type', 'ODP', 2),
('inventory_type', 'Kabel', 3),
('inventory_type', 'Konektor', 4),
('inventory_type', 'Spliter', 5),
('inventory_type', 'Switch', 6),
('inventory_type', 'Splice', 7),
('inventory_type', 'Adaptor', 8),
('inventory_type', 'Power Supply', 9),
('inventory_type', 'Lainnya', 10);

-- 3. Sample Inventory Items (dengan atribut JSON)
-- Butuh tambah kolom attributes dulu
-- ALTER TABLE inventory ADD COLUMN attributes JSON DEFAULT NULL;

-- Sample data ONU
INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES
('ONU', 'Huawei HG8010', 50, 12, 'Gudang Pusat', 'ONU 1 port GPON', 'owner', '{"ports": 1, "gpon": true, "speed": "1Gbps"}'),
('ONU', 'ZTE F660', 30, 5, 'Gudang Pusat', 'ONU 4 port GE', 'owner', '{"ports": 4, "gpon": true, "wifi": true, "speed": "1Gbps"}'),
('ONU', 'FiberHome AN5506-04', 20, 8, 'Gudang Cabang', 'ONU 4 port FE', 'owner', '{"ports": 4, "gpon": true, "wifi": false}');

-- Sample data Kabel
INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES
('Kabel', 'Kabel FO Single Mode 1km', 10, 3, 'Gudang Pusat', 'Drum 1km', 'owner', '{"length_m": 1000, "type": "single_mode", "core": 12}'),
('Kabel', 'Kabel FO Single Mode 500m', 15, 5, 'Gudang Cabang', 'Drum 500m', 'owner', '{"length_m": 500, "type": "single_mode", "core": 8}'),
('Kabel', 'Kabel UTP Cat6 10m', 100, 30, 'Gudang Pusat', 'Patch cable', 'owner', '{"length_m": 10, "type": "utp_cat6"}');

-- Sample data Spliter
INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES
('Spliter', 'Spliter 1:8 SC/APC', 40, 10, 'Gudang Pusat', 'Splitter optik 1:8', 'owner', '{"ports": 8, "split_ratio": "1:8", "connector": "SC/APC"}'),
('Spliter', 'Spliter 1:4 SC/APC', 25, 5, 'Gudang Cabang', 'Splitter optik 1:4', 'owner', '{"ports": 4, "split_ratio": "1:4", "connector": "SC/APC"}');

-- Sample data Switch
INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES
('Switch', 'Switch 8 Port Gigabit TP-Link', 20, 8, 'Gudang Pusat', 'Switch manageable', 'owner', '{"ports": 8, "gigabit": true, "manageable": true}'),
('Switch', 'Switch 24 Port D-Link', 5, 2, 'Gudang Pusat', 'Switch unmanaged', 'owner', '{"ports": 24, "gigabit": true, "manageable": false}');

-- Sample data Konektor
INSERT INTO inventory (device_type, device_name, total_stock, used_stock, location, notes, created_by, attributes) VALUES
('Konektor', 'Konektor SC/APC Fast Connector', 200, 45, 'Gudang Pusat', 'Fast connector SC/APC', 'owner', '{"type": "SC/APC", "fast_connector": true}'),
('Konektor', 'Konektor SC/UPC', 150, 30, 'Gudang Cabang', 'Fusion splice pigtail', 'owner', '{"type": "SC/UPC"}');

-- Hitung total
SELECT CONCAT('Total device_brand: ', COUNT(*)) AS info FROM reference_options WHERE type = 'device_brand'
UNION ALL
SELECT CONCAT('Total inventory_type: ', COUNT(*)) FROM reference_options WHERE type = 'inventory_type'
UNION ALL
SELECT CONCAT('Total sample inventory items: ', COUNT(*)) FROM inventory;