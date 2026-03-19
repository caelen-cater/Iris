CREATE TABLE IF NOT EXISTS watchlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profile_id INT NOT NULL,
    tmdb_id INT NOT NULL,
    media_type ENUM('movie', 'tv') NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    poster_path VARCHAR(500) DEFAULT NULL,
    backdrop_path VARCHAR(500) DEFAULT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_profile_tmdb (profile_id, tmdb_id, media_type),
    KEY idx_profile (profile_id),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
