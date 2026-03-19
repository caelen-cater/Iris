ALTER TABLE profiles ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL AFTER pin_hash;
ALTER TABLE profiles ADD COLUMN auth_method ENUM('none', 'pin', 'password') NOT NULL DEFAULT 'none' AFTER password_hash;

CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    profile_id INT DEFAULT NULL,
    username VARCHAR(100) DEFAULT NULL,
    success TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ip (ip_address, attempted_at),
    INDEX idx_profile (profile_id, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
