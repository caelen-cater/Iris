<?php

function check_auth(): array {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['user_id'])) {
        json_error('Not authenticated', 401);
    }
    return [
        'user_id' => $_SESSION['user_id'],
        'username' => $_SESSION['username'] ?? '',
        'role' => $_SESSION['role'] ?? 'user',
    ];
}

function check_profile(): array {
    $user = check_auth();
    if (empty($_SESSION['profile_id'])) {
        json_error('No profile selected', 403);
    }
    $user['profile_id'] = $_SESSION['profile_id'];
    $user['profile_name'] = $_SESSION['profile_name'] ?? '';
    $user['maturity'] = $_SESSION['maturity'] ?? 'adult';
    return $user;
}

function check_admin(): array {
    $user = check_auth();
    if ($user['role'] !== 'admin') {
        json_error('Admin access required', 403);
    }
    return $user;
}
