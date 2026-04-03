<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'check':
        handle_check();
        break;
    case 'run':
        require_method('POST');
        handle_install();
        break;
    default:
        json_error('Unknown install action', 404);
}

function handle_check(): void {
    $checks = [
        'php_version' => version_compare(PHP_VERSION, '8.0.0', '>='),
        'pdo' => extension_loaded('pdo'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'curl' => extension_loaded('curl'),
        'json' => extension_loaded('json'),
        'session' => extension_loaded('session'),
        'config_writable' => is_writable(APP_ROOT . '/config'),
        'binary_exists' => false,
    ];

    $binaryPaths = [
        APP_ROOT . '/media-downloader',
        APP_ROOT . '/media-downloader-new',
        '/usr/local/bin/media-downloader',
    ];
    foreach ($binaryPaths as $p) {
        if (file_exists($p) && is_executable($p)) {
            $checks['binary_exists'] = true;
            $checks['binary_path'] = realpath($p);
            break;
        }
    }

    $checks['all_passed'] = !in_array(false, $checks, true);
    json_response($checks);
}

function handle_install(): void {
    $data = get_json_body();

    $required = ['db_host', 'db_name', 'db_user', 'admin_username', 'admin_password', 'rd_key', 'service_url'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            json_error("Missing required field: $field");
        }
    }

    // Test DB connection
    try {
        $pdo = get_db_from_credentials(
            $data['db_host'],
            $data['db_name'],
            $data['db_user'],
            $data['db_pass'] ?? ''
        );
    } catch (PDOException $e) {
        json_error('Database connection failed: ' . $e->getMessage());
    }

    // Run migrations
    try {
        $sql = file_get_contents(APP_ROOT . '/migrations/001_schema.sql');
        $pdo->exec($sql);
    } catch (PDOException $e) {
        json_error('Migration failed: ' . $e->getMessage());
    }

    // Create admin user
    $passwordHash = password_hash($data['admin_password'], PASSWORD_BCRYPT);
    try {
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
        $stmt->execute([$data['admin_username'], $passwordHash, 'admin']);
        $adminId = $pdo->lastInsertId();

        $stmt = $pdo->prepare('INSERT INTO profiles (user_id, name, avatar, maturity) VALUES (?, ?, ?, ?)');
        $stmt->execute([$adminId, $data['admin_username'], 'red', 'adult']);
    } catch (PDOException $e) {
        json_error('Failed to create admin user: ' . $e->getMessage());
    }

    // Save settings
    $settings = [
        'rd_key' => $data['rd_key'],
        'service_url' => $data['service_url'],
        'movies_dir' => $data['movies_dir'] ?? '/home/media_lib/Movies',
        'tv_dir' => $data['tv_dir'] ?? '/home/media_lib/TV Shows',
        'quality_default' => $data['quality'] ?? '1080p',
        'proxy' => $data['proxy'] ?? '',
        'sftp_host' => $data['sftp_host'] ?? '',
        'sftp_port' => $data['sftp_port'] ?? '22',
        'sftp_user' => $data['sftp_user'] ?? '',
        'sftp_pass' => $data['sftp_pass'] ?? '',
        'sftp_path' => $data['sftp_path'] ?? '',
        'site_name' => $data['site_name'] ?? 'Iris',
        'tmdb_api_key' => $data['tmdb_api_key'] ?? '',
        'installed' => '1',
    ];

    $stmt = $pdo->prepare('INSERT INTO settings (key_name, value_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)');
    foreach ($settings as $key => $value) {
        $stmt->execute([$key, $value]);
    }

    // Determine binary path
    $binaryPath = $data['binary_path'] ?? '';
    if (!$binaryPath) {
        $paths = [APP_ROOT . '/media-downloader', APP_ROOT . '/media-downloader-new'];
        foreach ($paths as $p) {
            if (file_exists($p)) { $binaryPath = realpath($p); break; }
        }
    }

    // Write config file
    $config = "<?php\n";
    $config .= "define('DB_HOST', " . var_export($data['db_host'], true) . ");\n";
    $config .= "define('DB_NAME', " . var_export($data['db_name'], true) . ");\n";
    $config .= "define('DB_USER', " . var_export($data['db_user'], true) . ");\n";
    $config .= "define('DB_PASS', " . var_export($data['db_pass'] ?? '', true) . ");\n";
    $config .= "define('BINARY_PATH', " . var_export($binaryPath, true) . ");\n";

    $configPath = APP_ROOT . '/config/config.php';
    if (file_put_contents($configPath, $config) === false) {
        json_error('Failed to write config file. Check directory permissions.');
    }

    json_response(['success' => true, 'message' => 'Installation complete']);
}
