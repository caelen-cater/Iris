<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        handle_list();
        break;
    case 'public-list':
        handle_public_list();
        break;
    case 'create':
        require_method('POST');
        handle_create();
        break;
    case 'update':
        require_method('POST');
        handle_update();
        break;
    case 'delete':
        require_method('POST');
        handle_delete();
        break;
    case 'switch':
        require_method('POST');
        handle_switch();
        break;
    case 'upload-picture':
        require_method('POST');
        handle_upload_picture();
        break;
    default:
        json_error('Unknown profiles action', 404);
}

function handle_public_list(): void {
    $db = get_db();
    $authMode = get_setting($db, 'auth_mode', 'login');

    if ($authMode !== 'profiles') {
        json_error('Profile selection mode not enabled', 403);
    }

    $stmt = $db->query('SELECT id, name, avatar, picture, maturity, auth_method, pin_hash IS NOT NULL as has_pin, password_hash IS NOT NULL as has_password FROM profiles ORDER BY created_at');
    $profiles = $stmt->fetchAll();

    foreach ($profiles as &$p) {
        $p['has_pin'] = (bool)$p['has_pin'];
        $p['has_password'] = (bool)$p['has_password'];
    }

    json_response(['profiles' => $profiles]);
}

function handle_list(): void {
    $user = check_auth();
    $db = get_db();

    $stmt = $db->prepare('SELECT id, name, avatar, picture, maturity, auth_method, pin_hash IS NOT NULL as has_pin, password_hash IS NOT NULL as has_password FROM profiles WHERE user_id = ? ORDER BY created_at');
    $stmt->execute([$user['user_id']]);
    $profiles = $stmt->fetchAll();

    foreach ($profiles as &$p) {
        $p['has_pin'] = (bool)$p['has_pin'];
        $p['has_password'] = (bool)$p['has_password'];
    }

    json_response(['profiles' => $profiles]);
}

function handle_create(): void {
    $user = check_auth();
    $data = get_json_body();

    if (empty($data['name'])) json_error('Profile name required');

    $maturity = in_array($data['maturity'] ?? '', ['child', 'teen', 'adult']) ? $data['maturity'] : 'adult';
    $avatar = sanitize($data['avatar'] ?? 'blue');

    $authMethod = 'none';
    $pinHash = null;
    $passwordHash = null;

    if (!empty($data['password'])) {
        $authMethod = 'password';
        $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT);
    } elseif (!empty($data['pin'])) {
        $authMethod = 'pin';
        $pinHash = hash_pin($data['pin']);
    }

    $db = get_db();

    $stmt = $db->prepare('SELECT COUNT(*) as cnt FROM profiles WHERE user_id = ?');
    $stmt->execute([$user['user_id']]);
    if ($stmt->fetch()['cnt'] >= 8) json_error('Maximum 8 profiles allowed');

    $stmt = $db->prepare('INSERT INTO profiles (user_id, name, avatar, maturity, pin_hash, password_hash, auth_method) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$user['user_id'], sanitize($data['name']), $avatar, $maturity, $pinHash, $passwordHash, $authMethod]);

    log_activity($db, $user['user_id'], null, 'profile_create', 'Created profile: ' . $data['name']);

    json_response(['success' => true, 'id' => $db->lastInsertId()]);
}

function handle_update(): void {
    $user = check_auth();
    $data = get_json_body();

    if (empty($data['id'])) json_error('Profile ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?');
    $stmt->execute([$data['id'], $user['user_id']]);
    if (!$stmt->fetch()) json_error('Profile not found', 404);

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
    } else {
        if (array_key_exists('pin', $data)) {
            if ($data['pin']) {
                $fields[] = 'pin_hash = ?';
                $params[] = hash_pin($data['pin']);
                $fields[] = 'auth_method = ?';
                $params[] = 'pin';
            } else {
                $fields[] = 'pin_hash = NULL';
                $fields[] = 'auth_method = ?';
                $params[] = 'none';
            }
        }
        if (array_key_exists('password', $data) && $data['password']) {
            $fields[] = 'password_hash = ?';
            $params[] = password_hash($data['password'], PASSWORD_BCRYPT);
            $fields[] = 'auth_method = ?';
            $params[] = 'password';
        }
    }

    if (array_key_exists('remove_picture', $data) && $data['remove_picture']) {
        $fields[] = 'picture = NULL';
    }

    if (empty($fields)) json_error('Nothing to update');

    $params[] = $data['id'];
    $db->prepare('UPDATE profiles SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    if (($_SESSION['profile_id'] ?? null) == $data['id']) {
        if (isset($data['name']) && $data['name'] !== '') $_SESSION['profile_name'] = sanitize($data['name']);
        if (isset($data['avatar'])) $_SESSION['profile_avatar'] = sanitize($data['avatar']);
        if (isset($data['maturity'])) $_SESSION['maturity'] = $data['maturity'];
        if (!empty($data['remove_picture'])) unset($_SESSION['profile_picture']);
    }

    json_response(['success' => true]);
}

