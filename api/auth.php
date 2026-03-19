<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        require_method('POST');
        handle_login();
        break;
    case 'profile-login':
        require_method('POST');
        handle_profile_login();
        break;
    case 'logout':
        handle_logout();
        break;
    case 'session':
        handle_session();
        break;
    case 'verify-pin':
        require_method('POST');
        handle_verify_pin();
        break;
    default:
        json_error('Unknown auth action', 404);
}

function get_client_ip(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['HTTP_X_REAL_IP']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

function check_ip_blocked(PDO $db): void {
    $enabled = get_setting($db, 'ip_blocking_enabled', '0');
    if ($enabled !== '1') return;

    $ip = get_client_ip();
    $maxAttempts = (int)get_setting($db, 'max_login_attempts', '10');
    $lockoutMinutes = (int)get_setting($db, 'lockout_duration_minutes', '15');

    if ($maxAttempts <= 0) return;

    $stmt = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)');
    $stmt->execute([$ip, $lockoutMinutes]);
    $failedCount = (int)$stmt->fetchColumn();

    if ($failedCount >= $maxAttempts) {
        json_error("Too many failed attempts. Try again in {$lockoutMinutes} minutes.", 429);
    }
}

function record_attempt(PDO $db, bool $success, ?int $profileId = null, ?string $username = null): void {
    $enabled = get_setting($db, 'ip_blocking_enabled', '0');
    if ($enabled !== '1') return;

    $ip = get_client_ip();
    $stmt = $db->prepare('INSERT INTO login_attempts (ip_address, profile_id, username, success) VALUES (?, ?, ?, ?)');
    $stmt->execute([$ip, $profileId, $username, $success ? 1 : 0]);

    if ($success) {
        $stmt = $db->prepare('DELETE FROM login_attempts WHERE ip_address = ? AND success = 0');
        $stmt->execute([$ip]);
    }
}

function handle_login(): void {
    $data = get_json_body();
    if (empty($data['username']) || empty($data['password'])) {
        json_error('Username and password required');
    }

    $db = get_db();
    check_ip_blocked($db);

    $stmt = $db->prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?');
    $stmt->execute([$data['username']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($data['password'], $user['password_hash'])) {
        record_attempt($db, false, null, $data['username']);
        json_error('Invalid username or password', 401);
    }

    record_attempt($db, true, null, $data['username']);

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];
    unset($_SESSION['profile_id']);

    log_activity($db, $user['id'], null, 'login', 'User logged in');

    json_response([
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
        ]
    ]);
}

function handle_profile_login(): void {
    $data = get_json_body();
    if (empty($data['profile_id'])) json_error('Profile ID required');

    $db = get_db();
    check_ip_blocked($db);

    $stmt = $db->prepare('SELECT p.*, u.id as uid, u.username, u.role FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.id = ?');
    $stmt->execute([$data['profile_id']]);
    $profile = $stmt->fetch();

    if (!$profile) json_error('Profile not found', 404);

    $authMethod = $profile['auth_method'] ?? 'none';

    if ($authMethod === 'password') {
        if (empty($data['password'])) json_error('Password required');
        if (!$profile['password_hash'] || !password_verify($data['password'], $profile['password_hash'])) {
            record_attempt($db, false, $profile['id'], null);
            json_error('Incorrect password', 401);
        }
    } elseif ($authMethod === 'pin') {
        if (empty($data['pin'])) json_error('PIN required');
        if (!$profile['pin_hash'] || !verify_pin($data['pin'], $profile['pin_hash'])) {
            record_attempt($db, false, $profile['id'], null);
            json_error('Incorrect PIN', 401);
        }
    }

    record_attempt($db, true, $profile['id'], null);

    $_SESSION['user_id'] = $profile['uid'];
    $_SESSION['username'] = $profile['username'];
    $_SESSION['role'] = $profile['role'];
    $_SESSION['profile_id'] = $profile['id'];
    $_SESSION['profile_name'] = $profile['name'];
    $_SESSION['maturity'] = $profile['maturity'];
    $_SESSION['profile_avatar'] = $profile['avatar'];
    $_SESSION['profile_picture'] = $profile['picture'] ?? null;

    log_activity($db, $profile['uid'], $profile['id'], 'profile_login', 'Profile login: ' . $profile['name']);

    json_response([
        'success' => true,
        'user' => [
            'id' => $profile['uid'],
            'username' => $profile['username'],
            'role' => $profile['role'],
        ],
        'profile' => [
            'id' => $profile['id'],
            'name' => $profile['name'],
            'maturity' => $profile['maturity'],
            'avatar' => $profile['avatar'],
            'picture' => $profile['picture'] ?? null,
        ]
    ]);
}

function handle_logout(): void {
    if (!empty($_SESSION['user_id'])) {
        try {
            $db = get_db();
            log_activity($db, $_SESSION['user_id'], $_SESSION['profile_id'] ?? null, 'logout', '');
        } catch (Exception $e) {}
    }
    session_destroy();
    json_response(['success' => true]);
}

function handle_session(): void {
    $authMode = 'login';
    $siteName = 'Iris';

    try {
        $db = get_db();
        $authMode = get_setting($db, 'auth_mode', 'login');
        $siteName = get_setting($db, 'site_name', 'Iris');
    } catch (Exception $e) {}

    if (empty($_SESSION['user_id'])) {
        json_response([
            'authenticated' => false,
            'auth_mode' => $authMode,
            'site_name' => $siteName,
        ]);
        return;
    }

    $resp = [
        'authenticated' => true,
        'auth_mode' => $authMode,
        'site_name' => $siteName,
        'user' => [
            'id' => $_SESSION['user_id'],
            'username' => $_SESSION['username'],
            'role' => $_SESSION['role'],
        ],
    ];

    if (!empty($_SESSION['profile_id'])) {
        $resp['profile'] = [
            'id' => $_SESSION['profile_id'],
            'name' => $_SESSION['profile_name'] ?? '',
            'maturity' => $_SESSION['maturity'] ?? 'adult',
            'avatar' => $_SESSION['profile_avatar'] ?? 'blue',
            'picture' => $_SESSION['profile_picture'] ?? null,
        ];
    }

    json_response($resp);
}

function handle_verify_pin(): void {
    $data = get_json_body();
    if (empty($data['profile_id'])) json_error('Profile ID required');

    $db = get_db();
    check_ip_blocked($db);

    $profileId = (int)$data['profile_id'];

    if (!empty($_SESSION['user_id'])) {
        $stmt = $db->prepare('SELECT id, pin_hash FROM profiles WHERE id = ? AND user_id = ?');
        $stmt->execute([$profileId, $_SESSION['user_id']]);
    } else {
        $stmt = $db->prepare('SELECT id, pin_hash FROM profiles WHERE id = ?');
        $stmt->execute([$profileId]);
    }

    $profile = $stmt->fetch();
    if (!$profile) json_error('Profile not found', 404);

    if ($profile['pin_hash'] && !verify_pin($data['pin'] ?? '', $profile['pin_hash'])) {
        record_attempt($db, false, $profileId, null);
        json_error('Incorrect PIN', 401);
    }

    record_attempt($db, true, $profileId, null);
    json_response(['verified' => true]);
}
