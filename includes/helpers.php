<?php

function json_response(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function json_error(string $message, int $status = 400): void {
    json_response(['error' => $message], $status);
}

function get_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_method(string $method): void {
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        json_error('Method not allowed', 405);
    }
}

function sanitize(string $value): string {
    return htmlspecialchars(trim($value), ENT_QUOTES, 'UTF-8');
}

function hash_pin(string $pin): string {
    return password_hash($pin, PASSWORD_BCRYPT);
}

function verify_pin(string $pin, string $hash): bool {
    return password_verify($pin, $hash);
}

function get_setting(PDO $db, string $key, mixed $default = null): mixed {
    $stmt = $db->prepare('SELECT value_data FROM settings WHERE key_name = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return $row ? $row['value_data'] : $default;
}

function set_setting(PDO $db, string $key, string $value): void {
    $stmt = $db->prepare('INSERT INTO settings (key_name, value_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)');
    $stmt->execute([$key, $value]);
}

function log_activity(PDO $db, ?int $userId, ?int $profileId, string $action, string $details = ''): void {
    $stmt = $db->prepare('INSERT INTO activity_log (user_id, profile_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())');
    $stmt->execute([$userId, $profileId, $action, $details]);
}
