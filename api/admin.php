<?php
require_once APP_ROOT . '/includes/db.php';

check_admin();

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'stats':
        handle_stats();
        break;
    case 'downloads':
        handle_admin_downloads();
        break;
    case 'users':
        handle_users();
        break;
    case 'user-create':
        require_method('POST');
        handle_user_create();
        break;
    case 'user-detail':
        handle_user_detail();
        break;
    case 'user-update':
        require_method('POST');
        handle_user_update();
        break;
    case 'user-delete':
        require_method('POST');
        handle_user_delete();
        break;
    case 'profile-update':
        require_method('POST');
        handle_admin_profile_update();
        break;
    case 'profile-delete':
        require_method('POST');
        handle_admin_profile_delete();
        break;
    case 'profile-create':
        require_method('POST');
        handle_admin_profile_create();
        break;
    case 'activity':
        handle_activity();
        break;
    case 'settings':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') handle_save_settings();
        else handle_get_settings();
        break;
    case 'storage':
        handle_storage();
        break;
    default:
        json_error('Unknown admin action', 404);
}

function handle_stats(): void {
    $db = get_db();

    $total_downloads = $db->query('SELECT COUNT(*) FROM downloads')->fetchColumn();
    $completed_downloads = $db->query("SELECT COUNT(*) FROM downloads WHERE status='completed'")->fetchColumn();
    $active_downloads = $db->query("SELECT COUNT(*) FROM downloads WHERE status IN ('queued','downloading')")->fetchColumn();
    $total_users = $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $total_profiles = $db->query('SELECT COUNT(*) FROM profiles')->fetchColumn();
    $total_size = $db->query("SELECT COALESCE(SUM(file_size), 0) FROM downloads WHERE status='completed'")->fetchColumn();
    $failed = $db->query("SELECT COUNT(*) FROM downloads WHERE status='failed'")->fetchColumn();

    // Downloads per day (last 30 days)
    $daily = $db->query("SELECT DATE(created_at) as day, COUNT(*) as count FROM downloads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY day")->fetchAll();

    // Downloads by user (top 10)
    $byUser = $db->query("SELECT p.name, COUNT(d.id) as count FROM downloads d JOIN profiles p ON d.profile_id = p.id GROUP BY p.id ORDER BY count DESC LIMIT 10")->fetchAll();

    // Downloads by type
    $byType = $db->query("SELECT media_type, COUNT(*) as count FROM downloads GROUP BY media_type")->fetchAll();

    // Downloads by status
    $byStatus = $db->query("SELECT status, COUNT(*) as count FROM downloads GROUP BY status")->fetchAll();

    // Recent 7 day comparison
    $thisWeek = $db->query("SELECT COUNT(*) FROM downloads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
    $lastWeek = $db->query("SELECT COUNT(*) FROM downloads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();

    json_response([
        'total_downloads' => (int)$total_downloads,
        'completed_downloads' => (int)$completed_downloads,
        'active_downloads' => (int)$active_downloads,
        'failed_downloads' => (int)$failed,
        'total_users' => (int)$total_users,
        'total_profiles' => (int)$total_profiles,
        'total_storage' => (int)$total_size,
        'this_week' => (int)$thisWeek,
        'last_week' => (int)$lastWeek,
        'daily_downloads' => $daily,
        'downloads_by_user' => $byUser,
        'downloads_by_type' => $byType,
        'downloads_by_status' => $byStatus,
    ]);
}

function handle_admin_downloads(): void {
    $db = get_db();
    $page = max(1, intval($_GET['page'] ?? 1));
    $limit = 50;
    $offset = ($page - 1) * $limit;

    $total = $db->query('SELECT COUNT(*) FROM downloads')->fetchColumn();
    $stmt = $db->prepare("SELECT d.*, p.name as profile_name FROM downloads d JOIN profiles p ON d.profile_id = p.id ORDER BY d.created_at DESC LIMIT ? OFFSET ?");
    $stmt->execute([$limit, $offset]);
    $downloads = $stmt->fetchAll();

    json_response([
        'downloads' => $downloads,
        'total' => (int)$total,
        'page' => $page,
        'pages' => ceil($total / $limit),
    ]);
}

function handle_users(): void {
    $db = get_db();
    $users = $db->query("SELECT u.id, u.username, u.role, u.created_at, (SELECT COUNT(*) FROM profiles WHERE user_id = u.id) as profile_count, (SELECT COUNT(*) FROM downloads d JOIN profiles p ON d.profile_id = p.id WHERE p.user_id = u.id) as download_count FROM users u ORDER BY u.created_at")->fetchAll();

    json_response(['users' => $users]);
}

function handle_user_create(): void {
    $data = get_json_body();
    if (empty($data['username'])) json_error('Name is required');

    $db = get_db();
    $authMode = get_setting($db, 'auth_mode', 'login');
    $role = ($data['role'] ?? 'user') === 'admin' ? 'admin' : 'user';

    if ($authMode === 'login' && empty($data['password'])) {
        json_error('Password is required in login mode');
    }

    $userPassHash = !empty($data['password'])
        ? password_hash($data['password'], PASSWORD_BCRYPT)
        : password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT);

    try {
        $stmt = $db->prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        $stmt->execute([$data['username'], $userPassHash, $role]);
        $userId = $db->lastInsertId();

        $profileAuthMethod = $data['auth_method'] ?? 'none';
        if (!in_array($profileAuthMethod, ['none', 'pin', 'password'])) $profileAuthMethod = 'none';

        $pinHash = null;
        $profilePassHash = null;
        if ($profileAuthMethod === 'pin' && !empty($data['pin'])) {
            $pinHash = hash_pin($data['pin']);
        } elseif ($profileAuthMethod === 'password' && !empty($data['profile_password'])) {
            $profilePassHash = password_hash($data['profile_password'], PASSWORD_BCRYPT);
        }

        $stmt = $db->prepare('INSERT INTO profiles (user_id, name, avatar, maturity, auth_method, pin_hash, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $data['username'], 'blue', 'adult', $profileAuthMethod, $pinHash, $profilePassHash]);

        json_response(['success' => true, 'id' => $userId]);
    } catch (PDOException $e) {
        json_error('Username already exists');
    }
}

function handle_user_delete(): void {
    $data = get_json_body();
    if (empty($data['id'])) json_error('User ID required');

    if ($data['id'] == $_SESSION['user_id']) {
        json_error('Cannot delete yourself');
    }

    $db = get_db();
    $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$data['id']]);

    if ($stmt->rowCount() === 0) json_error('User not found', 404);

    json_response(['success' => true]);
}

