-- Dummy tickets for 1 August 2026 (pakai data referensi yang benar)
INSERT INTO tickets (aktifitas, sub_node, odc, lokasi, pic, priority, status, info, created_by, created_at) VALUES
('PSB', 'SKM', 'ODC 1 - rumah p enjel', 'Gubuk Lauk', 'mikki', 'Critical', 'Terlapor', 'PSB - Budi Santoso | Telp: 081234567890 | SN ONU: HW123456', 'pfizer', '2026-08-01 08:15:00'),
('Maintenance', 'SKM', 'ODC 4 - sekarteja', 'Kampung Baru', 'ijang1', 'Critical', 'Dikerjakan', 'Kabel putus tertimpa pohon', 'pfizer', '2026-08-01 08:30:00'),
('PSB', 'SKJ', 'ODC 3 - depan kubur sekarteja', 'GOR Praya', 'samsul', 'Moderate', 'Terlapor', 'PSB - Siti Nurhaliza | Telp: 081987654321 | SN ONU: ZTE789012', 'mikki', '2026-08-01 09:00:00'),
('loss', 'ANJ', 'ODC 12 - Anjani', 'Dasan Tereng', 'ijang2', 'Low', 'Selesai', 'Redaman tinggi karena konektor kotor', 'pfizer', '2026-08-01 09:30:00'),
('Maintenance', 'JRG', 'ODC 7 - rumah epol', 'Mantang Baru', 'ijang1', 'Moderate', 'Pending', 'Menunggu spare part ONU', 'mikki', '2026-08-01 10:00:00'),
('PSB', 'SKM', 'ODC 15 Gubuk Lauk Masjid', 'Sektim Timur', 'samsul', 'Low', 'Terlapor', 'Pembersihan ODC', 'pfizer', '2026-08-01 10:30:00'),
('migrasi', 'DMS', 'ODC 14 - Rekat lauk', 'Batu Jai', 'ijang1', 'Moderate', 'Dikerjakan', 'Migrasi pelanggan ke ODC baru', 'mikki', '2026-08-01 11:00:00'),
('PSB', 'RKM', 'ODC 5 - rumah amak unet', 'Perumahan Griya', 'mikki', 'Critical', 'Terlapor', 'PSB - Ahmad Fauzi | Telp: 081555666777 | SN ONU: HW345678', 'pfizer', '2026-08-01 13:00:00');

SELECT CONCAT('Added ', COUNT(*), ' dummy tickets for August (using correct references)') as info FROM tickets WHERE MONTH(created_at) = 8 AND YEAR(created_at) = 2026;