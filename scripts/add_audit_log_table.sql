-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT NOT NULL AUTO_INCREMENT,
    action VARCHAR(20) NOT NULL COMMENT 'CREATE|UPDATE|DELETE|LOGIN|LOGOUT',
    target_type VARCHAR(30) NOT NULL COMMENT 'ticket|user|inventory|ftth|reference|setting',
    target_id INT DEFAULT NULL,
    details JSON DEFAULT NULL COMMENT '{old_value, new_value, changes}',
    username VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_target (target_type, target_id),
    KEY idx_audit_username (username),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
