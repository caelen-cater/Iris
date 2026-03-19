<?php
session_start();

if (is_dir(__DIR__ . '/api')) {
    define('APP_ROOT', __DIR__);
} else {
    define('APP_ROOT', dirname(__DIR__));
}
define('PUBLIC_ROOT', __DIR__);

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/') ?: '/';

$basePath = '';
if (isset($_SERVER['SCRIPT_NAME'])) {
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir !== '/' && $scriptDir !== '\\') {
        $basePath = $scriptDir;
        $uri = substr($uri, strlen($basePath)) ?: '/';
    }
}

if (strpos($uri, '/api/') === 0) {
    require APP_ROOT . '/api/router.php';
    exit;
}

$configFile = APP_ROOT . '/config/config.php';
$installed = false;

if (file_exists($configFile)) {
    require_once $configFile;
    if (defined('DB_HOST') && DB_HOST !== '') {
        $installed = true;
    }
}

if (!$installed) {
    require APP_ROOT . '/templates/install.html';
    exit;
}

require APP_ROOT . '/templates/app.html';