function handle_activity(): void {
    $db = get_db();
    $limit = min(200, max(1, intval($_GET['limit'] ?? 50)));

    $stmt = $db->prepare("SELECT a.*, u.username, p.name as profile_name FROM activity_log a LEFT JOIN users u ON a.user_id = u.id LEFT JOIN profiles p ON a.profile_id = p.id ORDER BY a.created_at DESC LIMIT ?");
    $stmt->execute([$limit]);

    json_response(['activity' => $stmt->fetchAll()]);
}

function handle_get_settings(): void {
    $db = get_db();
    $stmt = $db->query('SELECT key_name, value_data FROM settings');
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['key_name']] = $row['value_data'];
    }
    json_response(['settings' => $settings]);
}

function handle_save_settings(): void {
    $data = get_json_body();
    if (empty($data)) json_error('No settings provided');

    $db = get_db();
    $allowed = ['rd_key', 'service_url', 'movies_dir', 'tv_dir', 'quality_default', 'proxy', 'sftp_host', 'sftp_port', 'sftp_user', 'sftp_pass', 'sftp_path', 'site_name', 'tmdb_api_key', 'auth_mode', 'ip_blocking_enabled', 'max_login_attempts', 'lockout_duration_minutes'];

    $stmt = $db->prepare('INSERT INTO settings (key_name, value_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)');
    foreach ($data as $key => $value) {
        if (in_array($key, $allowed)) {
            $stmt->execute([$key, $value]);
        }
    }

    log_activity($db, $_SESSION['user_id'], null, 'settings_update', 'Settings updated');
    json_response(['success' => true]);
}

