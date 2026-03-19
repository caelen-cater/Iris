<?php
if (session_status() === PHP_SESSION_NONE) session_start();

define('API_ROOT', __DIR__);
if (!defined('APP_ROOT')) define('APP_ROOT', dirname(__DIR__));

require_once APP_ROOT . '/includes/helpers.php';
require_once APP_ROOT . '/includes/auth_middleware.php';

header('Content-Type: application/json');

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

$basePath = '';
if (isset($_SERVER['SCRIPT_NAME'])) {
    $scriptDir = dirname(dirname($_SERVER['SCRIPT_NAME']));
    if ($scriptDir !== '/' && $scriptDir !== '\\') {
        $basePath = $scriptDir;
    }
}
$uri = substr($uri, strlen($basePath)) ?: '/';

$parts = explode('/', trim($uri, '/'));
// $parts[0] = 'api', $parts[1] = endpoint, $parts[2..] = params
$endpoint = $parts[1] ?? '';
$action = $parts[2] ?? '';

$_GET['action'] = $action;
$_GET['param'] = $parts[3] ?? '';

$endpoints = [
    'install'   => '/install.php',
    'auth'      => '/auth.php',
    'profiles'  => '/profiles.php',
    'tmdb'      => '/tmdb.php',
    'downloads' => '/downloads.php',
    'media'     => '/media.php',
    'watchlist' => '/watchlist.php',
    'admin'     => '/admin.php',
];

if (!isset($endpoints[$endpoint])) {
    json_error('Unknown endpoint', 404);
}

require API_ROOT . $endpoints[$endpoint];