function handle_delete(): void {
    $user = check_auth();
    $data = get_json_body();
    if (empty($data['id'])) json_error('Profile ID required');

    $db = get_db();

    $stmt = $db->prepare('SELECT picture FROM profiles WHERE id = ? AND user_id = ?');
    $stmt->execute([$data['id'], $user['user_id']]);
    $profile = $stmt->fetch();
    if ($profile && $profile['picture']) {
        $picPath = APP_ROOT . '/public/' . $profile['picture'];
        if (file_exists($picPath)) @unlink($picPath);
    }

    $stmt = $db->prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?');
    $stmt->execute([$data['id'], $user['user_id']]);

    if ($stmt->rowCount() === 0) json_error('Profile not found', 404);

    if (($_SESSION['profile_id'] ?? null) == $data['id']) {
        unset($_SESSION['profile_id'], $_SESSION['profile_name'], $_SESSION['maturity'], $_SESSION['profile_avatar'], $_SESSION['profile_picture']);
    }

    json_response(['success' => true]);
}

function handle_switch(): void {
    $user = check_auth();
    $data = get_json_body();
    if (empty($data['id'])) json_error('Profile ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT id, name, maturity, avatar, picture, pin_hash, auth_method FROM profiles WHERE id = ? AND user_id = ?');
    $stmt->execute([$data['id'], $user['user_id']]);
    $profile = $stmt->fetch();

    if (!$profile) json_error('Profile not found', 404);

    $authMethod = $profile['auth_method'] ?? 'none';
    if ($authMethod === 'pin' && $profile['pin_hash'] && empty($data['pin_verified'])) {
        json_response(['requires_pin' => true]);
        return;
    }

    $_SESSION['profile_id'] = $profile['id'];
    $_SESSION['profile_name'] = $profile['name'];
    $_SESSION['maturity'] = $profile['maturity'];
    $_SESSION['profile_avatar'] = $profile['avatar'];
    $_SESSION['profile_picture'] = $profile['picture'];

    log_activity($db, $user['user_id'], $profile['id'], 'profile_switch', 'Switched to ' . $profile['name']);

    json_response([
        'success' => true,
        'profile' => [
            'id' => $profile['id'],
            'name' => $profile['name'],
            'maturity' => $profile['maturity'],
            'avatar' => $profile['avatar'],
            'picture' => $profile['picture'],
        ]
    ]);
}

function handle_upload_picture(): void {
    $user = check_auth();

    if (empty($_POST['profile_id'])) json_error('Profile ID required');
    if (empty($_FILES['picture']) || $_FILES['picture']['error'] !== UPLOAD_ERR_OK) {
        json_error('No valid file uploaded');
    }

    $profileId = (int)$_POST['profile_id'];

    $db = get_db();
    $stmt = $db->prepare('SELECT id, picture FROM profiles WHERE id = ? AND user_id = ?');
    $stmt->execute([$profileId, $user['user_id']]);
    $profile = $stmt->fetch();
    if (!$profile) json_error('Profile not found', 404);

    $file = $_FILES['picture'];
    $maxSize = 5 * 1024 * 1024;
    if ($file['size'] > $maxSize) json_error('File too large (max 5MB)');

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($allowed[$mime])) json_error('Invalid file type. Allowed: JPG, PNG, WebP, GIF');

    $ext = $allowed[$mime];

    if ($profile['picture']) {
        $oldPath = APP_ROOT . '/public/' . $profile['picture'];
        if (file_exists($oldPath)) @unlink($oldPath);
    }

    $uploadDir = APP_ROOT . '/public/uploads/profiles';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $filename = 'profile_' . $profileId . '_' . time() . '.' . $ext;
    $destPath = $uploadDir . '/' . $filename;
    $relativePath = 'uploads/profiles/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        json_error('Failed to save file');
    }

    $stmt = $db->prepare('UPDATE profiles SET picture = ? WHERE id = ?');
    $stmt->execute([$relativePath, $profileId]);

    if (($_SESSION['profile_id'] ?? null) == $profileId) {
        $_SESSION['profile_picture'] = $relativePath;
    }

    json_response(['success' => true, 'picture' => $relativePath]);
}