function handle_user_detail(): void {
    $userId = $_GET['param'] ?? '';
    if (!$userId) json_error('User ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT id, username, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) json_error('User not found', 404);

    $stmt = $db->prepare('SELECT id, name, avatar, picture, maturity, auth_method, pin_hash IS NOT NULL as has_pin, password_hash IS NOT NULL as has_password FROM profiles WHERE user_id = ? ORDER BY created_at');
    $stmt->execute([$userId]);
    $profiles = $stmt->fetchAll();
    foreach ($profiles as &$p) {
        $p['has_pin'] = (bool)$p['has_pin'];
        $p['has_password'] = (bool)$p['has_password'];
    }

    json_response(['user' => $user, 'profiles' => $profiles]);
}

function handle_user_update(): void {
    $data = get_json_body();
    if (empty($data['id'])) json_error('User ID required');

    $db = get_db();
    $fields = [];
    $params = [];

    if (!empty($data['username'])) {
        $fields[] = 'username = ?';
        $params[] = $data['username'];
    }
    if (!empty($data['role']) && in_array($data['role'], ['user', 'admin'])) {
        $fields[] = 'role = ?';
        $params[] = $data['role'];
    }
    if (!empty($data['password'])) {
        $fields[] = 'password_hash = ?';
        $params[] = password_hash($data['password'], PASSWORD_BCRYPT);
    }

    if (empty($fields)) json_error('Nothing to update');

    $params[] = $data['id'];
    $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    json_response(['success' => true]);
}

function handle_admin_profile_update(): void {
    $data = get_json_body();
    if (empty($data['id'])) json_error('Profile ID required');

    $db = get_db();
    $fields = [];
    $params = [];

    if (isset($data['name']) && $data['name'] !== '') {
        $fields[] = 'name = ?';
        $params[] = sanitize($data['name']);
    }
    if (isset($data['avatar'])) {
        $fields[] = 'avatar = ?';
        $params[] = sanitize($data['avatar']);
    }
    if (isset($data['maturity']) && in_array($data['maturity'], ['child', 'teen', 'adult'])) {
        $fields[] = 'maturity = ?';
        $params[] = $data['maturity'];
    }
    if (isset($data['auth_method']) && in_array($data['auth_method'], ['none', 'pin', 'password'])) {
        $fields[] = 'auth_method = ?';
        $params[] = $data['auth_method'];
        if ($data['auth_method'] === 'none') {
            $fields[] = 'pin_hash = NULL';
            $fields[] = 'password_hash = NULL';
        } elseif ($data['auth_method'] === 'pin' && !empty($data['pin'])) {
            $fields[] = 'pin_hash = ?';
            $params[] = hash_pin($data['pin']);
            $fields[] = 'password_hash = NULL';
        } elseif ($data['auth_method'] === 'password' && !empty($data['password'])) {
            $fields[] = 'password_hash = ?';
            $params[] = password_hash($data['password'], PASSWORD_BCRYPT);
            $fields[] = 'pin_hash = NULL';
        }
    }
    if (!empty($data['remove_picture'])) {
        $stmt = $db->prepare('SELECT picture FROM profiles WHERE id = ?');
        $stmt->execute([$data['id']]);
        $old = $stmt->fetch();
        if ($old && $old['picture']) {
            $picPath = APP_ROOT . '/' . $old['picture'];
            if (file_exists($picPath)) @unlink($picPath);
            $altPath = APP_ROOT . '/public/' . $old['picture'];
            if (file_exists($altPath)) @unlink($altPath);
        }
        $fields[] = 'picture = NULL';
    }

    if (empty($fields)) json_error('Nothing to update');

    $params[] = $data['id'];
    $db->prepare('UPDATE profiles SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    json_response(['success' => true]);
}

function handle_admin_profile_delete(): void {
    $data = get_json_body();
    if (empty($data['id'])) json_error('Profile ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT picture FROM profiles WHERE id = ?');
    $stmt->execute([$data['id']]);
    $profile = $stmt->fetch();
    if ($profile && $profile['picture']) {
        $picPath = APP_ROOT . '/public/' . $profile['picture'];
        if (file_exists($picPath)) @unlink($picPath);
    }

    $db->prepare('DELETE FROM profiles WHERE id = ?')->execute([$data['id']]);
    json_response(['success' => true]);
}

function handle_admin_profile_create(): void {
    $data = get_json_body();
    if (empty($data['user_id']) || empty($data['name'])) json_error('User ID and name required');

    $db = get_db();
    $maturity = in_array($data['maturity'] ?? '', ['child', 'teen', 'adult']) ? $data['maturity'] : 'adult';
    $avatar = sanitize($data['avatar'] ?? 'blue');
    $authMethod = 'none';
    $pinHash = null;
    $passHash = null;

    if (!empty($data['auth_method'])) {
        $authMethod = in_array($data['auth_method'], ['none', 'pin', 'password']) ? $data['auth_method'] : 'none';
        if ($authMethod === 'pin' && !empty($data['pin'])) $pinHash = hash_pin($data['pin']);
        if ($authMethod === 'password' && !empty($data['password'])) $passHash = password_hash($data['password'], PASSWORD_BCRYPT);
    }

    $stmt = $db->prepare('INSERT INTO profiles (user_id, name, avatar, maturity, auth_method, pin_hash, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$data['user_id'], sanitize($data['name']), $avatar, $maturity, $authMethod, $pinHash, $passHash]);

    json_response(['success' => true, 'id' => $db->lastInsertId()]);
}

function handle_storage(): void {
    $db = get_db();

    // By media type
    $byType = $db->query("SELECT media_type, COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size FROM downloads WHERE status = 'completed' GROUP BY media_type")->fetchAll();

    // Largest files
    $largest = $db->query("SELECT title, season, episode, file_size, file_path FROM downloads WHERE status = 'completed' AND file_size > 0 ORDER BY file_size DESC LIMIT 10")->fetchAll();

    // By quality
    $byQuality = $db->query("SELECT quality, COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size FROM downloads WHERE status = 'completed' GROUP BY quality")->fetchAll();

    json_response([
        'by_type' => $byType,
        'largest' => $largest,
        'by_quality' => $byQuality,
    ]);
}
