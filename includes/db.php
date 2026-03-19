<?php

function get_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $configFile = dirname(__DIR__) . '/config/config.php';
    if (!file_exists($configFile)) {
        throw new RuntimeException('Application not installed');
    }
    require_once $configFile;

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function get_db_from_credentials(string $host, string $name, string $user, string $pass): PDO {
    $dsn = 'mysql:host=' . $host . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$name`");

    return $pdo;
}
