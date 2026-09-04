-- ============================================================
-- Database Schema — Ticketing & Activity Logging System
-- Source of Truth: Staging Database
-- Sync date: 2026-08-26
--
-- Konsolidasi dari scripts/*.sql — sebelumnya file ini didokumentasikan sebagai
-- schema dasar dan setiap deployment baru HARUS menyusul dengan ~10 migration
-- script secara manual (odp, soft-delete, ftth_devices, audit_logs, dst).
-- Instalasi fresh yang hanya menjalankan file ini akan gagal login (kolom
-- deleted_at/is_active belum ada) dan gagal membuat tiket (kolom odp belum
-- ada). Sekarang file ini sudah mencakup semuanya — scripts/*.sql tetap ada
-- untuk riwayat migrasi database yang SUDAH berjalan sebelum sync ini.
-- ============================================================

CREATE DATABASE IF NOT EXISTS login_app_db;
USE login_app_db;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `role` varchar(50) DEFAULT 'User',
  `phone` varchar(20) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `is_active` boolean NOT NULL DEFAULT TRUE,
  -- Wilayah default Teknisi, dipakai auto-PIC (GET /api/auto-pic) untuk
  -- memprioritaskan Teknisi di sub_node yang sama dengan tiket. Teks bebas
  -- (bukan FK), konsisten dengan tickets.sub_node yang juga teks bebas.
  `default_sub_node` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_deleted_at` (`deleted_at`),
  KEY `idx_users_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `aktifitas` varchar(255) NOT NULL,
  `sub_node` varchar(50) DEFAULT NULL,
  `odc` varchar(50) DEFAULT NULL,
  `odp` varchar(255) DEFAULT NULL,
  `lokasi` varchar(100) NOT NULL,
  `pic` varchar(255) DEFAULT NULL,
  `priority` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Terlapor',
  `info` text,
  `evidence` varchar(255) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `date_selesai` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `psb_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_created_by` (`created_by`),
  KEY `idx_tickets_status` (`status`),
  KEY `idx_tickets_created_at` (`created_at`),
  KEY `idx_tickets_priority` (`priority`),
  KEY `idx_tickets_sub_node` (`sub_node`),
  KEY `idx_tickets_lokasi` (`lokasi`),
  KEY `idx_tickets_odp` (`odp`),
  KEY `idx_tickets_deleted_at` (`deleted_at`),
  KEY `idx_tickets_psb_id` (`psb_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `description` text NOT NULL,
  `username` varchar(255) NOT NULL,
  `date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `date_selesai` timestamp NULL DEFAULT NULL,
  `ticket_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_activities_ticket` (`ticket_id`),
  KEY `idx_activities_username` (`username`),
  KEY `idx_activities_ticket_id` (`ticket_id`),
  KEY `idx_activities_date` (`date`),
  CONSTRAINT `fk_activities_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ticket_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `old_status` varchar(50) DEFAULT NULL,
  `new_status` varchar(50) NOT NULL,
  `changed_by` varchar(255) DEFAULT NULL,
  `changed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  KEY `changed_by` (`changed_by`),
  KEY `idx_history_ticket_id` (`ticket_id`),
  CONSTRAINT `ticket_status_history_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  -- SET NULL (bukan CASCADE): changed_by adalah snapshot historis nama pelaku,
  -- riwayat status tiket harus tetap utuh walau user-nya sudah dihapus.
  CONSTRAINT `fk_history_changed_by_setnull` FOREIGN KEY (`changed_by`) REFERENCES `users` (`username`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `reference_options` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(50) NOT NULL,
  `label` varchar(255) NOT NULL,
  `group_name` varchar(100) DEFAULT NULL,
  `parent_port` varchar(50) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ref` (`type`,`label`,`group_name`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sumber kebenaran topologi FTTH (OLT/ODC/ODP/ONU) + port tracking. Dipisah
-- dari reference_options (yang tetap dipakai untuk dropdown non-FTTH: aktifitas,
-- sub_node, priority, dst). Baris FTTH lama di reference_options TIDAK dihapus
-- otomatis di sini — lihat scripts/add_ftth_devices_table.sql untuk migrasi
-- data dari instalasi yang sudah berjalan.
CREATE TABLE IF NOT EXISTS `ftth_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('olt','odc','odp','onu') NOT NULL,
  `label` varchar(255) NOT NULL,
  `group_name` varchar(255) DEFAULT NULL,
  `parent_port` varchar(50) DEFAULT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `total_ports` int DEFAULT '0',
  `serial_number` varchar(100) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  -- TRUE untuk entri ONU yang dibuat otomatis dari PSB "Terpasang" — perlu
  -- direview & dikonfirmasi staf di halaman FTTH sebelum dianggap data resmi.
  `is_draft` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ftth` (`type`,`label`,`group_name`),
  KEY `idx_ftth_type` (`type`),
  KEY `idx_ftth_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `psb` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `address` text NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `onu_sn` varchar(100) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `odp_label` varchar(255) DEFAULT NULL,
  `onu_port` varchar(50) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `notes` text,
  `status` varchar(50) DEFAULT 'Terdaftar',
  `created_by` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_psb_status` (`status`),
  KEY `idx_psb_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- FK ditambahkan di sini (bukan di CREATE TABLE tickets di atas) karena psb
-- baru terdefinisi di titik ini dalam urutan file. ON DELETE SET NULL: hapus
-- PSB tidak boleh ikut menghapus tiketnya — riwayat tiket harus tetap ada.
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_psb FOREIGN KEY (psb_id) REFERENCES psb (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `device_type` varchar(50) NOT NULL,
  `device_name` varchar(255) NOT NULL,
  `total_stock` int DEFAULT '0',
  `used_stock` int DEFAULT '0',
  `location` varchar(255) DEFAULT NULL,
  `notes` text,
  `attributes` json DEFAULT NULL,
  `created_by` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_type` (`device_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inventory_id` int DEFAULT NULL,
  `change_type` enum('in','out') NOT NULL,
  `quantity` int NOT NULL,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `notes` text,
  `created_by` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_inventory` (`inventory_id`),
  KEY `idx_log_created_at` (`created_at`),
  -- SET NULL (bukan tanpa FK sama sekali): histori pemakaian tetap ada walau
  -- item inventory-nya dihapus, alih-alih jadi baris yatim yang di-drop diam-
  -- diam oleh JOIN di routes/inventory.js.
  CONSTRAINT `fk_inventory_log_item` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(20) NOT NULL COMMENT 'CREATE|UPDATE|DELETE|LOGIN|LOGOUT',
  `target_type` varchar(30) NOT NULL COMMENT 'ticket|user|inventory|ftth|reference|psb|activity|setting',
  `target_id` int DEFAULT NULL,
  `details` json DEFAULT NULL COMMENT '{old_value, new_value, changes}',
  `username` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_target` (`target_type`,`target_id`),
  KEY `idx_audit_username` (`username`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` varchar(50) NOT NULL,
  `setting_value` text,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
